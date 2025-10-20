import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { generateClarificationQuestions } from '../../scripts/generate-questions';
import { normalizeYamlSpecification } from '../../scripts/normalize-yaml';
import { generateFeatureFiles } from '../../scripts/generate-features';
import { validateFeatureCoverage } from '../../scripts/validate-coverage';
import { validateSelectors } from '../../scripts/validate-selectors';
import { runCiVerification, EXIT_CODES } from '../../scripts/ci-verify';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../../scripts/llm';

class SequenceProvider extends LLMProvider {
  private index = 0;

  constructor(private readonly responses: LLMCompletionResult[]) {
    super();
  }

  readonly name = 'codex' as const;

  async generateCompletion(_prompt: string, _options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const response = this.responses[this.index];
    if (!response) {
      throw new Error('SequenceProvider exhausted responses');
    }
    this.index += 1;
    return response;
  }
}

let tempDir: string;
let originalCacheSetting: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-e2e-'));
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

test('pipeline generates artifacts and passes CI verification using stubbed providers', async () => {
  const specPath = path.join(tempDir, 'qa-specs/example-login.txt');
  const clarificationsPath = path.join(tempDir, 'clarifications/example-login.md');
  const normalizedPath = path.join(tempDir, 'normalized/example-login.yaml');
  const featureDir = path.join(tempDir, 'features');
  const featurePath = path.join(featureDir, 'customer-login.feature');
  const vocabularyPath = path.join(tempDir, 'artifacts/step-vocabulary.json');
  const selectorsPath = path.join(tempDir, 'artifacts/selectors.json');
  const reportPath = path.join(tempDir, 'artifacts/validation-report.json');

  await fs.mkdir(path.dirname(specPath), { recursive: true });
  await fs.mkdir(path.dirname(clarificationsPath), { recursive: true });
  await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
  await fs.mkdir(featureDir, { recursive: true });
  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });

  const specContent = `Feature: Customer login

Users must authenticate with email and password to reach the dashboard.

Happy path:
- User opens the login page.
- User enters a valid email and password combination.
- Submit button logs user in.
- Dashboard greets the user with a welcome message.

Invalid password:
- User provides an existing email with incorrect password.
- Show an inline error messaging the invalid credentials.
- Keep the submit button enabled for retry.`;

  await fs.writeFile(specPath, specContent, 'utf8');

  const clarificationsDraft = `# Clarifications: example-login

## Question 1

**Q**: Should social login providers appear on the page or only email/password?
**Why it matters**: Determines UI scope
**A**: _[Pending answer]_
**Required**: Yes

## Question 2

**Q**: What greeting should display after a successful login?
**Why it matters**: Confirms assertion content
**A**: _[Pending answer]_
**Required**: Yes
`;

  const normalizeYaml = `feature: Customer login
description: Validate successful and failed login attempts for dashboard entry.
scenarios:
  - name: Successful login with valid credentials
    steps:
      - type: given
        text: I am on the login page
      - type: when
        text: I enter email as "qa.user@example.com"
        selector: email-input
      - type: when
        text: I enter password as "SuperSecure123!"
        selector: password-input
      - type: when
        text: I click the submit button
        selector: submit-button
      - type: then
        text: I should see text "Welcome back"
        selector: dashboard-heading
    selectors:
      email-input: "[data-testid='email-input']"
      password-input: "[data-testid='password-input']"
      submit-button: "button[aria-label='Sign in']"
      dashboard-heading: "h1[aria-label='Welcome back']"
metadata:
  specId: "11111111-1111-1111-1111-111111111111"
  generatedAt: "2025-10-18T12:00:00.000Z"
  llmProvider: "codex"
  llmModel: "codex-typescript"`;

  const featureOutput = `Feature: Customer login
  @smoke @auth
  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter email as "qa.user@example.com"
    And I enter password as "SuperSecure123!"
    And I click the submit button
    Then I should see text "Welcome back"`;

  const provider = new SequenceProvider([
    {
      completion: clarificationsDraft,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 128, responseTime: 200 },
    },
    {
      completion: normalizeYaml,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 256, responseTime: 300 },
    },
    {
      completion: featureOutput,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 512, responseTime: 400 },
    },
  ]);

  const clarResult = await generateClarificationQuestions({
    specPath,
    outputPath: clarificationsPath,
    provider,
    author: 'qa@example.com',
  });

  assert.equal(clarResult.outputPath, clarificationsPath);
  await fs.writeFile(
    clarificationsPath,
    clarificationsDraft
      .replace('_[Pending answer]_', 'Only email and password authentication is in scope.')
      .replace('_[Pending answer]_', 'Show the text "Welcome back" in the dashboard header.'),
    'utf8',
  );

  const normalizeResult = await normalizeYamlSpecification({
    specPath,
    clarificationsPath,
    outputPath: normalizedPath,
    provider,
  });

  assert.equal(normalizeResult.outputPath, normalizedPath);
  const normalizedContents = await fs.readFile(normalizedPath, 'utf8');
  assert.match(normalizedContents, /feature: Customer login/);

  await fs.writeFile(
    vocabularyPath,
    JSON.stringify(
      {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        definitions: [
          {
            pattern: 'I am on the {page} page',
            domain: 'navigation',
            file: 'tests/steps/navigation.steps.ts',
            parameters: [{ name: 'page', type: 'string' }],
            examples: ['I am on the login page'],
            version: '1.0.0',
          },
          {
            pattern: 'I enter {field} as {value}',
            domain: 'interaction',
            file: 'tests/steps/interaction.steps.ts',
            parameters: [
              { name: 'field', type: 'string' },
              { name: 'value', type: 'string' },
            ],
            examples: ['I enter email as "qa.user@example.com"'],
            version: '1.0.0',
          },
          {
            pattern: 'I click the {element} button',
            domain: 'interaction',
            file: 'tests/steps/interaction.steps.ts',
            parameters: [{ name: 'element', type: 'string' }],
            examples: ['I click the submit button'],
            version: '1.0.0',
          },
          {
            pattern: 'I should see text {text}',
            domain: 'assertion',
            file: 'tests/steps/assertion.steps.ts',
            parameters: [{ name: 'text', type: 'string' }],
            examples: ['I should see text "Welcome back"'],
            version: '1.0.0',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  await fs.writeFile(
    selectorsPath,
    JSON.stringify(
      {
        version: '2025-10-18',
        lastScanned: '2025-10-18T00:00:00Z',
        selectors: {
          'email-input': {
            id: 'email-input',
            type: 'testid',
            selector: "[data-testid='email-input']",
            priority: 3,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/login',
            accessible: false,
          },
          'password-input': {
            id: 'password-input',
            type: 'testid',
            selector: "[data-testid='password-input']",
            priority: 3,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/login',
            accessible: false,
          },
          'submit-button': {
            id: 'submit-button',
            type: 'label',
            selector: "button[aria-label='Sign in']",
            priority: 2,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'medium',
            page: '/login',
            accessible: true,
          },
          'dashboard-heading': {
            id: 'dashboard-heading',
            type: 'role',
            selector: "h1[aria-label='Welcome back']",
            priority: 1,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/dashboard',
            accessible: true,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const featureResult = await generateFeatureFiles({
    yamlPath: normalizedPath,
    outputDir: featureDir,
    provider,
    vocabularyPath,
  });

  assert.ok(featureResult.outputPaths.includes(featurePath));
  const featureContents = await fs.readFile(featurePath, 'utf8');
  assert.match(featureContents, /Scenario: Successful login with valid credentials/);

  await validateFeatureCoverage({
    featurePaths: [featurePath],
    vocabularyPath,
  });

  const selectorReport = await validateSelectors({
    normalizedDir: path.dirname(normalizedPath),
    featuresDir: featureDir,
    registryPath: selectorsPath,
    reportPath,
  });

  assert.equal(selectorReport.issues.length, 0);

  const ciResult = await runCiVerification({
    normalizedDir: path.dirname(normalizedPath),
    featuresDir: featureDir,
    selectorsPath,
    vocabularyPath,
    reportPath,
    ciReportPath: path.join(tempDir, 'artifacts/ci-report.json'),
    artifactsArchiveDir: path.join(tempDir, 'artifacts/ci-bundle'),
    timeoutMs: 10_000,
  });

  assert.equal(ciResult.exitCode, EXIT_CODES.success);
  assert.equal(ciResult.summary.secretFindings, 0);
});
