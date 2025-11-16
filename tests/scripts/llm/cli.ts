#!/usr/bin/env node
import process from 'node:process';

import { compileQaSpecs, type LlmbddCompileOptions } from './compiler.js';
import { verifySelectors, type HeadlessVerifierOptions } from './verifier.js';

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
    case 'verify':
      await handleVerify(rest);
      break;
    case 'ci':
      await handleCi(rest);
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
      case '--connectors':
        ensureArgValue(token, peek);
        options.connectorsPath = peek;
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

async function handleVerify(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printVerifyUsage();
    return;
  }

  const options: HeadlessVerifierOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const peek = argv[index + 1];

    switch (token) {
      case '--base-url':
        ensureArgValue(token, peek);
        options.baseUrl = peek;
        index += 1;
        break;
      case '--spec-dir':
        ensureArgValue(token, peek);
        options.specDir = peek;
        index += 1;
        break;
      case '--out-dir':
        ensureArgValue(token, peek);
        options.outputDir = peek;
        index += 1;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown flag for verify: ${token}`);
        }
        break;
    }
  }

  try {
    await verifySelectors(options);
  } catch (error) {
    console.error('llm-bdd verify failed:', (error as Error).message);
    process.exitCode = 1;
  }
}

async function handleCi(argv: string[]): Promise<void> {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    printCiUsage();
    return;
  }

  // Parse all arguments for CI flow
  const compileArgs: string[] = [];
  const verifyArgs: string[] = [];
  let parsingCompile = true;

  // Simple approach: treat all positional args as spec paths for compile
  const compileOptions: LlmbddCompileOptions = { specPaths: [] };
  const verifyOptions: HeadlessVerifierOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const peek = argv[index + 1];

    // Handle verify-specific flags (stop parsing compile args)
    if (
      token === '--spec-dir' ||
      token === '--verify-base-url' ||
      token === '--verify-out-dir'
    ) {
      parsingCompile = false;
    }

    if (parsingCompile && !token.startsWith('--verify')) {
      switch (token) {
        case '--pages':
          ensureArgValue(token, peek);
          compileOptions.pagesPath = peek;
          index += 1;
          break;
        case '--vocabulary':
          ensureArgValue(token, peek);
          compileOptions.vocabularyPath = peek;
          index += 1;
          break;
        case '--connectors':
          ensureArgValue(token, peek);
          compileOptions.connectorsPath = peek;
          index += 1;
          break;
        case '--base-url':
          ensureArgValue(token, peek);
          compileOptions.baseUrl = peek;
          verifyOptions.baseUrl = peek;
          index += 1;
          break;
        case '--out-dir':
          ensureArgValue(token, peek);
          compileOptions.outputDir = peek;
          index += 1;
          break;
        default:
          if (!token.startsWith('--')) {
            compileOptions.specPaths.push(token);
          }
          break;
      }
    } else if (token.startsWith('--verify')) {
      switch (token) {
        case '--verify-spec-dir':
          ensureArgValue(token, peek);
          verifyOptions.specDir = peek;
          index += 1;
          break;
        case '--verify-base-url':
          ensureArgValue(token, peek);
          verifyOptions.baseUrl = peek;
          index += 1;
          break;
        case '--verify-out-dir':
          ensureArgValue(token, peek);
          verifyOptions.outputDir = peek;
          index += 1;
          break;
        default:
          break;
      }
    }
  }

  if (!compileOptions.specPaths.length) {
    printCiUsage();
    process.exitCode = 1;
    return;
  }

  try {
    console.log('Running compile phase...');
    await compileQaSpecs(compileOptions);

    console.log('Running verify phase...');
    await verifySelectors(verifyOptions);

    console.log('Running Playwright tests...');
    // TODO: invoke playwright test programmatically or via exec
    console.log('CI pipeline complete.');
  } catch (error) {
    console.error('llm-bdd ci failed:', (error as Error).message);
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
  console.log('  verify     Verify selectors in generated specs can be resolved headlessly');
  console.log('  ci         Run compile → verify → playwright pipeline (CI-safe)');
  console.log('  help       Show this message');
}

function printCompileUsage(): void {
  console.log(
    'Usage: llm-bdd compile <spec>... [--scenario <name>] [--pages <path>] [--out-dir <dir>] [--base-url <url>] [--vocabulary <path>] [--connectors <path>]'
  );
}

function printVerifyUsage(): void {
  console.log(
    'Usage: llm-bdd verify [--base-url <url>] [--spec-dir <dir>] [--out-dir <dir>]'
  );
}

function printCiUsage(): void {
  console.log(
    'Usage: llm-bdd ci <spec>... [--pages <path>] [--base-url <url>] [--out-dir <dir>] [--vocabulary <path>] [--verify-spec-dir <dir>] [--verify-out-dir <dir>]'
  );
}

void main();
