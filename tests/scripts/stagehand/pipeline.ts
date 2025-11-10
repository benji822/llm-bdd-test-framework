import fs from 'node:fs/promises';
import path from 'node:path';

import { ActionGraphBuilder, generateGraphId } from '../action-graph/index.js';
import { GraphPersistence } from '../action-graph/persistence.js';
import { compileActionGraph } from '../action-graph/compiler.js';
import type { DeterministicAction, GherkinKeyword, NodeType } from '../action-graph/types.js';
import { buildPlaceholderDefaults } from './recorder.js';
import type { ScenarioRecordingResult } from './recorder.js';
import { createAuthoringStagehandWrapper } from './bootstrap.js';
import type { StagehandActionDescriptor, StagehandRuntimeOptions } from './types.js';
import type { StagehandWrapper } from './wrapper.js';
import { parsePlainSpec, PlainSpecDefinition, PlainSpecScenario } from './spec.js';

const DEFAULT_FEATURE_DIR = 'tests/features/compiled';
const DEFAULT_STEPS_DIR = 'tests/steps/generated';

export interface StagehandPipelineOptions {
  specPath: string;
  scenario?: string;
  graphDir?: string;
  featureDir?: string;
  stepsDir?: string;
  dryRun?: boolean;
  skipCompile?: boolean;
  stagehandOptions?: StagehandRuntimeOptions;
  baseUrl?: string;
}

export interface StagehandPipelineResult {
  spec: PlainSpecDefinition;
  scenario: PlainSpecScenario;
  graphPath?: string;
  featurePath?: string;
  stepsPath?: string;
  recording: ScenarioRecordingResult;
}

interface RecordScenarioParams {
  scenario: PlainSpecScenario;
  spec: PlainSpecDefinition;
  stagehand: StagehandWrapper;
  placeholders: Record<string, string>;
  dryRun?: boolean;
  baseUrl?: string;
}

interface StagehandPlan {
  selector?: string;
  action?: DeterministicAction;
  value?: unknown;
}

export async function runStagehandRecord(
  options: StagehandPipelineOptions
): Promise<StagehandPipelineResult[]> {
  if (!options.specPath) {
    throw new Error('specPath is required');
  }

  const content = await fs.readFile(options.specPath, 'utf-8');
  const spec = parsePlainSpec(content, options.specPath);
  const query = options.scenario?.trim().toLowerCase();
  const scenarios = query
    ? spec.scenarios.filter((scenario) => scenario.name.toLowerCase() === query)
    : spec.scenarios;

  if (scenarios.length === 0) {
    throw new Error(`Scenario ${options.scenario ?? 'unnamed'} not found in ${options.specPath}`);
  }

  const stagehand = await createAuthoringStagehandWrapper(options.stagehandOptions);
  const placeholders = buildPlaceholderDefaults();
  const persistence = new GraphPersistence({ graphDir: options.graphDir });
  const baseUrl = options.baseUrl ?? process.env.E2E_BASE_URL;
  const results: StagehandPipelineResult[] = [];

  try {
    for (const scenario of scenarios) {
      const recording = await recordScenarioGraph({
        scenario,
        spec,
        stagehand,
        placeholders,
        dryRun: options.dryRun,
        baseUrl,
      });

      let graphPath: string | undefined;
      if (!options.dryRun) {
        graphPath = await persistence.write(recording.graph);
      }

      let featurePath: string | undefined;
      let stepsPath: string | undefined;
      if (!options.skipCompile && !options.dryRun) {
        const compileResult = await compileActionGraph(recording.graph, {
          featureDir: options.featureDir ?? DEFAULT_FEATURE_DIR,
          stepsDir: options.stepsDir ?? DEFAULT_STEPS_DIR,
        });
        featurePath = compileResult.featurePath;
        stepsPath = compileResult.stepsPath;
      }

      results.push({ spec, scenario, recording, graphPath, featurePath, stepsPath });
    }
  } finally {
    const rawStagehand = stagehand.getStagehand();
    if (rawStagehand && typeof rawStagehand.close === 'function') {
      try {
        await rawStagehand.close();
      } catch (error) {
        // Ignore cleanup failures; we're already unwinding the operation.
      }
    }
  }

  return results;
}

