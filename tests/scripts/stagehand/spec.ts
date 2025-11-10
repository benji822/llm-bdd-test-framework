import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface PlainSpecScenario {
  name: string;
  description?: string;
  steps: string[];
}

export interface PlainSpecDefinition {
  specPath: string;
  specId: string;
  featureName?: string;
  description?: string;
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

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    if (line.toLowerCase().startsWith('feature:')) {
      result.featureName = line.slice('feature:'.length).trim();
      continue;
    }

    if (line.endsWith(':') && !line.startsWith('-')) {
      const name = line.slice(0, -1).trim();
      if (name) {
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
      if (!currentScenario) {
        currentScenario = { name: 'Primary scenario', steps: [] };
        result.scenarios.push(currentScenario);
      }
      currentScenario.steps.push(step);
      continue;
    }

    if (currentScenario && currentScenario.steps.length === 0) {
      currentScenario.description = currentScenario.description
        ? `${currentScenario.description} ${line}`
        : line;
      continue;
    }

    result.description = result.description ? `${result.description} ${line}` : line;
  }

  if (result.scenarios.length === 0) {
    throw new Error(`Spec ${specPath} does not contain any scenarios or steps`);
  }

  if (result.scenarios.every((scenario) => scenario.steps.length === 0)) {
    throw new Error(`Spec ${specPath} includes scenarios but no steps`);
  }

  return result;
}

function createSpecId(content: string, specPath: string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .update(specPath)
    .digest('hex');
}
