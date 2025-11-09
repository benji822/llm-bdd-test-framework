import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { validateSelectors } from '../scripts/validate-selectors';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us3-validate-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('validateSelectors reports missing selectors with suggestions', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts/report.json');

  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(
    path.join(normalizedDir, 'checkout.yaml'),
    `feature: Checkout
scenarios:
  - name: Submit order
    steps:
      - type: given
        text: I am on the checkout page
      - type: then
        text: I should see text "Order confirmed"
    selectors:
      confirm-banner: "div[role='status']"
      submit-button: "[data-testid='submit-order']"
metadata:
  specId: "44444444-4444-4444-4444-444444444444"
  generatedAt: "2025-10-18T10:30:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  await fs.writeFile(
    registryPath,
    JSON.stringify(
      {
        version: '2025-10-18',
        lastScanned: '2025-10-18T00:00:00Z',
        selectors: {
          'confirm-banner': {
            id: 'confirm-banner',
            type: 'label',
            selector: "[aria-label='Confirmation banner']",
            priority: 2,
            lastSeen: '2025-10-17T00:00:00Z',
            stability: 'high',
            page: '/checkout',
            accessible: true,
          },
          'accessible-submit': {
            id: 'accessible-submit',
            type: 'role',
            selector: "[role='button'][aria-label='Submit order']",
            priority: 1,
            lastSeen: '2025-10-17T00:00:00Z',
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

  const report = await validateSelectors({
    normalizedDir,
    registryPath,
    reportPath,
  });

  assert.equal(report.issues.length, 1);
  assert.match(report.issues[0].message, /submit-button/);
  assert.equal(report.issues[0].suggestion, 'accessible-submit');

  const stored = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(stored.issues.length, 1);
  assert.equal(stored.summary.selectorMismatches, 1);
});

test('validateSelectors passes when all selectors exist', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts/report.json');

  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(
    path.join(normalizedDir, 'profile.yaml'),
    `feature: Profile
scenarios:
  - name: Update details
    steps:
      - type: then
        text: I should see text "Saved"
    selectors:
      saved-banner: "div[role='status']"
metadata:
  specId: "55555555-5555-5555-5555-555555555555"
  generatedAt: "2025-10-18T11:30:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  await fs.writeFile(
    registryPath,
    JSON.stringify(
      {
        version: '2025-10-18',
        lastScanned: '2025-10-18T00:00:00Z',
        selectors: {
          'saved-banner': {
            id: 'saved-banner',
            type: 'role',
            selector: "[role='status'][aria-label='Saved']",
            priority: 1,
            lastSeen: '2025-10-18T00:00:00Z',
            stability: 'high',
            page: '/profile',
            accessible: true,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const report = await validateSelectors({
    normalizedDir,
    registryPath,
    reportPath,
  });

  assert.equal(report.issues.length, 0);
  assert.equal(report.failed, 0);
  const stored = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(stored.issues.length, 0);
});
