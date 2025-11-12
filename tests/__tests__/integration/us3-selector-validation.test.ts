import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  collectSelectors,
  type BrowserFactory,
  type ExtractedSelector,
} from '../../scripts/collect-selectors';
import { validateSelectors } from '../../scripts/validate-selectors';
import type { ActionGraph } from '../../scripts/action-graph/types';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us3-integration-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('collect selectors then validate deterministically generated graph', async () => {
  const selectorsPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts/report.json');
  const graphDir = path.join(tempDir, 'graph');

  await fs.mkdir(path.dirname(selectorsPath), { recursive: true });
  await fs.mkdir(graphDir, { recursive: true });

  const extractedSelectors = new Map([
    [
      '/',
      [
        {
          id: 'discount-banner',
          type: 'label',
          selector: "[aria-label='Discount applied']",
          priority: 2,
          accessible: true,
        },
        {
          id: 'apply-discount',
          type: 'testid',
          selector: "[data-testid='apply-discount']",
          priority: 3,
          accessible: false,
        },
      ],
    ],
  ]);

  const visits: string[] = [];
  const browserFactory: BrowserFactory = async () => ({
    async newPage() {
      let route = '/';
      return {
        async goto(url: string) {
          route = new URL(url).pathname;
          visits.push(route);
          return null;
        },
        async evaluate(_fn?: () => ExtractedSelector[] | Promise<ExtractedSelector[]>) {
          return extractedSelectors.get(route) ?? [];
        },
        async close() {},
      };
    },
    async close() {},
  });

  await collectSelectors({
    baseUrl: 'https://example.com',
    routes: ['/'],
    outputPath: selectorsPath,
    browserFactory,
    now: () => new Date('2025-10-18T00:00:00Z'),
  });

  const registry = JSON.parse(await fs.readFile(selectorsPath, 'utf8'));
  assert.ok(registry.selectors['discount-banner']);

  const graph = createGraph([
    { selectorId: 'discount-banner', locator: "[aria-label='Discount applied']" },
    { selectorId: 'apply-discount', locator: "[data-testid='apply-discount']" },
  ]);

  await fs.writeFile(path.join(graphDir, 'spec.json'), JSON.stringify(graph, null, 2), 'utf8');

  const report = await validateSelectors({ graphDir, registryPath: selectorsPath, reportPath });
  assert.equal(report.issues.length, 0);
  assert.equal(report.summary.selectorMismatches, 0);
});

function createGraph(selectors: Array<{ selectorId: string; locator: string }>): ActionGraph {
  const nodes = selectors.map((selector, index) => ({
    nodeId: `step_${index}`,
    type: 'act',
    stepIndex: index,
    gherkinStep: { keyword: 'when', text: `Interact with ${selector.selectorId}` },
    selectors: [{ id: selector.selectorId, locator: selector.locator }],
    instructions: { deterministic: { selector: selector.selectorId, action: 'click' } },
  }));

  return {
    graphId: 'integration-graph',
    version: '1.0',
    nodes,
    edges: [],
    metadata: {
      createdAt: new Date().toISOString(),
      specId: 'integration-spec',
      scenarioName: 'Integration scenario',
      authorship: { authoringMode: true, authoredBy: 'integration-test' },
    },
  };
}
