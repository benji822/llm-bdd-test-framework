import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  collectSelectors,
  type ExtractedSelector,
  type BrowserFactory,
} from '../scripts/collect-selectors';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us3-collect-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('collectSelectors writes registry and prefers higher priority entries', async () => {
  const routes = ['/login', '/dashboard'];
  const outputPath = path.join(tempDir, 'selectors.json');

  const extractedByRoute = new Map<string, ExtractedSelector[]>([
    [
      '/login',
      [
        {
          id: 'login-button',
          type: 'testid',
          selector: "[data-testid='login-button']",
          priority: 3,
          accessible: false,
        },
        {
          id: 'login-button',
          type: 'role',
          selector: "[role='button'][aria-label='Login']",
          priority: 1,
          accessible: true,
        },
      ],
    ],
    [
      '/dashboard',
      [
        {
          id: 'header',
          type: 'label',
          selector: "[aria-label='Dashboard header']",
          priority: 2,
          accessible: true,
        },
      ],
    ],
  ]);

  const visitedRoutes: string[] = [];
  let pageClosed = false;
  let browserClosed = false;

  const browserFactory: BrowserFactory = async () => ({
    async newPage() {
      let currentRoute = routes[0];
      return {
        async goto(url: string) {
          currentRoute = new URL(url).pathname;
          visitedRoutes.push(currentRoute);
        },
        async evaluate() {
          return extractedByRoute.get(currentRoute) ?? [];
        },
        async close() {
          pageClosed = true;
        },
      };
    },
    async close() {
      browserClosed = true;
    },
  });

  const registry = await collectSelectors({
    baseUrl: 'https://example.com',
    routes,
    outputPath,
    browserFactory,
    extractSelectors: async (_page, route) => extractedByRoute.get(route) ?? [],
    now: () => new Date('2025-10-18T00:00:00Z'),
  });

  assert.deepEqual(visitedRoutes, routes);
  assert.equal(pageClosed, true);
  assert.equal(browserClosed, true);

  const stored = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  assert.equal(stored.version, '2025-10-18');
  assert.ok(stored.selectors['login-button']);
  assert.equal(stored.selectors['login-button'].type, 'role');
  assert.equal(stored.selectors['login-button'].priority, 1);
  assert.equal(stored.selectors['header'].type, 'label');

  assert.deepEqual(registry.selectors['login-button'].selector, "[role='button'][aria-label='Login']");
});

test('collectSelectors merges newly discovered selectors without dropping existing ones', async () => {
  const outputPath = path.join(tempDir, 'selectors.json');

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        version: '2025-10-17',
        lastScanned: '2025-10-17T00:00:00Z',
        selectors: {
          'persisted-link': {
            id: 'persisted-link',
            type: 'label',
            selector: "[aria-label='Persisted link']",
            priority: 2,
            lastSeen: '2025-10-17T00:00:00Z',
            stability: 'high',
            page: '/account',
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
          id: 'login-button',
          type: 'role',
          selector: "[role='button'][aria-label='Login']",
          priority: 1,
          accessible: true,
        },
      ],
    ],
  ]);

  const browserFactory: BrowserFactory = async () => ({
    async newPage() {
      return {
        async goto() {},
        async evaluate(route?: string) {
          return extractedByRoute.get(route ?? '') ?? [];
        },
        async close() {},
      };
    },
    async close() {},
  });

  const registry = await collectSelectors({
    baseUrl: 'https://example.com',
    routes: ['/login'],
    outputPath,
    browserFactory,
    extractSelectors: async (_page, route) => extractedByRoute.get(route) ?? [],
    now: () => new Date('2025-10-18T00:00:00Z'),
  });

  assert.ok(registry.selectors['persisted-link']);
  assert.ok(registry.selectors['login-button']);
  const stored = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  assert.equal(stored.selectors['persisted-link'].selector, "[aria-label='Persisted link']");
});
