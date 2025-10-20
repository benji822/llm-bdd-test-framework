import fs from 'node:fs/promises';
import path from 'node:path';

export interface PromptVariables {
  [key: string]: string | number | boolean;
}

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

const templateCache = new Map<string, string>();

export async function loadPromptTemplate(templatePath: string): Promise<string> {
  const resolvedPath = path.resolve(templatePath);

  if (templateCache.has(resolvedPath)) {
    return templateCache.get(resolvedPath) as string;
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf8');
    templateCache.set(resolvedPath, content);
    return content;
  } catch (error) {
    throw new PromptTemplateError(
      `Unable to load prompt template at ${resolvedPath}: ${(error as Error).message}`,
    );
  }
}

export async function renderPrompt(
  templatePath: string,
  variables: PromptVariables = {},
): Promise<string> {
  const template = await loadPromptTemplate(templatePath);
  return interpolateVariables(template, variables);
}

export function interpolateVariables(
  template: string,
  variables: PromptVariables,
): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!(key in variables)) {
      throw new PromptTemplateError(`Missing prompt variable: ${key}`);
    }
    const value = variables[key];
    if (value === undefined || value === null) {
      throw new PromptTemplateError(`Variable ${key} resolved to empty value`);
    }
    return String(value);
  });
}

export function clearPromptTemplateCache(): void {
  templateCache.clear();
}
