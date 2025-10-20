export function assertRequiredEnvVars(vars: string[], context: string): void {
  const missing = vars.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim().length === 0;
  });

  if (missing.length > 0) {
    const list = missing.join(', ');
    throw new Error(
      `${context} requires environment variables: ${list}. Populate them in .env.local (see .env.local.example).`,
    );
  }
}
