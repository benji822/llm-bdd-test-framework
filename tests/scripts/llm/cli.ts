#!/usr/bin/env node
import process from 'node:process';

import { compileQaSpecs, type LlmbddCompileOptions } from './compiler.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const [command, ...rest] = args;
  switch (command) {
    case 'compile':
      await handleCompile(rest);
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

async function handleCompile(argv: string[]): Promise<void> {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    printCompileUsage();
    return;
  }

  const options: LlmbddCompileOptions = { specPaths: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const peek = argv[index + 1];

    switch (token) {
      case '--scenario':
        ensureArgValue(token, peek);
        options.scenario = peek;
        index += 1;
        break;
      case '--pages':
        ensureArgValue(token, peek);
        options.pagesPath = peek;
        index += 1;
        break;
      case '--out-dir':
        ensureArgValue(token, peek);
        options.outputDir = peek;
        index += 1;
        break;
      case '--base-url':
        ensureArgValue(token, peek);
        options.baseUrl = peek;
        index += 1;
        break;
      case '--vocabulary':
        ensureArgValue(token, peek);
        options.vocabularyPath = peek;
        index += 1;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown flag for compile: ${token}`);
        }
        options.specPaths.push(token);
        break;
    }
  }

  if (!options.specPaths.length) {
    printCompileUsage();
    process.exitCode = 1;
    return;
  }

  try {
    await compileQaSpecs(options);
  } catch (error) {
    console.error('llm-bdd compile failed:', (error as Error).message);
    process.exitCode = 1;
  }
}

function ensureArgValue(flag: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`Missing value after ${flag}`);
  }
}

function printUsage(): void {
  console.log('Usage: llm-bdd <command> [options] <spec>...');
  console.log('Commands:');
  console.log('  compile    Generate direct @playwright/test specs from QA documents');
  console.log('  help       Show this message');
}

function printCompileUsage(): void {
  console.log('Usage: llm-bdd compile <spec>... [--scenario <name>] [--pages <path>] [--out-dir <dir>] [--base-url <url>] [--vocabulary <path>]');
}

void main();
