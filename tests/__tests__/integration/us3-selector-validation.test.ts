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

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us3-integration-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('collect selectors then validate normalized YAML using updated registry', async () => {
  const normalizedDir = path.join(tempDir, 'normalized');
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.writeFile(
    path.join(normalizedDir, 'cart.yaml'),
    `feature: Shopping cart
scenarios:
  - name: Apply discount
    steps:
      - type: given
        text: I am on the cart page
      - type: then
        text: I should see text "Discount applied"
    selectors:
      discount-banner: "div[aria-label='Discount applied']"
      apply-discount: "[data-testid='apply-discount']"
metadata:
  specId: "66666666-6666-6666-6666-666666666666"
  generatedAt: "2025-10-18T12:30:00Z"
  llmProvider: "codex"
  llmModel: "stub-model"
`,
    'utf8',
  );

  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'artifacts/report.json');

  const extractedSelectors = new Map([
    [
      '/',
      [
        {
          id: 'discount-banner',
          type: 'label' as const,
          selector: "[aria-label='Discount applied']",
          priority: 2 as const,
          accessible: true,
        },
        {
          id: 'apply-discount',
          type: 'testid' as const,
          selector: "[data-testid='apply-discount']",
          priority: 3 as const,
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
    outputPath: registryPath,
    browserFactory,
    now: () => new Date('2025-10-18T00:00:00Z'),
  });

  const report = await validateSelectors({
    normalizedDir,
    registryPath,
    reportPath,
  });

  assert.deepEqual(visits, ['/']);
  assert.equal(report.issues.length, 0);
  const stored = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  assert.ok(stored.selectors['discount-banner']);
  const storedReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(storedReport.failed, 0);
});
