# Issue 2 Implementation Plan: Test Execution Reliability

> **Plan Created**: 2025-10-19
> **Status**: Ready for Implementation
> **Prerequisites**: Issue 1 (Performance) completed, Step 3.5 (Selector Validation) implemented

## Executive Summary

This document provides a detailed implementation plan for Issue 2 (Test Execution Reliability) solutions. Since Step 3.5 has already addressed selector validation (Solution 2.4) and partial pre-flight checks (Solution 2.2), this plan focuses on the remaining solutions to achieve 80-90% test success rate.

**Current State**: 60-70% test success rate (with Step 3.5)
**Target State**: 80-90% test success rate
**Timeline**: 2-3 weeks

---

## Solutions Overview

| Solution | Status | Effort | Impact | Priority | Timeline |
|----------|--------|--------|--------|----------|----------|
| 2.1: Selector Registry Integration | 🔄 Planned | Medium | High | P0 | Week 1-2 |
| 2.2: Complete Pre-flight Health Checks | 🔄 Planned | Low | Medium | P1 | Week 1 |
| 2.3: Smart Selector Fallback | 🔄 Planned | Medium | High | P2 | Week 2-3 |
| 2.4: Selector Validation | ✅ Done | - | - | - | Completed |

---

## Solution 2.1: Integrate Selector Registry into Step Implementations

### 🎯 Objective

Replace hardcoded selectors in step implementations with dynamic lookups from the selector registry, ensuring tests always use validated selectors from the actual application.

### 📋 Prerequisites

- ✅ Selector registry exists (`tests/artifacts/selectors.json`)
- ✅ Registry populated with login page selectors
- ✅ Type definitions exist (`tests/scripts/types/selector-registry.ts`)

### 📁 Files to Create/Modify

#### 1. Create Selector Loader Utility

**File**: `tests/scripts/utils/selector-loader.ts`

```typescript
import path from 'node:path';
import { readTextFile } from './file-operations';
import type { SelectorRegistry, SelectorEntry } from '../types/selector-registry';

let cachedRegistry: SelectorRegistry | null = null;

/**
 * Load selector registry from artifacts
 * Uses in-memory cache to avoid repeated file reads
 */
export async function loadSelectorRegistry(): Promise<SelectorRegistry> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryPath = path.resolve(__dirname, '../../artifacts/selectors.json');
  
  try {
    const content = await readTextFile(registryPath);
    cachedRegistry = JSON.parse(content) as SelectorRegistry;
    return cachedRegistry;
  } catch (error) {
    throw new Error(
      `Failed to load selector registry from ${registryPath}. ` +
      `Run: yarn spec:collect-selectors --route /login --route /dashboard\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get selector by ID from registry
 * @throws Error if selector not found
 */
export async function getSelector(id: string): Promise<string> {
  const registry = await loadSelectorRegistry();
  const normalizedId = id.toLowerCase();
  const entry = registry.selectors[normalizedId];

  if (!entry) {
    const available = Object.keys(registry.selectors).slice(0, 5).join(', ');
    throw new Error(
      `Selector '${id}' not found in registry.\n` +
      `Available selectors: ${available}...\n` +
      `Run: yarn spec:collect-selectors --route /<page-with-${id}>`
    );
  }

  return entry.selector;
}

/**
 * Get selector entry (full metadata) by ID
 * @throws Error if selector not found
 */
export async function getSelectorEntry(id: string): Promise<SelectorEntry> {
  const registry = await loadSelectorRegistry();
  const normalizedId = id.toLowerCase();
  const entry = registry.selectors[normalizedId];

  if (!entry) {
    throw new Error(`Selector '${id}' not found in registry`);
  }

  return entry;
}

/**
 * Check if selector exists in registry
 */
export async function hasSelector(id: string): Promise<boolean> {
  const registry = await loadSelectorRegistry();
  return registry.selectors[id.toLowerCase()] !== undefined;
}

/**
 * Clear cache (useful for tests)
 */
