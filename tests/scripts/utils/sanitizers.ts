export function sanitizeFeatureOutput(raw: string): string {
  const withoutFences = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
  const normalizedNewlines = withoutFences.replace(/\r\n/g, '\n');
  return normalizedNewlines.trim();
}
