import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { validateFeatureCoverage } from '../scripts/validate-coverage';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us2-coverage-'));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('validateFeatureCoverage passes when all steps covered', async () => {
  const featurePath = path.join(tempDir, 'features/login.feature');
  const vocabularyPath = path.join(tempDir, 'artifacts/step-vocabulary.json');

  await fs.mkdir(path.dirname(featurePath), { recursive: true });
  await fs.writeFile(
    featurePath,
    `Feature: Login\n  Scenario: successful\n    Given I am on the login page\n    When I enter email as "user@example.com"\n    Then I should see text "Dashboard"\n`,
    'utf8',
  );

  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });
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
            examples: ['I enter email as "user@example.com"'],
            version: '1.0.0',
          },
          {
            pattern: 'I should see text {text}',
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

  await validateFeatureCoverage({
    featurePaths: [featurePath],
    vocabularyPath,
  });
});

test('validateFeatureCoverage throws when step not covered', async () => {
  const featurePath = path.join(tempDir, 'features/profile.feature');
  const vocabularyPath = path.join(tempDir, 'artifacts/step-vocabulary.json');

  await fs.mkdir(path.dirname(featurePath), { recursive: true });
  await fs.writeFile(
    featurePath,
    `Feature: Profile\n  Scenario: update\n    Given I am on the profile page\n    When I change avatar\n    Then I should see text "Saved"\n`,
    'utf8',
  );

  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });
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
            examples: ['I am on the profile page'],
            version: '1.0.0',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  await assert.rejects(
    validateFeatureCoverage({
      featurePaths: [featurePath],
      vocabularyPath,
    }),
    /Step "When I change avatar" is not covered by vocabulary/i,
  );
});
