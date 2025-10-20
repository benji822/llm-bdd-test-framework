import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { generateClarificationQuestions } from '../../scripts/generate-questions';
import { normalizeYamlSpecification } from '../../scripts/normalize-yaml';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../../scripts/llm';
import { parseYaml } from '../../scripts/utils/yaml-parser';

class QuestionsProvider extends LLMProvider {
  readonly name = 'codex' as const;

  async generateCompletion(): Promise<LLMCompletionResult> {
    return {
      completion: `# Clarifications: banking-transfer\n\n## Question 1\n\n**Source**: line 1\n**Q**: What is the maximum transfer amount?\n**Why it matters**: Drives boundary scenarios\n**A**: _[Pending answer]_\n**Required**: Yes\n`,
      metadata: { provider: 'codex', model: 'stub', tokensUsed: 80, responseTime: 180 },
    };
  }
}

class NormalizeProvider extends LLMProvider {
  readonly name = 'codex' as const;

  async generateCompletion(): Promise<LLMCompletionResult> {
    return {
      completion: `feature: Banking transfer\nscenarios:\n  - name: Successful transfer below limit\n    steps:\n      - type: given\n        text: I am on the transfers page\n      - type: when\n        text: I enter amount as "500"\n        selector: transfer-amount-input\n      - type: then\n        text: I should see text "Transfer scheduled"\n        selector: transfer-confirmation\n    selectors:\n      transfer-amount-input: "input[name='amount']"\n      transfer-confirmation: "div[role='status']"\nmetadata:\n  specId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"\n  generatedAt: "2025-10-18T11:30:00Z"\n  llmProvider: "codex"\n  llmModel: "stub-model"\n`,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 220, responseTime: 420 },
    };
  }
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us1-e2e-'));
});

afterEach(async () => {
  delete process.env.LLM_MODEL;
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('plain spec to answered clarifications to normalized YAML', async () => {
  const specPath = path.join(tempDir, 'banking-transfer.txt');
  const clarificationsPath = path.join(tempDir, 'clarifications/banking-transfer.md');
  const normalizedPath = path.join(tempDir, 'normalized/banking-transfer.yaml');

  await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
  await fs.writeFile(
    specPath,
    'Banking users can schedule transfers between internal accounts with limits, scheduling, and confirmation messaging.',
    'utf8',
  );

  await generateClarificationQuestions({
    specPath,
    outputPath: clarificationsPath,
    provider: new QuestionsProvider(),
  });

  const clarifications = await fs.readFile(clarificationsPath, 'utf8');
  const answered = clarifications.replace('_[Pending answer]_', 'Transfers above 1000 require manager approval');
  await fs.writeFile(clarificationsPath, answered, 'utf8');

  process.env.LLM_MODEL = 'stub-model';
  const result = await normalizeYamlSpecification({
    specPath,
    clarificationsPath,
    outputPath: normalizedPath,
    provider: new NormalizeProvider(),
  });

  assert.equal(result.outputPath, normalizedPath);
  const yaml = await fs.readFile(normalizedPath, 'utf8');
  const parsed = parseYaml<Record<string, unknown>>(yaml);
  assert.equal(parsed?.feature, 'Banking transfer');
  assert.equal(result.metadata.model, 'stub-model');
});
