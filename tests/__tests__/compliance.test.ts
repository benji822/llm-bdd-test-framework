import type { Dirent } from 'node:fs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { scanFilesForSecrets } from '../scripts/utils/secret-scanner';

test('TypeScript strict mode enabled for pipeline sources', async () => {
  const tsconfigPath = path.resolve('tsconfig.json');
  const raw = await fs.readFile(tsconfigPath, 'utf8');
  const tsconfig = JSON.parse(raw) as { compilerOptions?: { strict?: boolean }; include?: string[] };

  assert.equal(tsconfig.compilerOptions?.strict, true, 'tsconfig should enable strict mode');
  assert.ok(
    tsconfig.include?.some((pattern) => pattern.includes('tests/')),
    'tsconfig must include the tests directory for type checking',
  );
});

test('Service layer isolation prevents direct SDK imports in pipeline scripts', async () => {
  const scriptsDir = path.resolve('tests/scripts');
  const banned = [/@openai\/codex-sdk/, /@anthropic-ai\/claude-agent-sdk/];
  const files = await collectTypeScriptFiles(scriptsDir);

  for (const file of files) {
    if (file.includes(`${path.sep}llm${path.sep}`)) {
      continue;
    }
    const contents = await fs.readFile(file, 'utf8');
    banned.forEach((pattern) => {
      assert.ok(!pattern.test(contents), `${file} should not import ${pattern.source}`);
    });
  }
});

test('Graph artifacts exist for Stagehand recordings', async () => {
  const graphDir = path.resolve('tests/artifacts/graph');
  const graphFiles = await collectFiles(graphDir, '.json');
  assert.ok(graphFiles.length > 0, 'At least one Stagehand graph file should exist');
});

test('Secret scanning covers compiled artifacts', async () => {
  const graphDir = path.resolve('tests/artifacts/graph');
  const featureDir = path.resolve('tests/features');
  const selectorFile = path.resolve('tests/artifacts/selectors/registry.json');

  const targets = [
    ...await collectFiles(graphDir, '.json'),
    ...await collectFiles(featureDir, '.feature'),
    selectorFile,
  ];

  const issues = await scanFilesForSecrets({ files: targets });
  assert.equal(issues.length, 0, `Secret scan found ${issues.length} issues`);
});

async function collectFiles(root: string, extension: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(candidate, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push(candidate);
    }
  }
  return files;
}
