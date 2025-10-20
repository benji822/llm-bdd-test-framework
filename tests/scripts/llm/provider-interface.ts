export type LLMProviderName = 'codex' | 'claude';

export type LLMErrorCode =
  | 'PROVIDER_ERROR'
  | 'SDK_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'SDK_INITIALIZATION_FAILED'
  | 'MODEL_NOT_AVAILABLE';

export interface LLMCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface LLMCompletionMetadata {
  provider: LLMProviderName;
  model: string;
  tokensUsed: number;
  responseTime: number;
}

export interface LLMCompletionResult {
  completion: string;
  metadata: LLMCompletionMetadata;
}

export class LLMProviderError extends Error {
  public readonly code: LLMErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly cause: unknown;

  constructor(code: LLMErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(message);
    this.name = 'LLMProviderError';
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

export abstract class LLMProvider {
  abstract readonly name: LLMProviderName;

  abstract generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult>;
}
