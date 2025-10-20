#!/usr/bin/env node
import { runPipelineBenchmark, MAX_STAGE_DURATION_MS } from './utils/benchmark-runner';

async function main(): Promise<void> {
  try {
    const result = await runPipelineBenchmark();
    Object.entries(result.stageDurations).forEach(([stage, duration]) => {
      const ms = Math.round(duration);
      const status = ms <= MAX_STAGE_DURATION_MS ? '✓' : '✗';
      console.log(`${status} ${stage} completed in ${ms}ms`);
      if (ms > MAX_STAGE_DURATION_MS) {
        throw new Error(`${stage} exceeded ${MAX_STAGE_DURATION_MS}ms benchmark`);
      }
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
