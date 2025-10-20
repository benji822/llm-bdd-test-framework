#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import { generateFeatureFilesBatch } from './generate-features';
import { createLLMProvider } from './llm';
import { logEvent } from './utils/logging';
import { assertRequiredEnvVars } from './utils/env-validation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      'Usage: yarn spec:features <yamlPath...> [--output <dir>] [--vocabulary <path>] [--concurrency <n>]',
    );
    process.exitCode = 1;
    return;
  }

  const yamlPaths: string[] = [];
  let outputDir: string | undefined;
  let vocabularyPath: string | undefined;
  let concurrency: number | undefined;
  let explicitOutput = false;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--vocabulary') {
      vocabularyPath = args[i + 1];
      i += 1;
    } else if (token === '--output' || token === '--out') {
      outputDir = args[i + 1];
      explicitOutput = true;
      i += 1;
    } else if (token === '--concurrency') {
      const value = Number(args[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        console.error(`Invalid --concurrency value: ${args[i + 1]}`);
        process.exitCode = 1;
        return;
      }
      concurrency = value;
      i += 1;
    } else if (token.startsWith('--')) {
      console.error(`Unknown argument: ${token}`);
      process.exitCode = 1;
      return;
    } else {
      yamlPaths.push(token);
    }
  }

  if (yamlPaths.length === 0) {
    console.error('Provide at least one YAML path.');
    process.exitCode = 1;
    return;
  }

  if (!explicitOutput && yamlPaths.length === 2 && !/\.(ya?ml)$/i.test(yamlPaths[1])) {
    outputDir = yamlPaths.pop();
  }

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:features');
    const provider = createLLMProvider();
    const results = await generateFeatureFilesBatch({
      yamlPaths,
      outputDir,
      provider,
      vocabularyPath,
      concurrency,
    });
    const allOutputs = results.flatMap((result) => result.outputPaths);

    for (const result of results) {
      logEvent('cli.features.generated', 'Feature generation completed', {
        outputPaths: result.outputPaths,
        model: result.metadata.model,
        provider: result.metadata.provider,
        tokensUsed: result.metadata.tokensUsed,
        responseTime: result.metadata.responseTime,
      });
    }

    console.log(`Generated feature files:\n${allOutputs.join('\n')}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
