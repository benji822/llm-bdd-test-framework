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
  const normalizedDir = path.join(ROOT, 'tests/normalized');
  const featuresDir = path.join(ROOT, 'tests/features');
  const vocabularyPath = path.join(ROOT, 'tests/artifacts/step-vocabulary.json');
  const selectorsPath = path.join(ROOT, 'tests/artifacts/selectors.json');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'success-criteria-'));
  const reportPath = path.join(tempDir, 'validation-report.json');
  const ciReportPath = path.join(tempDir, 'ci-report.json');
  const ciBundleDir = path.join(tempDir, 'ci-bundle');

  await validateFeatureCoverage({
    featurePaths: [path.join(featuresDir, 'example-login.feature')],
    vocabularyPath,
  });

  const selectorReport = await validateSelectors({
    normalizedDir,
    featuresDir,
    registryPath: selectorsPath,
    reportPath,
  });

  assert.equal(selectorReport.summary.selectorMismatches, 0);

  const ciResult = await runCiVerification({
    normalizedDir,
    featuresDir,
    selectorsPath,
    vocabularyPath,
    reportPath,
    ciReportPath,
    artifactsArchiveDir: ciBundleDir,
    timeoutMs: 600_000,
  });

  assert.equal(ciResult.exitCode, EXIT_CODES.success);
  assert.ok(ciResult.durationMs < 600_000, 'CI verification should complete in under 10 minutes');
  assert.equal(ciResult.summary.secretFindings, 0);
  assert.equal(ciResult.summary.coverageGaps, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});
