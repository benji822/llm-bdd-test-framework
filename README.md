# LLM-Powered BDD Test Framework

An automated testing framework that transforms plain-text QA specifications into executable Playwright BDD test suites using Large Language Models (LLMs). Authoring flows stay fast and expressive, while CI is fully deterministic—no LLM calls run in CI pipelines.

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Write Your First Spec](#write-your-first-spec)
  - [Generate Tests](#generate-tests)
- [Best Practices](#best-practices)
- [Pipeline Overview](#pipeline-overview)
- [Performance Optimizations](#performance-optimizations)
- [Architecture & Design Principles](#architecture--design-principles)
- [Directory Structure](#directory-structure)
- [LLM Integration](#llm-integration)
  - [Multi-Provider Architecture](#multi-provider-architecture)
  - [Provider Interface](#provider-interface)
  - [Provider Selection](#provider-selection)
  - [LLM Performance Optimizations](#llm-performance-optimizations)
  - [Error Handling & Retries](#error-handling--retries)
  - [Response Caching](#response-caching)
  - [Prompt Management](#prompt-management)
- [Test Data Management](#test-data-management)
- [Selector Strategy](#selector-strategy)
- [Environment Variables](#environment-variables)
- [Workflow Commands](#workflow-commands)
  - [Single Spec Processing](#single-spec-processing)
  - [Batch Processing](#batch-processing)
  - [Validation & CI](#validation--ci)
  - [Additional Commands](#additional-commands)
- [Test Execution](#test-execution)
  - [Playwright Commands](#playwright-commands)
  - [Test Lifecycle](#test-lifecycle)
  - [Step Implementations](#step-implementations)
  - [Controlled Vocabulary](#controlled-vocabulary)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
  - [GitHub Actions Example](#github-actions-example)
  - [CI Verification Process](#ci-verification-process)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Features

- 🤖 **LLM-Assisted Authoring**: Uses OpenAI Codex or Anthropic Claude to generate test artifacts.
- ✅ **Deterministic Execution**: LLMs only run during authoring; CI pipelines validate pre-generated assets.
- 🚀 **Performance Optimized**: Differential caching, parallel processing, and tuned parameters minimize turnaround time.
- 📝 **Schema Validation**: Zod-backed schemas enforce structure for YAML specs, selectors, and reports.
- 🎯 **Controlled Vocabulary**: Step definitions are bound to an approved vocabulary to guarantee coverage.
- ♿ **Accessibility-First Selectors**: Prioritizes ARIA roles and labels before falling back to test IDs.

## Quick Start

### Installation

```bash
npm install
# or
yarn install
```

### Configuration

Copy the example environment file and configure it for your workspace:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```env
LLM_PROVIDER=codex       # or "claude"
LLM_MODEL=gpt-5-codex

OPENAI_API_KEY=your_key_here
# or
ANTHROPIC_API_KEY=your_key_here

E2E_BASE_URL=http://localhost:4200
E2E_USER_EMAIL=qa.user@example.com
E2E_USER_PASSWORD=SuperSecure123!
```

### Write Your First Spec

Create a plain-text specification in `tests/qa-specs/`:

**tests/qa-specs/login.txt**

```
Feature: User login

Users authenticate with email and password.

Happy path:
- User opens the login page.
- User enters valid email and password.
- User clicks submit button.
- User sees welcome message.

Invalid credentials:
- User enters wrong password.
- System shows error message.
```

### Generate Tests

```bash
# 1. Generate clarification questions (LLM)
yarn spec:questions tests/qa-specs/login.txt

# 2. Answer questions in tests/clarifications/login.md

# 3. Normalize to YAML (LLM + schema validation)
yarn spec:normalize tests/qa-specs/login.txt tests/clarifications/login.md

# 4. (Optional) Validate selectors against the running app before feature generation
yarn spec:validate-and-fix tests/normalized/login.yaml

# 5. Generate Gherkin features
yarn spec:features tests/normalized/login.yaml

# 6. Run the Playwright suite
yarn test
```

## Best Practices

- Keep specs small—one feature area per file (< 1 KB).
- Use batch normalization for multiple specs to maximize caching benefits.
- Commit generated YAML and feature files for deterministic CI execution.
- Answer all required clarification questions before normalization.
- Start with TODO selectors, then resolve them with `yarn spec:validate-and-fix`.
- Run the full pipeline locally before pushing to catch regressions early.

## Pipeline Overview

```
Plain Text Spec ──┐
                  │  yarn spec:questions         ┌─────────────────────┐
                  ├─> Clarification Markdown ───►│ generate-questions  │
                  │                              └─────────────────────┘
                  │  yarn spec:normalize         ┌─────────────────────┐
                  ├─> Normalized YAML ──────────►│ normalize-yaml      │
Selector Registry │                              └─────────────────────┘
                  │  yarn spec:validate-and-fix  ┌─────────────────────┐
(Optional Gate)   ├─> Selector Validation ──────►│ validate-and-fix    │
                  │                              └─────────────────────┘
                  │  yarn spec:features          ┌─────────────────────┐
Step Vocabulary   ├─> Gherkin Features ─────────►│ generate-features   │
                  │                              └─────────────────────┘
                  │  yarn spec:ci-verify         ┌─────────────────────┐
                  └─> CI Verification ─────────►│ ci-verify            │
                                                 └─────────────────────┘
```

Every CLI in `package.json` wraps a module in `tests/scripts/`, so you can orchestrate stages programmatically if needed. For a deep dive into stage wiring, see `tests/docs/architecture.md`.

## Performance Optimizations

### Solution 1.2: Differential Updates (Smart Caching)

- Clarifications content is hashed (SHA-256) and stored in YAML metadata.
- If the hash matches on subsequent runs, cached YAML is returned instantly (< 1 second).
- Ideal for iterative spec refinement; typical cache hit rate is 60–80%.
- Force regeneration when needed with `yarn spec:normalize ... --force`.

### Solution 1.3: Parallel Batch Processing

- Processes multiple specs concurrently using dynamic worker pools.
- Default concurrency auto-tunes to `(CPU cores - 1)`; override via `--concurrency`.
- Reuses the LLM provider across tasks for connection pooling and progress reporting.
- 3–4× faster than sequential processing for 10-spec workloads.

### Solution 1.4: Parameter Optimization

- Temperature reduced to 0.1 for deterministic outputs.
- Max tokens limited to 3000 and timeout lowered to 120s to reduce latency.
- Override via environment variables when experimentation is required.

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| Single spec (cached) | 100s | <1s | **100× faster** |
| Single spec (fresh) | 100s | 95s | 5% faster |
| 10 specs (sequential) | 1000s | 200s | **5× faster** |
| 10 specs (parallel, cached) | 1000s | 10s | **100× faster** |
| Output determinism | Variable | Consistent | Massive stability gain |

## Architecture & Design Principles

1. **LLM Isolation**: Authoring uses LLMs; execution and CI are deterministic.
2. **API-First Data Seeding**: Prefer API-backed setup over brittle UI flows.
3. **Deterministic Placeholders**: Resolve values such as `<E2E_USER_EMAIL>` from environment variables.
4. **Stable Selectors**: Favor ARIA roles and `data-testid` attributes before CSS fallbacks.
5. **Auditability**: Commit generated artifacts so CI and reviewers can diff outputs.
6. **Fail-Fast Validation**: Multiple gates (schema, lint, coverage, selectors, secrets) each with dedicated exit codes.

| Stage | Module | CLI Entry Point | Responsibility | Key Dependencies |
|-------|--------|-----------------|----------------|------------------|
| Clarification | `generate-questions.ts` | `tests/scripts/cli-questions.ts` (`yarn spec:questions`) | Render prompts, call LLM, persist Q&A markdown. | `llm/`, prompt renderer, logging. |
| Normalization | `normalize-yaml.ts` | `tests/scripts/cli-normalize.ts` (`yarn spec:normalize`, `yarn spec:normalize:batch`) | Convert spec + clarifications into schema-validated YAML with caching. | `llm/`, `utils/hash`, `utils/yaml-parser`, `types/yaml-spec`. |
| Selector Hygiene | `collect-selectors.ts` | `tests/scripts/cli-collect-selectors.ts` (`yarn spec:collect-selectors`) | Crawl the running app and refresh `tests/artifacts/selectors/registry.json`. | Playwright Chromium runner, `utils/file-operations`. |
| Optional Gate | `validate-and-fix-selectors.ts` | `tests/scripts/cli-validate-and-fix.ts` (`yarn spec:validate-and-fix`) | Validate selectors referenced in YAML, emit reports, optionally auto-fix. | Playwright, `types/yaml-spec`, logging. |
| Drift Validation | `selector-drift.ts` | `tests/scripts/cli-selector-drift.ts` (`yarn spec:selector-drift`) | Compare live scans against the registry, emit drift reports, optionally apply updates. | `collect-selectors`, selector registry helpers. |
| Feature Generation | `generate-features.ts` | `tests/scripts/cli-features.ts` (`yarn spec:features`) | Produce `.feature` files and enforce vocabulary coverage and lint rules. | `validate-coverage`, `gherkin-lint`, step vocabulary JSON. |
| Graph Compilation | `action-graph/compiler.ts` | `tests/scripts/cli-compile-graph.ts` (`yarn spec:compile-graph`) | Convert deterministic action graphs into `.feature` files and localized step definitions. | `action-graph`, selector registry, `utils/file-operations`. |
| Validation (offline) | `validate-selectors.ts`, `validate-coverage.ts` | `tests/scripts/cli-validate.ts` (`yarn spec:validate`) | Run selector and vocabulary checks without opening a browser. | `types/validation-report`, selector registry. |
| CI Verification | `ci-verify.ts` | `tests/scripts/cli-ci-verify.ts` (`yarn spec:ci-verify`) | Aggregate schema, lint, coverage, selector, and secret checks; bundle artifacts. | `utils/secret-scanner`, logging, validation modules. |
| Benchmarks | `benchmarks.ts` | `yarn spec:benchmarks` | Measure throughput across stages to catch performance regressions. | `utils/benchmark-runner`. |

Shared utilities live under `tests/scripts/utils/`, and Zod schemas under `tests/scripts/types/` keep contracts explicit.

## Directory Structure

```
.
├── tests/
│   ├── qa-specs/           # Plain-text specifications
│   ├── clarifications/     # LLM-generated Q&A (with manual answers)
│   ├── normalized/         # Schema-validated YAML specs
│   ├── features/           # Generated Gherkin features
│   ├── steps/              # Playwright BDD step implementations
│   ├── scripts/            # Pipeline automation scripts
│   ├── prompts/            # Versioned prompt templates
│   ├── artifacts/          # Selector registry, vocabulary, reports, caches
│   ├── config/             # Tooling configuration (e.g., gherkinlint)
│   ├── schemas/            # JSON schemas for validation
│   └── __tests__/          # Unit and integration tests (node:test + tsx)
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── tsconfig.cucumber.json
```

| Path | Purpose |
|------|---------|
| `tests/qa-specs/` | Human-authored plain-text specifications (pipeline input). |
| `tests/clarifications/` | Markdown Q&A generated by the LLM and answered by QA. |
| `tests/normalized/` | Canonical YAML specs validated by Zod. |
| `tests/features/` | Generated `.feature` files consumed by Playwright BDD. |
| `tests/steps/` | Step implementations referencing the selector registry and vocabulary. |
| `tests/scripts/` | TypeScript modules and CLI wrappers for every stage. |
| `tests/scripts/llm/` | Provider abstraction, timeout handling, retries, logging. |
| `tests/scripts/utils/` | Shared utilities (file I/O, hashing, prompt rendering, caching). |
| `tests/scripts/types/` | Zod schemas and TypeScript typings for artifacts and reports. |
| `tests/prompts/` | Prompt templates rendered before LLM calls. |
| `tests/artifacts/` | Selector registry (`selectors/registry.json`), drift reports (`selectors/drift-report.json`), vocabulary, validation reports, CI bundles, caches. |
| `tests/config/` | Tool configuration such as `gherkinlint.json`. |
| `tests/schemas/` & `tests/contracts/` | JSON schemas enforced across the pipeline. |
| `tests/__tests__/` | Unit and integration coverage built on `node:test` with `tsx --test`. |

## LLM Integration

### Multi-Provider Architecture

The provider abstraction supports multiple LLM vendors:

- **Codex** (default) via `@openai/codex-sdk`
- **Claude** via `@anthropic-ai/claude-agent-sdk`

### Provider Interface

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

Priority order:

1. Explicit CLI parameter
2. `LLM_PROVIDER` environment variable
3. Default to `codex`

```bash
# Use Codex (default)
LLM_PROVIDER=codex yarn spec:questions tests/qa-specs/login.txt

# Switch to Claude
LLM_PROVIDER=claude yarn spec:questions tests/qa-specs/login.txt
```

### LLM Performance Optimizations

- Differential caching (Solution 1.2) short-circuits normalization when clarifications are unchanged.
- Parallel batch normalization (Solution 1.3) reuses provider instances across specs.
- Tuned parameters (Solution 1.4) align model configuration with deterministic outputs.

### Error Handling & Retries

- Timeout enforced at 120 000 ms by default (`LLM_TIMEOUT_MS` override).
- Exponential backoff retries cover transient `PROVIDER_ERROR`, `SDK_TIMEOUT`, and `INVALID_RESPONSE` failures.
- Non-retriable codes (`SDK_INITIALIZATION_FAILED`, `MODEL_NOT_AVAILABLE`) bubble up immediately with actionable errors.

### Response Caching

- Cache file: `tests/artifacts/cache/llm-cache.json`.
- Key includes provider, model, prompt content, and parameters.
- Disable cache for debugging with `LLM_CACHE=off`.

### Prompt Management

Prompts live in `tests/prompts/` and are rendered with simple variable interpolation.

| Prompt | Purpose | Key Variables |
|--------|---------|---------------|
| `spec-to-questions.md` | Generate clarification questions from plain-text specs. | `QA_SPEC_TEXT` |
| `questions-to-yaml.md` | Convert spec + clarifications into normalized YAML. | `QA_SPEC_TEXT`, `CLARIFICATIONS_MD` |
| `yaml-to-features.md` | Produce `.feature` files with full vocabulary coverage. | `YAML_SPEC`, `STEP_VOCABULARY_JSON`, `SELECTOR_REGISTRY_SNIPPET` |

## Test Data Management

- Placeholders such as `<E2E_USER_EMAIL>` resolve to environment variables at runtime.
- YAML `testData` blocks capture per-scenario inputs so Playwright steps can consume deterministic values.

```yaml
scenarios:
  - name: Authenticate With Valid Credentials
    steps:
      - type: when
        text: I enter email as "<E2E_USER_EMAIL>"
    testData:
      E2E_USER_EMAIL: qa.user@example.com
```

During execution the step implementation reads `process.env.E2E_USER_EMAIL`, ensuring secrets never leak into committed files.

## Selector Strategy

1. **Role + Accessible Name** (`priority: 1`)  
   `<button role="button" aria-label="Submit order">Submit</button>` → `button-submit-order`
2. **ARIA Label** (`priority: 2`)  
   `<div aria-label="Discount applied">…</div>` → `discount-applied`
3. **Data Test ID** (`priority: 3`)  
   `<input data-testid="email-input" />` → `email-input`
4. **Fallback CSS** (`priority: 4`) only when unavoidable.

Selector registry entries (`tests/artifacts/selectors/registry.json`) follow:

```json
{
  "email-input": {
    "id": "email-input",
    "type": "testid",
    "selector": "input[data-testid='email-input']",
    "priority": 3,
    "lastSeen": "2025-10-19T10:12:34Z",
    "stability": "high",
    "page": "/login",
    "accessible": true
  }
}
```

`yarn spec:collect-selectors` refreshes the registry by crawling live routes with Playwright. Run `yarn spec:selector-drift --base-url <url>` to compare a fresh scan against the committed registry, emit `tests/artifacts/selectors/drift-report.json`, and optionally sync updates with `--apply`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | Yes | `codex` | `codex` or `claude`. |
| `LLM_MODEL` | Yes | - | Provider-specific model identifier. |
| `OPENAI_API_KEY` | If `codex` | - | OpenAI API key. |
| `ANTHROPIC_API_KEY` | If `claude` | - | Anthropic API key. |
| `E2E_BASE_URL` | Yes | - | Application URL used by Playwright and selector validation. |
| `E2E_USER_EMAIL` | Yes | - | Default QA account email. |
| `E2E_USER_PASSWORD` | Yes | - | Default QA account password. |
| `LLM_TEMPERATURE` | No | `0.1` | LLM sampling temperature (0–1). |
| `LLM_MAX_TOKENS` | No | `3000` | Max tokens per LLM request. |
| `LLM_TIMEOUT_MS` | No | `120000` | Timeout per LLM request in milliseconds. |
| `LLM_CACHE` | No | `on` | Set to `off` to bypass local cache. |
| `AUTHORING_MODE` | No | `false` | Set to `true` during local authoring sessions to allow live Stagehand/LLM calls; must remain `false`/unset in CI. |
| `STAGEHAND_CACHE_DIR` | No | `.stagehand-cache` | Directory used by the Stagehand disk cache shared between authoring runs and CI verification. |

## Workflow Commands

### Single Spec Processing

```bash
# Generate clarification questions
yarn spec:questions <spec.txt>

# Normalize to YAML (uses cache automatically)
yarn spec:normalize <spec.txt> <clarifications.md> [output.yaml]

# Force regeneration (bypass cache)
yarn spec:normalize <spec.txt> <clarifications.md> --force

# Generate Gherkin features
yarn spec:features <normalized.yaml>
```

### Batch Processing

```bash
# Normalize all specs in a directory with auto-concurrency
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized

# Specify concurrency (default: CPU cores - 1)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4

# Sequential processing for debugging
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1
```

### Validation & CI

```bash
# Collect selectors from the running application
yarn spec:collect-selectors --route /login --route /dashboard

# Compare live scan vs registry and emit drift report (add --apply to sync)
yarn spec:selector-drift --base-url https://app.example.com --route /login --route /dashboard

# Validate vocabulary coverage and selector usage (no browser)
yarn spec:validate

# Optional Step 3.5 gate: validate selectors directly against the live app
yarn spec:validate-and-fix tests/normalized/example.yaml

# Deterministic CI verification (schema, lint, coverage, selectors, secrets)
yarn spec:ci-verify
```

### Additional Commands

```bash
# Benchmark pipeline performance across stages
yarn spec:benchmarks

# Compile saved action graphs into deterministic features + step defs
yarn spec:compile-graph tests/artifacts/graph/<spec>__scenario.json --feature-dir tests/features/compiled --steps-dir tests/steps/generated

# Run Playwright tests
yarn test
yarn test:headed
yarn test:ui
yarn test:report
```

## Test Execution

### Playwright Commands

```bash
# Run the entire suite headlessly
yarn test

# Run in headed mode
yarn test:headed

# Launch Playwright UI mode
yarn test:ui

# Show the latest HTML report
yarn test:report
```

### Test Lifecycle

1. **Setup**: Playwright reads `playwright.config.ts`, loads environment variables, and prepares test fixtures.
2. **Generation**: `playwright-bdd` converts `.feature` files into executable tests under `tests/.features-gen/`.
3. **Execution**: Each step resolves to its implementation, using selectors from the registry and environment-backed data.
4. **Teardown**: Browser contexts close, and screenshots/videos/traces are collected for failures.

### Step Implementations

**Navigation** (`tests/steps/navigation.steps.ts`):

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

**Interaction** (`tests/steps/interaction.steps.ts`):

```typescript
import { createBdd } from 'playwright-bdd';

const { When } = createBdd();

When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const locator = page.locator(`[data-testid='${field}-input']`);
  await locator.fill(value);
});

When(/^I click the (.+) button$/, async ({ page }, rawLabel: string) => {
  await page.getByRole('button', { name: rawLabel }).click();
});
```

**Assertions** (`tests/steps/assertion.steps.ts`):

```typescript
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

Then('I should see text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the URL should include {string}', async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});
```

### Controlled Vocabulary

All Gherkin steps must match patterns in `tests/artifacts/step-vocabulary.json`:

```json
{
  "version": "1.0.0",
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

Benefits:

- Guarantees step implementations exist for every generated phrase.
- Enables comprehensive coverage checks during `yarn spec:validate`.
- Simplifies maintenance by centralizing approved wording.

## Writing New Tests

1. **Draft the Spec**: Add a plain-text feature under `tests/qa-specs/`.
2. **Generate Clarifications**: `yarn spec:questions` prompts for missing details.
3. **Answer Required Questions**: Edit the generated markdown to replace `_Pending answer_` entries.
4. **Normalize**: `yarn spec:normalize` produces schema-validated YAML with selectors and test data.
5. **Validate Selectors (Optional)**: `yarn spec:validate-and-fix` catches missing locators before feature generation.
6. **Generate Features**: `yarn spec:features` outputs `.feature` files with 100% vocabulary coverage.
7. **Execute**: `yarn test` runs the generated suite in Playwright.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: BDD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Verify test artifacts
        run: yarn spec:ci-verify

      - name: Run Playwright tests
        run: yarn test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}

      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### CI Verification Process

`yarn spec:ci-verify` performs:

1. **Schema validation** for all YAML specs.
2. **Gherkin linting** across generated `.feature` files.
3. **Vocabulary coverage** checks.
4. **Selector reconciliation** against `tests/artifacts/selectors/registry.json`.
5. **Secret scanning** to prevent credential leaks.
6. **Artifact packaging** under `tests/artifacts/ci-bundle/`.

Exit codes:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Schema validation failed |
| `3` | Gherkin lint failed |
| `4` | Step coverage failed |
| `5` | Selector validation failed |
| `6` | Secret scan failed |
| `7` | Verification timeout |
| `9` | Unknown error |

No LLM calls run in CI—only committed artifacts are validated.

## Troubleshooting

### LLM Request Timeout

- Increase `LLM_TIMEOUT_MS` in `.env.local`.
- Check API quota and network connectivity.
- Retry with `LLM_PROVIDER=claude` if Codex is degraded.

### Missing Required Fields During Normalization

- Review the generated clarification markdown; answer all `**Required: Yes**` questions.
- Confirm the YAML schema in `tests/schemas/yaml-spec.schema.json` for required properties.

### Selector Not Found in Registry

1. Ensure the application is running at `E2E_BASE_URL`.
2. Recollect selectors: `yarn spec:collect-selectors --route /login`.
3. Verify the selector exists in `tests/artifacts/selectors/registry.json`.
4. Add `data-testid` or ARIA attributes in the application if necessary.

### Step Pattern Not Covered by Vocabulary

- Check `tests/artifacts/step-vocabulary.json` for a matching pattern.
- Update step implementations in `tests/steps/`.
- Document changes in `tests/docs/step-vocabulary-guide.md`.

### CLI Fails with `E2E_BASE_URL env var or --base-url argument is required`

- Add the variable to `.env.local` or pass `--base-url` when running the command.

## Documentation

- `tests/docs/architecture.md` — Stage-by-stage architecture and execution flow.
- `tests/docs/selector-best-practices.md` — Guidance for building resilient selectors and maintaining the registry.
- `tests/docs/step-vocabulary-guide.md` — Evolving the approved Gherkin vocabulary and step implementations.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Add or update tests alongside your changes.
4. Document pipeline updates in the relevant `tests/docs/` files.
5. Commit generated artifacts (`tests/normalized/`, `tests/features/`, reports) to keep CI deterministic.
6. Open a pull request.

## License

MIT

## Support

- Review this README and linked documentation.
- Inspect the example assets in `tests/`.
- Run `yarn spec:validate` for fast local diagnostics.
- If issues persist, open a GitHub issue with logs and reproduction steps.