export function clearSelectorCache(): void {
  cachedRegistry = null;
}
```

**Implementation Checklist**:
- [ ] Create file `tests/scripts/utils/selector-loader.ts`
- [ ] Add exports to `tests/scripts/utils/index.ts`
- [ ] Write unit tests in `tests/__tests__/selector-loader.test.ts`

#### 2. Update Step Implementations

**File**: `tests/steps/interaction.steps.ts`

```typescript
import { createBdd } from 'playwright-bdd';
import { getSelector } from '../scripts/utils/selector-loader';

const { When } = createBdd();

When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-input`;
  const selector = await getSelector(selectorId);
  
  await page.fill(selector, value);
});

When('I select {word} as {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-select`;
  const selector = await getSelector(selectorId);
  
  await page.selectOption(selector, { label: value });
});

When('I click the {word} button', async ({ page }, element: string) => {
  const selectorId = `${element}-button`;
  const selector = await getSelector(selectorId);
  
  await page.click(selector);
});

When('I click {string}', async ({ page }, elementName: string) => {
  // Generic click for any element by name/id
  const selectorId = elementName.toLowerCase().replace(/\s+/g, '-');
  const selector = await getSelector(selectorId);
  
  await page.click(selector);
});
```

**File**: `tests/steps/assertion.steps.ts`

```typescript
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { getSelector } from '../scripts/utils/selector-loader';

const { Then } = createBdd();

Then('I should see {string}', async ({ page }, element: string) => {
  const selectorId = element.toLowerCase().replace(/\s+/g, '-');
  const selector = await getSelector(selectorId);
  
  await expect(page.locator(selector)).toBeVisible();
});

Then('I should see an error message', async ({ page }) => {
  const selector = await getSelector('error-banner');
  await expect(page.locator(selector)).toBeVisible();
});

Then('the {word} field should contain {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-input`;
  const selector = await getSelector(selectorId);
  
  await expect(page.locator(selector)).toHaveValue(value);
});
```

**File**: `tests/steps/navigation.steps.ts`

```typescript
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { getSelector } from '../scripts/utils/selector-loader';

const { Given, Then } = createBdd();

Given('I am on the {word} page', async ({ page, baseURL }, pageName: string) => {
  const url = `${baseURL ?? 'http://localhost:4200'}/${pageName === 'home' ? '' : pageName}`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
});

Then('I should be on the {word} page', async ({ page }, pageName: string) => {
  // Verify URL
  const expectedPath = pageName === 'home' ? '/' : `/${pageName}`;
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
  
  // Verify page-specific element exists
  const selectorId = `${pageName}-heading`;
  const selector = await getSelector(selectorId);
  await expect(page.locator(selector)).toBeVisible({ timeout: 10000 });
});
```

**Implementation Checklist**:
- [ ] Update `tests/steps/interaction.steps.ts`
- [ ] Update `tests/steps/assertion.steps.ts`
- [ ] Update `tests/steps/navigation.steps.ts`
- [ ] Update `tests/steps/auth.steps.ts` (if exists)
- [ ] Test with existing feature files
- [ ] Update documentation

#### 3. Add Error Handling and Debugging

**File**: `tests/steps/hooks.ts` (create if doesn't exist)

```typescript
import { Before, After } from '@playwright/test';
import { clearSelectorCache, loadSelectorRegistry } from '../scripts/utils/selector-loader';

Before(async ({ page }, testInfo) => {
  // Pre-load registry to catch errors early
  try {
    const registry = await loadSelectorRegistry();
    
    // Log registry freshness
    const lastScanned = new Date(registry.lastScanned);
    const hoursSinceUpdate = (Date.now() - lastScanned.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate > 24) {
      console.warn(
        `⚠️  Selector registry is ${Math.floor(hoursSinceUpdate)} hours old. ` +
        `Consider running: yarn spec:collect-selectors`
      );
    }
  } catch (error) {
    throw new Error(
      `Cannot start test: Selector registry not available.\n` +
      `${error instanceof Error ? error.message : String(error)}`
    );
  }
});