async function recordScenarioGraph(params: RecordScenarioParams): Promise<ScenarioRecordingResult> {
  const { scenario, spec, stagehand, placeholders, dryRun, baseUrl } = params;
  const builder = new ActionGraphBuilder()
    .setGraphId(generateGraphId())
    .setSpecId(spec.specId)
    .setScenarioName(scenario.name)
    .setFeatureName(spec.featureName ?? path.basename(spec.specPath))
    .setAuthorship(true, 'stagehand');

  const recordedSteps: ScenarioRecordingResult['recordedSteps'] = [];
  const orderedNodeIds: string[] = [];
  let previousType: NodeType | undefined;

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const text = scenario.steps[index]!;
    const nodeId = `step_${index}`;
    const nodeType = inferNodeType(text, previousType);
    previousType = nodeType;
    const keyword = mapNodeTypeToKeyword(nodeType);

    builder.addGherkinStep(nodeId, keyword, text, nodeType).addNaturalInstruction(nodeId, text);

    if (!dryRun) {
      const actResult = await stagehand.act(text);
      const plan = mapStagehandActionToPlan(text, actResult.actions ?? [], placeholders, baseUrl);

      if (plan.selector || plan.action || plan.value !== undefined) {
        builder.addDeterministicInstruction(nodeId, plan.selector, plan.action, plan.value);
      }

      const execution = {
        state: 'success',
        duration: actResult.metadata.duration,
        cached: actResult.metadata.cached,
        cacheKey: actResult.metadata.cacheKey,
        timestamp: actResult.metadata.timestamp,
      } satisfies RecordingExecution;

      recordedSteps.push({ nodeId, instruction: text, execution, actions: actResult.actions });
    } else {
      recordedSteps.push({ nodeId, instruction: text, execution: { state: 'pending' } });
    }

    orderedNodeIds.push(nodeId);
  }

  if (orderedNodeIds.length > 1) {
    builder.addSequentialChain(...orderedNodeIds);
  }

  const graph = builder.build();
  orderedNodeIds.forEach((nodeId) => {
    const recorded = recordedSteps.find((step) => step.nodeId === nodeId);
    if (recorded) {
      const node = graph.nodes.find((n) => n.nodeId === nodeId);
      if (node) {
        node.execution = {
          state: recorded.execution.state,
          duration: recorded.execution.duration,
          cached: recorded.execution.cached,
          cacheKey: recorded.execution.cacheKey,
          completedAt: recorded.execution.timestamp,
        } as typeof node.execution;
      }
    }
  });

  return { graph, recordedSteps };
}

function inferNodeType(instruction: string, previous?: NodeType): NodeType {
  const normalized = instruction.toLowerCase();
  if (/(should|expect|verify|confirm|assert|see|display|shows?)/.test(normalized)) {
    return 'assert';
  }
  if (/(open|visit|navigate|go to|launch|load)/.test(normalized)) {
    return 'navigate';
  }
  if (/(setup|prepare|initialize|configure)/.test(normalized)) {
    return 'setup';
  }
  return previous ?? 'act';
}

function mapNodeTypeToKeyword(type: NodeType): GherkinKeyword {
  switch (type) {
    case 'navigate':
    case 'setup':
      return 'given';
    case 'assert':
      return 'then';
    default:
      return 'when';
  }
}

function mapStagehandActionToPlan(
  instruction: string,
  actions: StagehandActionDescriptor[],
  placeholders: Record<string, string>,
  baseUrl?: string
): StagehandPlan {
  const primary = pickPrimaryAction(actions);
  const plan: StagehandPlan = {
    selector: primary?.selector,
  };

  plan.action = determineActionType(instruction, primary);
  plan.value = determineActionValue(instruction, primary, placeholders, plan.action, baseUrl);

  if (plan.action === 'navigate' && !plan.value && baseUrl) {
    plan.value = baseUrl;
  }

  return plan;
}

