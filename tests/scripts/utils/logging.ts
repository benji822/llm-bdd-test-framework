type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message?: string;
  data?: Record<string, unknown>;
}

interface LLMInteractionDetails {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  responseTimeMs?: number;
  metadata?: Record<string, unknown>;
}

export function logEvent(event: string, message: string, data?: Record<string, unknown>, level: LogLevel = 'info'): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    data,
  };

  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export function logLLMInteraction(scope: string, details: LLMInteractionDetails): void {
  logEvent('llm.interaction', scope, {
    provider: details.provider,
    model: details.model,
    promptTokens: details.promptTokens,
    completionTokens: details.completionTokens,
    totalTokens: details.totalTokens ?? sumDefined(details.promptTokens, details.completionTokens),
    responseTimeMs: details.responseTimeMs,
    metadata: details.metadata,
  });
}

export function logValidationResult(artifact: string, status: 'pass' | 'fail', details?: Record<string, unknown>): void {
  logEvent('validation.result', artifact, { status, ...details });
}

function sumDefined(a?: number, b?: number): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') {
    return a + b;
  }
  return a ?? b;
}