After(async ({}, testInfo) => {
  // Clear cache after each test to ensure fresh data
  if (process.env.NODE_ENV === 'test') {
    clearSelectorCache();
  }
});
```

**Implementation Checklist**:
- [ ] Create `tests/steps/hooks.ts`
- [ ] Add Before/After hooks
- [ ] Test with CI environment

### 🧪 Testing Strategy

```bash
# 1. Run existing tests with new implementation
yarn test:bdd tests/features/login.feature

# 2. Test with missing selector (should fail gracefully)
# Temporarily remove a selector from registry and verify error message

# 3. Test with stale registry (should warn)
# Modify lastScanned timestamp to be > 24 hours old

# 4. Run full test suite
yarn test:bdd
```

### 📊 Success Criteria

- [ ] All step implementations use `getSelector()` instead of hardcoded selectors
- [ ] Clear error messages when selectors are missing
- [ ] Tests pass with existing selector registry
- [ ] No hardcoded `data-testid` or selector strings in step files
- [ ] Error messages include actionable next steps (e.g., run collect-selectors)

### ⏱️ Timeline

- **Day 1-2**: Create selector loader utility + tests
- **Day 3-4**: Update all step implementations
- **Day 5**: Add hooks and error handling
- **Day 6-7**: Testing and refinement

---

## Solution 2.2: Complete Pre-flight Health Checks

### 🎯 Objective

Enhance pre-flight checks beyond Step 3.5's validation to ensure comprehensive readiness before test execution.

### 📋 Current State (Step 3.5)

Step 3.5 already provides:
- ✅ Application availability check
- ✅ Selector validation against running app
- ✅ Clear error messages with fix suggestions

### 📋 Gaps to Address

- ⚠️ No check during test runtime (only during validation step)
- ⚠️ No registry freshness validation
- ⚠️ No environment variable checks

### 📁 Files to Create/Modify

#### 1. Enhance Hooks with Additional Checks

**File**: `tests/steps/hooks.ts` (extend from Solution 2.1)

```typescript
import { Before } from '@playwright/test';
import { loadSelectorRegistry } from '../scripts/utils/selector-loader';

let healthCheckPassed = false;
let appHealthCheckTime: number | null = null;

