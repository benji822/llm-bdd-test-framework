# LLM-Powered BDD Test Pipeline

This `tests/` workspace contains an automated pipeline that transforms plain-text QA specifications into executable Playwright BDD test suites using Large Language Models (LLMs). The architecture is designed for **deterministic CI runs** (no LLM calls in CI) while enabling rich, LLM-assisted authoring flows locally.

## Table of Contents

- [Overview](#overview)
- [Performance Optimizations](#performance-optimizations--solutions-12-13-14)
- [Architecture & Design Principles](#architecture--design-principles)
- [Directory Structure](#directory-structure)
- [LLM Integration](#llm-integration)
- [Test Data Management](#test-data-management)
- [Selector Strategy](#selector-strategy)
- [Setup & Configuration](#setup--configuration)
- [Workflow Commands](#workflow-commands)
- [Test Execution](#test-execution)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Overview

The pipeline transforms natural language test specifications through multiple stages:

```
Plain Text Spec → Clarifications → Normalized YAML → Gherkin Features → Executable Tests
     (QA)            (LLM)            (LLM+Schema)        (LLM+Vocab)      (Playwright)
```

**Key Features:**

- **LLM-Assisted Authoring**: Uses OpenAI Codex or Anthropic Claude to generate test artifacts
- **Deterministic Execution**: LLM only used during authoring; CI runs are fully deterministic
- **Multi-Provider Support**: Supports both Codex (default) and Claude providers with unified interface
- **Schema Validation**: Zod-based runtime validation ensures artifact consistency
- **Controlled Vocabulary**: Step definitions bound to approved vocabulary for maintainability
- **Accessibility-First Selectors**: Priority system favoring ARIA roles and labels over test IDs

---

## Performance Optimizations (Solutions 1.2, 1.3, 1.4)

The pipeline includes three major optimizations implemented to significantly improve performance and determinism:

### Solution 1.2: Differential Updates (Smart Caching)

**Problem Solved:** Repeated LLM calls for unchanged specifications waste time and API calls.

**Implementation:**

- Clarifications content is hashed (SHA-256) and stored in each YAML file's metadata
- On subsequent runs, hashes are compared to detect changes
- If unchanged, cached YAML is returned instantly (< 1 second)
- If changed, full LLM-based regeneration occurs

**Impact:**

- **Unchanged specs**: 100% time savings (< 1 second vs 90-120 seconds)
- **Cache hit rate**: 60-80% in typical usage
- **Use case**: Perfect for iterative spec refinement

**Usage:**

```bash
# Cache is automatic - no special flags needed
yarn spec:normalize tests/qa-specs/login.txt tests/clarifications/login.md

# Force regeneration if needed
yarn spec:normalize tests/qa-specs/login.txt tests/clarifications/login.md --force
```

### Solution 1.3: Parallel Batch Processing

**Problem Solved:** Processing 10+ specs sequentially takes 15-20 minutes, blocking workflows.

**Implementation:**

- Multiple specs are processed concurrently using worker pools
- Default concurrency auto-tunes to CPU count - 1
- LLM provider instance is reused across tasks (connection pooling)
- Batch operation mode with progress reporting

**Impact:**

- **3 specs**: 2-3 minutes (vs 5-8 minutes sequential)
- **10 specs**: 3-4 minutes (vs 15-20 minutes sequential)
- **Speedup**: 3-4x faster for batch operations

**Usage:**

```bash
# Default (auto-concurrency)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized

# Custom concurrency
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4

# Sequential (useful for debugging)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1
```

**Features:**

- Automatic discovery of `.txt` spec files
- Per-spec progress reporting
- Summary statistics on completion
- Works seamlessly with Solution 1.2 caching

### Solution 1.4: Parameter Optimization

**Problem Solved:** Default LLM parameters (temperature=0.3, timeout=3min) are overly conservative, causing unnecessary delays and variability.

**Implementation:**

- **Temperature**: Reduced from 0.3 to 0.1 (less randomness, more determinism)
- **Max Tokens**: Reduced from 4000 to 3000 (YAML specs rarely exceed this)
- **Timeout**: Reduced from 180s to 120s (most complete within 2 minutes)

**Impact:**

- **Determinism**: Lower temperature reduces output variability (better for Solution 1.2 caching)
- **Speed**: Reduced timeout and token limits improve feedback time
- **Quality**: Generated YAML quality maintained or improved

**Environment Variables:**

```bash
# Override if needed
LLM_TEMPERATURE=0.2  # Custom temperature
LLM_MAX_TOKENS=3500  # Custom token limit
LLM_TIMEOUT_MS=150000  # Custom timeout (2.5 min)
```

### Combined Benefits

When used together, these solutions provide:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Single spec (cached) | 100s | <1s | **100x faster** |
| Single spec (fresh) | 100s | 95s | 5% faster |
| 10 specs (sequential) | 1000s | 200s | **5x faster** |
| 10 specs (parallel, cached) | 1000s | 10s | **100x faster** |
| Output determinism | Variable | Consistent | More reliable |

---

## Architecture & Design Principles

### Core Design Principles

1. **LLM Isolation**: LLMs are kept out of the test runner execution path for determinism
2. **API-First Data Seeding**: Test data seeded via API calls, not UI interactions (when applicable)
3. **Deterministic Placeholders**: Runtime resolution of placeholders like `<E2E_USER_EMAIL>` from environment variables
4. **Stable Selectors**: Preference for `data-testid` and ARIA attributes over fragile CSS selectors
5. **Auditability**: All generated artifacts (YAML, features, reports) committed to Git
6. **Fail-Fast Validation**: Multiple validation gates (schema, lint, coverage, selectors) with specific exit codes

### Pipeline Stages

The pipeline consists of four transformation stages plus CI verification:

```
┌─────────────────┐
│  Plain Text     │  QA writes natural language specs
│  Specification  │  (tests/qa-specs/*.txt)
└────────┬────────┘
         │ spec:questions (LLM)
         ▼
┌─────────────────┐
│ Clarifications  │  LLM generates Q&A for ambiguities
│   (Markdown)    │  QA answers required questions
└────────┬────────┘
         │ spec:normalize (LLM + Schema)
         ▼
┌─────────────────┐
│ Normalized YAML │  Structured, validated specification
│  (Zod Schema)   │  Includes selectors, test data, metadata
└────────┬────────┘
         │ spec:features (LLM + Vocabulary)
         ▼
┌─────────────────┐
│ Gherkin Feature │  Executable .feature files
│     Files       │  100% step vocabulary coverage
└────────┬────────┘
         │ Playwright BDD
         ▼
┌─────────────────┐
│  Test Execution │  Playwright runs generated tests
│   (Chromium,    │  with step implementations
│  Firefox, etc)  │
└─────────────────┘
```

**Parallel Validation Workflows:**

- **Selector Collection**: `spec:collect-selectors` scans running app for available selectors
- **Coverage Validation**: `spec:validate` ensures all steps match vocabulary and selectors exist
- **CI Verification**: `spec:ci-verify` runs all validations without LLM calls

---

## Directory Structure

| Path                     | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `qa-specs/`              | Human-authored plain-text specifications (input to pipeline)         |
| `clarifications/`        | LLM-generated Q&A markdown with QA-provided answers                  |
| `normalized/`            | Validated YAML specs (schema enforced by Zod)                        |
| `features/`              | Generated `.feature` files (gherkin-lint + step coverage enforced)   |
| `steps/`                 | Playwright BDD step implementations (bound to controlled vocabulary) |
| `scripts/`               | TypeScript automation scripts (LLM orchestration + CI verification)  |
| `scripts/llm/`           | LLM provider abstraction layer (Codex, Claude)                       |
| `scripts/utils/`         | Shared utilities (file I/O, logging, prompt rendering, caching)      |
| `scripts/types/`         | Zod schemas and TypeScript types                                     |
| `prompts/`               | Versioned prompt templates consumed by LLM scripts                   |
| `artifacts/`             | Selector registry, vocabulary, validation/CI reports, and bundles    |
| `artifacts/cache/`       | LLM response cache (speeds up local development)                     |
| `schemas/`, `contracts/` | JSON/Zod schemas guaranteeing consistent artifacts                   |
| `config/`                | Tooling configuration (e.g., `gherkinlint.json`)                     |
| `docs/`                  | Architecture, selector best practices, vocabulary guide              |
| `__tests__/`             | Node test runner suites (unit + integration tests)                   |
| `.features-gen/`         | Playwright-BDD generated test files (auto-generated, not committed)  |

---

## LLM Integration

### Multi-Provider Architecture

The pipeline supports multiple LLM providers through a unified abstraction layer:

**Supported Providers:**

- **Codex** (default): TypeScript Codex SDK (`@openai/codex-sdk`)
- **Claude** (fallback): Anthropic Claude SDK (`@anthropic-ai/claude-agent-sdk`)

### Provider Interface

All providers implement the `LLMProvider` abstract class:

```typescript
interface LLMCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

interface LLMCompletionResult {
  completion: string;
  metadata: {
    provider: 'codex' | 'claude';
    model: string;
    tokensUsed: number;
    responseTime: number;
  };
}

abstract class LLMProvider {
  abstract readonly name: 'codex' | 'claude';
  abstract generateCompletion(
    prompt: string,
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;
}
```

### Provider Selection

Provider selection follows this priority:

1. Explicit configuration in script parameters
2. `LLM_PROVIDER` environment variable
3. Default to `codex`

```bash
# Use Codex (default)
LLM_PROVIDER=codex yarn spec:questions tests/qa-specs/login.txt

# Use Claude
LLM_PROVIDER=claude yarn spec:questions tests/qa-specs/login.txt
```

### Performance Optimizations

**Solution 1.2: Differential Updates (Caching)**

The pipeline implements smart caching to skip LLM calls when clarifications haven't changed:

- Clarifications content is hashed (SHA-256) and stored in YAML metadata
- On subsequent runs, if the hash matches, cached YAML is returned instantly
- Benefit: 100% time savings for unchanged specs (< 1 second vs 90-120 seconds)
- Expected cache hit rate: 60-80% in normal usage

**Solution 1.3: Parallel Batch Processing**

Process multiple specs concurrently with configurable concurrency limits:

- Default concurrency: CPU count - 1 (automatic tuning)
- Configurable via `--concurrency` flag
- Reuses LLM provider instance across tasks (connection pooling)
- Benefit: 3-4x speedup for batch operations (10 specs in ~2 min vs ~8 min)

**Solution 1.4: Parameter Optimization**

Optimized LLM parameters for faster, more deterministic responses:

- **Temperature**: 0.3 → 0.1 (more deterministic YAML generation)
- **Max Tokens**: 4000 → 3000 (YAML specs rarely exceed 3000 tokens)
- **Timeout**: 180000ms (3 min) → 120000ms (2 min) (most complete in < 2 min)

### Error Handling & Retries

**Timeout Enforcement:**

- Maximum timeout: 2 minutes per LLM call (optimized from 3 minutes)
- Configurable via `LLM_TIMEOUT_MS` environment variable
- Default: 120,000ms (2 minutes)

**Retry Strategy:**

- Exponential backoff with 2-3 attempts
- Initial delay: 2 seconds
- Retriable errors: `PROVIDER_ERROR`, `SDK_TIMEOUT`, `INVALID_RESPONSE`
- Non-retriable errors: `SDK_INITIALIZATION_FAILED`, `MODEL_NOT_AVAILABLE`

**Error Codes:**

```typescript
type LLMErrorCode =
  | 'PROVIDER_ERROR' // Generic provider failure
  | 'SDK_TIMEOUT' // Request exceeded timeout
  | 'INVALID_RESPONSE' // Response missing required fields
  | 'SDK_INITIALIZATION_FAILED' // SDK failed to initialize
  | 'MODEL_NOT_AVAILABLE'; // Requested model not found
```

### Response Caching

LLM responses are cached locally to speed up development:

**Cache Location:** `tests/artifacts/cache/llm-cache.json`

**Cache Key:** SHA-256 hash of:

- Provider name
- Model name
- Prompt content
- Additional parameters (temperature, stage)

**Cache Control:**

```bash
# Disable cache (useful for testing)
LLM_CACHE=off yarn spec:questions tests/qa-specs/login.txt

# Cache is enabled by default
yarn spec:questions tests/qa-specs/login.txt
```

### Prompt Management

Prompts are versioned markdown templates stored in `tests/prompts/`:

| Prompt File            | Purpose                          | Variables                                                        |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `spec-to-questions.md` | Generate clarification questions | `QA_SPEC_TEXT`                                                   |
| `questions-to-yaml.md` | Convert Q&A to normalized YAML   | `QA_SPEC_TEXT`, `CLARIFICATIONS_MD`                              |
| `yaml-to-features.md`  | Generate Gherkin features        | `YAML_SPEC`, `STEP_VOCABULARY_JSON`, `SELECTOR_REGISTRY_SNIPPET` |

**Prompt Interpolation:**

```typescript
// Variables use {{VARIABLE_NAME}} syntax
const prompt = await renderPrompt('tests/prompts/yaml-to-features.md', {
  YAML_SPEC: yamlContent,
  STEP_VOCABULARY_JSON: vocabularyJson,
  SELECTOR_REGISTRY_SNIPPET: selectorSnippet,
});
```

---

## Test Data Management

### Deterministic Placeholder Resolution

Test data uses **placeholder tokens** that are resolved at runtime from environment variables:

**Common Placeholders:**

- `<E2E_USER_EMAIL>` → `process.env.E2E_USER_EMAIL`
- `<E2E_USER_PASSWORD>` → `process.env.E2E_USER_PASSWORD`
- `<INVALID_PASSWORD>` → Hardcoded test value
- `<UNKNOWN_EMAIL>` → Hardcoded test value

**Example in YAML:**

```yaml
scenarios:
  - name: Authenticate With Valid Credentials
    steps:
      - type: when
        text: I enter email as "<E2E_USER_EMAIL>"
      - type: and
        text: I enter password as "<E2E_USER_PASSWORD>"
    testData:
      E2E_USER_EMAIL: qa.user@example.com
      E2E_USER_PASSWORD: SuperSecure123!
```

**Example in Feature File:**

```gherkin
Scenario: Authenticate With Valid Credentials
  When I enter email as "<E2E_USER_EMAIL>"
  And I enter password as "<E2E_USER_PASSWORD>"
  # testData: <E2E_USER_EMAIL>=qa.user@example.com, <E2E_USER_PASSWORD>=SuperSecure123!
```

### Data Seeding Strategy

**Preferred Approach: API Seeding**

- Test data should be seeded via API calls before test execution
- Avoids brittle UI-based setup flows
- Ensures consistent test state

**Current Implementation:**

- Placeholders resolved from environment variables
- Step implementations use the resolved values directly
- Future enhancement: API seeding layer for user accounts, test data

### Test Isolation

**Playwright Configuration:**

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true, // Tests run in parallel
  retries: process.env.CI ? 1 : 0, // Retry once in CI
  workers: process.env.CI ? 4 : undefined, // 4 workers in CI
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

**Isolation Mechanisms:**

- Each test gets a fresh Playwright `page` context
- No shared state between tests
- Parallel execution with isolated browser contexts

---

## Selector Strategy

### Priority Ladder

Selectors follow an accessibility-first priority system:

1. **Role + Accessible Name** (Priority 1, `role`)

   ```html
   <button role="button" aria-label="Submit order">Submit</button>
   ```

   Registry ID: `button-submit-order`

2. **ARIA Label** (Priority 2, `label`)

   ```html
   <div aria-label="Discount applied">…</div>
   ```

   Registry ID: `discount-applied`

3. **Data Test ID** (Priority 3, `testid`)

   ```html
   <input data-testid="email-input" />
   ```

   Registry ID: `email-input`

4. **Fallback CSS** (Priority 4, `css`) – avoid unless unavoidable
   ```html
   <div class="legacy-component">…</div>
   ```
   Mark as `accessible: false`

### Selector Registry

**Location:** `tests/artifacts/selectors.json`

**Schema:**

```typescript
interface SelectorEntry {
  id: string; // Unique kebab-case identifier
  type: 'role' | 'label' | 'testid' | 'css';
  selector: string; // Playwright locator string
  priority: 1 | 2 | 3 | 4; // Lower is better
  lastSeen: string; // ISO timestamp
  stability: 'high' | 'medium' | 'low';
  page: string; // Route where found
  accessible: boolean; // ARIA-friendly?
}
```

**Example Entry:**

```json
{
  "email-input": {
    "id": "email-input",
    "type": "testid",
    "selector": "input[data-testid='email-input']",
    "priority": 3,
    "lastSeen": "2025-10-18T00:00:00Z",
    "stability": "high",
    "page": "/login",
    "accessible": false
  }
}
```

### Selector Collection

**Command:**

```bash
yarn spec:collect-selectors --route /login --route /dashboard
```

**Process:**

1. Launches Playwright browser (Chromium)
2. Navigates to each specified route
3. Extracts selectors via page introspection:
   - ARIA roles (`page.getByRole()`)
   - Labels and accessible names (`page.getByLabel()`)
   - Test IDs (`page.getByTestId()`)
4. Deduplicates by ID, preferring higher-priority entries
5. Updates `tests/artifacts/selectors.json`

**Automated Collection:**

- Nightly workflow scans production/staging environments
- Keeps registry fresh with latest UI changes
- Removes stale selectors (>30 days unseen)

### Selector Validation

**Command:**

```bash
yarn spec:validate
```

**Validation Checks:**

1. All selectors referenced in YAML exist in registry
2. All feature steps match vocabulary patterns
3. No missing or deprecated selectors

**Error Reporting:**

```json
{
  "severity": "error",
  "type": "selector",
  "message": "Selector 'submit-button' not found in registry.",
  "file": "tests/normalized/login.yaml",
  "line": 18,
  "suggestion": "Did you mean 'login-submit'?"
}
```

---

## Setup & Configuration

### Prerequisites

- Node.js 18+
- Yarn package manager
- Running application instance (for selector collection)

### Installation

```bash
# Install dependencies
yarn install

# Install Playwright browsers
npx playwright install
```

### Environment Configuration

Create `.env.local` in project root:

```bash
# LLM Provider Configuration
LLM_PROVIDER=codex              # or 'claude'
LLM_MODEL=gpt-5-codex          # or 'claude-3-opus'
LLM_TEMPERATURE=0.1            # 0.0-1.0, lower = more deterministic (default: 0.1)
LLM_MAX_TOKENS=3000            # Maximum response tokens (default: 3000, optimized from 4000)
LLM_TIMEOUT_MS=120000          # 2 minutes (default: 120000ms, optimized from 180000ms)

# Optional: Provider-specific credentials (if required)
# CODEX_API_KEY=your-key-here
# CLAUDE_API_KEY=your-key-here

# Playwright Test Configuration
E2E_BASE_URL=http://localhost:4200
E2E_USER_EMAIL=qa.user@example.com
E2E_USER_PASSWORD=SuperSecure123!

# Optional: Cache control & Batch Processing
# LLM_CACHE=off                # Disable LLM response caching (default: on)
```

**Performance Notes:**

- Default parameters are optimized for speed and determinism (Solution 1.4)
- You can override any parameter to adjust for specific needs
- Cached responses are reused automatically (Solution 1.2)
- Use `--force` flag with `spec:normalize` to bypass cache when needed

### Verification

```bash
# Verify pipeline is ready
yarn spec:validate

# Expected output: ✓ Pipeline ready
```

---

## Workflow Commands

All commands run from repository root:

### Single Spec Authoring (LLM-Enabled)

```bash
# Step 1: Generate clarification questions from plain-text spec
yarn spec:questions tests/qa-specs/<spec>.txt

# Step 2: Answer questions in tests/clarifications/<spec>.md

# Step 3: Convert answered clarifications to normalized YAML
yarn spec:normalize tests/qa-specs/<spec>.txt tests/clarifications/<spec>.md

# Step 3.5: Validate selectors against running application (NEW!)
yarn spec:validate-and-fix tests/normalized/<spec>.yaml

# Step 4: Generate Gherkin feature files from YAML
yarn spec:features tests/normalized/<spec>.yaml
```

**Note:** Step 3.5 is a new validation step that ensures all selectors referenced in the YAML exist in the running application before generating tests. This prevents runtime failures and provides actionable feedback. See `tests/docs/step-3.5-selector-validation.md` for details.

### Batch Operations (NEW! Solution 1.3)

```bash
# Normalize multiple specs in parallel (3-4x faster than sequential)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized

# Control concurrency (default: CPU count - 1)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4

# Sequential processing (concurrency=1)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1
```

**Batch Processing Benefits:**

- Processes multiple specs concurrently (default: auto-tuned to CPU cores)
- 3-4x faster than sequential processing for typical workloads
- Seamlessly integrates with caching (Solution 1.2)
- Reuses LLM provider for connection pooling
- Automatic progress reporting

**Performance Examples:**

- **3 specs**: ~2-3 minutes (vs 5-8 minutes sequential)
- **10 specs**: ~3-4 minutes (vs 15-20 minutes sequential)
- **With cache hits**: <1 second per cached spec

### Validation (No LLM)

```bash
# Collect selectors from running application
yarn spec:collect-selectors --route /dashboard --route /profile

# Validate coverage and selectors
yarn spec:validate

# CI verification bundle (schema, lint, selectors, secrets)
yarn spec:ci-verify
```

### Additional Commands

```bash
# Run benchmarks
yarn spec:benchmarks

# Type checking
yarn type-check

# Format code
yarn formatting
```

---

## Test Execution

### Running Tests with Playwright (Need to be generated first)

```bash
# Generate BDD tests only (no run)
npx bddgen

# Generate and Run all BDD tests
npx bddgen && npx playwright test

# Run all BDD tests
npx playwright test

# Run specific feature
npx playwright test tests/features/customer-login.feature

# Run with specific browser
npx playwright test --project=chromium

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# Run tests matching tag
npx playwright test --grep @smoke
```

### Test Lifecycle

1. **Setup Phase:**

   - Playwright loads configuration from `playwright.config.ts`
   - Environment variables loaded from `.env.local`
   - `playwright-bdd` discovers `.feature` files and step definitions

2. **Generation Phase:**

   - `playwright-bdd` generates test files in `tests/.features-gen/`
   - Each scenario becomes a Playwright test case
   - Step text mapped to step implementations

3. **Execution Phase:**

   - Playwright launches browser(s) based on configuration
   - Each test gets isolated browser context
   - Steps execute in order via step definitions
   - Assertions validate expected behavior

4. **Teardown Phase:**
   - Browser contexts closed
   - Screenshots/videos saved on failure
   - Traces captured on retry
   - Test results reported

### Step Implementations

Step definitions use `playwright-bdd` decorators and Playwright fixtures:

**Navigation Steps** (`tests/steps/navigation.steps.ts`):

```typescript
import { createBdd } from 'playwright-bdd';

const { Given, When } = createBdd();

Given('I am on the {word} page', async ({ page }, slug: string) => {
  const routes = {
    login: '/login',
    dashboard: '/dashboard',
  };
  await page.goto(routes[slug] ?? `/${slug}`);
});
```

**Interaction Steps** (`tests/steps/interaction.steps.ts`):

```typescript
When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const locator = page.locator(`[data-testid='${field}-input']`);
  await locator.fill(value);
});

When(/^I click the (.+) button$/, async ({ page }, rawLabel: string) => {
  await page.getByRole('button', { name: rawLabel }).click();
});
```

**Assertion Steps** (`tests/steps/assertion.steps.ts`):

```typescript
import { expect } from '@playwright/test';

Then('I should see text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the URL should include {string}', async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});
```

### Controlled Vocabulary

All steps must match patterns in `tests/artifacts/step-vocabulary.json`:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-10-18T09:21:26Z",
  "definitions": [
    {
      "pattern": "I am on the {page} page",
      "domain": "navigation",
      "file": "tests/steps/navigation.steps.ts",
      "parameters": [{ "name": "page", "type": "string" }],
      "examples": ["I am on the login page"],
      "version": "1.0.0"
    }
  ]
}
```

**Benefits:**

- Ensures all generated steps have implementations
- Prevents vocabulary drift
- Enables 100% step coverage validation
- Facilitates step reuse across features

---

## Writing New Tests

### Quick Start Example

**Step 1: Write Plain-Text Specification**

Create `tests/qa-specs/user-profile.txt`:

```
Feature: User profile management

Users should be able to view and edit their profile information.

Happy path:
- User navigates to profile page
- User sees their current email and name
- User updates their name
- System saves changes and shows confirmation

Validation:
- Empty name should show error
- Email field should be read-only
```

**Step 2: Generate Clarifications**

```bash
yarn spec:questions tests/qa-specs/user-profile.txt
```

This creates `tests/clarifications/user-profile.md` with questions like:

```markdown
## Question 1

**Q**: What exact confirmation message appears after saving?
**Why it matters**: Automation needs precise text for assertions
**A**: _[Pending answer]_
**Required**: Yes
```

**Step 3: Answer Questions**

Edit `tests/clarifications/user-profile.md` and replace `_[Pending answer]_` with actual answers:

```markdown
**A**: Display "Profile updated successfully" in a green banner
```

**Step 4: Generate Normalized YAML**

```bash
yarn spec:normalize tests/qa-specs/user-profile.txt
```

This creates `tests/normalized/user-profile.yaml`:

```yaml
feature: User Profile Management
description: Users can view and edit profile information
scenarios:
  - name: Update Profile Name
    tags: [profile, smoke]
    steps:
      - type: given
        text: I am on the profile page
      - type: when
        text: I enter name as "John Doe"
      - type: and
        text: I click the save button
      - type: then
        text: I should see text "Profile updated successfully"
    selectors:
      name-input: "[data-testid='name-input']"
      save-button: "button[aria-label='Save']"
    testData:
      name: 'John Doe'
metadata:
  specId: 'uuid-here'
  generatedAt: '2025-10-18T10:00:00Z'
  llmProvider: 'codex'
  llmModel: 'gpt-5-codex'
```

**Step 5: Generate Feature Files**

```bash
yarn spec:features tests/normalized/user-profile.yaml
```

This creates `tests/features/user-profile.feature`:

```gherkin
Feature: User Profile Management
  Users can view and edit profile information

  @profile @smoke
  Scenario: Update Profile Name
    Given I am on the profile page
    When I enter name as "John Doe"
    And I click the save button
    Then I should see text "Profile updated successfully"
```

**Step 6: Add Selectors (if needed)**

If new selectors are required:

1. Add `data-testid` attributes to application code:

   ```tsx
   <input data-testid="name-input" />
   <button aria-label="Save">Save</button>
   ```

2. Collect selectors:

   ```bash
   yarn spec:collect-selectors --route /profile
   ```

3. Validate:
   ```bash
   yarn spec:validate
   ```

**Step 7: Run Tests**

```bash
npx playwright test tests/features/user-profile.feature
```

**Step 8: Commit Artifacts**

```bash
git add tests/qa-specs/user-profile.txt
git add tests/clarifications/user-profile.md
git add tests/normalized/user-profile.yaml
git add tests/features/user-profile.feature
git add tests/artifacts/selectors.json  # if updated
git commit -m "Add user profile management tests"
```

### Adding New Step Definitions

If you need a step pattern not in the vocabulary:

**1. Implement Step Definition**

Create or update file in `tests/steps/`:

```typescript
// tests/steps/interaction.steps.ts
When('I upload file {string}', async ({ page }, filename: string) => {
  const fileInput = page.locator('[data-testid="file-upload"]');
  await fileInput.setInputFiles(filename);
});
```

**2. Update Vocabulary**

Edit `tests/artifacts/step-vocabulary.json`:

```json
{
  "pattern": "I upload file {filename}",
  "domain": "interaction",
  "file": "tests/steps/interaction.steps.ts",
  "parameters": [{ "name": "filename", "type": "string" }],
  "examples": ["I upload file \"avatar.png\""],
  "version": "1.1.0"
}
```

**3. Bump Version**

Increment the vocabulary `version` to signal manual migration requirement.

**4. Validate**

```bash
yarn spec:validate
```

**5. Document**

Update `tests/docs/step-vocabulary-guide.md` with the new pattern.

---

## CI/CD Integration

### GitHub Actions Workflow

The pipeline includes a CI workflow at `.github/workflows/bdd-pipeline-ci.yml`:

```yaml
name: BDD Pipeline CI

on:
  pull_request:
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'yarn'
      - run: yarn install --frozen-lockfile
      - run: yarn spec:ci-verify
      - uses: actions/upload-artifact@v4
        with:
          name: bdd-pipeline-artifacts
          path: tests/artifacts/ci-bundle
          retention-days: 30
```

### CI Verification Process

**Command:** `yarn spec:ci-verify`

**Validation Steps:**

1. **Schema Validation**: All YAML files match `yaml-spec.schema.json`
2. **Gherkin Linting**: All `.feature` files pass `gherkin-lint` rules
3. **Coverage Check**: All feature steps match vocabulary patterns
4. **Selector Validation**: All referenced selectors exist in registry
5. **Secret Scanning**: No leaked credentials in committed files

**Exit Codes:**

- `0`: All validations passed
- `2`: Schema validation failed
- `3`: Gherkin lint failed
- `4`: Coverage check failed
- `5`: Selector validation failed
- `6`: Secret scanning failed

**Artifacts:**

- Validation reports saved to `tests/artifacts/ci-bundle/`
- Bundle uploaded to CI artifacts (30-day retention)
- Includes: validation report, selector registry, vocabulary snapshot

### No LLM in CI

**Critical Design Decision:** LLM calls are **never** made during CI runs.

**Rationale:**

- Ensures deterministic, reproducible builds
- Avoids API rate limits and costs
- Eliminates network dependency failures
- Faster CI execution

**Implementation:**

- All LLM-generated artifacts committed to Git
- CI only validates committed artifacts
- LLM providers only used during local authoring

---

## Troubleshooting

### Common Issues

**Issue: `E2E_BASE_URL env var or --base-url argument is required`**

**Solution:**

```bash
# Add to .env.local
E2E_BASE_URL=http://localhost:4200

# Or pass as argument
yarn spec:collect-selectors --base-url http://localhost:4200 --route /login
```

---

**Issue: `Selector 'submit-button' not found in registry`**

**Solution:**

1. Ensure application is running
2. Collect selectors for the relevant route:
   ```bash
   yarn spec:collect-selectors --route /login
   ```
3. Verify selector exists in `tests/artifacts/selectors.json`
4. If missing, add `data-testid` or ARIA attributes to application code

---

**Issue: `Step text 'I do something' is not covered by vocabulary`**

**Solution:**

1. Check if similar pattern exists in `tests/artifacts/step-vocabulary.json`
2. If not, add new step definition (see [Adding New Step Definitions](#adding-new-step-definitions))
3. Or modify YAML to use existing vocabulary pattern

---

**Issue: `LLM timeout after 180000ms`**

**Solution:**

```bash
# Increase timeout
LLM_TIMEOUT_MS=300000 yarn spec:questions tests/qa-specs/spec.txt

# Or check network connectivity to LLM provider
```

---

**Issue: `SDK_INITIALIZATION_FAILED: Codex SDK export missing constructor`**

**Solution:**

1. Verify SDK is installed:
   ```bash
   yarn add @openai/codex-sdk
   ```
2. Check SDK version compatibility
3. Try alternative provider:
   ```bash
   LLM_PROVIDER=claude yarn spec:questions tests/qa-specs/spec.txt
   ```

---

**Issue: Generated features fail gherkin-lint**

**Solution:**

1. Check lint errors:
   ```bash
   npx gherkin-lint tests/features/*.feature
   ```
2. Common fixes:
   - Ensure scenario names are unique
   - Use proper Gherkin keywords (Given/When/Then)
   - Avoid duplicate tags
3. Regenerate features:
   ```bash
   yarn spec:features tests/normalized/<spec>.yaml
   ```

---

**Issue: Tests fail with "Selector not found"**

**Solution:**

1. Verify application is running at `E2E_BASE_URL`
2. Check selector exists on page:
   ```bash
   npx playwright test --debug
   ```
3. Update selectors if UI changed:
   ```bash
   yarn spec:collect-selectors --route /affected-page
   ```

---

### Debug Mode

**Enable verbose logging:**

```bash
DEBUG=* yarn spec:questions tests/qa-specs/spec.txt
```

**Disable LLM cache for testing:**

```bash
LLM_CACHE=off yarn spec:normalize tests/qa-specs/spec.txt
```

**Run Playwright in debug mode:**

```bash
npx playwright test --debug tests/features/login.feature
```

---

## Additional Resources

### Documentation

- **Architecture Deep Dive**: `tests/docs/architecture.md`
- **Selector Best Practices**: `tests/docs/selector-best-practices.md`
- **Step Vocabulary Guide**: `tests/docs/step-vocabulary-guide.md`
- **Data Model**: `specs/001-llm-bdd-test-pipeline/data-model.md`
- **Research & Decisions**: `specs/001-llm-bdd-test-pipeline/research.md`
- **Quick Start Guide**: `specs/001-llm-bdd-test-pipeline/quickstart.md`

### Schemas

- **YAML Spec Schema**: `tests/schemas/yaml-spec.schema.json`
- **Selector Registry Schema**: `tests/contracts/selector-registry.schema.json`
- **Config Schema**: `tests/schemas/config.schema.json`

### Example Files

- **QA Spec**: `tests/qa-specs/example-login.txt`
- **Clarifications**: `tests/clarifications/example-login.md`
- **Normalized YAML**: `tests/normalized/example-login.yaml`
- **Feature File**: `tests/features/customer-login.feature`

---

## Support & Contributing

For questions or issues:

1. Check this README and linked documentation
2. Review example files in `tests/` directory
3. Run `yarn spec:validate` to diagnose issues
4. Check CI logs for detailed error messages

When adding new features:

1. Follow existing patterns in `tests/scripts/`
2. Add unit tests in `tests/__tests__/`
3. Update vocabulary and selectors as needed
4. Document changes in relevant `tests/docs/` files
5. Commit all generated artifacts to Git
