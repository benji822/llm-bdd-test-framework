import { readTextFile } from '../utils/file-operations.js';
import { parseYaml } from '../utils/yaml-parser.js';
import { logEvent } from '../utils/logging.js';
import type {
  ConnectorRegistry,
  ConnectorAction,
  ExecutedAction,
  SetupState,
} from '../types/connectors.js';
import type { SetupAction } from '../stagehand/spec.js';
import crypto from 'node:crypto';

/**
 * Resolves environment variables in connector configuration
 */
function resolveEnvVar(value: string): string {
  const match = value.match(/^\$\{([A-Z0-9_]+)\}$|^<([A-Z0-9_]+)>$/);
  if (!match) {
    return value;
  }
  const envKey = match[1] || match[2];
  const envValue = process.env[envKey];
  if (!envValue) {
    throw new Error(
      `Environment variable ${envKey} not found. Required by connector configuration.`
    );
  }
  return envValue;
}

/**
 * Generates an idempotency key based on resource and timestamp
 */
function generateIdempotencyKey(resource: string, timestamp: string): string {
  return crypto
    .createHash('sha256')
    .update(`${resource}:${timestamp}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Loads and parses connectors.yaml
 */
export async function loadConnectors(
  connectorsPath: string
): Promise<ConnectorRegistry | undefined> {
  try {
    const raw = await readTextFile(connectorsPath);
    return parseYaml<ConnectorRegistry>(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(
      `Failed to load connectors at ${connectorsPath}: ${(error as Error).message}`
    );
  }
}

/**
 * Maps a SetupAction (from spec) to a ConnectorAction (from connectors.yaml)
 */
function resolveActionFromRegistry(
  setupAction: SetupAction,
  registry: ConnectorRegistry
): ConnectorAction | undefined {
  // Find an action that matches the resource and operation type
  for (const actionName of Object.keys(registry.actions)) {
    const action = registry.actions[actionName];
    if (
      action.resource === setupAction.resource &&
      action.operation === setupAction.type
    ) {
      return action;
    }
  }
  return undefined;
}

/**
 * Executes a connector action and returns the result
 */
async function executeConnectorAction(
  action: ConnectorAction,
  connectorRegistry: ConnectorRegistry,
  setupAction: SetupAction,
  aliases: Record<string, unknown>
): Promise<ExecutedAction> {
  const timestamp = new Date().toISOString();
  const result: ExecutedAction = {
    name: action.name,
    resource: action.resource,
    status: 'skipped',
    alias: setupAction.alias,
    timestamp,
  };

  try {
    const endpoint = connectorRegistry.endpoints[action.endpoint];
    if (!endpoint) {
      throw new Error(`Endpoint ${action.endpoint} not found in connectors.yaml`);
    }

    // Prepare payload with setup properties
    const payload = action.payload ? { ...action.payload } : {};
    for (const [key, value] of Object.entries(setupAction.properties)) {
      payload[key] = value;
    }

    // Resolve aliases in payload
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const aliasKey = value.slice(1); // Remove $
        if (aliases[aliasKey]) {
          payload[key] = aliases[aliasKey];
        }
      }
    }

    // Mock HTTP/GraphQL execution (production would use actual client)
    if (endpoint.type === 'http' || endpoint.type === 'graphql') {
      const url = resolveEnvVar(endpoint.url || '');
      const idempotencyKey =
        action.idempotencyKey || generateIdempotencyKey(action.resource, timestamp);

      // In production, call actual endpoint
      // For now, mock successful response
      const mockResponse = {
        id: crypto.randomUUID(),
        ...payload,
        createdAt: timestamp,
      };

      result.data = mockResponse;
      result.status = 'success';

      logEvent('llm-bdd.setup', `Executed action: ${action.name}`, {
        endpoint: url,
        resource: action.resource,
        operation: action.operation,
        idempotencyKey,
      });
    } else if (endpoint.type === 'sql') {
      // SQL execution (mocked for now)
      const mockResponse = {
        id: crypto.randomUUID(),
        ...payload,
        createdAt: timestamp,
      };

      result.data = mockResponse;
      result.status = 'success';

      logEvent('llm-bdd.setup', `Executed action: ${action.name}`, {
        database: endpoint.database,
        resource: action.resource,
        operation: action.operation,
      });
    }

    return result;
  } catch (error) {
    result.status = 'failed';
    result.error = (error as Error).message;
    logEvent('llm-bdd.setup', `Failed action: ${action.name}`, {
      error: (error as Error).message,
      resource: action.resource,
    });
    return result;
  }
}

/**
 * Executes all setup actions in order, building aliases for cross-step references
 */
export async function executeSetup(
  setupActions: SetupAction[] | undefined,
  connectorsPath: string
): Promise<SetupState> {
  const state: SetupState = {
    executedActions: [],
    aliases: {},
  };

  if (!setupActions || setupActions.length === 0) {
    return state;
  }

  const registry = await loadConnectors(connectorsPath);
  if (!registry) {
    logEvent('llm-bdd.setup', 'No connectors.yaml found; skipping setup execution', {
      connectorsPath,
    });
    return state;
  }

  for (const setupAction of setupActions) {
    const connectorAction = resolveActionFromRegistry(setupAction, registry);
    if (!connectorAction) {
      logEvent('llm-bdd.setup', `No connector found for action`, {
        resource: setupAction.resource,
        operation: setupAction.type,
      });
      continue;
    }

    const executed = await executeConnectorAction(
      connectorAction,
      registry,
      setupAction,
      state.aliases
    );

    state.executedActions.push(executed);

    // Build aliases for this action result
    if (executed.status === 'success' && executed.alias && executed.data) {
      state.aliases[executed.alias.slice(1)] = executed.data; // Remove $ prefix
    }
  }

  return state;
}

/**
 * Injects setup state into test steps via substitution
 */
export function injectAliasesIntoSteps(
  steps: string[],
  state: SetupState
): string[] {
  return steps.map((step) => {
    let modified = step;
    for (const [alias, value] of Object.entries(state.aliases)) {
      // Replace $alias references with actual values
      // E.g., "I claim reward as $player" -> gets player.id injected
      const pattern = new RegExp(`\\$${alias}`, 'g');
      if (value && typeof value === 'object' && 'id' in value) {
        modified = modified.replace(pattern, String((value as Record<string, unknown>).id));
      }
    }
    return modified;
  });
}

// Re-export types
export type { SetupState };
