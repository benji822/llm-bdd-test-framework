import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { normalizeYamlSpecification } from '../scripts/normalize-yaml';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../scripts/llm';
import { parseYaml } from '../scripts/utils/yaml-parser';

class StubProvider extends LLMProvider {
  constructor(private readonly responder: (prompt: string) => LLMCompletionResult) {
    super();
  }

  readonly name = 'codex' as const;
  public lastPrompt: string | undefined;
  public lastOptions: LLMCompletionOptions | undefined;

  async generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    this.lastPrompt = prompt;
    this.lastOptions = options;
    return this.responder(prompt);
  }
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us1-normalize-'));
});

afterEach(async () => {
  delete process.env.LLM_MODEL;
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('normalizeYamlSpecification stops when required clarifications are unanswered', async () => {
  const specPath = path.join(tempDir, 'checkout.txt');
  const clarPath = path.join(tempDir, 'clarifications/checkout.md');
  await fs.mkdir(path.dirname(clarPath), { recursive: true });
  await fs.writeFile(
    specPath,
    'Checkout requires payment details, shipping address, coupon handling, and error states verification for declines.',
    'utf8',
  );
  await fs.writeFile(
    clarPath,
    '# Clarifications: checkout\n\n## Question 1\n\n**Source**: line 1\n**Q**: What payment providers are supported?\n**Why it matters**: Determines external integrations\n**A**: _[Pending answer]_\n**Required**: Yes\n',
    'utf8',
  );

  const provider = new StubProvider(() => ({
    completion: '',
    metadata: { provider: 'codex', model: 'stub', tokensUsed: 0, responseTime: 0 },
  }));

  await assert.rejects(
    normalizeYamlSpecification({
      specPath,
      clarificationsPath: clarPath,
      outputPath: path.join(tempDir, 'normalized/checkout.yaml'),
      provider,
    }),
    /Missing required clarification answers/i,
  );
});

test('normalizeYamlSpecification generates schema-compliant YAML', async () => {
  const specPath = path.join(tempDir, 'profile-update.txt');
  const clarPath = path.join(tempDir, 'clarifications/profile-update.md');
  const outputPath = path.join(tempDir, 'normalized/profile-update.yaml');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(clarPath), { recursive: true });
  await fs.writeFile(
    specPath,
    'Users update their profile details including display name, preferred language, and marketing opt-in preferences.',
    'utf8',
  );
  await fs.writeFile(
    clarPath,
    '# Clarifications: profile-update\n\n## Question 1\n\n**Source**: line 1\n**Q**: Which fields are mandatory when saving?\n**Why it matters**: Ensures validation coverage\n**A**: Display name and language are required; marketing opt-in optional\n**Required**: Yes\n',
    'utf8',
  );

  const provider = new StubProvider(() => ({
    completion: `feature: Profile update
scenarios:
  - name: Update profile with required fields
    steps:
      - type: given
        text: I am on the profile page
      - type: when
        text: I enter display name as "Taylor"
        selector: display-name-input
      - type: when
        text: I select language as "English"
        selector: language-select
      - type: then
        text: I should see text "Profile updated"
        selector: confirmation-banner
    selectors:
      display-name-input: "input[name='displayName']"
      language-select: "select[name='language']"
      confirmation-banner: "div[role='status']"
metadata:
  specId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  generatedAt: "2025-10-18T10:30:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"`,
    metadata: {
      provider: 'codex',
      model: 'stub-model',
      tokensUsed: 512,
      responseTime: 1234,
    },
  }));

  process.env.LLM_MODEL = 'stub-model';
  const result = await normalizeYamlSpecification({
    specPath,
    clarificationsPath: clarPath,
    outputPath,
    provider,
  });

  assert.equal(result.outputPath, outputPath);
  const written = await fs.readFile(outputPath, 'utf8');
  assert.ok(!written.includes('```'));

  const parsed = parseYaml<Record<string, unknown>>(written);
  assert.equal(parsed?.feature, 'Profile update');
  assert.equal(result.metadata.model, 'stub-model');
});

test('normalizeYamlSpecification surfaces validation errors with guidance', async () => {
  const specPath = path.join(tempDir, 'bad-spec.txt');
  const clarPath = path.join(tempDir, 'clarifications/bad-spec.md');

  await fs.mkdir(path.dirname(clarPath), { recursive: true });
  await fs.writeFile(
    specPath,
    'Spec with ambiguous content to trigger malformed YAML handling. Provide at least one required clarification.',
    'utf8',
  );
  await fs.writeFile(
    clarPath,
    '# Clarifications: bad-spec\n\n## Question 1\n\n**Q**: Required?\n**Why it matters**: Schema\n**A**: yes\n**Required**: Yes\n',
    'utf8',
  );

  const provider = new StubProvider(() => ({
    completion: 'this: is: not: valid: yaml',
    metadata: { provider: 'codex', model: 'stub', tokensUsed: 10, responseTime: 10 },
  }));

  await assert.rejects(
    normalizeYamlSpecification({
      specPath,
      clarificationsPath: clarPath,
      outputPath: path.join(tempDir, 'normalized/bad.yaml'),
      provider,
    }),
    /Normalized YAML validation failed:[\s\S]+yaml-spec\.schema\.json/i,
  );
});
