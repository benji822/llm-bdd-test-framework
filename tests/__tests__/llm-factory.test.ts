import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { CodexProvider } from '../scripts/llm/codex-provider';
import { ClaudeProvider } from '../scripts/llm/claude-provider';
import { createLLMProvider, resolveProviderName } from '../scripts/llm/factory';
import { LLMProviderError } from '../scripts/llm/provider-interface';

const codexStubClient = {
  completions: {
    generate: async () => ({ completion: 'ok' }),
  },
  startThread: () => ({
    run: async () => ({
      items: [],
      finalResponse: 'ok',
      usage: null,
    }),
  }),
};

const claudeStubClient = {
  responses: {
    generate: async () => ({ completion: 'ok' }),
  },
};

const originalProvider = process.env.LLM_PROVIDER;

beforeEach(() => {
  delete process.env.LLM_PROVIDER;
});

afterEach(() => {
  if (originalProvider === undefined) {
    delete process.env.LLM_PROVIDER;
  } else {
    process.env.LLM_PROVIDER = originalProvider;
  }
});

test('createLLMProvider returns Codex provider by default', () => {
  const provider = createLLMProvider({
    codex: {
      clientFactory: async () => codexStubClient,
    },
  });

  assert.ok(provider instanceof CodexProvider);
});

test('createLLMProvider respects environment override', () => {
  process.env.LLM_PROVIDER = 'claude';

  const provider = createLLMProvider({
    claude: {
      clientFactory: async () => claudeStubClient,
    },
  });

  assert.ok(provider instanceof ClaudeProvider);
});

test('resolveProviderName rejects unsupported providers', () => {
  assert.throws(
    () => resolveProviderName('unsupported'),
    (error: unknown) =>
      error instanceof LLMProviderError && error.code === 'MODEL_NOT_AVAILABLE',
  );
});
