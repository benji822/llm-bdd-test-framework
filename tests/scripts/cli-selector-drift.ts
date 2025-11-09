#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import { validateSelectorDrift } from './selector-drift';
import { resolveRegistryPath, resolveDriftReportPath } from './selector-registry';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let baseUrl = process.env.E2E_BASE_URL ?? '';
  const routes: string[] = [];
  let registryPath: string | undefined;
  let reportPath: string | undefined;
  let applyUpdates = false;

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
    } else if (token === '--base-url') {
      baseUrl = args[i + 1] ?? '';
      if (!baseUrl) {
        console.error('Missing value after --base-url');
        process.exitCode = 1;
        return;
      }
      i += 1;
    } else if (token === '--registry') {
      registryPath = args[i + 1];
      if (!registryPath) {
        console.error('Missing value after --registry');
        process.exitCode = 1;
        return;
      }
      i += 1;
    } else if (token === '--report') {
      reportPath = args[i + 1];
      if (!reportPath) {
        console.error('Missing value after --report');
        process.exitCode = 1;
        return;
      }
      i += 1;
    } else if (token === '--apply') {
      applyUpdates = true;
    } else if (token === '--help') {
      printHelp();
      return;
    } else {
      routes.push(token);
    }
  }

  if (!baseUrl) {
    console.error('E2E_BASE_URL env var or --base-url argument is required.');
    process.exitCode = 1;
    return;
  }

  const resolvedRegistryPath = resolveRegistryPath(registryPath);
  const resolvedReportPath = resolveDriftReportPath(reportPath);

  try {
    const result = await validateSelectorDrift({
      baseUrl,
      routes: routes.length > 0 ? Array.from(new Set(routes)) : undefined,
      registryPath: resolvedRegistryPath,
      reportPath: resolvedReportPath,
      applyUpdates,
    });

    const summary = result.report.summary;
    console.log(`Selector drift report saved to ${resolvedReportPath}.`);
    console.log(
      `Missing: ${summary.missing}, Updated: ${summary.updated}, New: ${summary.new}, Unchanged: ${summary.unchanged}.`,
    );
    if (applyUpdates) {
      console.log(`Registry updated at ${resolvedRegistryPath}.`);
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`Usage: spec:selector-drift [options] [routes...]

Options:
  --base-url <url>     Base URL of the running application (required if env not set)
  --route <path>       Route to scan (can be repeated)
  --registry <path>    Override selector registry path
  --report <path>      Override drift report output path
  --apply              Apply suggested updates to the registry
  --help               Show this help message
`);
}

void main();
