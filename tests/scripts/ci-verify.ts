import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ZodError, type ZodIssue } from 'zod';

import { ensureDir, fileExists, readTextFile, writeTextFile } from './utils/file-operations';
import { logEvent } from './utils/logging';
import { parseYaml } from './utils/yaml-parser';
import { NormalizedYamlSchema } from './types/yaml-spec';
import type { ValidationIssue, ValidationReport, ValidationSummary } from './types/validation-report';
import { validateFeatureCoverage } from './validate-coverage';
import { validateSelectors } from './validate-selectors';
import { scanFilesForSecrets } from './utils/secret-scanner';

const DEFAULT_NORMALIZED_DIR = path.resolve('tests/normalized');
const DEFAULT_FEATURES_DIR = path.resolve('tests/features');
const DEFAULT_SELECTORS_PATH = path.resolve('tests/artifacts/selectors.json');
const DEFAULT_VOCABULARY_PATH = path.resolve('tests/artifacts/step-vocabulary.json');
const DEFAULT_SELECTOR_REPORT_PATH = path.resolve('tests/artifacts/validation-report.json');
const DEFAULT_CI_REPORT_PATH = path.resolve('tests/artifacts/ci-report.json');
const DEFAULT_ARTIFACT_ARCHIVE_DIR = path.resolve('tests/artifacts/ci-bundle');
const DEFAULT_GHERKIN_CONFIG_PATH = path.resolve('tests/config/gherkinlint.json');
const DEFAULT_TIMEOUT_MS = 600_000;

export const EXIT_CODES = {
  success: 0,
  schemaError: 2,
  lintError: 3,
  coverageError: 4,
  selectorError: 5,
  secretError: 6,
  timeout: 7,
  unknown: 9,
} as const;

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class CiVerificationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CiVerificationTimeoutError';
  }
}

export interface CiVerifyOptions {
  normalizedDir?: string;
  featuresDir?: string;
  selectorsPath?: string;
  vocabularyPath?: string;
  reportPath?: string;
  ciReportPath?: string;
  artifactsArchiveDir?: string;
  gherkinConfigPath?: string;
  timeoutMs?: number;
}

interface ResolvedCiVerifyOptions {
  normalizedDir: string;
  featuresDir: string;
  selectorsPath: string;
  vocabularyPath: string;
  reportPath: string;
  ciReportPath: string;
  artifactsArchiveDir: string;
  gherkinConfigPath: string;
}

interface CiVerifyResult {
  issues: ValidationIssue[];
  summary: ValidationSummary;
  exitCode: ExitCode;
  reportPath: string;
  bundlePath: string;
  durationMs: number;
  checkedFiles: {
    normalized: number;
    features: number;
  };
}

export async function runCiVerification(options: CiVerifyOptions = {}): Promise<CiVerifyResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolved = resolveOptions(options);
  return withTimeout(executeCiVerification(resolved), timeoutMs);
}

function resolveOptions(options: CiVerifyOptions): ResolvedCiVerifyOptions {
  return {
    normalizedDir: path.resolve(options.normalizedDir ?? DEFAULT_NORMALIZED_DIR),
    featuresDir: path.resolve(options.featuresDir ?? DEFAULT_FEATURES_DIR),
    selectorsPath: path.resolve(options.selectorsPath ?? DEFAULT_SELECTORS_PATH),
    vocabularyPath: path.resolve(options.vocabularyPath ?? DEFAULT_VOCABULARY_PATH),
    reportPath: path.resolve(options.reportPath ?? DEFAULT_SELECTOR_REPORT_PATH),
    ciReportPath: path.resolve(options.ciReportPath ?? DEFAULT_CI_REPORT_PATH),
    artifactsArchiveDir: path.resolve(options.artifactsArchiveDir ?? DEFAULT_ARTIFACT_ARCHIVE_DIR),
    gherkinConfigPath: path.resolve(options.gherkinConfigPath ?? DEFAULT_GHERKIN_CONFIG_PATH),
  };
}

