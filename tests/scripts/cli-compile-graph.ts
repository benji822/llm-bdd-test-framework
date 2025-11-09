#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import type { ActionGraph } from './action-graph/types.js';
import { compileActionGraph } from './action-graph/compiler.js';
import { readTextFile } from './utils/file-operations';

interface CliOptions {
  graphFiles: string[];
  featureDir?: string;
  stepsDir?: string;
  dryRun: boolean;
  includeMetadata: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const graphFiles: string[] = [];
  let featureDir: string | undefined;
  let stepsDir: string | undefined;
  let dryRun = false;
  let includeMetadata = true;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--feature-dir':
      case '--features':
        featureDir = argv[i + 1];
        i += 1;
        break;
      case '--steps-dir':
      case '--steps':
        stepsDir = argv[i + 1];
        i += 1;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--no-metadata':
        includeMetadata = false;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown argument: ${token}`);
        }
        graphFiles.push(token);
        break;
    }
  }

  return { graphFiles, featureDir, stepsDir, dryRun, includeMetadata };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.graphFiles.length === 0) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    for (const graphPath of options.graphFiles) {
      const raw = await readTextFile(graphPath);
      const graph = JSON.parse(raw) as ActionGraph;

      const result = await compileActionGraph(graph, {
        featureDir: options.featureDir,
        stepsDir: options.stepsDir,
        dryRun: options.dryRun,
        includeMetadata: options.includeMetadata,
      });

      console.log(
        [
          `Compiled scenario "${graph.metadata.scenarioName}"`,
          `feature: ${result.featurePath}`,
          `steps: ${result.stepsPath}`,
          options.dryRun ? '[dry-run]' : '',
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
  console.log('Usage: yarn spec:compile-graph <graph.json...> [--feature-dir <dir>] [--steps-dir <dir>] [--dry-run]');
}

void main();
