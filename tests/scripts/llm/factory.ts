import { CodexProvider, type CodexProviderConfig } from './codex-provider';
import { ClaudeProvider, type ClaudeProviderConfig } from './claude-provider';
import { LLMProvider, LLMProviderError, type LLMProviderName } from './provider-interface';

export interface LLMFactoryConfig {
  provider?: LLMProviderName;
  codex?: CodexProviderConfig;
  claude?: ClaudeProviderConfig;
}

const SUPPORTED_PROVIDERS: readonly LLMProviderName[] = ['codex', 'claude'];

export function resolveProviderName(
  explicitProvider?: string,
  env: NodeJS.ProcessEnv = process.env,
): LLMProviderName {
  const candidate = explicitProvider ?? env.LLM_PROVIDER ?? 'codex';
  const normalized = candidate.toLowerCase();

  if (isSupportedProvider(normalized)) {
    return normalized;
  }

  throw new LLMProviderError('MODEL_NOT_AVAILABLE', `Unsupported LLM provider "${candidate}"`, {
    supported: SUPPORTED_PROVIDERS,
  });
}

export function createLLMProvider(config: LLMFactoryConfig = {}): LLMProvider {
  const providerName = resolveProviderName(config.provider);

  switch (providerName) {
    case 'codex':
      return new CodexProvider(config.codex);
    case 'claude':
      return new ClaudeProvider(config.claude);
    default:
      throw new LLMProviderError('MODEL_NOT_AVAILABLE', `Unsupported LLM provider "${providerName}"`);
  }
}

export function isSupportedProvider(candidate: string): candidate is LLMProviderName {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(candidate.toLowerCase());
}

export function listSupportedProviders(): readonly LLMProviderName[] {
  return SUPPORTED_PROVIDERS;
}
