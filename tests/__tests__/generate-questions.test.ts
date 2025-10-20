import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { generateClarificationQuestions } from '../scripts/generate-questions';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../scripts/llm';

class StubProvider extends LLMProvider {
  public readonly calls: Array<{ prompt: string; options: LLMCompletionOptions }> = [];

  constructor(private readonly responder: (prompt: string) => LLMCompletionResult) {
    super();
  }

  readonly name = 'codex' as const;

  async generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    this.calls.push({ prompt, options });
    return this.responder(prompt);
  }
}

let tempDir: string;
let originalCacheSetting: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us1-tests-'));
  originalCacheSetting = process.env.LLM_CACHE;
  process.env.LLM_CACHE = 'off';
});

afterEach(async () => {
  if (originalCacheSetting === undefined) {
    delete process.env.LLM_CACHE;
  } else {
    process.env.LLM_CACHE = originalCacheSetting;
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('generateClarificationQuestions writes formatted markdown using prompt output', async () => {
  const specPath = path.join(tempDir, 'login-spec.txt');
  const clarificationsPath = path.join(tempDir, 'clarifications/login-spec.md');
  const specContent = 'User logs in with email and password, invalid attempts lock account for fifteen minutes.';
  await fs.mkdir(path.dirname(specPath), { recursive: true });
  await fs.writeFile(specPath, specContent, 'utf8');

  const provider = new StubProvider(() => ({
    completion: `# Clarifications: login-spec\n\n## Question 1\n\n**Source**: line 1\n**Q**: Do we allow social login providers?\n**Why it matters**: Determines authentication coverage\n**A**: _[Pending answer]_\n**Required**: Yes\n`,
    metadata: {
      provider: 'codex',
      model: 'stub-model',
      tokensUsed: 100,
      responseTime: 200,
    },
  }));

  const result = await generateClarificationQuestions({
    specPath,
    outputPath: clarificationsPath,
    provider,
    author: 'qa@example.com',
  });

  assert.equal(result.outputPath, clarificationsPath);
  const written = await fs.readFile(clarificationsPath, 'utf8');
  assert.equal(written.trimEnd(), result.content.trimEnd());
  assert.ok(written.includes('# Clarifications: login-spec'));
  assert.match(provider.calls[0]?.prompt ?? '', /login-spec\.txt/);
  assert.match(provider.calls[0]?.prompt ?? '', /qa@example\.com/);
  assert.match(provider.calls[0]?.prompt ?? '', /invalid attempts lock account/);
});

test('generateClarificationQuestions rejects specifications shorter than 50 characters', async () => {
  const specPath = path.join(tempDir, 'short.txt');
  await fs.writeFile(specPath, 'Too short.', 'utf8');

  const provider = new StubProvider(() => ({
    completion: '',
    metadata: { provider: 'codex', model: 'stub', tokensUsed: 0, responseTime: 0 },
  }));

  await assert.rejects(
    generateClarificationQuestions({
      specPath,
      outputPath: path.join(tempDir, 'clarifications/short.md'),
      provider,
    }),
    /must contain at least 50 characters/i,
  );
});
