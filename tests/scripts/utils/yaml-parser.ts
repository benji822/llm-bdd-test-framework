import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

export function sanitizeYamlInput(raw: string): string {
  const withoutFences = raw.replace(/```(?:yaml|yml|json)?/gi, '').replace(/```/g, '');
  const trimmed = withoutFences.trim();

  if (looksLikeJson(trimmed)) {
    try {
      const jsonValue = JSON.parse(trimmed);
      return dumpYaml(jsonValue, { lineWidth: 120 });
    } catch {
      // Fall through and return original content if JSON parse fails
    }
  }

  return trimmed.replace(/\r\n/g, '\n');
}

export function parseYaml<T>(raw: string): T {
  const sanitized = sanitizeYamlInput(raw);
  const result = loadYaml(sanitized);

  if (result === undefined || result === null) {
    throw new Error('YAML input resolved to empty value');
  }

  return result as T;
}

export function stringifyYaml(value: unknown): string {
  return dumpYaml(value, { lineWidth: 120, noRefs: true });
}

function looksLikeJson(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}