Before(async ({ page, baseURL }, testInfo) => {
  const currentTime = Date.now();
  
  // Re-check health every 5 minutes
  if (healthCheckPassed && appHealthCheckTime && currentTime - appHealthCheckTime < 5 * 60 * 1000) {
    return;
  }

  // Check 1: Application accessibility
  const targetURL = baseURL ?? 'http://localhost:4200';
  
  try {
    const response = await page.goto(targetURL, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    if (!response || response.status() >= 400) {
      throw new Error(
        `❌ Application not accessible at ${targetURL}\n` +
        `   Status: ${response?.status()}\n` +
        `   Action: Make sure dev server is running: yarn dev`
      );
    }
  } catch (error) {
    throw new Error(
      `❌ Cannot connect to application at ${targetURL}\n` +
      `   Action: Make sure dev server is running: yarn dev\n` +
      `   Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check 2: Selector registry exists and is recent
  try {
    const registry = await loadSelectorRegistry();
    const lastScanned = new Date(registry.lastScanned);
    const daysSinceUpdate = (Date.now() - lastScanned.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 7) {
      console.warn(
        `⚠️  Selector registry is ${Math.floor(daysSinceUpdate)} days old\n` +
        `   Action: Run: yarn spec:collect-selectors --route /login --route /dashboard`
      );
    }
  } catch (error) {
    throw new Error(
      `❌ Selector registry not found or invalid\n` +
      `   Action: Run: yarn spec:collect-selectors --route /login --route /dashboard\n` +
      `   Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check 3: Required environment variables
  const requiredEnvVars = ['E2E_USER_EMAIL', 'E2E_USER_PASSWORD'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `❌ Missing required environment variables: ${missingVars.join(', ')}\n` +
      `   Action: Create .env.test file with required variables\n` +
      `   Example:\n` +
      `     E2E_USER_EMAIL=test@example.com\n` +
      `     E2E_USER_PASSWORD=testpassword123`
    );
  }

  healthCheckPassed = true;
  appHealthCheckTime = currentTime;
  
  console.log(`✅ Pre-flight checks passed for ${testInfo.title}`);
});
```

**Implementation Checklist**:
- [ ] Extend `tests/steps/hooks.ts` with new checks
- [ ] Add environment variable validation
- [ ] Add app health re-check mechanism (every 5 minutes)
- [ ] Test all failure scenarios

### 🧪 Testing Strategy

```bash
# Test 1: App not running
# Stop dev server, run test, verify clear error message

# Test 2: Missing env vars
# Remove E2E_USER_EMAIL, run test, verify error message

# Test 3: Stale registry
# Modify lastScanned to be > 7 days old, verify warning

# Test 4: All checks pass
# Run with all conditions met, verify tests execute
```

### 📊 Success Criteria

- [ ] Tests fail fast with clear messages when app is not running
- [ ] Warning shown when registry is > 7 days old
- [ ] Tests fail when required env vars are missing
- [ ] Health check caches results for 5 minutes to avoid overhead
- [ ] All error messages include actionable next steps

### ⏱️ Timeline

- **Day 1**: Implement enhanced health checks
- **Day 2**: Test all failure scenarios
- **Day 3**: Documentation and refinement

---

## Solution 2.3: Smart Selector Fallback Strategy

### 🎯 Objective

Implement automatic fallback to alternative selectors when primary selector fails, reducing false failures due to minor DOM changes.

### 📋 Prerequisites

- ✅ Solution 2.1 completed (selector registry integration)
- ✅ Selector registry populated with multiple selector types

### 📁 Files to Create/Modify

#### 1. Enhance Selector Loader with Fallback Logic

**File**: `tests/scripts/utils/selector-loader.ts` (extend from Solution 2.1)

```typescript
import type { Page, Locator } from '@playwright/test';
import type { SelectorRegistry, SelectorEntry } from '../types/selector-registry';

/**
 * Find alternative selectors for fallback
 * Prioritizes accessible selectors and same page
 */
function findAlternativeSelectors(
  registry: SelectorRegistry,
  primaryEntry: SelectorEntry
): SelectorEntry[] {
  const alternatives: SelectorEntry[] = [];

  // Strategy 1: Same page, same base ID, different type
  const baseId = primaryEntry.id.split('-')[0]; // e.g., "email" from "email-input"
  
  Object.values(registry.selectors).forEach(entry => {
    if (
      entry.id !== primaryEntry.id &&
      entry.page === primaryEntry.page &&
      entry.id.startsWith(baseId)
    ) {
      alternatives.push(entry);
    }
  });

  // Strategy 2: Same page, accessible selectors
  if (alternatives.length === 0) {
    Object.values(registry.selectors).forEach(entry => {
      if (
        entry.id !== primaryEntry.id &&
        entry.page === primaryEntry.page &&
        entry.accessible
      ) {
        alternatives.push(entry);
      }
    });
  }

  // Sort by priority (lower number = higher priority)
  return alternatives.sort((a, b) => a.priority - b.priority);
}

/**
 * Find element with smart fallback
 * @throws Error if element not found with any selector
 */
export async function findElement(
  page: Page,
  selectorId: string,
  options?: { timeout?: number; verbose?: boolean }
): Promise<Locator> {
  const registry = await loadSelectorRegistry();
  const normalizedId = selectorId.toLowerCase();
  const primaryEntry = registry.selectors[normalizedId];

  if (!primaryEntry) {
    throw new Error(`Selector '${selectorId}' not found in registry`);
  }

  const verbose = options?.verbose ?? false;
  const timeout = options?.timeout ?? 5000;

  // Try primary selector
  const primaryLocator = page.locator(primaryEntry.selector);

  try {
    await primaryLocator.waitFor({ state: 'visible', timeout });
    
    if (verbose) {
      console.log(`✅ Found element '${selectorId}' with primary selector: ${primaryEntry.selector}`);
    }
    
    return primaryLocator;
  } catch (primaryError) {
    if (verbose) {
      console.warn(`⚠️  Primary selector failed for '${selectorId}': ${primaryEntry.selector}`);
    }

    // Try alternatives
    const alternatives = findAlternativeSelectors(registry, primaryEntry);

    for (const alt of alternatives) {
      try {
        const altLocator = page.locator(alt.selector);
        await altLocator.waitFor({ state: 'visible', timeout: 2000 });
        
        console.warn(
          `⚠️  Using fallback selector for '${selectorId}':\n` +
          `   Primary: ${primaryEntry.selector} (failed)\n` +
          `   Fallback: ${alt.selector} (${alt.type})\n` +
          `   Action: Update registry: yarn spec:collect-selectors --route ${primaryEntry.page}`
        );
        
        return altLocator;
      } catch {
        // Try next alternative
        continue;
      }
    }

    // All attempts failed
    const attemptedSelectors = [
      primaryEntry.selector,
      ...alternatives.map(a => a.selector)
    ].join('\n     - ');

    throw new Error(
      `❌ Element '${selectorId}' not found on page '${primaryEntry.page}'\n` +
      `   Attempted selectors:\n     - ${attemptedSelectors}\n` +
      `   Action: Verify element exists and run: yarn spec:collect-selectors --route ${primaryEntry.page}`
    );
  }
}

/**
 * Safe click with fallback
 */
export async function clickElement(
  page: Page,
  selectorId: string,
  options?: { timeout?: number }
): Promise<void> {
  const locator = await findElement(page, selectorId, options);
  await locator.click();
}

/**
 * Safe fill with fallback
 */
export async function fillElement(
  page: Page,
  selectorId: string,
  value: string,
  options?: { timeout?: number }
): Promise<void> {
  const locator = await findElement(page, selectorId, options);
  await locator.fill(value);
}

/**
 * Safe select with fallback
 */
export async function selectElement(
  page: Page,
  selectorId: string,
  value: string,
  options?: { timeout?: number }
): Promise<void> {
  const locator = await findElement(page, selectorId, options);
  await locator.selectOption({ label: value });
}
```

#### 2. Update Step Implementations to Use Fallback

**File**: `tests/steps/interaction.steps.ts` (replace Solution 2.1 version)

```typescript
import { createBdd } from 'playwright-bdd';
import { fillElement, clickElement, selectElement } from '../scripts/utils/selector-loader';

const { When } = createBdd();

When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-input`;
  await fillElement(page, selectorId, value);
});

When('I select {word} as {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-select`;
  await selectElement(page, selectorId, value);
});

