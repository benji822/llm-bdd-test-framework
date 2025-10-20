import type { LLMCompletionResult, LLMCompletionOptions } from './provider-interface';
import { LLMProvider, LLMProviderError } from './provider-interface';
import { mapProviderError, sanitizeTimeout, withLLMTimeout } from './error-handler';

interface ClaudeCompletionRequest {
  prompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ClaudeCompletionResponse {
  completion?: string;
  output?: string;
  text?: string;
  metadata?: {
    tokensUsed?: number;
    responseTime?: number;
  };
  usage?: {
    totalTokens?: number;
  };
  tokens?: number;
  responseTimeMs?: number;
}

interface ClaudeResponseApi {
  generate?: (request: ClaudeCompletionRequest) => Promise<ClaudeCompletionResponse>;
  create?: (request: ClaudeCompletionRequest) => Promise<ClaudeCompletionResponse>;
}

interface ClaudeClient {
  responses: ClaudeResponseApi;
}

interface ClaudeModule {
  Claude?: new (config: Record<string, unknown>) => ClaudeClient;
  ClaudeClient?: new (config: Record<string, unknown>) => ClaudeClient;
  default?: new (config: Record<string, unknown>) => ClaudeClient;
}

export interface ClaudeProviderConfig {
  apiKey?: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  clientFactory?: () => Promise<ClaudeClient>;
}

const DEFAULT_MODEL = 'claude-3-opus';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4000;

export class ClaudeProvider extends LLMProvider {
  public readonly name = 'claude' as const;

  private readonly clientFactory: () => Promise<ClaudeClient>;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: ClaudeProviderConfig = {}) {
    super();
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultTemperature = config.defaultTemperature ?? DEFAULT_TEMPERATURE;
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.clientFactory = config.clientFactory ?? createDefaultClaudeFactory(config);
  }

  async generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const timeoutMs = sanitizeTimeout(options.timeoutMs);
    const model = options.model ?? this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    const client = await this.clientFactory();
    const startedAt = Date.now();

    try {
      const response = await withLLMTimeout(
        (signal) =>
          invokeClaudeCompletion(client, {
            prompt,
            model,
            temperature,
            maxTokens,
            timeoutMs,
            signal,
          }),
        timeoutMs,
        this.name,
        'claude.generateCompletion',
      );

      const normalized = normalizeClaudeResponse(response);
      const responseTime = normalized.responseTime ?? Date.now() - startedAt;

      return {
        completion: normalized.completion,
        metadata: {
          provider: this.name,
          model,
          tokensUsed: normalized.tokensUsed ?? 0,
          responseTime,
        },
      };
    } catch (error) {
      throw mapProviderError(this.name, error);
    }
  }
}

function createDefaultClaudeFactory(config: ClaudeProviderConfig): () => Promise<ClaudeClient> {
  let clientPromise: Promise<ClaudeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = loadClaudeClient(config);
    }
    return clientPromise;
  };
}

async function loadClaudeClient(config: ClaudeProviderConfig): Promise<ClaudeClient> {
  try {
    const module = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as ClaudeModule;
    const Ctor = module?.Claude ?? module?.ClaudeClient ?? module?.default;

    if (typeof Ctor !== 'function') {
      throw new LLMProviderError('SDK_INITIALIZATION_FAILED', 'Claude SDK export missing constructor');
    }

    const credentials: Record<string, unknown> = {};
    if (config.apiKey ?? process.env.CLAUDE_API_KEY) {
      credentials.apiKey = config.apiKey ?? process.env.CLAUDE_API_KEY;
    }

    const client = new Ctor(credentials);
    if (!isClaudeClient(client)) {
      throw new LLMProviderError('SDK_INITIALIZATION_FAILED', 'Claude client missing responses API');
    }

    return client;
  } catch (error) {
    throw mapProviderError('claude', error, 'SDK_INITIALIZATION_FAILED');
  }
}

function isClaudeClient(candidate: unknown): candidate is ClaudeClient {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'responses' in candidate &&
    typeof (candidate as { responses?: unknown }).responses === 'object'
  );
}

async function invokeClaudeCompletion(
  client: ClaudeClient,
  request: ClaudeCompletionRequest,
): Promise<ClaudeCompletionResponse> {
  const api = client.responses;

  if (typeof api.generate === 'function') {
    return api.generate(request);
  }

  if (typeof api.create === 'function') {
    return api.create(request);
  }

  throw new LLMProviderError('PROVIDER_ERROR', 'Claude client does not expose a completion generator');
}

function normalizeClaudeResponse(response: ClaudeCompletionResponse) {
  const completion =
    response.completion ??
    response.text ??
    (typeof response.output === 'string' ? response.output : undefined);

  if (!completion) {
    throw new LLMProviderError('INVALID_RESPONSE', 'Claude response did not include completion text');
  }

  const tokensUsed =
    response.metadata?.tokensUsed ?? response.usage?.totalTokens ?? response.tokens ?? 0;
  const responseTime =
    response.metadata?.responseTime ?? response.responseTimeMs ?? undefined;

  return { completion, tokensUsed, responseTime };
}
