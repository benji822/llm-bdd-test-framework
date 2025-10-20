#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs/promises';

import './utils/load-env';

import { normalizeYamlSpecification, normalizeYamlBatch } from './normalize-yaml';
import { createLLMProvider } from './llm';
import { logEvent } from './utils/logging';
import { assertRequiredEnvVars } from './utils/env-validation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const batchModeIndex = args.indexOf('--batch');
  const isBatchMode = batchModeIndex !== -1;

  if (isBatchMode) {
    args.splice(batchModeIndex, 1);
    await runBatchMode(args);
  } else {
    await runSingleMode(args);
  }
}

async function runSingleMode(args: string[]): Promise<void> {
  const forceIndex = args.indexOf('--force');
  const force = forceIndex !== -1;
  if (force) {
    args.splice(forceIndex, 1);
  }

  if (args.length < 2) {
    console.error('Usage: node tests/scripts/cli-normalize.ts <specPath> <clarificationsPath> [outputPath]');
    console.error('   or: node tests/scripts/cli-normalize.ts --batch <specsDir> <clarificationsDir> [outputDir] [--concurrency N]');
    process.exitCode = 1;
    return;
  }

  const [specPath, clarificationsPath, maybeOutput] = args;

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:normalize');
    const provider = createLLMProvider();
    const result = await normalizeYamlSpecification({
      specPath,
      clarificationsPath,
      outputPath: maybeOutput,
      provider,
      force,
    });

    logEvent('cli.normalize.generated', `Normalized YAML generated for ${specPath}`, {
      outputPath: result.outputPath,
      model: result.metadata.model,
      provider: result.metadata.provider,
      tokensUsed: result.metadata.tokensUsed,
      responseTime: result.metadata.responseTime,
    });
    console.log(`Normalized YAML written to ${result.outputPath}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function runBatchMode(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Usage: node tests/scripts/cli-normalize.ts --batch <specsDir> <clarificationsDir> [outputDir] [--concurrency N]');
    process.exitCode = 1;
    return;
  }

  const [specsDir, clarificationsDir, outputDir] = args;

  const concurrencyIndex = args.indexOf('--concurrency');
  const concurrency = concurrencyIndex !== -1 && args[concurrencyIndex + 1]
    ? parseInt(args[concurrencyIndex + 1], 10)
    : undefined;

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:normalize');

    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    const specPaths = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
      .map((entry) => path.join(specsDir, entry.name));

    if (specPaths.length === 0) {
      console.error(`No .txt files found in ${specsDir}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Found ${specPaths.length} specs to normalize`);
    console.log(`Concurrency: ${concurrency ?? 'auto'}`);

    const startTime = Date.now();
    const provider = createLLMProvider();
    const results = await normalizeYamlBatch({
      specPaths,
      clarificationsDir,
      outputDir,
      provider,
      concurrency,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    logEvent('cli.normalize.batch.completed', `Normalized ${results.length} specs in ${duration}s`, {
      count: results.length,
      duration,
      concurrency: concurrency ?? 'auto',
    });

    console.log(`\n✅ Normalized ${results.length} specs in ${duration}s`);
    results.forEach((result) => {
      console.log(`   - ${path.basename(result.outputPath)}`);
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
