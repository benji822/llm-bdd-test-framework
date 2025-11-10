#!/usr/bin/env node
import process from 'node:process';

import './utils/load-env';

import { runStagehandRecord } from './stagehand/pipeline.js';
import type { StagehandPipelineOptions } from './stagehand/pipeline.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const command = argv[0];
  const args = argv.slice(1);

  if (command === 'record') {
    await handleRecord(args);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exitCode = 1;
}

async function handleRecord(argv: string[]): Promise<void> {
  try {
    const options = parseRecordArgs(argv);
    const results = await runStagehandRecord(options);

    for (const result of results) {
      console.log(`Recorded scenario ${result.scenario.name} (${result.spec.specPath})`);
      console.log(`  Graph: ${result.graphPath ?? '[not persisted]'}`);
      if (result.featurePath) {
        console.log(`  Feature: ${result.featurePath}`);
      } else if (options.dryRun || options.skipCompile) {
        console.log(`  Feature generation skipped${options.dryRun ? ' (dry-run)' : options.skipCompile ? ' (--skip-compile)' : ''}`);
      }
      if (result.stepsPath) {
        console.log(`  Steps: ${result.stepsPath}`);
      }
      if (!result.featurePath && !options.dryRun && !options.skipCompile) {
        console.log('  (Compilation did not produce outputs)');
      }
      console.log('');
    }
  } catch (error) {
    console.error(`bdd record failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function parseRecordArgs(argv: string[]): StagehandPipelineOptions {
  const options: StagehandPipelineOptions = {
    specPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--scenario':
        options.scenario = argv[i + 1];
        i += 1;
        break;
      case '--graph-dir':
        options.graphDir = argv[i + 1];
        i += 1;
        break;
      case '--feature-dir':
      case '--features':
        options.featureDir = argv[i + 1];
        i += 1;
        break;
      case '--steps-dir':
      case '--steps':
        options.stepsDir = argv[i + 1];
        i += 1;
        break;
      case '--base-url':
        options.baseUrl = argv[i + 1];
        i += 1;
        break;
      case '--skip-compile':
        options.skipCompile = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        printRecordUsage();
        process.exit(0);
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown argument: ${token}`);
        }
        if (!options.specPath) {
          options.specPath = token;
        } else {
          throw new Error('Only one spec path may be provided');
        }
        break;
    }
  }

  if (!options.specPath) {
    throw new Error('specPath is required');
  }

  return options;
}

function printUsage(): void {
  console.log('Usage: yarn bdd <command> [options]');
  console.log('Commands:');
  console.log('  record <specPath>          Record a scenario with Stagehand, compile graphs, and emit deterministic artifacts');
  console.log('  help                       Show this help message');
}

function printRecordUsage(): void {
  console.log('Usage: yarn bdd record <specPath> [--scenario <name>] [--graph-dir <dir>] [--feature-dir <dir>] [--steps-dir <dir>] [--base-url <url>] [--dry-run] [--skip-compile]');
}

void main();
