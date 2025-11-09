import path from 'node:path';

import { ensureDir, fileExists, readTextFile, writeTextFile } from './utils/file-operations';
import type { SelectorRegistry } from './types/selector-registry';

const SELECTOR_ARTIFACT_DIR = path.resolve('tests/artifacts/selectors');
const DEFAULT_REGISTRY_PATH = path.join(SELECTOR_ARTIFACT_DIR, 'registry.json');
const DEFAULT_DRIFT_REPORT_PATH = path.join(SELECTOR_ARTIFACT_DIR, 'drift-report.json');

export function resolveRegistryPath(customPath?: string): string {
  return path.resolve(customPath ?? DEFAULT_REGISTRY_PATH);
}

export function resolveDriftReportPath(customPath?: string): string {
  return path.resolve(customPath ?? DEFAULT_DRIFT_REPORT_PATH);
}

export async function readSelectorRegistry(
  registryPath?: string
): Promise<SelectorRegistry | undefined> {
  const resolved = resolveRegistryPath(registryPath);
  if (!(await fileExists(resolved))) {
    return undefined;
  }

  try {
    const contents = await readTextFile(resolved);
    return JSON.parse(contents) as SelectorRegistry;
  } catch (error) {
    throw new Error(`Failed to parse selector registry at ${resolved}: ${(error as Error).message}`);
  }
}

export async function writeSelectorRegistry(
  registry: SelectorRegistry,
  registryPath?: string
): Promise<string> {
  const resolved = resolveRegistryPath(registryPath);
  await ensureDir(path.dirname(resolved));
  await writeTextFile(resolved, `${JSON.stringify(registry, null, 2)}\n`);
  return resolved;
}

export function selectorArtifactDir(): string {
  return SELECTOR_ARTIFACT_DIR;
}
