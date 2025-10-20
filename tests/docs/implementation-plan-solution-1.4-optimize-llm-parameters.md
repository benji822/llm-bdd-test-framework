# Implementation Plan: Solution 1.4 - Optimize LLM Parameters

## Overview

Optimize LLM parameters for the `normalize-yaml` stage to achieve faster response times and more deterministic outputs. This solution reduces `temperature` from 0.3 to 0.1, `maxTokens` from 4000 to 3000, and `timeoutMs` from 180000 (3 min) to 120000 (2 min).

**Expected Impact**: 5-10% faster response times, more deterministic outputs

**Effort**: Low (1 day)

**Priority**: P1 (Quick win)

---

## Implementation Steps

### Step 1: Update `buildLlmOptions` in `normalize-yaml.ts`

Modify the default LLM parameters in the `buildLlmOptions` function.

**File**: `tests/scripts/normalize-yaml.ts`

**Current code** (lines 135-146):
```typescript
function buildLlmOptions(
  providerName: string,
  overrides?: NormalizeYamlParams['llmOptions']
): LLMCompletionOptions {
  return {
    model: resolveModelName(overrides?.model),
    temperature: overrides?.temperature ?? readNumberEnv('LLM_TEMPERATURE', 0.3),
    maxTokens: overrides?.maxTokens ?? readNumberEnv('LLM_MAX_TOKENS', 4000),
    timeoutMs: overrides?.timeoutMs ?? readNumberEnv('LLM_TIMEOUT_MS', 180000),
    metadata: { provider: providerName },
  };
}
```

**New code**:
```typescript
function buildLlmOptions(
  providerName: string,
  overrides?: NormalizeYamlParams['llmOptions']
): LLMCompletionOptions {
  return {
    model: resolveModelName(overrides?.model),
    temperature: overrides?.temperature ?? readNumberEnv('LLM_TEMPERATURE', 0.1), // Reduced from 0.3
    maxTokens: overrides?.maxTokens ?? readNumberEnv('LLM_MAX_TOKENS', 3000), // Reduced from 4000
    timeoutMs: overrides?.timeoutMs ?? readNumberEnv('LLM_TIMEOUT_MS', 120000), // Reduced from 180000
    metadata: { provider: providerName },
  };
}
```

**Changes**:
- Line 141: Change `0.3` → `0.1` (more deterministic, faster)
- Line 142: Change `4000` → `3000` (YAML rarely needs 4000 tokens)
- Line 143: Change `180000` → `120000` (2 min instead of 3 min)

### Step 2: Add inline comments explaining the changes

Add comments to document the rationale for each parameter change.

**File**: `tests/scripts/normalize-yaml.ts`

**Updated code**:
```typescript
function buildLlmOptions(
  providerName: string,
  overrides?: NormalizeYamlParams['llmOptions']
): LLMCompletionOptions {
  return {
    model: resolveModelName(overrides?.model),
    // Lower temperature (0.1 vs 0.3) for more deterministic YAML generation
    temperature: overrides?.temperature ?? readNumberEnv('LLM_TEMPERATURE', 0.1),
    // Reduced max tokens (3000 vs 4000) - YAML specs rarely exceed 3000 tokens
    maxTokens: overrides?.maxTokens ?? readNumberEnv('LLM_MAX_TOKENS', 3000),
    // Reduced timeout (2 min vs 3 min) - most normalizations complete within 2 minutes
    timeoutMs: overrides?.timeoutMs ?? readNumberEnv('LLM_TIMEOUT_MS', 120000),
    metadata: { provider: providerName },
  };
}
```

### Step 3: Update environment variable documentation (optional)

If there's a `.env.example` or documentation file that lists environment variables, update it to reflect the new defaults.

**Files to check**:
- `.env.example` (if exists)
- `tests/docs/` (any environment variable documentation)
- `README.md` or `tests/README.md`

**Update**:
```bash
# LLM Configuration
LLM_TEMPERATURE=0.1  # Default: 0.1 (was 0.3)
LLM_MAX_TOKENS=3000  # Default: 3000 (was 4000)
LLM_TIMEOUT_MS=120000  # Default: 120000 (was 180000)
```

---

## Code Changes Required

### File: `tests/scripts/normalize-yaml.ts`

**Function**: `buildLlmOptions` (lines 135-146)

**Changes**:
1. Line 141: `temperature` default: `0.3` → `0.1`
2. Line 142: `maxTokens` default: `4000` → `3000`
3. Line 143: `timeoutMs` default: `180000` → `120000`
4. Add inline comments explaining each change

**No new files required**

**No new dependencies required**

---

## Testing Strategy

### Test 1: Verify Parameter Changes

