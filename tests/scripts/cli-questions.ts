#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import { generateClarificationQuestions } from './generate-questions';
import { createLLMProvider } from './llm';
import { logEvent } from './utils/logging';
import { assertRequiredEnvVars } from './utils/env-validation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tests/scripts/cli-questions.ts <specPath> [outputPath] [--author <email>]');
    process.exitCode = 1;
    return;
  }

  const specPath = args[0];
  let outputPath: string | undefined;
  let author: string | undefined;

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--author') {
      author = args[i + 1];
      i += 1;
    } else if (!outputPath) {
      outputPath = token;
    }
  }

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:questions');
    const provider = createLLMProvider();
    const result = await generateClarificationQuestions({
      specPath,
      outputPath,
      provider,
      author,
    });

    logEvent('cli.questions.generated', `Clarification questions generated for ${specPath}`, {
      outputPath: result.outputPath,
      model: result.metadata.model,
      provider: result.metadata.provider,
      tokensUsed: result.metadata.tokensUsed,
      responseTime: result.metadata.responseTime,
    });
    console.log(`Clarification questions written to ${result.outputPath}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
