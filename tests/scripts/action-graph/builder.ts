import { v4 as uuidv4 } from 'uuid';
import type {
  ActionGraph,
  ActionNode,
  Edge,
  GraphMetadata,
  NodeType,
  GherkinKeyword,
  NodeMetadata,
} from './types.js';

/**
 * Fluent builder for constructing action graphs
 */
export class ActionGraphBuilder {
  private nodes: ActionNode[] = [];
  private edges: Edge[] = [];
  private metadata: Partial<GraphMetadata> = {};
  private graphId = uuidv4();
  private stepCounter = 0;

  setGraphId(graphId: string): this {
    this.graphId = graphId;
    return this;
  }

  setSpecId(specId: string): this {
    this.metadata.specId = specId;
    return this;
  }

  setScenarioName(name: string): this {
    this.metadata.scenarioName = name;
    return this;
  }

  setFeatureName(name: string): this {
    this.metadata.featureName = name;
    return this;
  }

  setScenarioTags(tags: string[]): this {
    if (tags.length === 0) {
      delete this.metadata.scenarioTags;
      return this;
    }

    this.metadata.scenarioTags = Array.from(new Set(tags));
    return this;
  }

  setAuthorship(authoringMode: boolean, authoredBy: 'llm' | 'manual' | 'hybrid'): this {
    this.metadata.authorship = { authoringMode, authoredBy };
    return this;
  }

  addNode(nodeId: string, type: NodeType, options?: Partial<ActionNode>): this {
    this.nodes.push({
      nodeId,
      type,
      stepIndex: this.stepCounter++,
      ...options,
      execution: options?.execution || { state: 'pending' },
    });
    return this;
  }

  addGherkinStep(
    nodeId: string,
    keyword: GherkinKeyword,
    text: string,
    type?: NodeType
  ): this {
    const existingNode = this.nodes.find((n) => n.nodeId === nodeId);
    if (existingNode) {
      existingNode.gherkinStep = { keyword, text };
    } else {
      this.addNode(nodeId, type || 'act', {
        gherkinStep: { keyword, text },
      });
    }
    return this;
  }

  addMetadata(nodeId: string, metadata: Partial<NodeMetadata>): this {
    const node = this.nodes.find((n) => n.nodeId === nodeId);
    if (node) {
      node.metadata = {
        ...(node.metadata || {}),
        ...metadata,
      };
    }
    return this;
  }

  addNaturalInstruction(nodeId: string, instruction: string): this {
    const node = this.nodes.find((n) => n.nodeId === nodeId);
    if (node) {
      node.instructions = {
        ...(node.instructions || {}),
        natural: instruction,
      };
    }
    return this;
  }

  addDeterministicInstruction(
    nodeId: string,
    selector?: string,
    action?: string,
    value?: unknown
  ): this {
    const node = this.nodes.find((n) => n.nodeId === nodeId);
    if (node) {
      node.instructions = {
        ...(node.instructions || {}),
        deterministic: {
          selector,
          action: action as any,
          value,
        },
      };
    }
    return this;
  }

  addSelector(nodeId: string, id: string, locator?: string): this {
    const node = this.nodes.find((n) => n.nodeId === nodeId);
    if (node) {
      if (!node.selectors) {
        node.selectors = [];
      }
      node.selectors.push({
        id,
        locator,
        verified: false,
      });
    }
    return this;
  }

  addEdge(from: string, to: string, type: 'sequential' | 'conditional' | 'parallel' = 'sequential'): this {
    this.edges.push({
      from,
      to,
      type,
    });
    return this;
  }

  addSequentialChain(...nodeIds: string[]): this {
    for (let i = 0; i < nodeIds.length - 1; i++) {
      this.addEdge(nodeIds[i], nodeIds[i + 1], 'sequential');
    }
    return this;
  }

