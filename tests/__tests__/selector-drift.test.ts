import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { validateSelectorDrift } from '../scripts/selector-drift';
import type {
  BrowserFactory,
  ExtractedSelector,
  ExtractSelectorsFn,
} from '../scripts/collect-selectors';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selector-drift-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('validateSelectorDrift reports missing/updated/new selectors without applying changes', async () => {
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'selectors', 'drift-report.json');
  await fs.mkdir(path.dirname(registryPath), { recursive: true });

  await fs.writeFile(
    registryPath,
    JSON.stringify(
      {
        version: '2025-10-01',
        lastScanned: '2025-10-01T00:00:00Z',
        selectors: {
          'stable-button': {
            id: 'stable-button',
            type: 'role',
            selector: "[role='button'][aria-label='Continue']",
            priority: 1,
            lastSeen: '2025-10-01T00:00:00Z',
            stability: 'high',
            page: '/login',
            accessible: true,
          },
          'login-input': {
            id: 'login-input',
            type: 'testid',
            selector: "[data-testid='login-input']",
            priority: 3,
            lastSeen: '2025-10-01T00:00:00Z',
            stability: 'medium',
            page: '/login',
            accessible: false,
          },
          'stale-link': {
            id: 'stale-link',
            type: 'label',
            selector: "[aria-label='Legacy link']",
            priority: 2,
            lastSeen: '2025-09-15T00:00:00Z',
            stability: 'low',
            page: '/legacy',
            accessible: true,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const extractedByRoute = new Map<string, ExtractedSelector[]>([
    [
      '/login',
      [
        {
          id: 'stable-button',
          type: 'role',
          selector: "[role='button'][aria-label='Continue']",
          priority: 1,
          accessible: true,
        },
        {
          id: 'login-input',
          type: 'css',
          selector: "input[name='login']",
          priority: 4,
          accessible: false,
        },
        {
          id: 'promo-banner',
          type: 'label',
          selector: "[aria-label='Promo banner']",
          priority: 2,
          accessible: true,
        },
      ],
    ],
    [
      '/legacy',
      [
        {
          id: 'legacy-banner',
          type: 'label',
          selector: "[aria-label='Legacy replacement']",
          priority: 2,
          accessible: true,
        },
      ],
    ],
  ]);

  const browserFactory: BrowserFactory = async () => ({
    async newPage() {
      let currentRoute = '/login';
      return {
        async goto(url: string) {
          currentRoute = new URL(url).pathname;
          return null;
        },
        async evaluate(_fn?: () => ExtractedSelector[] | Promise<ExtractedSelector[]>) {
          return extractedByRoute.get(currentRoute) ?? [];
        },
        async close() {},
      };
    },
    async close() {},
  });

  const extractSelectors: ExtractSelectorsFn = async (_page, route) =>
    extractedByRoute.get(route) ?? [];

  const result = await validateSelectorDrift({
    baseUrl: 'https://example.com',
    routes: ['/login', '/legacy'],
    registryPath,
    reportPath,
    browserFactory,
    extractSelectors,
    now: () => new Date('2025-11-01T00:00:00Z'),
  }).catch((error) => {
    console.error('validateSelectorDrift (report) failed', error);
    throw error;
  });

  assert.equal(result.applied, false);
  assert.equal(result.report.summary.missing, 1);
  assert.equal(result.report.summary.updated, 1);
  assert.equal(result.report.summary.new, 2);
  assert.equal(result.report.summary.unchanged, 1);
  assert.equal(result.report.missing[0].id, 'stale-link');
  assert.equal(result.report.updated[0].id, 'login-input');
  assert.ok(result.report.added.some((entry) => entry.id === 'promo-banner'));
  assert.ok(result.report.added.some((entry) => entry.id === 'legacy-banner'));

  const storedReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(storedReport.summary.missing, 1);
  assert.ok(storedReport.missing[0].suggestion);
});

test('validateSelectorDrift applies updates when requested', async () => {
  const registryPath = path.join(tempDir, 'selectors', 'registry.json');
  const reportPath = path.join(tempDir, 'selectors', 'drift-report.json');
  await fs.mkdir(path.dirname(registryPath), { recursive: true });

  await fs.writeFile(
    registryPath,
    JSON.stringify(
      {
        version: '2025-10-10',
        lastScanned: '2025-10-10T00:00:00Z',
        selectors: {
          'checkout-button': {
            id: 'checkout-button',
            type: 'role',
            selector: "[role='button'][aria-label='Checkout']",
            priority: 1,
            lastSeen: '2025-10-10T00:00:00Z',
            stability: 'high',
            page: '/cart',
            accessible: true,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const extractedByRoute = new Map<string, ExtractedSelector[]>([
    [
      '/cart',
      [
        {
          id: 'checkout-button',
          type: 'role',
          selector: "[role='button'][aria-label='Checkout now']",
          priority: 1,
          accessible: true,
        },
        {
          id: 'cart-summary',
          type: 'label',
          selector: "[aria-label='Cart summary']",
          priority: 2,
          accessible: true,
        },
      ],
    ],
  ]);

  const browserFactory: BrowserFactory = async () => ({
    async newPage() {
      return {
        async goto() {
          return null;
        },
        async evaluate(_fn?: () => ExtractedSelector[] | Promise<ExtractedSelector[]>) {
          return extractedByRoute.get('/cart') ?? [];
        },
        async close() {},
      };
    },
    async close() {},
  });

  const extractSelectors: ExtractSelectorsFn = async (_page, route) =>
    extractedByRoute.get(route) ?? [];

  const result = await validateSelectorDrift({
    baseUrl: 'https://example.com',
    routes: ['/cart'],
    registryPath,
    reportPath,
    browserFactory,
    extractSelectors,
    applyUpdates: true,
    now: () => new Date('2025-11-01T00:00:00Z'),
  }).catch((error) => {
    console.error('validateSelectorDrift (apply) failed', error);
    throw error;
  });

  assert.equal(result.applied, true);

  const storedRegistry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  assert.equal(storedRegistry.selectors['checkout-button'].selector, "[role='button'][aria-label='Checkout now']");
  assert.ok(storedRegistry.selectors['cart-summary']);
});
