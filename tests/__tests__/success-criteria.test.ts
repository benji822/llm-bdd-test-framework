import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { validateFeatureCoverage } from '../scripts/validate-coverage';
import { validateSelectors } from '../scripts/validate-selectors';
import { runCiVerification, EXIT_CODES } from '../scripts/ci-verify';

const ROOT = path.resolve('.');

test('sample artifacts satisfy core success criteria', async () => {
  const graphDir = path.join(ROOT, 'tests/artifacts/graph');
  const featuresDir = path.join(ROOT, 'tests/features');
  const vocabularyPath = path.join(ROOT, 'tests/artifacts/step-vocabulary.json');
  const selectorsPath = path.join(ROOT, 'tests/artifacts/selectors/registry.json');
  const reportPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'success-')), 'validation-report.json');
  const ciReportPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'success-ci-')), 'ci-report.json');
  const bundleDir = path.join(os.tmpdir(), 'ci-bundle');

  const graphFiles = await findFiles(graphDir, '.json');
  assert.ok(graphFiles.length > 0, 'Graph artifacts exist');
  const featureFiles = await findFiles(featuresDir, '.feature');
  assert.ok(featureFiles.length > 0, 'Feature artifacts exist');

  await validateFeatureCoverage({ featurePaths: featureFiles, vocabularyPath });

  const selectorReport = await validateSelectors({ graphDir, registryPath: selectorsPath, reportPath });
  assert.equal(selectorReport.summary.selectorMismatches, 0);

  const ciResult = await runCiVerification({
    graphDir,
    featuresDir,
    selectorsPath,
    vocabularyPath,
    reportPath,
    ciReportPath,
    artifactsArchiveDir: bundleDir,
    timeoutMs: 600_000,
  });

  assert.equal(ciResult.exitCode, EXIT_CODES.success);
  assert.equal(ciResult.summary.secretFindings, 0);
  assert.equal(ciResult.summary.coverageGaps, 0);
});

async function findFiles(root: string, extension: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(candidate, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push(candidate);
    }
  }
  return files;
}