async function executeCiVerification(options: ResolvedCiVerifyOptions): Promise<CiVerifyResult> {
  const startedAt = Date.now();

  const [yamlFiles, featureFiles] = await Promise.all([
    findFiles(options.normalizedDir, '.yaml'),
    findFiles(options.featuresDir, '.feature'),
  ]);

  const [schemaIssues, lintIssues, coverageIssues, selectorReport] = await Promise.all([
    validateYamlSchemas(yamlFiles),
    lintFeatureFiles(featureFiles, options.gherkinConfigPath),
    checkFeatureCoverage(featureFiles, options.vocabularyPath),
    runSelectorValidation({
      normalizedDir: options.normalizedDir,
      featuresDir: options.featuresDir,
      selectorsPath: options.selectorsPath,
      reportPath: options.reportPath,
    }),
  ]);

  const selectorIssues = selectorReport?.issues ?? [];
  const secretTargets = new Set<string>([...yamlFiles, ...featureFiles]);

  if (await fileExists(options.selectorsPath)) {
    secretTargets.add(options.selectorsPath);
  }
  if (await fileExists(options.reportPath)) {
    secretTargets.add(options.reportPath);
  }

  const secretIssues = await scanFilesForSecrets({ files: Array.from(secretTargets) });

  const allIssues = [...schemaIssues, ...lintIssues, ...coverageIssues, ...selectorIssues, ...secretIssues];
  const summary: ValidationSummary = {
    schemaErrors: schemaIssues.length,
    lintErrors: lintIssues.length,
    selectorMismatches: selectorIssues.length,
    coverageGaps: coverageIssues.length,
    secretFindings: secretIssues.length,
  };

  const exitCode = determineExitCode(summary);

  const validationReport = buildCiReport({
    issues: allIssues,
    summary,
    yamlFiles,
    featureFiles,
  });

  await ensureDir(path.dirname(options.ciReportPath));
  await writeTextFile(options.ciReportPath, `${JSON.stringify(validationReport, null, 2)}\n`);

  const bundlePath = await packageArtifacts({
    normalizedDir: options.normalizedDir,
    featuresDir: options.featuresDir,
    selectorsPath: options.selectorsPath,
    selectorReportPath: options.reportPath,
    ciReportPath: options.ciReportPath,
    artifactsArchiveDir: options.artifactsArchiveDir,
  });

  const durationMs = Date.now() - startedAt;

  if (exitCode === EXIT_CODES.success) {
    logEvent('ci.verify.success', 'CI verification completed successfully', {
      durationMs,
      bundlePath,
      summary,
    });
  } else {
    logEvent('ci.verify.failure', 'CI verification detected issues', {
      exitCode,
      issueCount: allIssues.length,
      summary,
    });
  }

  return {
    issues: allIssues,
    summary,
    exitCode,
    reportPath: options.ciReportPath,
    bundlePath,
    durationMs,
    checkedFiles: {
      normalized: yamlFiles.length,
      features: featureFiles.length,
    },
  };
}

async function validateYamlSchemas(yamlFiles: string[]): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const file of yamlFiles) {
    try {
      const contents = await readTextFile(file);
      NormalizedYamlSchema.parse(parseYaml(contents));
    } catch (error) {
      if (error instanceof ZodError) {
        for (const issue of error.issues) {
          issues.push({
            severity: 'error',
            type: 'schema',
            message: `${formatZodPath(issue)} - ${issue.message}`,
            file,
          });
        }
      } else {
        issues.push({
          severity: 'error',
          type: 'schema',
          message: (error as Error).message,
          file,
        });
      }
    }
  }
  return issues;
}

async function lintFeatureFiles(featureFiles: string[], configPath: string): Promise<ValidationIssue[]> {
  if (featureFiles.length === 0) {
    return [];
  }
  const linter = await import('gherkin-lint/dist/linter');
  const configuration = await loadLintConfiguration(configPath);
  const results = await linter.lint(featureFiles, configuration, []);
  const issues: ValidationIssue[] = [];

  for (const result of results ?? []) {
    const errors = (result?.errors ?? []).filter(
      (error: { severity?: string }) => (error.severity ?? 'error').toLowerCase() === 'error',
    );
    for (const error of errors) {
      issues.push({
        severity: 'error',
        type: 'lint',
        message: `${error.rule}: ${error.message}`,
        file: result?.filePath ?? '',
      });
    }
  }

  return issues;
}

