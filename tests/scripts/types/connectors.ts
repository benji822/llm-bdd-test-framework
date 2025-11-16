export type ConnectorType = 'http' | 'graphql' | 'sql';

export interface ConnectorVariable {
  name: string;
  value: string;
  env?: string; // Optional env var name to resolve from
}

export interface ConnectorEndpoint {
  type: ConnectorType;
  url?: string; // For HTTP/GraphQL
  database?: string; // For SQL
  connectionString?: string; // For SQL
}

export interface ConnectorAction {
  name: string;
  resource: string; // e.g., "player", "reward"
  operation: 'create' | 'delete' | 'update' | 'assign';
  endpoint: string; // Reference to connectors.endpoints key
  payload?: Record<string, unknown>;
  query?: string; // For SQL/GraphQL
  idempotencyKey?: string; // For idempotent operations
  alias?: string; // For result aliasing (e.g., "$player")
  retry?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

export interface ConnectorRegistry {
  version: string;
  variables?: ConnectorVariable[];
  endpoints: Record<string, ConnectorEndpoint>;
  actions: Record<string, ConnectorAction>;
}

export interface ExecutedAction {
  name: string;
  resource: string;
  status: 'success' | 'failed' | 'skipped';
  alias?: string;
  data?: Record<string, unknown>; // Returned data (e.g., { id, email })
  error?: string;
  timestamp: string;
}

export interface SetupState {
  executedActions: ExecutedAction[];
  aliases: Record<string, unknown>; // Mapping of $alias -> value
}
