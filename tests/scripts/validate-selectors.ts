import fs from 'node:fs/promises';
import path from 'node:path';

import { readTextFile, ensureDir, writeTextFile } from './utils/file-operations';
import type { SelectorRegistry, SelectorEntry } from './types/selector-registry';
import { NormalizedYamlSchema, type NormalizedYaml } from './types/yaml-spec';
import { parseYaml } from './utils/yaml-parser';
import type { ValidationReport, ValidationIssue } from './types/validation-report';

interface ValidateSelectorsOptions {
  normalizedDir: string;
  featuresDir?: string;
  registryPath?: string;
  reportPath?: string;
}

const DEFAULT_REGISTRY_PATH = path.resolve('tests/artifacts/selectors.json');
const DEFAULT_REPORT_PATH = path.resolve('tests/artifacts/validation-report.json');

export async function validateSelectors(options: ValidateSelectorsOptions): Promise<ValidationReport> {
  const {
    normalizedDir,
    featuresDir,
    registryPath = DEFAULT_REGISTRY_PATH,
    reportPath = DEFAULT_REPORT_PATH,
  } = options;

  const registry = await loadRegistry(registryPath);
  const issues: ValidationIssue[] = [];

  const yamlFiles = await findFiles(normalizedDir, '.yaml');
  for (const file of yamlFiles) {
    const yamlContent = await readTextFile(file);
    const normalized = NormalizedYamlSchema.parse(parseYaml<NormalizedYaml>(yamlContent));
    const selectorsByLine = indexYamlSelectors(yamlContent);

    for (const scenario of normalized.scenarios) {
      for (const [selectorId] of Object.entries(scenario.selectors ?? {})) {
        const normalizedId = selectorId.toLowerCase();
        if (!registry.selectors[normalizedId]) {
          issues.push({
            severity: 'error',
            type: 'selector',
            message: `Selector '${selectorId}' not found in registry.`,
            file,
            line: selectorsByLine.get(selectorId),
            suggestion: suggestAlternative(registry.selectors),
          });
        }
      }
    }
  }

  const report = createReport(issues, yamlFiles.length + (featuresDir ? (await findFiles(featuresDir)).length : 0));

  await ensureDir(path.dirname(reportPath));
  await writeTextFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}

async function loadRegistry(registryPath: string): Promise<SelectorRegistry> {
  const raw = await readTextFile(registryPath);
  return JSON.parse(raw) as SelectorRegistry;
}

async function findFiles(root: string, extension?: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, extension)));
    } else if (!extension || entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function indexYamlSelectors(content: string): Map<string, number> {
  const lines = content.split(/\r?\n/);
  const map = new Map<string, number>();

  lines.forEach((line, index) => {
    const match = line.match(/^\s*([a-z0-9-]+)\s*:/i);
    if (match) {
      map.set(match[1], index + 1);
    }
  });

  return map;
}

function suggestAlternative(registry: Record<string, SelectorEntry>): string | undefined {
  const accessible = Object.values(registry)
    .filter((entry) => entry.accessible)
    .sort((a, b) => a.priority - b.priority);
  return accessible[0]?.id;
}

function createReport(issues: ValidationIssue[], totalFiles: number): ValidationReport {
  const failedFiles = new Set(issues.map((issue) => issue.file));

  return {
    timestamp: new Date().toISOString(),
    totalFiles,
    passed: totalFiles - failedFiles.size,
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
