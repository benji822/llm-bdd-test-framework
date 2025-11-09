#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs/promises';

import { validateFeatureCoverage } from './validate-coverage';
import { validateSelectors } from './validate-selectors';
import { logEvent } from './utils/logging';
import { fileExists } from './utils/file-operations';
import { scanFilesForSecrets } from './utils/secret-scanner';
import { resolveRegistryPath } from './selector-registry';

async function main(): Promise<void> {
  const normalizedDir = path.resolve('tests/normalized');
  const featuresDir = path.resolve('tests/features');
  const vocabularyPath = path.resolve('tests/artifacts/step-vocabulary.json');
  const registryPath = resolveRegistryPath();
  const reportPath = path.resolve('tests/artifacts/validation-report.json');

  const featurePaths = await findFiles(featuresDir, '.feature');
  const yamlPaths = await findFiles(normalizedDir, '.yaml');

  try {
    const coverageIssues = await evaluateCoverage(featurePaths, vocabularyPath);
    const selectorReport = await validateSelectors({
      normalizedDir,
      featuresDir,
      registryPath,
      reportPath,
    });

    const secretFiles = new Set<string>([...featurePaths, ...yamlPaths]);
    if (await fileExists(registryPath)) {
      secretFiles.add(registryPath);
    }
    if (await fileExists(reportPath)) {
      secretFiles.add(reportPath);
    }
    const secretIssues = await scanFilesForSecrets({ files: Array.from(secretFiles) });

    const aggregatedReport = combineReports({
      selectorReport,
      coverageIssues,
      secretIssues,
      yamlPaths,
      featurePaths,
    });

    await fs.writeFile(reportPath, `${JSON.stringify(aggregatedReport, null, 2)}\n`, 'utf8');

    if (aggregatedReport.issues.length > 0) {
      logEvent('cli.validate.failure', 'spec:validate detected issues', {
        counts: aggregatedReport.summary,
        reportPath,
      });
      console.error('spec:validate found validation errors:');
      for (const issue of aggregatedReport.issues) {
        const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
        console.error(`- [${issue.type}] ${location} → ${issue.message}`);
        if (issue.suggestion) {
          console.error(`    Suggestion: ${issue.suggestion}`);
        }
      }
      console.error('Review tests/docs/step-vocabulary-guide.md and tests/docs/selector-best-practices.md for fixes.');
      process.exitCode = 1;
      return;
    }

    logEvent('cli.validate.success', 'spec:validate completed', {
      featureCount: featurePaths.length,
      normalizedDir,
      reportPath,
    });
    console.log('spec:validate completed successfully.');
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function findFiles(root: string, extension: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error: unknown) {
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

void main();

async function evaluateCoverage(featurePaths: string[], vocabularyPath: string): Promise<ValidationIssue[]> {
  if (featurePaths.length === 0) {
    return [];
  }

  try {
    await validateFeatureCoverage({
      featurePaths,
      vocabularyPath,
    });
    return [];
  } catch (error) {
    return parseCoverageIssues(error);
  }
}

function parseCoverageIssues(error: unknown): ValidationIssue[] {
  const message = (error as Error)?.message ?? '';
  return message
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      severity: 'error' as const,
      type: 'coverage' as const,
      message: line.trim(),
      file: extractFileFromCoverage(line),
      suggestion:
        'Add a matching step pattern to tests/artifacts/step-vocabulary.json (see tests/docs/step-vocabulary-guide.md).',
    }));
}

function extractFileFromCoverage(line: string): string {
  const match = /^([^:]+):/.exec(line);
  return match ? match[1] : '';
}

interface CombineParams {
  selectorReport: ValidationReport;
  coverageIssues: ValidationIssue[];
  secretIssues: ValidationIssue[];
  yamlPaths: string[];
  featurePaths: string[];
}

function combineReports(params: CombineParams): ValidationReport {
  const { selectorReport, coverageIssues, secretIssues, yamlPaths, featurePaths } = params;
  const issues = [...selectorReport.issues, ...coverageIssues, ...secretIssues];

  const filesChecked = new Set<string>([...yamlPaths, ...featurePaths]);
  for (const issue of issues) {
    if (issue.file) {
      filesChecked.add(issue.file);
    }
  }

  const failedFiles = new Set(issues.map((issue) => issue.file).filter(Boolean) as string[]);

  return {
    timestamp: new Date().toISOString(),
    totalFiles: filesChecked.size,
    passed: Math.max(filesChecked.size - failedFiles.size, 0),
    failed: failedFiles.size,
    issues,
    summary: {
      schemaErrors: selectorReport.summary.schemaErrors,
      lintErrors: selectorReport.summary.lintErrors,
      selectorMismatches: selectorReport.summary.selectorMismatches,
      coverageGaps: coverageIssues.length,
      secretFindings: selectorReport.summary.secretFindings + secretIssues.length,
    },
  };
}

type ValidationIssue = import('./types/validation-report').ValidationIssue;
type ValidationReport = import('./types/validation-report').ValidationReport;
