import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { runPipelineBenchmark, MAX_STAGE_DURATION_MS } from '../scripts/utils/benchmark-runner';
import { scanFilesForSecrets } from '../scripts/utils/secret-scanner';

test('TypeScript strict mode enabled for pipeline sources', async () => {
  const tsconfigPath = path.resolve('tsconfig.json');
  const raw = await fs.readFile(tsconfigPath, 'utf8');
  const tsconfig = JSON.parse(raw) as {
    compilerOptions?: { strict?: boolean };
    include?: string[];
  };

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

test('Benchmark run keeps each stage under target threshold', async () => {
  const result = await runPipelineBenchmark();
  for (const [stage, duration] of Object.entries(result.stageDurations)) {
    assert.ok(duration <= MAX_STAGE_DURATION_MS, `${stage} took ${duration}ms (> ${MAX_STAGE_DURATION_MS})`);
  }
});

test('Secret scanning passes for committed artifacts', async () => {
  const files = [
    path.resolve('tests/normalized/example-login.yaml'),
    path.resolve('tests/features/example-login.feature'),
    path.resolve('tests/artifacts/selectors/registry.json'),
  ];
  const issues = await scanFilesForSecrets({ files });
  assert.equal(issues.length, 0, `Secret scan found ${issues.length} issues`);
});

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}
