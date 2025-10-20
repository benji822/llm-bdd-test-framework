import type {
  CodexOptions,
  RunResult,
  SandboxMode,
  ThreadOptions,
  Usage,
} from '@openai/codex-sdk';

import type { LLMCompletionResult, LLMCompletionOptions } from './provider-interface';
import { LLMProvider, LLMProviderError } from './provider-interface';
import { mapProviderError, sanitizeTimeout, withLLMTimeout } from './error-handler';

interface CodexClient {
  startThread(options?: ThreadOptions): CodexThread;
}

interface CodexThread {
  run(input: string): Promise<RunResult>;
}

interface CodexModule {
  Codex?: new (options?: CodexOptions) => CodexClient;
  default?: new (options?: CodexOptions) => CodexClient;
}

export interface CodexProviderConfig {
  codexOptions?: CodexOptions;
  threadOptions?: ThreadOptions;
  defaultModel?: string;
  clientFactory?: () => Promise<CodexClient>;
}

const DEFAULT_MODEL = 'codex-typescript';

export class CodexProvider extends LLMProvider {
  public readonly name = 'codex' as const;

  private readonly clientFactory: () => Promise<CodexClient>;
  private readonly baseThreadOptions: ThreadOptions;
  private readonly defaultModel: string;

  constructor(config: CodexProviderConfig = {}) {
    super();
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.baseThreadOptions = { ...(config.threadOptions ?? {}) };
    this.clientFactory = config.clientFactory ?? createDefaultCodexFactory(config);
  }

  async generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const timeoutMs = sanitizeTimeout(options.timeoutMs);
    const client = await this.clientFactory();
    const threadOptions = this.buildThreadOptions(options);
    const startedAt = Date.now();

    try {
      const result = await withLLMTimeout(
        (signal) => runCodexPrompt(client, prompt, threadOptions, signal),
        timeoutMs,
        this.name,
        'codex.generateCompletion',
      );

      const completion = result.finalResponse?.trim();
      if (!completion) {
        throw new LLMProviderError('INVALID_RESPONSE', 'Codex response did not include completion text');
      }

      const responseTime = Date.now() - startedAt;
      const tokensUsed = estimateTokens(result.usage);

      return {
        completion,
        metadata: {
          provider: this.name,
          model: threadOptions.model ?? this.defaultModel,
          tokensUsed,
          responseTime,
        },
      };
    } catch (error) {
      throw mapProviderError(this.name, error);
    }
  }

  private buildThreadOptions(options: LLMCompletionOptions): ThreadOptions {
    const threadOptions: ThreadOptions = { ...this.baseThreadOptions };

    if (!threadOptions.model) {
      threadOptions.model = options.model ?? this.defaultModel;
    }

    const envSandbox = resolveSandboxMode(process.env.CODEX_SANDBOX_MODE ?? process.env.CODEX_SANDBOX);
    if (envSandbox && !threadOptions.sandboxMode) {
      threadOptions.sandboxMode = envSandbox;
    }

    threadOptions.skipGitRepoCheck ??= true;
    threadOptions.workingDirectory ??= process.cwd();

    return threadOptions;
  }
}

function createDefaultCodexFactory(config: CodexProviderConfig): () => Promise<CodexClient> {
  let clientPromise: Promise<CodexClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = loadCodexClient(config.codexOptions);
    }
    return clientPromise;
  };
}

async function loadCodexClient(options?: CodexOptions): Promise<CodexClient> {
  try {
    const module = (await import('@openai/codex-sdk')) as unknown as CodexModule;
    const Ctor = module?.Codex ?? module?.default;

    if (typeof Ctor !== 'function') {
      throw new LLMProviderError('SDK_INITIALIZATION_FAILED', 'Codex SDK export missing constructor');
    }

    const resolvedOptions = resolveCodexOptions(options);
    return new Ctor(resolvedOptions);
  } catch (error) {
    throw mapProviderError('codex', error, 'SDK_INITIALIZATION_FAILED');
  }
}

function resolveCodexOptions(options?: CodexOptions): CodexOptions | undefined {
  const resolved: CodexOptions = { ...(options ?? {}) };

  if (!resolved.apiKey && process.env.CODEX_API_KEY) {
    resolved.apiKey = process.env.CODEX_API_KEY;
  }

  if (!resolved.baseUrl && process.env.CODEX_BASE_URL) {
    resolved.baseUrl = process.env.CODEX_BASE_URL;
  }

  if (!resolved.codexPathOverride && process.env.CODEX_PATH_OVERRIDE) {
    resolved.codexPathOverride = process.env.CODEX_PATH_OVERRIDE;
  }

  return resolved;
}

async function runCodexPrompt(
  client: CodexClient,
  prompt: string,
  options: ThreadOptions,
  signal: AbortSignal,
): Promise<RunResult> {
  const thread = client.startThread(options);
  const runPromise = thread.run(prompt);
  return raceWithAbort(runPromise, signal);
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new LLMProviderError('SDK_TIMEOUT', 'Codex request was aborted');
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          reject(
            new LLMProviderError('SDK_TIMEOUT', 'Codex request timed out before completion', {
              provider: 'codex',
            }),
          );
        },
        { once: true },
      );
    }),
  ]);
}

function estimateTokens(usage: Usage | null | undefined): number {
  if (!usage) {
    return 0;
  }

  const input = usage.input_tokens ?? 0;
  const cached = usage.cached_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  return Math.max(0, input - cached) + output;
}

function resolveSandboxMode(raw?: string): SandboxMode | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'read-only' || normalized === 'workspace-write' || normalized === 'danger-full-access') {
    return normalized as SandboxMode;
  }

  return undefined;
}