async function loadLintConfiguration(configPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readTextFile(configPath);
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function checkFeatureCoverage(featureFiles: string[], vocabularyPath: string): Promise<ValidationIssue[]> {
  if (featureFiles.length === 0) {
    return [];
  }

  try {
    await validateFeatureCoverage({
      featurePaths: featureFiles,
      vocabularyPath,
    });
    return [];
  } catch (error) {
    const message = (error as Error).message;
    return message
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        severity: 'error' as const,
        type: 'coverage' as const,
        message: line,
        file: extractFileFromCoverageMessage(line),
      }));
  }
}

function extractFileFromCoverageMessage(message: string): string {
  const [maybeFile] = message.split(':', 1);
  return maybeFile?.trim() ?? '';
}

interface SelectorValidationOptions {
  normalizedDir: string;
  featuresDir: string;
  selectorsPath: string;
  reportPath: string;
}

async function runSelectorValidation(options: SelectorValidationOptions): Promise<ValidationReport | undefined> {
  if (!(await fileExists(options.selectorsPath))) {
    return undefined;
  }

  return validateSelectors({
    normalizedDir: options.normalizedDir,
    featuresDir: options.featuresDir,
    registryPath: options.selectorsPath,
    reportPath: options.reportPath,
  });
}



function determineExitCode(summary: ValidationSummary): ExitCode {
  if (summary.schemaErrors > 0) {
    return EXIT_CODES.schemaError;
  }
  if (summary.secretFindings > 0) {
    return EXIT_CODES.secretError;
  }
  if (summary.lintErrors > 0) {
    return EXIT_CODES.lintError;
  }
  if (summary.coverageGaps > 0) {
    return EXIT_CODES.coverageError;
  }
  if (summary.selectorMismatches > 0) {
    return EXIT_CODES.selectorError;
  }
  return EXIT_CODES.success;
}

interface BuildReportParams {
  issues: ValidationIssue[];
  summary: ValidationSummary;
  yamlFiles: string[];
  featureFiles: string[];
}

function buildCiReport(params: BuildReportParams): ValidationReport {
  const checkedFiles = new Set<string>([...params.yamlFiles, ...params.featureFiles]);
  const failedFiles = new Set(
    params.issues
      .map((issue) => issue.file?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return {
    timestamp: new Date().toISOString(),
    totalFiles: checkedFiles.size,
    passed: Math.max(checkedFiles.size - failedFiles.size, 0),
    failed: failedFiles.size,
    issues: params.issues,
    summary: params.summary,
  };
}

interface PackageArtifactsOptions {
  normalizedDir: string;
  featuresDir: string;
  selectorsPath: string;
  selectorReportPath: string;
  ciReportPath: string;
  artifactsArchiveDir: string;
}

async function packageArtifacts(options: PackageArtifactsOptions): Promise<string> {
  await fs.rm(options.artifactsArchiveDir, { recursive: true, force: true });
  await ensureDir(options.artifactsArchiveDir);

  await copyIfExists(options.normalizedDir, path.join(options.artifactsArchiveDir, 'normalized'));
  await copyIfExists(options.featuresDir, path.join(options.artifactsArchiveDir, 'features'));

  const artifactDir = path.join(options.artifactsArchiveDir, 'artifacts');
  await ensureDir(artifactDir);
  await copyIfExists(options.selectorsPath, path.join(artifactDir, path.basename(options.selectorsPath)));
  await copyIfExists(options.selectorReportPath, path.join(artifactDir, path.basename(options.selectorReportPath)));
  await copyIfExists(options.ciReportPath, path.join(artifactDir, path.basename(options.ciReportPath)));

  return options.artifactsArchiveDir;
}

async function copyIfExists(source: string, destination: string): Promise<void> {
  try {
    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
      await fs.cp(source, destination, { recursive: true });
    } else {
      await ensureDir(path.dirname(destination));
      await fs.copyFile(source, destination);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function findFiles(root: string, extension: string): Promise<string[]> {
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
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

function formatZodPath(issue: ZodIssue): string {
  if (!issue.path || issue.path.length === 0) {
    return 'root';
  }
  return issue.path.join('.');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CiVerificationTimeoutError(`CI verification exceeded ${timeoutMs / 60000} minutes`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type { CiVerifyResult };