**Objective**: Confirm the new defaults are applied correctly

**Steps**:
1. Run normalization without environment variable overrides:
   ```bash
   yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
   ```

2. Check the audit log to verify parameters:
   ```bash
   tail -n 1 tests/artifacts/audit/llm-interactions.jsonl | jq '.prompt' | grep -o '"temperature":[^,]*'
   ```

3. Expected output should show `temperature: 0.1` in the LLM options

**Pass Criteria**: Audit log shows new parameter values

### Test 2: Environment Variable Override

**Objective**: Ensure environment variables still override defaults

**Steps**:
1. Set environment variables:
   ```bash
   export LLM_TEMPERATURE=0.5
   export LLM_MAX_TOKENS=5000
   export LLM_TIMEOUT_MS=200000
   ```

2. Run normalization:
   ```bash
   yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
   ```

3. Verify the overrides were applied (check audit log)

**Pass Criteria**: Environment variables override the new defaults

### Test 3: Programmatic Override

**Objective**: Verify `llmOptions` parameter still works

**Steps**:
1. Create a test script that calls `normalizeYamlSpecification` with custom `llmOptions`:
   ```typescript
   await normalizeYamlSpecification({
     specPath: 'tests/qa-specs/example-login.txt',
     clarificationsPath: 'tests/clarifications/example-login.md',
     llmOptions: {
       temperature: 0.2,
       maxTokens: 3500,
     },
   });
   ```

2. Verify the custom options are used

**Pass Criteria**: Custom options override defaults

### Test 4: YAML Quality Validation

**Objective**: Ensure lower temperature doesn't degrade output quality

**Steps**:
1. Run normalization on 3-5 different specs
2. Validate each generated YAML:
   ```bash
   yarn spec:ci-verify
   ```

3. Compare scenario coverage with previous runs

**Pass Criteria**: 
- All YAML files pass schema validation
- Scenario coverage is equivalent or better
- No regression in test quality

### Test 5: Performance Measurement

**Objective**: Measure actual performance improvement

**Steps**:
1. Run normalization 5 times and record metrics:
   ```bash
   for i in {1..5}; do
     yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md
   done
   ```

2. Extract response times from audit log:
   ```bash
   grep 'normalize-yaml' tests/artifacts/audit/llm-interactions.jsonl | \
     jq -r '.responseTimeMs' | \
     awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
   ```

3. Compare with baseline metrics (92-121 seconds)

**Pass Criteria**: Average response time shows 5-10% improvement

---

## Success Criteria

### Functional Requirements

- ✅ **Parameter Changes Applied**: New defaults are used when no overrides provided
- ✅ **Environment Variables Work**: `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `LLM_TIMEOUT_MS` still override defaults
- ✅ **Programmatic Overrides Work**: `llmOptions` parameter still functions correctly
- ✅ **YAML Quality Maintained**: Generated YAML passes schema validation
- ✅ **No Regressions**: Existing tests continue to pass

### Performance Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| **Response Time** | 92-121s | 87-109s (5-10% faster) | Audit log `responseTimeMs` |
| **Token Usage** | 11,699-13,306 | ≤ 3,000 output tokens | Audit log `tokensUsed` |
| **Timeout Failures** | 0% | 0% | Error logs |
| **Determinism** | Variable | More consistent | Compare 5 runs of same spec |

### Quality Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Schema Validation** | 100% pass rate | `yarn spec:ci-verify` |
| **Scenario Coverage** | No regression | Compare scenario count |
| **Step Vocabulary Match** | 100% | `validateFeatureCoverage` |

---

## Rollback Plan

If the changes cause issues:

### Step 1: Revert Code Changes

```bash
git checkout HEAD -- tests/scripts/normalize-yaml.ts
```

### Step 2: Use Environment Variables as Temporary Fix

Set environment variables to old defaults:
```bash
export LLM_TEMPERATURE=0.3
export LLM_MAX_TOKENS=4000
export LLM_TIMEOUT_MS=180000
```

### Step 3: Investigate Issues

Common issues and solutions:
- **Timeout errors**: Increase `LLM_TIMEOUT_MS` to 150000 (2.5 min)
- **Truncated YAML**: Increase `LLM_MAX_TOKENS` to 3500
- **Quality degradation**: Increase `LLM_TEMPERATURE` to 0.15

---

## Notes

- **Backward Compatibility**: This change is backward compatible because environment variables and programmatic overrides still work
- **Gradual Rollout**: Can be tested on individual specs before applying to all
- **Monitoring**: Watch audit logs for timeout errors or truncated responses
- **Future Optimization**: If 3000 tokens is too low, can adjust to 3500 based on data

