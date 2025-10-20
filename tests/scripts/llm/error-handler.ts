import { LLMProviderError, type LLMErrorCode, type LLMProviderName } from './provider-interface';

export const MAX_LLM_TIMEOUT_MS = 3 * 60 * 1000;

const ERROR_CODES: ReadonlyArray<LLMErrorCode> = [
  'PROVIDER_ERROR',
  'SDK_TIMEOUT',
  'INVALID_RESPONSE',
  'SDK_INITIALIZATION_FAILED',
  'MODEL_NOT_AVAILABLE',
] as const;

export function sanitizeTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs)) {
    return MAX_LLM_TIMEOUT_MS;
  }

  if (timeoutMs <= 0) {
    throw new LLMProviderError('SDK_TIMEOUT', `Timeout must be greater than 0ms, received ${timeoutMs}`);
  }

  if (timeoutMs > MAX_LLM_TIMEOUT_MS) {
    throw new LLMProviderError(
      'SDK_TIMEOUT',
      `Timeout ${timeoutMs}ms exceeds the maximum allowed ${MAX_LLM_TIMEOUT_MS}ms window`,
    );
  }

  return timeoutMs;
}

export async function withLLMTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  provider: LLMProviderName,
  context = 'LLM request',
): Promise<T> {
  const effectiveTimeout = sanitizeTimeout(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const result = await operation(controller.signal);
    if (controller.signal.aborted) {
      throw new LLMProviderError(
        'SDK_TIMEOUT',
        `${context} exceeded ${effectiveTimeout}ms for provider ${provider}`,
        { provider, timeoutMs: effectiveTimeout },
      );
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LLMProviderError(
        'SDK_TIMEOUT',
        `${context} exceeded ${effectiveTimeout}ms for provider ${provider}`,
        { provider, timeoutMs: effectiveTimeout },
        error,
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function mapProviderError(
  provider: LLMProviderName,
  error: unknown,
  fallbackCode: LLMErrorCode = 'PROVIDER_ERROR',
): LLMProviderError {
  if (error instanceof LLMProviderError) {
    return error;
  }

  const candidateCode = extractErrorCode(error);
  const code = candidateCode ?? fallbackCode;
  const message = extractErrorMessage(error);

  return new LLMProviderError(code, message, { provider }, error);
}

function extractErrorCode(error: unknown): LLMErrorCode | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)) {
      return code as LLMErrorCode;
    }
  }
  return undefined;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown LLM provider error';
}

interface RetryOptions {
  provider: LLMProviderName;
  maxAttempts?: number;
  initialDelayMs?: number;
  onRetry?: (attempt: number, error: LLMProviderError) => void;
}

const RETRIABLE_CODES: ReadonlySet<LLMErrorCode> = new Set(['PROVIDER_ERROR', 'SDK_TIMEOUT', 'INVALID_RESPONSE']);

export async function withLLMRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let delayMs = Math.max(500, options.initialDelayMs ?? 2000);
  let attempt = 0;
  let lastError: LLMProviderError | undefined;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const mapped = mapProviderError(options.provider, error);
      if (!RETRIABLE_CODES.has(mapped.code) || attempt >= maxAttempts) {
        throw mapped;
      }

      lastError = mapped;
      options.onRetry?.(attempt, mapped);
      await sleep(delayMs);
      delayMs *= 2;
    }
  }

  throw lastError ?? new LLMProviderError('PROVIDER_ERROR', 'LLM retry attempts exhausted', {
    provider: options.provider,
    attempts: maxAttempts,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
