import path from 'node:path';

import { ensureDir, writeTextFile, fileExists, readTextFile } from './utils/file-operations';
import { logEvent } from './utils/logging';
import type { SelectorEntry, SelectorRegistry } from './types/selector-registry';

type BrowserFactory = () => Promise<BrowserAdapter>;

interface BrowserAdapter {
  newPage(): Promise<PageAdapter>;
  close(): Promise<void>;
}

interface PageAdapter {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface ExtractedSelector {
  id: string;
  type: SelectorEntry['type'];
  selector: string;
  priority: SelectorEntry['priority'];
  accessible: boolean;
}

type ExtractSelectorsFn = (page: PageAdapter, route: string) => Promise<ExtractedSelector[]>;

interface CollectSelectorsOptions {
  baseUrl: string;
  routes?: string[];
  outputPath?: string;
  browserFactory?: BrowserFactory;
  extractSelectors?: ExtractSelectorsFn;
  now?: () => Date;
}

const DEFAULT_ROUTES = ['/'];
const DEFAULT_OUTPUT = path.resolve('tests/artifacts/selectors.json');

export async function collectSelectors(options: CollectSelectorsOptions): Promise<SelectorRegistry> {
  const {
    baseUrl,
    routes = DEFAULT_ROUTES,
    outputPath = DEFAULT_OUTPUT,
    browserFactory = defaultBrowserFactory,
    extractSelectors = defaultExtractSelectors,
    now = () => new Date(),
  } = options;

  let existing: SelectorRegistry | undefined;
  if (await fileExists(outputPath)) {
    try {
      existing = JSON.parse(await readTextFile(outputPath)) as SelectorRegistry;
    } catch {
      existing = undefined;
    }
  }

  const browser = await browserFactory();
  const page = await browser.newPage();

  const selectors: Record<string, SelectorEntry> = { ...(existing?.selectors ?? {}) };
  const timestamp = now().toISOString();

  try {
    for (const route of routes) {
      const url = new URL(route, baseUrl).toString();
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
      } catch (error) {
        if (isConnectionRefused(error)) {
          console.warn(`Skipping ${url}: ${extractErrorMessage(error)}.`);
          logEvent('selectors.route.skipped', 'Route skipped during selector collection', {
            url,
            reason: 'connection_refused',
          });
          continue;
        }
        throw error;
      }

      const extracted = await extractSelectors(page, route);
      for (const entry of extracted) {
        const normalizedId = entry.id.toLowerCase();
        const existing = selectors[normalizedId];
        if (existing && existing.priority <= entry.priority) {
          continue;
        }

        selectors[normalizedId] = {
          id: normalizedId,
          type: entry.type,
          selector: entry.selector,
          priority: entry.priority,
          lastSeen: timestamp,
          stability: existing?.stability ?? 'medium',
          page: route,
          accessible: entry.accessible,
        };
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }

  const registry: SelectorRegistry = {
    version: timestamp.slice(0, 10),
    lastScanned: timestamp,
    selectors,
  };

  await ensureDir(path.dirname(outputPath));
  await writeTextFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`);

  logEvent('selectors.collected', 'Selector registry updated', {
    outputPath,
    total: Object.keys(selectors).length,
  });

  return registry;
}

async function defaultBrowserFactory(): Promise<BrowserAdapter> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const globalObject = globalThis as unknown as {
      __name?: (target: { name?: string }, value: string) => unknown;
    };

    if (typeof globalObject.__name !== 'function') {
      globalObject.__name = (target: { name?: string }, value: string) => {
        try {
          Object.defineProperty(target, 'name', { value, configurable: true });
        } catch {
          // Ignore inability to define property in older browsers.
        }
        return target;
      };
    }
  });

  return {
    async newPage(): Promise<PageAdapter> {
      const page = await context.newPage();
      return {
        goto: (url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }) =>
          page.goto(url, options),
        evaluate: <T>(fn: () => T | Promise<T>) => page.evaluate(fn),
        close: () => page.close(),
      };
    },
    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}

async function defaultExtractSelectors(page: PageAdapter, route: string): Promise<ExtractedSelector[]> {
  return page.evaluate(() => {
    const __name = <T extends Function>(target: T, value: string): T => {
      try {
        Object.defineProperty(target, 'name', { value, configurable: true });
      } catch {
        // ignore if defineProperty fails (older browsers)
      }
      return target;
    };

    const results = new Map<string, ExtractedSelector>();

    const slugify = (value: string) =>
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const record = (entry: ExtractedSelector) => {
      const id = entry.id.toLowerCase();
      const existing = results.get(id);
      if (existing && existing.priority <= entry.priority) {
        return;
      }
      results.set(id, { ...entry, id });
    };

    document.querySelectorAll('[role]').forEach((element) => {
      const role = element.getAttribute('role');
      if (!role) return;
      const name = element.getAttribute('aria-label') ?? element.textContent ?? '';
      if (!name.trim()) return;
      const id = `${role}-${slugify(name)}`;
      record({
        id,
        type: 'role',
        selector: `[role='${role}'][aria-label='${name.trim()}']`,
        priority: 1,
        accessible: true,
      });
    });

    document.querySelectorAll('[aria-label]').forEach((element) => {
      const label = element.getAttribute('aria-label');
      if (!label) return;
      record({
        id: slugify(label),
        type: 'label',
        selector: `[aria-label='${label}']`,
        priority: 2,
        accessible: true,
      });
    });

    document.querySelectorAll('[data-testid]').forEach((element) => {
      const testId = element.getAttribute('data-testid');
      if (!testId) return;
      record({
        id: slugify(testId),
        type: 'testid',
        selector: `[data-testid='${testId}']`,
        priority: 3,
        accessible: false,
      });
    });

    return Array.from(results.values());
  });
}

export type { CollectSelectorsOptions, ExtractSelectorsFn, ExtractedSelector, BrowserFactory };

function isConnectionRefused(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const value = error as { message?: string; code?: string };
  const message = value.message ?? '';
  return value.code === 'ECONNREFUSED' || /ERR_CONNECTION_REFUSED/u.test(message);
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
