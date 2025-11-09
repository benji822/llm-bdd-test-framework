import path from 'node:path';

import { scanSelectorRegistry, type SelectorScanOptions } from './collect-selectors';
import type { SelectorEntry, SelectorRegistry } from './types/selector-registry';
import {
  resolveRegistryPath,
  resolveDriftReportPath,
  readSelectorRegistry,
  writeSelectorRegistry,
} from './selector-registry';
import { ensureDir, writeTextFile } from './utils/file-operations';
import { logEvent } from './utils/logging';

export interface SelectorDriftOptions extends SelectorScanOptions {
  registryPath?: string;
  reportPath?: string;
  applyUpdates?: boolean;
}

export interface DriftMissingEntry {
  id: string;
  lastSeen?: string;
  page?: string;
  priority?: SelectorEntry['priority'];
  suggestion?: SelectorEntry;
}

export interface DriftUpdatedEntry {
  id: string;
  previous: SelectorEntry;
  observed: SelectorEntry;
}

export interface SelectorDriftReport {
  timestamp: string;
  baseUrl: string;
  routes: string[];
  registryPath: string;
  summary: {
    totalTracked: number;
    missing: number;
    updated: number;
    new: number;
    unchanged: number;
  };
  missing: DriftMissingEntry[];
  updated: DriftUpdatedEntry[];
  added: SelectorEntry[];
}

export interface SelectorDriftResult {
  report: SelectorDriftReport;
  applied: boolean;
  nextRegistry?: SelectorRegistry;
}

export async function validateSelectorDrift(options: SelectorDriftOptions): Promise<SelectorDriftResult> {
  const registryPath = resolveRegistryPath(options.registryPath);
  const reportPath = resolveDriftReportPath(options.reportPath);
  const routes = options.routes ?? ['/'];

  let existing: SelectorRegistry | undefined;
  try {
    existing = await readSelectorRegistry(registryPath);
  } catch (error) {
    console.warn(
      `Failed to read selector registry at ${registryPath}: ${(error as Error).message}`,
    );
  }

  if (!existing) {
    existing = {
      version: '',
      lastScanned: '',
      selectors: {},
    };
  }

  const scan = await scanSelectorRegistry({
    baseUrl: options.baseUrl,
    routes: options.routes,
    browserFactory: options.browserFactory,
    extractSelectors: options.extractSelectors,
    now: options.now,
  });

  const existingMap = existing.selectors ?? {};
  const observedMap = scan.selectors;

  const missing: DriftMissingEntry[] = [];
  const updated: DriftUpdatedEntry[] = [];
  const added: SelectorEntry[] = [];
  let unchanged = 0;

  for (const [id, entry] of Object.entries(existingMap)) {
    const observed = observedMap[id];
    if (!observed) {
      missing.push({
        id,
        lastSeen: entry.lastSeen,
        page: entry.page,
        priority: entry.priority,
        suggestion: findSuggestion(id, entry, observedMap),
      });
      continue;
    }

    if (hasMeaningfulChange(entry, observed)) {
      updated.push({ id, previous: entry, observed });
    } else {
      unchanged += 1;
    }
  }

  for (const [id, entry] of Object.entries(observedMap)) {
    if (!existingMap[id]) {
      added.push(entry);
    }
  }

  const summary = {
    totalTracked: Object.keys(existingMap).length,
    missing: missing.length,
    updated: updated.length,
    new: added.length,
    unchanged,
  };

  const report: SelectorDriftReport = {
    timestamp: new Date().toISOString(),
    baseUrl: options.baseUrl,
    routes,
    registryPath,
    summary,
    missing,
    updated,
    added,
  };

  await ensureDir(path.dirname(reportPath));
  await writeTextFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  let applied = false;
  let nextRegistry: SelectorRegistry | undefined;
  if (options.applyUpdates) {
    const mergedSelectors: Record<string, SelectorEntry> = { ...existingMap };

    for (const diff of updated) {
      const previous = mergedSelectors[diff.id];
      mergedSelectors[diff.id] = {
        ...diff.observed,
        stability: previous?.stability ?? diff.observed.stability ?? 'medium',
      };
    }

    for (const entry of added) {
      mergedSelectors[entry.id] = entry;
    }

    nextRegistry = {
      version: scan.version,
      lastScanned: scan.lastScanned,
      selectors: mergedSelectors,
    };

    await writeSelectorRegistry(nextRegistry, registryPath);
    applied = true;
  }

  logEvent('selectors.drift', 'Selector drift validation completed', {
    baseUrl: options.baseUrl,
    reportPath,
    missing: summary.missing,
    updated: summary.updated,
    added: summary.new,
    applied,
  });

  return { report, applied, nextRegistry };
}

function hasMeaningfulChange(previous: SelectorEntry, observed: SelectorEntry): boolean {
  return (
    previous.selector !== observed.selector ||
    previous.type !== observed.type ||
    previous.priority !== observed.priority ||
    previous.accessible !== observed.accessible ||
    previous.page !== observed.page
  );
}

function findSuggestion(
  id: string,
  missingEntry: SelectorEntry,
  observedMap: Record<string, SelectorEntry>
): SelectorEntry | undefined {
  const normalized = normalizeId(id);
  const exact = Object.values(observedMap).find((entry) => normalizeId(entry.id) === normalized);
  if (exact) {
    return exact;
  }

  const samePage = Object.values(observedMap)
    .filter((entry) => entry.page === missingEntry.page)
    .sort((a, b) => a.priority - b.priority);
  return samePage[0];
}

function normalizeId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
