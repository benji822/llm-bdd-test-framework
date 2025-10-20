# Implementation Plan: Solution 1.2 - Implement Differential Updates

## Overview

Implement differential updates to skip LLM calls when clarifications haven't changed, or perform incremental updates when only minor changes are detected. This optimization caches normalized YAML and only regenerates when necessary.

**Expected Impact**: Skip LLM call entirely for unchanged specs (100% time savings), or reduce to partial updates (50-70% time savings)

**Effort**: Medium (3-5 days)

**Priority**: P2 (Core improvement)

---

## Implementation Steps

### Step 1: Extend metadata schema to include clarifications hash

**File**: `tests/schemas/yaml-spec.schema.json`

**Add** new optional field to metadata:
```json
{
  "metadata": {
    "properties": {
      "specId": { "type": "string", "format": "uuid" },
      "generatedAt": { "type": "string", "format": "date-time" },
      "llmProvider": { "type": "string" },
      "llmModel": { "type": "string" },
      "clarificationsHash": {
        "type": "string",
        "description": "SHA-256 hash of clarifications content for change detection"
      }
    }
  }
}
```

**File**: `tests/scripts/types/yaml-spec.ts`

**Update** `MetadataSchema`:
```typescript
export const MetadataSchema = z.object({
  specId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
  clarificationsHash: z.string().optional(), // Add this line
});
```

### Step 2: Create hash utility function

**File**: `tests/scripts/utils/hash.ts` (new file)

```typescript
import crypto from 'node:crypto';

/**
 * Create a SHA-256 hash of the given content.
 * 
 * @param content - Content to hash
 * @returns Hex-encoded hash string
 */
export function createContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Parse clarifications markdown and extract individual questions.
 * 
 * @param markdown - Clarifications markdown content
 * @returns Array of question objects with content and hash
 */
export function parseClarificationQuestions(markdown: string): Array<{
  number: number;
  content: string;
  hash: string;
}> {
  const sections = markdown.split(/## Question (\d+)/u).slice(1);
  const questions: Array<{ number: number; content: string; hash: string }> = [];

  for (let i = 0; i < sections.length; i += 2) {
    const number = parseInt(sections[i], 10);
    const content = sections[i + 1]?.trim() ?? '';
    const hash = createContentHash(content);
    
    questions.push({ number, content, hash });
  }

  return questions;
}

/**
 * Detect which questions have changed between two clarification documents.
 * 
 * @param currentMarkdown - Current clarifications content
 * @param previousHash - Hash of previous clarifications (from metadata)
 * @returns Array of question numbers that changed, or null if full regeneration needed
 */
export function detectChangedQuestions(
  currentMarkdown: string,
  previousHash?: string
): number[] | null {
  const currentHash = createContentHash(currentMarkdown);
  
  // If overall hash matches, no changes at all
  if (currentHash === previousHash) {
    return [];
  }
  
  // If no previous hash, full regeneration needed
  if (!previousHash) {
    return null;
  }
  
  // Parse questions to detect granular changes
  const currentQuestions = parseClarificationQuestions(currentMarkdown);
  
  // For now, return null to indicate full regeneration
  // TODO: Implement granular change detection by storing per-question hashes
  return null;
}
```

**File**: `tests/scripts/utils/index.ts`

**Add** export:
```typescript
export * from './hash';
```

### Step 3: Update `normalizeYamlSpecification` to check for changes

**File**: `tests/scripts/normalize-yaml.ts`

**Add** import:
```typescript
import { createContentHash, detectChangedQuestions } from './utils/hash';
import { fileExists } from './utils/file-operations';
```

