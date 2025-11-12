#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import './utils/load-env';

import { ensureDir, fileExists, readTextFile, writeTextFile } from './utils/file-operations.js';
import { compileGraphArtifact, parseCompileGraphArgs } from './cli/compile-graph-core.js';
import { executeCiVerify, parseCiVerifyArgs } from './cli/ci-verify-core.js';
import { runStagehandRecord, type StagehandPipelineOptions } from './stagehand/pipeline.js';
import { EXIT_CODES } from './ci-verify.js';

const INIT_DIRECTORIES = [
  'tests/artifacts',
  'tests/artifacts/graph',
  'tests/artifacts/ci-bundle',
  'tests/artifacts/logs',
  'tests/artifacts/selectors',
  'tests/features/compiled',
  'tests/steps/generated',
  'tests/normalized',
  'tests/tmp/stagehand-cache',
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const [command, ...rest] = args;
  switch (command) {
    case 'init':
      await handleInit(rest);
      break;
    case 'record':
      await handleRecord(rest);
      break;
    case 'compile':
      await handleCompile(rest);
      break;
    case 'run':
      await handleRun(rest);
      break;
    case 'verify':
      await handleVerify(rest);
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exitCode = 1;
  }
}

async function handleInit(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printInitUsage();
    return;
  }

  try {
    console.log('Initializing deterministic workspace...');
    for (const directory of INIT_DIRECTORIES) {
      await ensureDir(directory);
    }
    console.log('Ensured directories:');
    for (const directory of INIT_DIRECTORIES) {
      console.log(`  • ${directory}`);
    }

    const envTarget = path.resolve('.env.local');
    const envTemplate = path.resolve('.env.example');
    if (await fileExists(envTarget)) {
      console.log('  .env.local already exists; leaving it untouched.');
    } else if (await fileExists(envTemplate)) {
      const contents = await readTextFile(envTemplate);
      await writeTextFile(envTarget, contents);
      console.log('  Created .env.local from .env.example. Update it with your credentials.');
    } else {
      console.warn('  .env.example is missing; create .env.local manually with the required variables.');
    }

    console.log('Initialization complete. Next steps: edit .env.local and run `yarn bdd record ...` or `yarn bdd run`.');
  } catch (error) {
    console.error(`bdd init failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
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
        console.log(
          `  Feature generation skipped${options.dryRun ? ' (dry-run)' : options.skipCompile ? ' (--skip-compile)' : ''}`,
        );
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

async function handleCompile(argv: string[]): Promise<void> {
  try {
    const options = parseCompileGraphArgs(argv);
    if (options.graphFiles.length === 0) {
      printCompileUsage();
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
          summary.dryRun ? '[dry-run]' : '',
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }
  } catch (error) {
    console.error(`bdd compile failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function handleRun(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printRunUsage();
    return;
  }

  try {
    const exitCode = await runCommand('yarn', ['test', ...argv]);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`bdd run failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function handleVerify(argv: string[]): Promise<void> {
  try {
    const options = parseCiVerifyArgs(argv);
    const exitCode = await executeCiVerify(options);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`bdd verify failed: ${(error as Error).message}`);
    process.exitCode = EXIT_CODES.unknown;
  }
}

function printUsage(): void {
  console.log('Usage: yarn bdd <command> [options]');
  console.log('Commands:');
  console.log('  init            Prepare directories and configuration files needed by the pipeline');
  console.log('  record          Stagehand-first authoring flow with graph persistence and compilation');
  console.log('  compile         Turn saved graphs into deterministic .feature and step artifacts');
  console.log('  run             Execute the Playwright suite with the current artifacts');
  console.log('  verify          Run the spec:ci-verify validation suite (schema, lint, selectors, secrets)');
  console.log('  help            Show this help message');
}

function printInitUsage(): void {
  console.log('Usage: yarn bdd init');
}

function printCompileUsage(): void {
  console.log('Usage: yarn bdd compile <graph.json...> [--feature-dir <dir>] [--steps-dir <dir>] [--dry-run] [--no-metadata]');
}

function printRunUsage(): void {
  console.log('Usage: yarn bdd run [playwright args]');
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

function printRecordUsage(): void {
  console.log('Usage: yarn bdd record <specPath> [--scenario <name>] [--graph-dir <dir>] [--feature-dir <dir>] [--steps-dir <dir>] [--base-url <url>] [--dry-run] [--skip-compile]');
}

function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}

void main();
