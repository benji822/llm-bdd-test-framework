import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { runCiVerification, EXIT_CODES } from '../scripts/ci-verify';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us4-ci-verify-unit-'));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runCiVerification succeeds with valid artifacts and produces bundle', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  const featuresDir = path.join(tempDir, 'features');
  const artifactsDir = path.join(tempDir, 'artifacts');
  const selectorsPath = path.join(artifactsDir, 'selectors', 'registry.json');
  const vocabularyPath = path.join(artifactsDir, 'step-vocabulary.json');
  const reportPath = path.join(artifactsDir, 'validation-report.json');
  const ciReportPath = path.join(artifactsDir, 'ci-report.json');
  const bundleDir = path.join(tempDir, 'ci-bundle');

  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(featuresDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(path.dirname(selectorsPath), { recursive: true });

  await fs.writeFile(
    path.join(normalizedDir, 'login.yaml'),
    `feature: Login
scenarios:
  - name: Successful login
    steps:
      - type: given
        text: I am on the login page
      - type: when
        text: I enter email as "qa@example.com"
        selector: email-input
      - type: when
        text: I enter password as "ValidPassword123"
        selector: password-input
      - type: then
        text: I should see text "Dashboard"
        selector: dashboard-heading
    selectors:
      email-input: "[data-testid='email-input']"
      password-input: "[data-testid='password-input']"
      dashboard-heading: "h1[role='heading']"
metadata:
  specId: "123e4567-e89b-12d3-a456-426614174000"
  generatedAt: "2025-10-18T12:00:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  await fs.writeFile(
    path.join(featuresDir, 'login.feature'),
    `Feature: Login
  Scenario: Successful login
    Given I am on the login page
    When I enter email as "qa@example.com"
    And I enter password as "ValidPassword123"
    Then I should see text "Dashboard"
`,
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
          'dashboard-heading': {
            id: 'dashboard-heading',
            type: 'role',
            selector: "h1[role='heading']",
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

  await fs.writeFile(
    vocabularyPath,
    JSON.stringify(
      {
        version: '1.0.0',
        lastUpdated: '2025-10-18T00:00:00Z',
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
            pattern: 'I enter {field} as "{value}"',
            domain: 'interaction',
            file: 'tests/steps/interaction.steps.ts',
            parameters: [
              { name: 'field', type: 'string' },
              { name: 'value', type: 'string' },
            ],
            examples: ['I enter email as "qa@example.com"'],
            version: '1.0.0',
          },
          {
            pattern: 'I should see text "{text}"',
            domain: 'assertion',
            file: 'tests/steps/assertion.steps.ts',
            parameters: [{ name: 'text', type: 'string' }],
            examples: ['I should see text "Dashboard"'],
            version: '1.0.0',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const result = await runCiVerification({
    normalizedDir,
    featuresDir,
    selectorsPath,
    vocabularyPath,
    reportPath,
    ciReportPath,
    artifactsArchiveDir: bundleDir,
    timeoutMs: 30_000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.summary, {
    schemaErrors: 0,
    lintErrors: 0,
    selectorMismatches: 0,
    coverageGaps: 0,
    secretFindings: 0,
  });

  const ciReport = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
  assert.equal(ciReport.summary.schemaErrors, 0);

  assert.ok(await pathExists(path.join(result.bundlePath, 'normalized', 'login.yaml')));
  assert.ok(await pathExists(path.join(result.bundlePath, 'features', 'login.feature')));
  assert.ok(await pathExists(path.join(result.bundlePath, 'artifacts', 'selectors', 'registry.json')));
});

test('runCiVerification detects secrets and returns dedicated exit code', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  const featuresDir = path.join(tempDir, 'features');
  const artifactsDir = path.join(tempDir, 'artifacts');
  const selectorsPath = path.join(artifactsDir, 'selectors', 'registry.json');
  const vocabularyPath = path.join(artifactsDir, 'step-vocabulary.json');
  const reportPath = path.join(artifactsDir, 'validation-report.json');
  const ciReportPath = path.join(artifactsDir, 'ci-report.json');
  const bundleDir = path.join(tempDir, 'ci-secret-bundle');

  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(featuresDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(path.dirname(selectorsPath), { recursive: true });

  await fs.writeFile(
    path.join(normalizedDir, 'billing.yaml'),
    `feature: Billing
scenarios:
  - name: Store API credentials
    steps:
      - type: given
        text: I am on the billing page
      - type: then
        text: I should see text "Configured"
    selectors:
      status-banner: "[role='status']"
    testData:
      secretApiKey: "sk_test_placeholder_do_not_use"
metadata:
  specId: "223e4567-e89b-12d3-a456-426614174000"
  generatedAt: "2025-10-18T12:00:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  await fs.writeFile(
    path.join(featuresDir, 'billing.feature'),
    `Feature: Billing
  Scenario: Configure billing
    Given I am on the billing page
    Then I should see text "Configured"
`,
    'utf8',
  );

  await fs.writeFile(
    selectorsPath,
    JSON.stringify(
      {
        version: '2025-10-18',
        lastScanned: '2025-10-18T00:00:00Z',
        selectors: {
          'status-banner': {
            id: 'status-banner',
            type: 'role',
            selector: "[role='status']",
            priority: 1,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/billing',
            accessible: true,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  await fs.writeFile(
    vocabularyPath,
    JSON.stringify(
      {
        version: '1.0.0',
        lastUpdated: '2025-10-18T00:00:00Z',
        definitions: [
          {
            pattern: 'I am on the {page} page',
            domain: 'navigation',
            file: 'tests/steps/navigation.steps.ts',
            parameters: [{ name: 'page', type: 'string' }],
            examples: ['I am on the billing page'],
            version: '1.0.0',
          },
          {
            pattern: 'I should see text "{text}"',
            domain: 'assertion',
            file: 'tests/steps/assertion.steps.ts',
            parameters: [{ name: 'text', type: 'string' }],
            examples: ['I should see text "Configured"'],
            version: '1.0.0',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const result = await runCiVerification({
    normalizedDir,
    featuresDir,
    selectorsPath,
    vocabularyPath,
    reportPath,
    ciReportPath,
    artifactsArchiveDir: bundleDir,
    timeoutMs: 30_000,
  });

  assert.equal(result.exitCode, EXIT_CODES.secretError);
  assert.equal(result.summary.secretFindings, 1);
  assert.ok(result.issues.some((issue) => issue.type === 'secret' && issue.file.endsWith('billing.yaml')));
});

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