**Modify** `normalizeYamlSpecification` function (insert after line 38):
```typescript
export async function normalizeYamlSpecification(
  params: NormalizeYamlParams
): Promise<NormalizeYamlResult> {
  const { specPath, clarificationsPath } = params;

  const specContent = await readTextFile(path.resolve(specPath));
  const clarificationsContent = await readTextFile(path.resolve(clarificationsPath));

  if (hasPendingClarifications(clarificationsContent)) {
    throw new Error('Missing required clarification answers. YAML generation blocked.');
  }

  // NEW: Calculate output path early to check for existing YAML
  const specFilename = path.basename(specPath);
  const outputPath =
    params.outputPath ??
    path.resolve(
      'tests/normalized',
      `${createSlug(specFilename.replace(path.extname(specFilename), ''))}.yaml`
    );

  // NEW: Check if output already exists and load it
  let existingYaml: NormalizedYaml | undefined;
  if (await fileExists(outputPath)) {
    try {
      const existingContent = await readTextFile(outputPath);
      const parsedValue = parseYaml<unknown>(existingContent);
      existingYaml = NormalizedYamlSchema.parse(parsedValue);
    } catch {
      // Ignore parse errors, will regenerate from scratch
      existingYaml = undefined;
    }
  }

  // NEW: Detect changes in clarifications
  const clarificationsHash = createContentHash(clarificationsContent);
  const changedQuestions = detectChangedQuestions(
    clarificationsContent,
    existingYaml?.metadata?.clarificationsHash
  );

  // NEW: If no changes detected, return existing YAML
  if (changedQuestions !== null && changedQuestions.length === 0 && existingYaml) {
    logEvent('normalize.skipped', `No changes detected for ${specFilename}`, {
      outputPath,
      clarificationsHash,
    });
    
    return {
      outputPath,
      content: stringifyYaml(existingYaml).trimEnd(),
      metadata: {
        provider: existingYaml.metadata.llmProvider,
        model: existingYaml.metadata.llmModel,
        tokensUsed: 0, // No LLM call made
        responseTime: 0, // Instant return
      },
    };
  }

  // Continue with existing LLM call logic...
  const vocabularyPath = path.resolve('tests/artifacts/step-vocabulary.json');
  // ... rest of existing code ...
```

### Step 4: Include hash in generated metadata

**File**: `tests/scripts/normalize-yaml.ts`

**Modify** the section where YAML is parsed and validated (around line 100):
```typescript
  const sanitized = sanitizeYamlInput(completion.completion);
  const parsedValue = parseYaml<unknown>(sanitized);
  coerceMetadataTypes(parsedValue);
  
  // NEW: Add clarifications hash to metadata
  if (parsedValue && typeof parsedValue === 'object') {
    const record = parsedValue as Record<string, unknown>;
    if (record.metadata && typeof record.metadata === 'object') {
      const metadata = record.metadata as Record<string, unknown>;
      metadata.clarificationsHash = clarificationsHash;
    }
  }
  
  let parsed;
  try {
    parsed = NormalizedYamlSchema.parse(parsedValue);
  } catch (error) {
    // ... existing error handling ...
  }
```

### Step 5: Update output path calculation

**File**: `tests/scripts/normalize-yaml.ts`

**Remove** duplicate output path calculation (lines 114-119) since we moved it earlier:
```typescript
  // DELETE these lines (now calculated earlier):
  // const outputPath =
  //   params.outputPath ??
  //   path.resolve(
  //     'tests/normalized',
  //     `${createSlug(specFilename.replace(path.extname(specFilename), ''))}.yaml`
  //   );
```

### Step 6: Add logging for cache hits

**File**: `tests/scripts/normalize-yaml.ts`

**Add** import:
```typescript
import { logEvent } from './utils/logging';
```

**Update** the cache hit logging (in the early return section):
```typescript
  if (changedQuestions !== null && changedQuestions.length === 0 && existingYaml) {
    logEvent('normalize.cache-hit', `Using cached YAML for ${specFilename}`, {
      outputPath,
      clarificationsHash,
      previousHash: existingYaml.metadata.clarificationsHash,
    });
    
    console.log(`✓ No changes detected, using cached YAML: ${path.basename(outputPath)}`);
    
    return {
      outputPath,
      content: stringifyYaml(existingYaml).trimEnd(),
      metadata: {
        provider: existingYaml.metadata.llmProvider,
        model: existingYaml.metadata.llmModel,
        tokensUsed: 0,
        responseTime: 0,
      },
    };
  }
```

### Step 7: Add force regeneration flag

**File**: `tests/scripts/normalize-yaml.ts`

**Update** `NormalizeYamlParams` interface:
```typescript
interface NormalizeYamlParams {
  specPath: string;
  clarificationsPath: string;
  outputPath?: string;
  provider?: LLMProvider;
  llmOptions?: Partial<
    Pick<LLMCompletionOptions, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>
  >;
  force?: boolean; // NEW: Force regeneration even if no changes detected
}
```

**Update** the change detection logic:
```typescript
  // Detect changes in clarifications
  const clarificationsHash = createContentHash(clarificationsContent);
  const changedQuestions = detectChangedQuestions(
    clarificationsContent,
    existingYaml?.metadata?.clarificationsHash
  );

  // If no changes detected and not forced, return existing YAML
  if (!params.force && changedQuestions !== null && changedQuestions.length === 0 && existingYaml) {
    // ... cache hit logic ...
  }
```

### Step 8: Update CLI to support force flag

**File**: `tests/scripts/cli-normalize.ts`