When('I click the {word} button', async ({ page }, element: string) => {
  const selectorId = `${element}-button`;
  await clickElement(page, selectorId);
});

When('I click {string}', async ({ page }, elementName: string) => {
  const selectorId = elementName.toLowerCase().replace(/\s+/g, '-');
  await clickElement(page, selectorId);
});
```

**File**: `tests/steps/assertion.steps.ts`

```typescript
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { findElement } from '../scripts/utils/selector-loader';

const { Then } = createBdd();

Then('I should see {string}', async ({ page }, element: string) => {
  const selectorId = element.toLowerCase().replace(/\s+/g, '-');
  const locator = await findElement(page, selectorId);
  
  await expect(locator).toBeVisible();
});

Then('I should see an error message', async ({ page }) => {
  const locator = await findElement(page, 'error-banner');
  await expect(locator).toBeVisible();
});

Then('the {word} field should contain {string}', async ({ page }, field: string, value: string) => {
  const selectorId = `${field}-input`;
  const locator = await findElement(page, selectorId);
  
  await expect(locator).toHaveValue(value);
});
```

**Implementation Checklist**:
- [ ] Add `findElement`, `clickElement`, `fillElement`, `selectElement` to selector-loader
- [ ] Implement `findAlternativeSelectors` logic
- [ ] Update all step implementations to use fallback helpers
- [ ] Add verbose logging option for debugging
- [ ] Write unit tests for fallback logic

### 🧪 Testing Strategy

```bash
# Test 1: Primary selector works
# Normal test execution, verify primary selector used