function pickPrimaryAction(actions: StagehandActionDescriptor[]): StagehandActionDescriptor | undefined {
  if (actions.length === 0) {
    return undefined;
  }
  return actions.find((action) => Boolean(action.selector)) ?? actions[0];
}

function determineActionType(
  instruction: string,
  action?: StagehandActionDescriptor
): DeterministicAction | undefined {
  const method = action?.method?.toLowerCase();
  if (method) {
    if (method.includes('click') || method.includes('press') || method.includes('tap')) {
      return 'click';
    }
    if (method.includes('fill') || method.includes('type') || method.includes('enter')) {
      return 'fill';
    }
    if (method.includes('select')) {
      return 'select';
    }
    if (method.includes('check') || method.includes('toggle')) {
      return 'check';
    }
    if (method.includes('navigate') || method.includes('goto')) {
      return 'navigate';
    }
    if (method.includes('wait')) {
      return 'wait';
    }
  }

  const normalized = instruction.toLowerCase();
  if (/(click|press|tap|submit)/.test(normalized)) {
    return 'click';
  }
  if (/(enter|type|fill|provide|submit value)/.test(normalized)) {
    return 'fill';
  }
  if (/(select|choose|pick)/.test(normalized)) {
    return 'select';
  }
  if (/(check|tick)/.test(normalized)) {
    return 'check';
  }
  if (/(open|visit|navigate|go to)/.test(normalized)) {
    return 'navigate';
  }
  if (/(wait|pause|sleep)/.test(normalized)) {
    return 'wait';
  }
  return undefined;
}

function determineActionValue(
  instruction: string,
  action: StagehandActionDescriptor | undefined,
  placeholders: Record<string, string>,
  actionType?: DeterministicAction,
  baseUrl?: string
): unknown {
  const arg = action?.arguments?.[0];
  if (arg) {
    return arg;
  }
  if (actionType === 'navigate') {
    return resolveNavigationTarget(instruction, baseUrl);
  }
  if (actionType === 'wait') {
    return extractTimeout(instruction);
  }
  return extractValueFromInstruction(instruction, placeholders);
}

function resolveNavigationTarget(instruction: string, baseUrl?: string): string | undefined {
  const absolute = instruction.match(/https?:\/\/[^\s]+/i);
  if (absolute) {
    return absolute[0];
  }
  const relative = instruction.match(/\/[a-z0-9\-_/]+/i);
  if (relative && baseUrl) {
    return new URL(relative[0], baseUrl).toString();
  }
  if (baseUrl) {
    return baseUrl;
  }
  return undefined;
}

function extractValueFromInstruction(text: string, placeholders: Record<string, string>): string | undefined {
  const quoted = text.match(/"([^\"]+)"/);
  if (quoted) {
    return quoted[1];
  }
  const placeholderMatch = text.match(/<([A-Z0-9_]+)>/);
  if (placeholderMatch) {
    return placeholders[placeholderMatch[1]] ?? `<${placeholderMatch[1]}>`;
  }
  const asMatch = text.match(/as ([^\.,]+)/i);
  if (asMatch) {
    return asMatch[1].trim();
  }
  return undefined;
}

function extractTimeout(text: string): number | undefined {
  const numeric = text.match(/(\d{2,4})\s?ms/i);
  if (numeric) {
    return Number(numeric[1]);
  }
  const seconds = text.match(/(\d+(?:\.\d+)?)\s?s(ec(onds)?)?/i);
  if (seconds) {
    return Math.floor(Number(seconds[1]) * 1000);
  }
  return undefined;
}

interface RecordingExecution {
  state: 'pending' | 'success';
  duration?: number;
  cached?: boolean;
  cacheKey?: string;
  timestamp?: string;
}
