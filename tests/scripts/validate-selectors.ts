import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir, readTextFile, writeTextFile } from './utils/file-operations';
import type { SelectorRegistry } from './types/selector-registry';
import { readSelectorRegistry, resolveRegistryPath } from './selector-registry';
import type { ValidationIssue, ValidationReport } from './types/validation-report';

interface ValidateSelectorsOptions {
  graphDir?: string;
  registryPath?: string;
  reportPath?: string;
}

const DEFAULT_GRAPH_DIR = path.resolve('tests/artifacts/graph');
const DEFAULT_REGISTRY_PATH = resolveRegistryPath();
const DEFAULT_REPORT_PATH = path.resolve('tests/artifacts/validation-report.json');

type SelectorIssue = {
  selectorId: string;
  graph: string;
};

export async function validateSelectors(options: ValidateSelectorsOptions): Promise<ValidationReport> {
  const graphDir = path.resolve(options.graphDir ?? DEFAULT_GRAPH_DIR);
  const registry = await loadRegistry(options.registryPath);
  const reportPath = path.resolve(options.reportPath ?? DEFAULT_REPORT_PATH);

  const graphFiles = await findFiles(graphDir, '.json');
  const issues: ValidationIssue[] = [];

  for (const file of graphFiles) {
    const content = await readTextFile(file);
    const graph = JSON.parse(content) as { nodes?: Array<{ selectors?: Array<{ id?: string }>; instructions?: { deterministic?: { selector?: string } } }>; };
    const missing = findMissingSelectors(graph, registry);
    missing.forEach((selector) => {
      issues.push({
        severity: 'error',
        type: 'selector',
        message: `Selector '${selector.selectorId}' referenced in ${path.basename(file)} is not in the registry.`,
        file,
        suggestion: suggestAlternative(registry.selectors),
      });
    });
  }

  const report = buildReport(graphFiles.length, issues);
  await persistReport(reportPath, report);
  return report;
}

async function loadRegistry(registryPath?: string): Promise<SelectorRegistry> {
  const registry = await readSelectorRegistry(registryPath ?? DEFAULT_REGISTRY_PATH);
  if (!registry) {
    throw new Error(`Selector registry not found at ${resolveRegistryPath(registryPath)}`);
  }
  return registry;
}

async function findFiles(root: string, extension: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findMissingSelectors(graph: { nodes?: Array<{ selectors?: Array<{ id?: string }>; instructions?: { deterministic?: { selector?: string } } }> } }, registry: SelectorRegistry): SelectorIssue[] {
  const missing: SelectorIssue[] = [];
  const nodes = graph.nodes ?? [];

  for (const node of nodes) {
    const ids = extractSelectorIds(node);
    for (const selectorId of ids) {
      const normalized = normalizeId(selectorId);
      if (!normalized) {
        continue;
      }
      if (!registry.selectors[normalized]) {
        missing.push({ selectorId, graph: node?.instructions?.deterministic?.selector ?? '' });
      }
    }
  }

  return missing;
}

function extractSelectorIds(node: { selectors?: Array<{ id?: string }>; instructions?: { deterministic?: { selector?: string } } }): string[] {
  const ids = new Set<string>();
  for (const entry of node.selectors ?? []) {
    if (entry.id) {
      ids.add(entry.id);
    }
  }
  const deterministic = node.instructions?.deterministic?.selector;
  if (deterministic) {
    ids.add(deterministic);
  }
  return Array.from(ids);
}

function normalizeId(selector: string): string {
  return selector.trim().toLowerCase();
}

function suggestAlternative(registry: Record<string, import('./types/selector-registry').SelectorEntry>): string | undefined {
  const matches = Object.values(registry)
    .filter((entry) => entry.accessible)
    .sort((a, b) => a.priority - b.priority);
  return matches[0]?.id;
}

function buildReport(totalGraphs: number, issues: ValidationIssue[]): ValidationReport {
  const failedFiles = new Set(issues.map((issue) => issue.file));
  return {
    timestamp: new Date().toISOString(),
    totalFiles: totalGraphs,
    passed: Math.max(totalGraphs - failedFiles.size, 0),
    failed: failedFiles.size,
    issues,
    summary: {
      schemaErrors: 0,
      lintErrors: 0,
      selectorMismatches: issues.length,
      coverageGaps: 0,
      secretFindings: 0,
    },
  };
}

async function persistReport(reportPath: string, report: ValidationReport): Promise<void> {
  await ensureDir(path.dirname(reportPath));
  await writeTextFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
