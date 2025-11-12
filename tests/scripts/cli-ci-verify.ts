#!/usr/bin/env node
import process from 'node:process';

import { EXIT_CODES } from './ci-verify.js';
import { executeCiVerify, parseCiVerifyArgs } from './cli/ci-verify-core.js';

async function main(): Promise<void> {
  try {
    const options = parseCiVerifyArgs(process.argv.slice(2));
    const exitCode = await executeCiVerify(options);
    process.exitCode = exitCode;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = EXIT_CODES.unknown;
  }
}

void main();
