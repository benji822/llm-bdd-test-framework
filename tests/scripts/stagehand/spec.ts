import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface PlainSpecScenario {
  name: string;
  description?: string;
  steps: string[];
}

export interface SetupAction {
  type: 'create' | 'delete' | 'assign' | 'update';
  resource: string; // e.g., "player", "reward"
  properties: Record<string, string>;
  alias?: string; // e.g., "$player", "$reward"
}

export interface PlainSpecDefinition {
  specPath: string;
  specId: string;
  featureName?: string;
  description?: string;
  setup?: SetupAction[];
  scenarios: PlainSpecScenario[];
}

export async function readPlainSpec(specPath: string): Promise<PlainSpecDefinition> {
  const content = await fs.readFile(specPath, 'utf-8');
  return parsePlainSpec(content, specPath);
}

export function parsePlainSpec(content: string, specPath: string): PlainSpecDefinition {
  const lines = content.split(/\r?\n/);
  const result: PlainSpecDefinition = {
    specPath,
    specId: createSpecId(content, specPath),
    scenarios: [],
  };

  let currentScenario: PlainSpecScenario | null = null;
  let inSetup = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    if (line.toLowerCase().startsWith('feature:')) {
      result.featureName = line.slice('feature:'.length).trim();
      continue;
    }

    if (line.toLowerCase() === 'setup:') {
      inSetup = true;
      result.setup = [];
      currentScenario = null;
      continue;
    }

    if (line.endsWith(':') && !line.startsWith('-')) {
      const name = line.slice(0, -1).trim();
      if (name && name.toLowerCase() !== 'setup') {
        inSetup = false;
        currentScenario = { name, steps: [] };
        result.scenarios.push(currentScenario);
        continue;
      }
    }

    if (line.startsWith('-')) {
      const step = line.slice(1).trim();
      if (!step) {
        continue;
      }

      if (inSetup) {
        // Parse setup action: "Create player with email <EMAIL>"
        const action = parseSetupAction(step);
        if (action && result.setup) {
          result.setup.push(action);
        }
      } else {
        if (!currentScenario) {
          currentScenario = { name: 'Primary scenario', steps: [] };
          result.scenarios.push(currentScenario);
        }
        currentScenario.steps.push(step);
      }
      continue;
    }

    if (currentScenario && currentScenario.steps.length === 0 && !inSetup) {
      currentScenario.description = currentScenario.description
        ? `${currentScenario.description} ${line}`
        : line;
      continue;
    }

    if (!inSetup) {
      result.description = result.description ? `${result.description} ${line}` : line;
    }
  }

  if (result.scenarios.length === 0) {
    throw new Error(`Spec ${specPath} does not contain any scenarios or steps`);
  }

  if (result.scenarios.every((scenario) => scenario.steps.length === 0)) {
    throw new Error(`Spec ${specPath} includes scenarios but no steps`);
  }

  return result;
}

function parseSetupAction(step: string): SetupAction | undefined {
  // Parse patterns like:
  // "Create player with email <PLAYER_EMAIL>"
  // "Assign reward to player"
  // "Delete old data"

  const parts = step.split(/\b/); // Split by word boundaries to preserve tokens
  const words = parts.filter((p) => p.trim().length > 0);

  if (words.length < 2) {
    return undefined;
  }

  const actionType = words[0].toLowerCase();
  const validTypes = ['create', 'delete', 'assign', 'update'];
  if (!validTypes.includes(actionType)) {
    return undefined;
  }

  const resource = words[1].toLowerCase();
  const properties: Record<string, string> = {};
  let alias: string | undefined;

  // Join the rest and parse key-value pairs
  const rest = step.slice(`${words[0]} ${words[1]}`.length).trim();

  // Extract "with key value" pairs (handles quoted values)
  const withRegex = /\bwith\s+(\w+)\s+([<"][^"]*[>"]|\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = withRegex.exec(rest)) !== null) {
    const key = match[1].toLowerCase();
    let value = match[2];
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    properties[key] = value;
  }

  // Extract alias if mentioned: "Create player ... as $player"
  const aliasMatch = step.match(/\bas\s+(\$[a-zA-Z0-9_]+)/i);
  if (aliasMatch) {
    alias = aliasMatch[1];
  }

  return {
    type: actionType as 'create' | 'delete' | 'assign' | 'update',
    resource,
    properties,
    alias,
  };
}

function createSpecId(content: string, specPath: string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .update(specPath)
    .digest('hex');
}
