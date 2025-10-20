#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import { collectSelectors } from './collect-selectors';
import { logEvent } from './utils/logging';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let baseUrl = process.env.E2E_BASE_URL ?? '';
  const routes: string[] = [];
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--route') {
      const value = args[i + 1];
      if (!value) {
        console.error('Missing value after --route');
        process.exitCode = 1;
        return;
      }
      routes.push(value);
      i += 1;
    } else if (token === '--output') {
      outputPath = args[i + 1];
      if (!outputPath) {
        console.error('Missing value after --output');
        process.exitCode = 1;
        return;
      }
      i += 1;
    } else if (token === '--base-url') {
      baseUrl = args[i + 1] ?? '';
      if (!baseUrl) {
        console.error('Missing value after --base-url');
        process.exitCode = 1;
        return;
      }
      i += 1;
    } else {
      routes.push(token);
    }
  }

  if (!baseUrl) {
    console.error('E2E_BASE_URL env var or --base-url argument is required.');
    process.exitCode = 1;
    return;
  }

  const uniqueRoutes = routes.length > 0 ? Array.from(new Set(routes)) : undefined;

  try {
    const registry = await collectSelectors({
      baseUrl,
      routes: uniqueRoutes,
      outputPath,
    });

    logEvent('cli.collect-selectors.success', 'Selector collection completed', {
      baseUrl,
      total: Object.keys(registry.selectors).length,
      outputPath: outputPath ?? 'tests/artifacts/selectors.json',
    });
    console.log(`Selector registry updated with ${Object.keys(registry.selectors).length} entries.`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
