#!/usr/bin/env node
import process from 'node:process';

import { CiVerificationTimeoutError, EXIT_CODES, runCiVerification, type CiVerifyOptions } from './ci-verify';
import { logEvent } from './utils/logging';

async function main(): Promise<void> {
  const options: CiVerifyOptions = {};
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];

    switch (token) {
      case '--normalized':
        ensureValue(token, next);
        options.normalizedDir = next;
        index += 1;
        break;
      case '--features':
        ensureValue(token, next);
        options.featuresDir = next;
        index += 1;
        break;
      case '--selectors':
        ensureValue(token, next);
        options.selectorsPath = next;
        index += 1;
        break;
      case '--vocabulary':
        ensureValue(token, next);
        options.vocabularyPath = next;
        index += 1;
        break;
      case '--report':
        ensureValue(token, next);
        options.reportPath = next;
        index += 1;
        break;
      case '--ci-report':
        ensureValue(token, next);
        options.ciReportPath = next;
        index += 1;
        break;
      case '--bundle':
        ensureValue(token, next);
        options.artifactsArchiveDir = next;
        index += 1;
        break;
      case '--timeout':
        ensureValue(token, next);
        options.timeoutMs = Number(next);
        if (!Number.isFinite(options.timeoutMs)) {
          throw new Error(`Invalid --timeout value: ${next}`);
        }
        index += 1;
        break;
      default:
        console.error(`Unknown argument: ${token}`);
        process.exitCode = EXIT_CODES.unknown;
        return;
    }
  }

  try {
    const result = await runCiVerification(options);
    process.exitCode = result.exitCode;

    if (result.exitCode === EXIT_CODES.success) {
      logEvent('cli.ci-verify.success', 'spec:ci-verify completed successfully', {
        durationMs: result.durationMs,
        bundlePath: result.bundlePath,
      });
      console.log(`spec:ci-verify completed successfully. Bundle: ${result.bundlePath}`);
    } else {
      logEvent('cli.ci-verify.failure', 'spec:ci-verify detected issues', {
        exitCode: result.exitCode,
        summary: result.summary,
      });
      console.error(`spec:ci-verify detected issues. Exit code: ${result.exitCode}`);
    }
  } catch (error) {
    if (error instanceof CiVerificationTimeoutError) {
      logEvent('cli.ci-verify.timeout', error.message, undefined, 'error');
      console.error(error.message);
      process.exitCode = EXIT_CODES.timeout;
    } else {
      const message = (error as Error).message ?? 'Unknown error';
      logEvent('cli.ci-verify.error', 'spec:ci-verify crashed', { message }, 'error');
      console.error(message);
      process.exitCode = EXIT_CODES.unknown;
    }
  }
}

function ensureValue(flag: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`Missing value after ${flag}`);
  }
}

void main();
