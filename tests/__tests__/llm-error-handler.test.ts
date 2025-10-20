import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_LLM_TIMEOUT_MS, sanitizeTimeout, withLLMTimeout } from '../scripts/llm/error-handler';
import { LLMProviderError } from '../scripts/llm/provider-interface';

test('sanitizeTimeout returns default window for undefined input', () => {
  assert.equal(sanitizeTimeout(undefined), MAX_LLM_TIMEOUT_MS);
});

test('sanitizeTimeout enforces upper bound', () => {
  assert.throws(
    () => sanitizeTimeout(MAX_LLM_TIMEOUT_MS + 1),
    (error: unknown) => error instanceof LLMProviderError && error.code === 'SDK_TIMEOUT',
  );
});

test('withLLMTimeout resolves when operation finishes within deadline', async () => {
  const result = await withLLMTimeout(async () => 'ok', 50, 'codex');
  assert.equal(result, 'ok');
});

test('withLLMTimeout rejects when deadline exceeded', async () => {
  await assert.rejects(
    withLLMTimeout(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return 'slow';
      },
      10,
      'claude',
    ),
    (error: unknown) => error instanceof LLMProviderError && error.code === 'SDK_TIMEOUT',
  );
});
