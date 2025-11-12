import type { CiVerifyOptions } from '../ci-verify.js';
import {
  CiVerificationTimeoutError,
  EXIT_CODES,
  runCiVerification,
} from '../ci-verify.js';
import { logEvent } from '../utils/logging.js';

export function parseCiVerifyArgs(argv: string[]): CiVerifyOptions {
  const options: CiVerifyOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

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
        const parsed = Number(next);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid --timeout value: ${next}`);
        }
        options.timeoutMs = parsed;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

export async function executeCiVerify(options: CiVerifyOptions): Promise<number> {
  try {
    const result = await runCiVerification(options);

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

    return result.exitCode;
  } catch (error) {
    if (error instanceof CiVerificationTimeoutError) {
      logEvent('cli.ci-verify.timeout', error.message, undefined, 'error');
      console.error(error.message);
      return EXIT_CODES.timeout;
    }

    const message = (error as Error).message ?? 'Unknown error';
    logEvent('cli.ci-verify.error', 'spec:ci-verify crashed', { message }, 'error');
    console.error(message);
    return EXIT_CODES.unknown;
  }
}

function ensureValue(flag: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`Missing value after ${flag}`);
  }
}