# Test 2: Primary selector fails, fallback succeeds
# Temporarily modify selector registry to break primary selector
# Add alternative selector, verify fallback kicks in

# Test 3: All selectors fail
# Remove all selectors for an element
# Verify clear error message with all attempted selectors

# Test 4: Performance impact
# Measure execution time with vs without fallback logic
# Ensure < 10% overhead
```

### 📊 Success Criteria

- [ ] Tests automatically try alternative selectors on failure
- [ ] Warning logged when fallback is used (with actionable message)
- [ ] Performance impact < 10% on normal execution
- [ ] Clear error message when all selectors fail
- [ ] Fallback logic tested with real failing scenarios

### ⏱️ Timeline

- **Day 1-2**: Implement findElement with fallback logic
- **Day 3**: Add helper functions (clickElement, fillElement, etc.)
- **Day 4-5**: Update step implementations
- **Day 6**: Testing with real failure scenarios
- **Day 7**: Performance testing and optimization

---

## Implementation Roadmap

### Week 1: Foundation + Quick Wins

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Solution 2.1: Create selector loader utility | ✅ selector-loader.ts with tests |
| 3-4 | Solution 2.1: Update step implementations | ✅ All steps use registry |
| 5 | Solution 2.2: Add pre-flight checks | ✅ Enhanced hooks.ts |
| 6-7 | Testing and refinement | ✅ All tests passing |

**End of Week 1 Goal**: 70-75% test success rate

### Week 2-3: Advanced Features

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 8-9 | Solution 2.3: Implement fallback logic | ✅ findElement with alternatives |
| 10 | Solution 2.3: Add helper functions | ✅ clickElement, fillElement, etc. |
| 11-12 | Solution 2.3: Update step implementations | ✅ All steps use fallback |
| 13 | Solution 2.3: Test failure scenarios | ✅ Fallback working correctly |
| 14 | Performance testing and optimization | ✅ < 10% overhead |
| 15 | Documentation and cleanup | ✅ Updated docs |

**End of Week 3 Goal**: 80-90% test success rate

---

## Testing Plan

### Unit Tests

```typescript
// tests/__tests__/selector-loader.test.ts

describe('Selector Loader', () => {
  describe('loadSelectorRegistry', () => {
    it('should load registry from artifacts', async () => {
      const registry = await loadSelectorRegistry();
      expect(registry.version).toBeDefined();
      expect(registry.selectors).toBeDefined();
    });

    it('should cache registry', async () => {
      const registry1 = await loadSelectorRegistry();
      const registry2 = await loadSelectorRegistry();
      expect(registry1).toBe(registry2); // Same reference
    });

    it('should throw error if registry not found', async () => {
      // Mock file read to fail
      await expect(loadSelectorRegistry()).rejects.toThrow('Failed to load selector registry');
    });
  });

  describe('getSelector', () => {
    it('should return selector for valid ID', async () => {
      const selector = await getSelector('email-input');
      expect(selector).toBe('[data-testid=\'email-input\']');
    });

    it('should throw error for missing selector', async () => {
      await expect(getSelector('nonexistent')).rejects.toThrow('Selector \'nonexistent\' not found');
    });

    it('should be case-insensitive', async () => {
      const selector1 = await getSelector('email-input');
      const selector2 = await getSelector('EMAIL-INPUT');
      expect(selector1).toBe(selector2);
    });
  });

  describe('findElement', () => {
    it('should find element with primary selector', async () => {
      // Test with mocked page
    });

    it('should fallback to alternative selector', async () => {
      // Test with primary failing, alternative working
    });

    it('should throw error when all selectors fail', async () => {
      // Test with all selectors failing
    });
  });
});
```

### Integration Tests

```typescript
// tests/__tests__/integration/selector-integration.test.ts

