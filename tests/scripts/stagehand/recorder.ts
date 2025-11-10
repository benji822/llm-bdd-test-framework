import type { Page } from '@playwright/test';
import type { ActionGraph } from '../action-graph/types.js';
import {
  ActionGraphBuilder,
  generateGraphId,
} from '../action-graph/index.js';
import type {
  DeterministicAction,
  GherkinKeyword,
} from '../action-graph/types.js';
import type { StagehandWrapper } from './wrapper.js';
import type { NormalizedYaml, NormalizedScenario, NormalizedStep } from '../types/yaml-spec.js';
import type { SelectorRegistry } from '../types/selector-registry.js';

export interface ScenarioRecordingOptions {
  yaml: NormalizedYaml;
  scenarioName: string;
  stagehand: StagehandWrapper;
  baseUrl: string;
  registry?: SelectorRegistry;
  placeholderValues?: Record<string, string>;
  dryRun?: boolean;
}

interface DeterministicPlan {
  selectorId?: string;
  action?: DeterministicAction;
  value?: unknown;
}

interface RecordingExecution {
  state: 'pending' | 'success';
  duration?: number;
  cached?: boolean;
  cacheKey?: string;
  timestamp?: string;
}

export interface ScenarioRecordingResult {
  graph: ActionGraph;
  recordedSteps: Array<{ nodeId: string; instruction: string; execution: RecordingExecution }>;
}

export async function recordScenarioToGraph(
  options: ScenarioRecordingOptions
): Promise<ScenarioRecordingResult> {
  const {
    yaml,
    scenarioName,
    stagehand,
    baseUrl,
    registry,
    placeholderValues = {},
    dryRun,
  } = options;

  const scenario = yaml.scenarios.find((s) => s.name === scenarioName);
  if (!scenario) {
    throw new Error(`Scenario "${scenarioName}" not found in ${yaml.feature}`);
  }

  const builder = new ActionGraphBuilder()
    .setGraphId(generateGraphId())
    .setSpecId(yaml.metadata.specId)
    .setScenarioName(scenario.name)
    .setFeatureName(yaml.feature)
    .setScenarioTags(scenario.tags ?? [])
    .setAuthorship(yaml.metadata.authoringMode ?? true, yaml.metadata.authoredBy ?? 'manual');

  const orderedNodeIds: string[] = [];
  const recordedSteps: ScenarioRecordingResult['recordedSteps'] = [];

  const backgroundSteps = yaml.background?.steps ?? [];
  for (let index = 0; index < backgroundSteps.length; index += 1) {
    const nodeId = `bg_${index}`;
    await processStep({
      builder,
      stagehand,
      nodeId,
      step: backgroundSteps[index]!,
      scenario,
      baseUrl,
      registry,
      placeholderValues,
      dryRun,
      recordedSteps,
      orderedNodeIds,
      isBackground: true,
    });
  }

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const nodeId = `step_${index}`;
    await processStep({
      builder,
      stagehand,
      nodeId,
      step: scenario.steps[index]!,
      scenario,
      baseUrl,
      registry,
      placeholderValues,
      dryRun,
      recordedSteps,
      orderedNodeIds,
    });
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

interface ProcessStepOptions {
  builder: ActionGraphBuilder;
  stagehand: StagehandWrapper;
  nodeId: string;
  step: NormalizedStep;
  scenario: NormalizedScenario;
  baseUrl: string;
  registry?: SelectorRegistry;
  placeholderValues: Record<string, string>;
  dryRun?: boolean;
  recordedSteps: ScenarioRecordingResult['recordedSteps'];
  orderedNodeIds: string[];
  isBackground?: boolean;
}

async function processStep(options: ProcessStepOptions): Promise<void> {
  const {
    builder,
    stagehand,
    nodeId,
    step,
    scenario,
    baseUrl,
    registry,
    placeholderValues,
    dryRun,
    recordedSteps,
    orderedNodeIds,
    isBackground,
  } = options;

  const keyword = step.type as GherkinKeyword;
  const nodeType = resolveNodeType(keyword, isBackground);
  const selectorId = inferSelectorId(step, scenario);
  const locator = resolveSelectorLocator(selectorId, scenario, registry);
  const deterministic = buildDeterministicPlan({
    step,
    selectorId,
    baseUrl,
    placeholderValues,
    locator,
  });

  builder.addGherkinStep(nodeId, keyword, step.text, nodeType).addNaturalInstruction(nodeId, step.text);

  if (deterministic.selectorId || deterministic.action || deterministic.value !== undefined) {
    builder.addDeterministicInstruction(
      nodeId,
      deterministic.selectorId,
      deterministic.action,
      deterministic.value
    );
  }

  if (selectorId && locator) {
    builder.addSelector(nodeId, selectorId, locator);
  }

  if (step.testData) {
    builder.addMetadata(nodeId, { testData: step.testData });
  }

  if (!dryRun) {
    try {
      const metadata = await stagehand.act(step.text);
      recordedSteps.push({
        nodeId,
        instruction: step.text,
        execution: {
          state: 'success',
          duration: metadata.duration,
          cached: metadata.cached,
          cacheKey: metadata.cacheKey,
          timestamp: metadata.timestamp,
        },
      });
    } catch (error) {
      recordedSteps.push({
        nodeId,
        instruction: step.text,
        execution: {
          state: 'pending',
          cached: false,
          duration: 0,
          timestamp: new Date().toISOString(),
        },
      });
      throw error;
    }
  } else {
    recordedSteps.push({
      nodeId,
      instruction: step.text,
      execution: {
        state: 'pending',
      },
    });
  }

  orderedNodeIds.push(nodeId);
}

function resolveNodeType(keyword: GherkinKeyword, isBackground?: boolean) {
  if (isBackground) {
    if (keyword === 'then') return 'assert';
    if (keyword === 'when') return 'act';
    return 'setup';
  }

  switch (keyword) {
    case 'given':
      return 'setup';
    case 'then':
      return 'assert';
    case 'when':
      return 'act';
    case 'and':
    case 'but':
      return 'act';
    default:
      return 'act';
  }
}

interface DeterministicContext {
  step: NormalizedStep;
  selectorId?: string;
  baseUrl: string;
  placeholderValues: Record<string, string>;
  locator?: string;
}

function buildDeterministicPlan(context: DeterministicContext): DeterministicPlan {
  const { step, selectorId, baseUrl, placeholderValues } = context;
  const action = inferAction(step.type, step.text);
  if (!action) {
    return { selectorId };
  }

  let value: unknown;
  if (action === 'navigate') {
    value = resolveNavigationValue(step.text, baseUrl);
  } else if (action === 'fill' || action === 'select' || action === 'check') {
    value = extractValueFromStep(step.text, placeholderValues);
  } else if (action === 'wait') {
    value = extractTimeout(step.text);
  } else if (action === 'click') {
    value = undefined;
  }

  if (step.type === 'then' && !value) {
    value = extractAssertionValue(step.text, placeholderValues);
  }

  return { selectorId, action, value };
}

function inferAction(keyword: NormalizedStep['type'], text: string): DeterministicAction | undefined {
  const normalized = text.toLowerCase();
  if (keyword === 'given' && normalized.includes('on the')) {
    return 'navigate';
  }
  if (normalized.includes('enter') || normalized.includes('type') || normalized.includes('fill')) {
    return 'fill';
  }
  if (normalized.includes('select')) {
    return 'select';
  }
  if (normalized.includes('click')) {
    return 'click';
  }
  if (normalized.includes('check')) {
    return 'check';
  }
  if (normalized.includes('wait')) {
    return 'wait';
  }
  return undefined;
}

function resolveNavigationValue(text: string, baseUrl: string): string {
  const explicitPath = text.match(/(\/[a-z0-9\/-]+)/i);
  if (explicitPath) {
    return new URL(explicitPath[1], baseUrl).toString();
  }
  if (text.toLowerCase().includes('login')) {
    return new URL('/login', baseUrl).toString();
  }
  if (text.toLowerCase().includes('dashboard')) {
    return new URL('/dashboard', baseUrl).toString();
  }
  return baseUrl;
}

function extractValueFromStep(text: string, placeholders: Record<string, string>): string | undefined {
  const quoted = text.match(/"([^"]+)"/);
  if (quoted) {
    return quoted[1];
  }
  const placeholderMatch = text.match(/<([A-Z0-9_]+)>/);
  if (placeholderMatch) {
    const key = placeholderMatch[1];
    return placeholders[key] ?? `<${key}>`;
  }
  return undefined;
}

