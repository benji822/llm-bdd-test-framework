import { logEvent } from './utils/logging';
import type { SelectorEntry, SelectorRegistry } from './types/selector-registry';
import {
  resolveRegistryPath,
  readSelectorRegistry,
  writeSelectorRegistry,
} from './selector-registry';

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

interface SelectorScanOptions {
  baseUrl: string;
  routes?: string[];
  browserFactory?: BrowserFactory;
  extractSelectors?: ExtractSelectorsFn;
  now?: () => Date;
}

interface CollectSelectorsOptions extends SelectorScanOptions {
  outputPath?: string;
}

const DEFAULT_ROUTES = ['/'];
const DEFAULT_OUTPUT = resolveRegistryPath();

export async function collectSelectors(options: CollectSelectorsOptions): Promise<SelectorRegistry> {
  const {
    baseUrl,
    routes,
    outputPath,
    browserFactory,
    extractSelectors,
    now,
  } = options;
  const resolvedOutputPath = resolveRegistryPath(outputPath ?? DEFAULT_OUTPUT);

  let existing: SelectorRegistry | undefined;
  try {
    existing = await readSelectorRegistry(resolvedOutputPath);
  } catch (error) {
    console.warn(
      `Failed to read existing selector registry at ${resolvedOutputPath}: ${(error as Error).message}`,
    );
  }

  const scan = await scanSelectorRegistry({
    baseUrl,
    routes,
    browserFactory,
    extractSelectors,
    now,
  });

  const selectors: Record<string, SelectorEntry> = { ...(existing?.selectors ?? {}) };

  for (const [id, entry] of Object.entries(scan.selectors)) {
    const existingEntry = selectors[id];
    if (existingEntry && existingEntry.priority <= entry.priority) {
      continue;
    }
    selectors[id] = {
      ...entry,
      stability: existingEntry?.stability ?? entry.stability ?? 'medium',
    };
  }

  const registry: SelectorRegistry = {
    version: scan.version,
    lastScanned: scan.lastScanned,
    selectors,
  };

  await writeSelectorRegistry(registry, resolvedOutputPath);

  logEvent('selectors.collected', 'Selector registry updated', {
    outputPath: resolvedOutputPath,
    total: Object.keys(selectors).length,
  });

  return registry;
}

export async function scanSelectorRegistry(options: SelectorScanOptions): Promise<SelectorRegistry> {
  const {
    baseUrl,
    routes = DEFAULT_ROUTES,
    browserFactory = defaultBrowserFactory,
    extractSelectors = defaultExtractSelectors,
    now = () => new Date(),
  } = options;

  const browser = await browserFactory();
  const page = await browser.newPage();

  const selectors: Record<string, SelectorEntry> = {};
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

export type {
  CollectSelectorsOptions,
  SelectorScanOptions,
  ExtractSelectorsFn,
  ExtractedSelector,
  BrowserFactory,
};

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