describe('Selector Integration', () => {
  test('login flow uses registry selectors', async ({ page }) => {
    await page.goto('/login');
    
    // Verify steps use registry
    await fillElement(page, 'email-input', 'test@example.com');
    await fillElement(page, 'password-input', 'password123');
    await clickElement(page, 'submit-button');
    
    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('fallback selector works when primary fails', async ({ page }) => {
    // Simulate primary selector failing
    // Verify fallback is used
  });
});
```

### E2E Tests

```bash
# Run existing feature files with new implementation
yarn test:bdd tests/features/login.feature
yarn test:bdd tests/features/*.feature

# Should maintain or improve success rate
```

---

## Success Metrics

### Quantitative Metrics

| Metric | Baseline | Week 1 Target | Week 3 Target | Measurement |
|--------|----------|---------------|---------------|-------------|
| Test success rate | 60-70% | 70-75% | 80-90% | Passing/total tests |
| Selector accuracy | Unknown | 100% | 100% | Tests using validated selectors |
| False failure rate | 20-30% | 15-20% | < 10% | Failures due to selector issues |
| Pre-flight validation | 100% | 100% | 100% | Specs validated before tests |
| Mean time to debug failure | Unknown | -20% | -50% | Time to identify root cause |

### Qualitative Metrics

- [ ] Clear error messages for all failure scenarios
- [ ] Developers can understand and fix failures without help
- [ ] Selector registry stays up-to-date with application changes
- [ ] Tests are resilient to minor UI changes
- [ ] CI pipeline is stable and reliable

---

## Risk Mitigation

### Risk 1: Selector Registry Becomes Stale

**Mitigation**:
- Add warning when registry > 7 days old
- Add CI job to refresh registry weekly
- Document process for updating registry

### Risk 2: Performance Overhead from Fallback Logic

**Mitigation**:
- Cache registry in memory
- Limit fallback attempts to 3 alternatives
- Add timeout limits (2 seconds per alternative)
- Monitor and optimize hot paths

### Risk 3: Breaking Changes to Existing Tests

**Mitigation**:
- Run full test suite after each solution
- Keep backward compatibility during migration
- Document migration guide for custom steps

### Risk 4: False Positives from Fallback

**Mitigation**:
- Log warnings when fallback is used
- Monitor fallback usage rate
- Alert if fallback rate > 20%

---

## Documentation Updates

### Files to Create/Update

1. **Quick Reference**: `tests/docs/selector-registry-usage.md`
   - How to use selector loader in steps
   - Common patterns and examples
   - Troubleshooting guide

2. **Architecture Update**: `tests/docs/architecture.md`
   - Add selector loader to architecture diagram
   - Document fallback strategy
   - Explain health check system

3. **README Update**: `tests/README.md`
   - Add selector registry section
   - Update getting started guide
   - Add troubleshooting section

4. **Step Guide Update**: `tests/docs/step-vocabulary-guide.md`
   - Update examples to use registry
   - Document selector ID conventions
   - Add best practices

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)

- Implement Solution 2.1 + 2.2
- Test with small subset of features
- Gather feedback from team
- Fix critical issues

### Phase 2: Gradual Migration (Week 2)

- Migrate all existing features to use registry
- Implement Solution 2.3
- Monitor success rate improvements
- Document learnings

### Phase 3: Full Deployment (Week 3)

- Enable all solutions in CI/CD
- Update all documentation
- Train team on new workflow
- Establish monitoring and alerts

---

## Conclusion

This implementation plan provides a structured approach to achieving 80-90% test success rate by:

1. **Solution 2.1**: Ensuring tests always use validated selectors from running application
2. **Solution 2.2**: Catching issues early with comprehensive pre-flight checks
3. **Solution 2.3**: Reducing false failures with smart fallback strategies

**Combined Impact**:
- From 60-70% (with Step 3.5 only) to **80-90% test success rate**
- **100% selector accuracy** (all tests use validated selectors)
- **< 10% false failure rate** (down from 20-30%)
- **50% faster debugging** with clear error messages

**Next Steps**:
1. Review and approve this plan
2. Create GitHub issues for each solution
3. Begin Week 1 implementation
4. Schedule weekly check-ins to track progress
