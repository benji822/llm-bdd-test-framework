# Implementation Plan: Solution 1.3 - Parallel Processing for Batch Operations

## Overview

Add parallel processing capability to the normalization pipeline to process multiple specs concurrently. This enables batch operations to complete 3-4x faster by utilizing multiple CPU cores and concurrent LLM API calls.

**Expected Impact**: 3-4x speedup for batch operations (e.g., 10 specs in 2 minutes instead of 8 minutes)

**Effort**: Medium (2-3 days)

**Priority**: P3 (Scale optimization)

---

## Implementation Steps

### Step 1: Extract `runConcurrent` utility function

The `runConcurrent` function already exists in `generate-features.ts`. Extract it to a shared utility module.

**Create new file**: `tests/scripts/utils/concurrent.ts`

```typescript
/**
 * Run tasks concurrently with a specified concurrency limit.
 * Tasks are executed in order, but multiple tasks run in parallel.
 * 
 * @param tasks - Array of task functions to execute
 * @param limit - Maximum number of concurrent tasks
 * @returns Array of results in the same order as input tasks
 */
export async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= tasks.length) {
        return;
      }
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  };

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
```

### Step 2: Update `generate-features.ts` to use shared utility

**File**: `tests/scripts/generate-features.ts`

**Remove** the local `runConcurrent` function (lines 133-152)

**Add** import at the top:
```typescript
import { runConcurrent } from './utils/concurrent';
```

### Step 3: Add batch interface to `normalize-yaml.ts`

**File**: `tests/scripts/normalize-yaml.ts`

**Add** new interface after `NormalizeYamlParams`:
```typescript
interface NormalizeYamlBatchParams {
  specPaths: string[];
  clarificationsDir: string;
  outputDir?: string;
  provider?: LLMProvider;
  concurrency?: number;
  llmOptions?: Partial<
    Pick<LLMCompletionOptions, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>
  >;
}
```

**Add** export at the bottom:
```typescript
export type { NormalizeYamlParams, NormalizeYamlResult, NormalizeYamlBatchParams };
```

### Step 4: Implement `normalizeYamlBatch` function

**File**: `tests/scripts/normalize-yaml.ts`

**Add** new function before the exports:
```typescript
/**
 * Normalize multiple YAML specifications in parallel.
 * 
 * @param params - Batch normalization parameters
 * @returns Array of normalization results
 */
export async function normalizeYamlBatch(
  params: NormalizeYamlBatchParams
): Promise<NormalizeYamlResult[]> {
  const { specPaths, clarificationsDir, outputDir } = params;
  
  if (specPaths.length === 0) {
    return [];
  }

  // Determine concurrency: default to CPU count - 1, max of spec count
  const concurrency = Math.max(
    1,
    Math.min(
      params.concurrency ?? Math.max(1, os.cpus().length - 1),
      specPaths.length
    )
  );

  // Create a shared provider instance for all tasks
  const provider = params.provider ?? createLLMProvider();

  // Build tasks array
  const tasks = specPaths.map((specPath) => {
    const specFilename = path.basename(specPath, path.extname(specPath));
    const clarificationsPath = path.join(
      clarificationsDir,
      `${specFilename}.md`
    );
    
    const outputPath = outputDir
      ? path.join(outputDir, `${createSlug(specFilename)}.yaml`)
      : undefined;

    return () =>
      normalizeYamlSpecification({
        specPath,
        clarificationsPath,
        outputPath,
        provider, // Reuse same provider instance
        llmOptions: params.llmOptions,
      });
  });

  // Execute tasks concurrently
  return runConcurrent(tasks, concurrency);
}
```

**Add** import at the top:
```typescript
import os from 'node:os';
import { runConcurrent } from './utils/concurrent';
```

### Step 5: Update CLI to support batch operations

**File**: `tests/scripts/cli-normalize.ts`

