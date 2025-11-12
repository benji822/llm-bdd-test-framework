import type { ActionGraph } from '../action-graph/types.js';
import { compileActionGraph } from '../action-graph/compiler.js';
import { readTextFile } from '../utils/file-operations.js';

export interface CompileGraphExecutionOptions {
  featureDir?: string;
  stepsDir?: string;
  dryRun: boolean;
  includeMetadata: boolean;
}

export interface CompileGraphCommandOptions {
  graphFiles: string[];
  execution: CompileGraphExecutionOptions;
}

export interface CompileGraphSummary {
  graphPath: string;
  scenarioName: string;
  featurePath: string;
  stepsPath: string;
  dryRun: boolean;
}

export function parseCompileGraphArgs(argv: string[]): CompileGraphCommandOptions {
  const graphFiles: string[] = [];
  let featureDir: string | undefined;
  let stepsDir: string | undefined;
  let dryRun = false;
  let includeMetadata = true;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--feature-dir':
      case '--features': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('Missing value for --feature-dir');
        }
        featureDir = value;
        i += 1;
        break;
      }
      case '--steps-dir':
      case '--steps': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('Missing value for --steps-dir');
        }
        stepsDir = value;
        i += 1;
        break;
      }
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

  return {
    graphFiles,
    execution: {
      featureDir,
      stepsDir,
      dryRun,
      includeMetadata,
    },
  };
}

export async function compileGraphArtifact(
  graphPath: string,
  options: CompileGraphExecutionOptions
): Promise<CompileGraphSummary> {
  const raw = await readTextFile(graphPath);
  const graph = JSON.parse(raw) as ActionGraph;

  const result = await compileActionGraph(graph, {
    featureDir: options.featureDir,
    stepsDir: options.stepsDir,
    dryRun: options.dryRun,
    includeMetadata: options.includeMetadata,
  });

  return {
    graphPath,
    scenarioName: graph.metadata.scenarioName,
    featurePath: result.featurePath,
    stepsPath: result.stepsPath,
    dryRun: options.dryRun,
  };
}
