import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { runCiVerification, EXIT_CODES } from '../../scripts/ci-verify';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us4-ci-verify-integration-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('CI verification reports coverage gaps without invoking LLM providers', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  const featuresDir = path.join(tempDir, 'features');
  const artifactsDir = path.join(tempDir, 'artifacts');
  const selectorsPath = path.join(artifactsDir, 'selectors', 'registry.json');
  const vocabularyPath = path.join(artifactsDir, 'step-vocabulary.json');
  const reportPath = path.join(artifactsDir, 'validation-report.json');
  const ciReportPath = path.join(artifactsDir, 'ci-report.json');
  const bundleDir = path.join(tempDir, 'bundle');

  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(featuresDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(path.dirname(selectorsPath), { recursive: true });

  await fs.writeFile(
    path.join(normalizedDir, 'checkout.yaml'),
    `feature: Checkout
scenarios:
  - name: Missing coverage example
    steps:
      - type: given
        text: I am on the checkout page
      - type: when
        text: I complete the purchase
    selectors:
      purchase-button: "[role='button'][name='Purchase']"
metadata:
  specId: "323e4567-e89b-12d3-a456-426614174000"
  generatedAt: "2025-10-18T12:00:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  await fs.writeFile(
    path.join(featuresDir, 'checkout.feature'),
    `Feature: Checkout
  Scenario: Complete purchase
    Given I am on the checkout page
    When I complete the purchase
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
          'purchase-button': {
            id: 'purchase-button',
            type: 'role',
            selector: "[role='button'][name='Purchase']",
            priority: 1,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/checkout',
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
            examples: ['I am on the checkout page'],
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

  assert.equal(result.exitCode, EXIT_CODES.coverageError);
  assert.equal(result.summary.coverageGaps, 1);
  assert.ok(result.issues.some((issue) => issue.type === 'coverage' && /complete the purchase/i.test(issue.message)));
});
