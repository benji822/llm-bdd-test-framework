/**
 * CI policy guard to keep the deterministic pipeline honest.
 *
 * Runs before `yarn test` (via the `pretest` hook) and can be invoked manually
 * with `yarn ci:policy`. When CI is detected, this script insists that
 * `AUTHORING_MODE` and `MOCK_LOGIN_APP` are disabled and that the compiled
 * artifacts we rely on exist. It also ensures the normalized specs directory is
 * populated so we never run Playwright tests without pre-generated fixtures.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const POLICY_INDICATORS = [
  'CI',
  'GITHUB_ACTIONS',
  'BUILDKITE',
  'GITLAB_CI',
  'CIRCLECI',
  'APPVEYOR',
  'TF_BUILD',
];

const FAILURE_MESSAGES: string[] = [];

function parseBooleanEnv(value?: string): boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isCi(): boolean {
  return POLICY_INDICATORS.some((key) => parseBooleanEnv(process.env[key]) === true) ||
    parseBooleanEnv(process.env.CI) === true;
}

function ensureNotEnabled(flagName: string, value?: string, reason?: string) {
  if (parseBooleanEnv(value) === true) {
    FAILURE_MESSAGES.push(
      `${flagName} must be disabled in CI${reason ? ` (${reason})` : ''}.`
    );
  }
}

function containsFilesWithExtensions(directory: string, extensions: string[]): boolean {
  let currentDir = directory;
  if (!fs.existsSync(currentDir)) {
    return false;
  }
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        return true;
      }
    } else if (entry.isDirectory()) {
      if (containsFilesWithExtensions(entryPath, extensions)) {
        return true;
      }
    }
  }
  return false;
}

function ensureArtifactsExist() {
  const lookup = [
    { dir: 'tests/normalized', description: 'normalized YAML specs', exts: ['.yaml', '.yml'] },
    { dir: 'tests/features', description: 'compiled `.feature` files', exts: ['.feature'] },
    { dir: 'tests/steps/generated', description: 'generated step definitions', exts: ['.ts', '.js'] },
  ];

  for (const target of lookup) {
    const resolved = path.resolve(target.dir);
    if (!containsFilesWithExtensions(resolved, target.exts)) {
      FAILURE_MESSAGES.push(
        `No ${target.description} were found under ${resolved}; ensure the pipeline produced them before running tests.`
      );
    }
  }
}

function exitWithErrors() {
  if (FAILURE_MESSAGES.length === 0) {
    return;
  }
  console.error('CI policy guard failed:');
  for (const message of FAILURE_MESSAGES) {
    console.error(`  • ${message}`);
  }
  const err = new Error('CI policy violations detected.');
  (err as { code?: number }).code = 1;
  throw err;
}

function runPolicy(): void {
  if (isCi()) {
    ensureNotEnabled('AUTHORING_MODE', process.env.AUTHORING_MODE, 'Stagehand authoring is forbidden in CI');
    ensureNotEnabled('MOCK_LOGIN_APP', process.env.MOCK_LOGIN_APP, 'CI should run against real or cached UI fixtures');
    ensureArtifactsExist();
    console.log('CI policy guard: deterministic prerequisites validated.');
  } else {
    console.log('CI policy guard: not running in CI (no checks executed).');
  }
  exitWithErrors();
}

runPolicy();
