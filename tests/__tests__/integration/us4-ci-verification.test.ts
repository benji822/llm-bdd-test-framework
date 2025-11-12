import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { runCiVerification, EXIT_CODES } from '../../scripts/ci-verify';
import type { ActionGraph } from '../../scripts/action-graph/types';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us4-ci-verify-integration-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('CI verification detects coverage gaps without legacy YAML artifacts', async () => {
  const graphDir = path.join(tempDir, 'graph');
  const featuresDir = path.join(tempDir, 'features');
  const artifactsDir = path.join(tempDir, 'artifacts');
  const selectorsPath = path.join(artifactsDir, 'selectors', 'registry.json');
  const vocabularyPath = path.join(artifactsDir, 'step-vocabulary.json');
  const reportPath = path.join(artifactsDir, 'validation-report.json');
  const ciReportPath = path.join(artifactsDir, 'ci-report.json');
  const bundleDir = path.join(tempDir, 'bundle');

  await fs.mkdir(graphDir, { recursive: true });
  await fs.mkdir(featuresDir, { recursive: true });
  await fs.mkdir(path.dirname(selectorsPath), { recursive: true });

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

  const graph = createGraph([
    { selectorId: 'purchase-button', locator: "[role='button'][name='Purchase']" },
  ]);

  await fs.writeFile(path.join(graphDir, 'checkout.json'), JSON.stringify(graph, null, 2), 'utf8');

  await fs.writeFile(
    path.join(featuresDir, 'checkout.feature'),
    `Feature: Checkout\n  Scenario: Complete purchase\n    Given I am on the checkout page\n    When I complete the purchase`,
    'utf8',
  );

  const result = await runCiVerification({
    graphDir,
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
  assert.ok(result.issues.some((issue) => issue.type === 'coverage'));
});

function createGraph(selectors: Array<{ selectorId: string; locator: string }>): ActionGraph {
  const nodes = selectors.map((selector, index) => ({
    nodeId: `step_${index}`,
    type: 'act',
    stepIndex: index,
    gherkinStep: { keyword: 'when', text: `Perform ${selector.selectorId}` },
    selectors: [{ id: selector.selectorId, locator: selector.locator }],
    instructions: { deterministic: { selector: selector.selectorId, action: 'click' } },
  }));

  return {
    graphId: 'ci-graph',
    version: '1.0',
    nodes,
    edges: [],
    metadata: {
      createdAt: new Date().toISOString(),
      specId: 'ci-spec',
      scenarioName: 'CI reproduction',
      authorship: { authoringMode: true, authoredBy: 'ci-test' },
    },
  };
}
