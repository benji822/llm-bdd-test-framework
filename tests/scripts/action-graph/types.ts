/**
 * Action Graph Types
 * Defines the structure for deterministic test execution tracking
 */

export type NodeType = 'navigate' | 'observe' | 'act' | 'extract' | 'assert' | 'setup' | 'teardown';
export type ExecutionState = 'pending' | 'running' | 'success' | 'failed' | 'skipped';
export type EdgeType = 'sequential' | 'conditional' | 'parallel';
export type GherkinKeyword = 'given' | 'when' | 'then' | 'and' | 'but';
export type AuthorshipSource = 'llm' | 'manual' | 'hybrid';
export type DeterministicAction = 'click' | 'fill' | 'select' | 'navigate' | 'wait' | 'check';

export interface ActionMetadata {
  id: string;
  timestamp: string;
  duration: number;
  cached: boolean;
  cacheKey?: string;
}

export interface GherkinStepRef {
  keyword: GherkinKeyword;
  text: string;
}

export interface DeterministicInstructions {
  selector?: string;
  action?: DeterministicAction;
  value?: unknown;
}

export interface NodeInstructions {
  natural?: string;
  deterministic?: DeterministicInstructions;
}

export interface SelectorRef {
  id: string;
  locator?: string;
  verified?: boolean;
}

export interface ExecutionRecord {
  state: ExecutionState;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  cached?: boolean;
  cacheKey?: string;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  result?: unknown;
}

export interface NodeMetadata {
  retries?: number;
  timeout?: number;
  critical?: boolean;
  testData?: Record<string, unknown>;
}

export interface ActionNode {
  nodeId: string;
  type: NodeType;
  stepIndex: number;
  gherkinStep?: GherkinStepRef;
  instructions?: NodeInstructions;
  selectors?: SelectorRef[];
  execution?: ExecutionRecord;
  metadata?: NodeMetadata;
}

export interface Edge {
  from: string;
  to: string;
  type?: EdgeType;
  condition?: string;
}

export interface GraphAuthorship {
  authoringMode?: boolean;
  authoredBy?: AuthorshipSource;
}

export interface GraphMetadata {
  createdAt: string;
  updatedAt?: string;
  specId: string;
  scenarioName: string;
  authorship?: GraphAuthorship;
}

export interface ActionGraph {
  graphId: string;
  version: '1.0';
  nodes: ActionNode[];
  edges: Edge[];
  metadata: GraphMetadata;
}

export interface GraphPersistenceOptions {
  graphDir?: string;
  versioned?: boolean;
}
