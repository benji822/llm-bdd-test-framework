#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import {
  compileGraphArtifact,
  parseCompileGraphArgs,
} from './cli/compile-graph-core.js';

async function main(): Promise<void> {
  try {
    const options = parseCompileGraphArgs(process.argv.slice(2));
    if (options.graphFiles.length === 0) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    for (const graphPath of options.graphFiles) {
      const summary = await compileGraphArtifact(graphPath, options.execution);
      console.log(
        [
          `Compiled scenario "${summary.scenarioName}"`,
          `feature: ${summary.featurePath}`,
          `steps: ${summary.stepsPath}`,
          options.execution.dryRun ? '[dry-run]' : '',
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function printUsage(): void {
  console.log('Usage: yarn spec:compile-graph <graph.json...> [--feature-dir <dir>] [--steps-dir <dir>] [--dry-run] [--no-metadata]');
}

void main();
