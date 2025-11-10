#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';

import './utils/load-env';

import { parseYaml } from './utils/yaml-parser.js';
import { readTextFile } from './utils/file-operations.js';
import { NormalizedYamlSchema } from './types/yaml-spec.js';
import { readSelectorRegistry } from './selector-registry.js';
import { createAuthoringStagehandWrapper } from './stagehand/bootstrap.js';
import {
  buildPlaceholderDefaults,
  recordScenarioToGraph,
} from './stagehand/recorder.js';
import { GraphPersistence } from './action-graph/index.js';
import { compileActionGraph } from './action-graph/compiler.js';

interface CliOptions {
  yamlPath: string;
  scenarioName: string;
  graphDir: string;
  featureDir?: string;
  stepsDir?: string;
  skipCompile: boolean;
  dryRun: boolean;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const yaml = await loadYaml(options.yamlPath);
    const registry = await readSelectorRegistry();
    const placeholderValues = buildPlaceholderDefaults();

    const stagehand = await createAuthoringStagehandWrapper();
    const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
    const recording = await recordScenarioToGraph({
      yaml,
      scenarioName: options.scenarioName,
      stagehand,
      baseUrl,
      registry,
      placeholderValues,
      dryRun: options.dryRun,
    });

    const persistence = new GraphPersistence({ graphDir: options.graphDir, versioned: true });
    const graphPath = await persistence.write(recording.graph);

    let featurePath: string | undefined;
    let stepsPath: string | undefined;

    if (!options.skipCompile) {
      const compileResult = await compileActionGraph(recording.graph, {
        featureDir: options.featureDir,
        stepsDir: options.stepsDir,
      });
      featurePath = compileResult.featurePath;
      stepsPath = compileResult.stepsPath;
    }

    printSummary({ graphPath, featurePath, stepsPath, recordingCount: recording.recordedSteps.length });
  } catch (error) {
    console.error(`Record failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    yamlPath: 'tests/normalized/example-login.yaml',
    scenarioName: 'Authenticate With Valid Credentials',
    graphDir: 'tests/artifacts/graph',
    featureDir: undefined,
    stepsDir: undefined,
    skipCompile: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--yaml':
        options.yamlPath = requiredValue(argv, ++i, '--yaml');
        break;
      case '--scenario':
        options.scenarioName = requiredValue(argv, ++i, '--scenario');
        break;
      case '--graph-dir':
        options.graphDir = requiredValue(argv, ++i, '--graph-dir');
        break;
      case '--feature-dir':
        options.featureDir = requiredValue(argv, ++i, '--feature-dir');
        break;
      case '--steps-dir':
        options.stepsDir = requiredValue(argv, ++i, '--steps-dir');
        break;
      case '--skip-compile':
        options.skipCompile = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown argument ${token}`);
        }
    }
  }

  return options;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function loadYaml(filePath: string) {
  const contents = await readTextFile(path.resolve(filePath));
  const parsed = parseYaml(contents);
  return NormalizedYamlSchema.parse(parsed);
}

function printSummary(params: {
  graphPath: string;
  featurePath?: string;
  stepsPath?: string;
  recordingCount: number;
}): void {
  console.log('Stagehand recording completed:');
  console.log(`  Recorded steps: ${params.recordingCount}`);
  console.log(`  Graph saved to: ${params.graphPath}`);
  if (params.featurePath && params.stepsPath) {
    console.log(`  Feature: ${params.featurePath}`);
    console.log(`  Step definitions: ${params.stepsPath}`);
  } else {
    console.log('  Compilation skipped (--skip-compile)');
  }
  console.log('\nNext step: run MOCK_LOGIN_APP=true yarn test to replay the compiled scenario.');
}

function printUsage(): void {
  console.log(`Usage: yarn bdd:record-login [--yaml <path>] [--scenario <name>] [--graph-dir <dir>] [--feature-dir <dir>] [--steps-dir <dir>] [--skip-compile] [--dry-run]`);
}

void main();