**Replace** the entire file with:
```typescript
#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs/promises';

import './utils/load-env';

import { normalizeYamlSpecification, normalizeYamlBatch } from './normalize-yaml';
import { createLLMProvider } from './llm';
import { logEvent } from './utils/logging';
import { assertRequiredEnvVars } from './utils/env-validation';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Check for batch mode flag
  const batchModeIndex = args.indexOf('--batch');
  const isBatchMode = batchModeIndex !== -1;
  
  if (isBatchMode) {
    args.splice(batchModeIndex, 1); // Remove --batch flag
    await runBatchMode(args);
  } else {
    await runSingleMode(args);
  }
}

async function runSingleMode(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Usage: node tests/scripts/cli-normalize.ts <specPath> <clarificationsPath> [outputPath]');
    console.error('   or: node tests/scripts/cli-normalize.ts --batch <specsDir> <clarificationsDir> [outputDir] [--concurrency N]');
    process.exitCode = 1;
    return;
  }

  const [specPath, clarificationsPath, maybeOutput] = args;

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:normalize');
    const provider = createLLMProvider();
    const result = await normalizeYamlSpecification({
      specPath,
      clarificationsPath,
      outputPath: maybeOutput,
      provider,
    });

    logEvent('cli.normalize.generated', `Normalized YAML generated for ${specPath}`, {
      outputPath: result.outputPath,
      model: result.metadata.model,
      provider: result.metadata.provider,
      tokensUsed: result.metadata.tokensUsed,
      responseTime: result.metadata.responseTime,
    });
    console.log(`Normalized YAML written to ${result.outputPath}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function runBatchMode(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Usage: node tests/scripts/cli-normalize.ts --batch <specsDir> <clarificationsDir> [outputDir] [--concurrency N]');
    process.exitCode = 1;
    return;
  }

  const [specsDir, clarificationsDir, outputDir] = args;
  
  // Parse concurrency option
  const concurrencyIndex = args.indexOf('--concurrency');
  const concurrency = concurrencyIndex !== -1 && args[concurrencyIndex + 1]
    ? parseInt(args[concurrencyIndex + 1], 10)
    : undefined;

  try {
    assertRequiredEnvVars(['LLM_PROVIDER', 'LLM_MODEL'], 'spec:normalize');
    
    // Find all .txt files in specs directory
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    const specPaths = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
      .map((entry) => path.join(specsDir, entry.name));

    if (specPaths.length === 0) {
      console.error(`No .txt files found in ${specsDir}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Found ${specPaths.length} specs to normalize`);
    console.log(`Concurrency: ${concurrency ?? 'auto'}`);
    
    const startTime = Date.now();
    const provider = createLLMProvider();
    const results = await normalizeYamlBatch({
      specPaths,
      clarificationsDir,
      outputDir,
      provider,
      concurrency,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    logEvent('cli.normalize.batch.completed', `Normalized ${results.length} specs in ${duration}s`, {
      count: results.length,
      duration,
      concurrency: concurrency ?? 'auto',
    });
    
    console.log(`\n✅ Normalized ${results.length} specs in ${duration}s`);
    results.forEach((result) => {
      console.log(`   - ${path.basename(result.outputPath)}`);
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

void main();
```

### Step 6: Update package.json scripts

**File**: `package.json`

**Add** new script for batch normalization:
```json
{
  "scripts": {
    "spec:normalize": "tsx tests/scripts/cli-normalize.ts",
    "spec:normalize:batch": "tsx tests/scripts/cli-normalize.ts --batch"
  }
}
```

---

## Code Changes Required

### New Files

1. **`tests/scripts/utils/concurrent.ts`**
   - Purpose: Shared concurrent execution utility
   - Exports: `runConcurrent<T>` function

### Modified Files

1. **`tests/scripts/normalize-yaml.ts`**
   - Add: `NormalizeYamlBatchParams` interface
   - Add: `normalizeYamlBatch` function
   - Add: Import `os` and `runConcurrent`
   - Update: Export statement to include `NormalizeYamlBatchParams`

2. **`tests/scripts/generate-features.ts`**
   - Remove: Local `runConcurrent` function
   - Add: Import `runConcurrent` from `./utils/concurrent`

3. **`tests/scripts/cli-normalize.ts`**
   - Replace: Entire file with batch-aware implementation
   - Add: `runBatchMode` function
   - Add: `--batch` flag support
   - Add: `--concurrency` option

4. **`tests/scripts/utils/index.ts`**
   - Add: Export for `concurrent` module
   ```typescript
   export * from './concurrent';
   ```

5. **`package.json`**
   - Add: `spec:normalize:batch` script

---

## Testing Strategy

### Test 1: Single Spec (Regression Test)

**Objective**: Ensure single-spec normalization still works

**Steps**:
```bash
yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
```

**Pass Criteria**: YAML generated successfully, no errors

### Test 2: Batch Mode with 3 Specs

**Objective**: Verify batch processing works correctly

**Setup**:
1. Create 3 test specs in `tests/qa-specs/`
2. Create corresponding clarifications in `tests/clarifications/`

**Steps**:
```bash
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized
```

**Pass Criteria**:
- All 3 YAML files generated
- No errors
- Completion time < 3x single spec time

### Test 3: Concurrency Control

**Objective**: Verify concurrency parameter works

**Steps**:
```bash
# Test with concurrency=1 (sequential)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1

# Test with concurrency=4 (parallel)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4
```

**Pass Criteria**:
- Concurrency=1 takes ~3x longer than concurrency=4
- Both produce identical output

### Test 4: Error Handling

**Objective**: Ensure errors in one spec don't crash the batch

**Setup**: Create a spec with missing clarifications

**Steps**:
```bash
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized
```

**Pass Criteria**:
- Error reported for problematic spec
- Other specs complete successfully
- Exit code indicates failure

### Test 5: Performance Benchmark

**Objective**: Measure actual speedup

**Setup**: Create 10 test specs

**Steps**:
```bash
# Sequential (concurrency=1)
time yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1

# Parallel (concurrency=4)
time yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4
```

**Pass Criteria**: Parallel is 3-4x faster than sequential

---

## Success Criteria

### Functional Requirements

- ✅ **Single Spec Works**: No regression in single-spec normalization
- ✅ **Batch Mode Works**: Can process multiple specs in one command
- ✅ **Concurrency Control**: `--concurrency` flag controls parallelism
- ✅ **Error Handling**: Errors in one spec don't crash the batch
- ✅ **Output Quality**: Generated YAML is identical to single-spec mode

### Performance Metrics

| Metric | Baseline (Sequential) | Target (Parallel) | Measurement |
|--------|----------------------|-------------------|-------------|
| **10 specs** | ~15 min | ~4 min | Wall clock time |
| **Speedup** | 1x | 3-4x | Parallel time / Sequential time |
| **CPU Usage** | ~25% | ~80-100% | System monitor |

### Quality Metrics

- ✅ All generated YAML files pass schema validation
- ✅ No difference in output between sequential and parallel modes
- ✅ Audit logs contain entries for all specs

---

## Notes

- **Shared Provider**: Reusing the same LLM provider instance across tasks is important for connection pooling
- **Concurrency Limits**: Default concurrency is CPU count - 1 to avoid overloading the system
- **API Rate Limits**: Be aware of LLM provider rate limits when using high concurrency
- **Memory Usage**: Each concurrent task holds spec content in memory; monitor for large batches

