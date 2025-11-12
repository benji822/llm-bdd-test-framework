import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { validateSelectors } from '../scripts/validate-selectors';
import type { ActionGraph } from '../scripts/action-graph/types';

type GraphNode = ActionGraph['nodes'][number];

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-selectors-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('validateSelectors reports missing registry entries cited by graphs', async () => {
  const graphDir = path.join(tempDir, 'graph');
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts', 'report.json');

  await fs.mkdir(graphDir, { recursive: true });
  await fs.mkdir(path.dirname(registryPath), { recursive: true });

  const graph = createGraph(
    [
      { selectorId: 'confirm-banner', locator: "div[role='status']" },
      { selectorId: 'submit-button', locator: "[data-testid='submit-order']" },
    ],
  );

  await fs.writeFile(path.join(graphDir, 'checkout.json'), JSON.stringify(graph, null, 2), 'utf8');

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
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const report = await validateSelectors({ graphDir, registryPath, reportPath });

  assert.equal(report.issues.length, 1);
  assert.equal(report.summary.selectorMismatches, 1);
  assert.match(report.issues[0].message, /submit-button/);
  const stored = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(stored.summary.selectorMismatches, 1);
});

test('validateSelectors passes when all selectors exist for graphs', async () => {
  const graphDir = path.join(tempDir, 'graph');
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts', 'report.json');

  await fs.mkdir(graphDir, { recursive: true });
  await fs.mkdir(path.dirname(registryPath), { recursive: true });

  const graph = createGraph([
    { selectorId: 'saved-banner', locator: "div[role='status']" },
  ]);

  await fs.writeFile(path.join(graphDir, 'profile.json'), JSON.stringify(graph, null, 2), 'utf8');

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

  const report = await validateSelectors({ graphDir, registryPath, reportPath });

  assert.equal(report.issues.length, 0);
  assert.equal(report.failed, 0);
  const stored = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(stored.issues.length, 0);
});

function createGraph(selectors: Array<{ selectorId: string; locator: string }>): ActionGraph {
  const nodes: GraphNode[] = selectors.map((selector, index) => ({
    nodeId: `step_${index}`,
    type: 'act',
    stepIndex: index,
    gherkinStep: {
      keyword: 'when',
      text: `Interact with ${selector.selectorId}`,
    },
    selectors: [
      {
        id: selector.selectorId,
        locator: selector.locator,
      },
    ],
    instructions: {
      deterministic: {
        selector: selector.selectorId,
        action: 'click',
      },
    },
  }));

  return {
    graphId: 'graph-test',
    version: '1.0',
    nodes,
    edges: [],
    metadata: {
      createdAt: new Date().toISOString(),
      specId: 'spec-test',
      scenarioName: 'Test scenario',
      featureName: 'Test feature',
      authorship: {
        authoringMode: true,
        authoredBy: 'tests',
      },
    },
  };
}