**Add** force flag support:
```typescript
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Check for --force flag
  const forceIndex = args.indexOf('--force');
  const force = forceIndex !== -1;
  if (force) {
    args.splice(forceIndex, 1); // Remove --force flag
  }
  
  if (args.length < 2) {
    console.error('Usage: node tests/scripts/cli-normalize.ts <specPath> <clarificationsPath> [outputPath] [--force]');
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
      force, // Pass force flag
    });

    // ... rest of existing code ...
  }
}
```

---

## Code Changes Required

### New Files

1. **`tests/scripts/utils/hash.ts`**
   - Purpose: Hash utilities for change detection
   - Exports: `createContentHash`, `parseClarificationQuestions`, `detectChangedQuestions`

### Modified Files

1. **`tests/schemas/yaml-spec.schema.json`**
   - Add: `clarificationsHash` field to metadata

2. **`tests/scripts/types/yaml-spec.ts`**
   - Update: `MetadataSchema` to include optional `clarificationsHash`

3. **`tests/scripts/normalize-yaml.ts`**
   - Add: Import hash utilities and `fileExists`
   - Add: `force` parameter to `NormalizeYamlParams`
   - Add: Early output path calculation
   - Add: Existing YAML loading logic
   - Add: Change detection logic
   - Add: Early return for cache hits
   - Add: Hash injection into metadata
   - Remove: Duplicate output path calculation

4. **`tests/scripts/cli-normalize.ts`**
   - Add: `--force` flag support
   - Update: Usage message

5. **`tests/scripts/utils/index.ts`**
   - Add: Export for `hash` module

---

## Testing Strategy

### Test 1: No Changes (Cache Hit)

**Objective**: Verify caching works when clarifications unchanged

**Steps**:
1. Run normalization:
   ```bash
   yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
   ```
2. Note the response time
3. Run again without changing clarifications:
   ```bash
   yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
   ```

**Pass Criteria**:
- Second run completes instantly (< 1 second)
- Console shows "No changes detected, using cached YAML"
- Output YAML is identical
- Audit log shows 0 tokens used for second run

### Test 2: Force Regeneration

**Objective**: Verify --force flag bypasses cache

**Steps**:
```bash
yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md --force
```

**Pass Criteria**:
- LLM call is made despite no changes
- Normal response time (90-140 seconds)
- YAML is regenerated

### Test 3: Clarifications Changed

**Objective**: Verify regeneration when clarifications change

**Steps**:
1. Run normalization
2. Modify one answer in clarifications file
3. Run normalization again

**Pass Criteria**:
- Change is detected
- LLM call is made
- New YAML reflects the change
- New hash is stored in metadata

### Test 4: Missing Existing YAML

**Objective**: Verify behavior when no cached YAML exists

**Steps**:
1. Delete `tests/normalized/example-login.yaml`
2. Run normalization

**Pass Criteria**:
- Full regeneration occurs
- No errors about missing file

### Test 5: Corrupted Existing YAML

**Objective**: Verify graceful handling of invalid cached YAML

**Steps**:
1. Corrupt the existing YAML file (invalid syntax)
2. Run normalization

**Pass Criteria**:
- Parse error is caught
- Full regeneration occurs
- Valid YAML is generated

---

## Success Criteria

### Functional Requirements

- ✅ **Cache Hits Work**: Unchanged specs return instantly
- ✅ **Change Detection Works**: Modified clarifications trigger regeneration
- ✅ **Force Flag Works**: `--force` bypasses cache
- ✅ **Hash Stored**: Generated YAML includes `clarificationsHash` in metadata
- ✅ **Backward Compatible**: Works with existing YAML files (no hash)

### Performance Metrics

| Scenario | Baseline | Target | Measurement |
|----------|----------|--------|-------------|
| **No Changes** | 92-140s | < 1s | Wall clock time |
| **Minor Changes** | 92-140s | 92-140s | Same (full regen for now) |
| **Cache Hit Rate** | 0% | 60-80% | Cached / Total runs |

### Quality Metrics

- ✅ Cached YAML is identical to freshly generated
- ✅ Hash changes when clarifications change
- ✅ No false positives (cache hit when changes exist)
- ✅ No false negatives (regeneration when no changes)

---

## Future Enhancements

### Phase 2: Granular Change Detection

Currently, any change triggers full regeneration. Future enhancement:
- Store per-question hashes
- Detect which specific questions changed
- Regenerate only affected scenarios

### Phase 3: Incremental Updates

For minor changes (< 3 questions):
- Keep unchanged scenarios
- Regenerate only affected scenarios
- Merge results

---

## Notes

- **Hash Algorithm**: SHA-256 provides good collision resistance
- **Whitespace**: Content is trimmed before hashing to ignore formatting changes
- **Metadata Extension**: Schema allows optional `clarificationsHash` for backward compatibility
- **Performance**: Hash calculation is negligible (< 1ms) compared to LLM calls