  build(): ActionGraph {
    if (!this.metadata.specId) {
      throw new Error('specId is required');
    }
    if (!this.metadata.scenarioName) {
      throw new Error('scenarioName is required');
    }
    if (this.nodes.length === 0) {
      throw new Error('At least one node is required');
    }

    return {
      graphId: this.graphId,
      version: '1.0',
      nodes: this.nodes,
      edges: this.edges,
      metadata: {
        createdAt: new Date().toISOString(),
        ...this.metadata,
      } as GraphMetadata,
    };
  }
}

/**
 * Convert a normalized YAML spec to an action graph
 */
export function yamlToActionGraph(
  yamlSpec: any,
  scenarioIndex: number
): ActionGraphBuilder {
  const scenario = yamlSpec.scenarios[scenarioIndex];
  if (!scenario) {
    throw new Error(`Scenario at index ${scenarioIndex} not found`);
  }

  const authoringMode = yamlSpec.metadata.authoringMode ?? true;
  const authoredBy =
    yamlSpec.metadata.authoredBy ?? (authoringMode ? 'llm' : 'manual');

  const builder = new ActionGraphBuilder()
    .setSpecId(yamlSpec.metadata.specId)
    .setScenarioName(scenario.name)
    .setFeatureName(yamlSpec.feature)
    .setScenarioTags(scenario.tags ?? [])
    .setAuthorship(authoringMode, authoredBy);

  const backgroundStepIds: string[] = [];
  const stepIds: string[] = [];
  let previousScenarioType: NodeType | undefined;
  let previousBackgroundType: NodeType | undefined;

  const selectorRegistry: Record<string, string> = scenario.selectors ?? {};

  if (yamlSpec.background?.steps) {
    yamlSpec.background.steps.forEach((step: any, idx: number) => {
      const nodeId = `bg_${idx}`;
      previousBackgroundType = addStepNode({
        builder,
        nodeId,
        step,
        selectorRegistry,
        previousType: previousBackgroundType,
        isBackground: true,
      });
      backgroundStepIds.push(nodeId);
    });
  }

  scenario.steps.forEach((step: any, idx: number) => {
    const nodeId = `step_${idx}`;
    previousScenarioType = addStepNode({
      builder,
      nodeId,
      step,
      selectorRegistry,
      previousType: previousScenarioType,
    });
    stepIds.push(nodeId);
  });

  const orderedIds = [...backgroundStepIds, ...stepIds];
  if (orderedIds.length > 1) {
    builder.addSequentialChain(...orderedIds);
  }

  return builder;
}

interface StepNodeOptions {
  builder: ActionGraphBuilder;
  nodeId: string;
  step: {
    type: GherkinKeyword;
    text: string;
    selector?: string;
    testData?: Record<string, unknown>;
  };
  selectorRegistry: Record<string, string>;
  previousType?: NodeType;
  isBackground?: boolean;
}

function addStepNode(options: StepNodeOptions): NodeType {
  const { builder, nodeId, step, selectorRegistry, previousType, isBackground } = options;
  const nodeType = resolveNodeType(step.type, previousType, isBackground);

  builder
    .addGherkinStep(nodeId, step.type, step.text, nodeType)
    .addNaturalInstruction(nodeId, step.text);

  if (step.selector) {
    const locator = selectorRegistry[step.selector];
    if (locator) {
      builder.addSelector(nodeId, step.selector, locator);
    }
  }

  if (step.testData) {
    builder.addMetadata(nodeId, { testData: step.testData });
  }

  return nodeType;
}

function resolveNodeType(
  keyword: GherkinKeyword,
  previousType?: NodeType,
  isBackground?: boolean
): NodeType {
  if (isBackground) {
    if (keyword === 'then') {
      return 'assert';
    }
    if (keyword === 'when') {
      return 'act';
    }
    return 'setup';
  }

  switch (keyword) {
    case 'given':
      return 'setup';
    case 'when':
      return 'act';
    case 'then':
      return 'assert';
    case 'and':
    case 'but':
      return previousType ?? 'act';
    default:
      return 'act';
  }
}