function extractAssertionValue(text: string, placeholders: Record<string, string>): string | undefined {
  if (text.includes('text ')) {
    const after = text.split('text ').pop();
    if (after) {
      const placeholder = extractValueFromStep(after, placeholders);
      if (placeholder && !placeholder.startsWith('<')) {
        return placeholder;
      }
      return after.trim();
    }
  }
  return extractValueFromStep(text, placeholders);
}

function extractTimeout(text: string): number | undefined {
  const numeric = text.match(/(\d{2,4})\s?ms/);
  if (numeric) {
    return Number(numeric[1]);
  }
  return undefined;
}

function inferSelectorId(step: NormalizedStep, scenario: NormalizedScenario): string | undefined {
  if (step.selector) {
    return step.selector;
  }
  const selectors = Object.keys(scenario.selectors ?? {});
  const normalized = step.text.toLowerCase();
  for (const id of selectors) {
    const token = id.replace(/[-_]/g, ' ');
    if (normalized.includes(token.split(' ')[0])) {
      return id;
    }
  }
  return undefined;
}

function resolveSelectorLocator(
  selectorId: string | undefined,
  scenario: NormalizedScenario,
  registry?: SelectorRegistry
): string | undefined {
  if (!selectorId) {
    return undefined;
  }
  const selectorFromScenario = scenario.selectors?.[selectorId];
  if (selectorFromScenario && !selectorFromScenario.startsWith('TODO')) {
    return selectorFromScenario;
  }
  const locator = registry?.selectors?.[selectorId]?.selector;
  if (locator) {
    return locator;
  }
  if (selectorId.startsWith('#') || selectorId.startsWith('.')) {
    return selectorId;
  }
  return `[data-testid='${selectorId}']`;
}

export function buildPlaceholderDefaults(): Record<string, string> {
  return {
    E2E_USER_EMAIL: process.env.E2E_USER_EMAIL ?? 'qa.user@example.com',
    E2E_USER_PASSWORD: process.env.E2E_USER_PASSWORD ?? 'SuperSecure123!',
    E2E_INVALID_PASSWORD: process.env.E2E_INVALID_PASSWORD ?? 'WrongPassword!123',
    E2E_UNKNOWN_EMAIL: process.env.E2E_UNKNOWN_EMAIL ?? 'unknown.user@example.com',
  };
}

export function createStubPage(): Page {
  return {
    url: () => 'about:blank',
  } as unknown as Page;
}
