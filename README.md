# Stagehand BDD Test Framework

An automated testing framework that transforms plain-text QA specifications into executable Playwright BDD suites via Stagehand. Authoring runs interact with the app through natural language, while CI only consumes the deterministic outputs (`graph` → `feature` + `steps`).

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Write Your First Spec](#write-your-first-spec)
  - [Generate Tests](#generate-tests)
- [Best Practices](#best-practices)
- [Pipeline Overview](#pipeline-overview)
- [Architecture & Design Principles](#architecture--design-principles)
- [Directory Structure](#directory-structure)
- [Test Data Management](#test-data-management)
- [Selector Strategy](#selector-strategy)
- [Environment Variables](#environment-variables)
- [Workflow Commands](#workflow-commands)
  - [Stagehand-first authoring](#stagehand-first-authoring)
  - [Umbrella CLI helpers](#umbrella-cli-helpers)
  - [Supporting commands](#supporting-commands)
- [Test Execution](#test-execution)
  - [Playwright Commands](#playwright-commands)
  - [Test Lifecycle](#test-lifecycle)
  - [Step Implementations](#step-implementations)
  - [Controlled Vocabulary](#controlled-vocabulary)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
  - [GitHub Actions Example](#github-actions-example)
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

- ⚙️ **Stagehand-first recordings**: Plain-text specs feed Stagehand, which records deterministic action graphs and emits compiled artifacts.
- ✅ **Deterministic execution**: Playwright consumes committed graphs, features, steps, and selectors so CI never depends on live authoring.
- 🔍 **Selector hygiene**: `collect-selectors`, `selector-drift`, and `validate-selectors` keep the registry aligned with the UI.
- 🧪 **Validation guardrail**: `yarn bdd verify` enforces linting, vocabulary coverage, selector presence, and secret scanning before tests run.
- 📦 **Artifact bundling**: CI packages graphs, selectors, features, and reports in `tests/artifacts/ci-bundle/` for auditing.

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
AUTHORING_MODE=true    # allow stagehand recording locally
STAGEHAND_CACHE_DIR=tests/tmp/stagehand-cache
MOCK_LOGIN_APP=false

E2E_BASE_URL=http://localhost:4200
E2E_USER_EMAIL=qa.user@example.com
E2E_USER_PASSWORD=SuperSecure123!
E2E_INVALID_PASSWORD=WrongPassword!123
E2E_UNKNOWN_EMAIL=unknown.user@example.com
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
yarn bdd record tests/qa-specs/example-login.txt \
  --scenario "Happy path" \
  --graph-dir tests/artifacts/graph \
  --feature-dir tests/features/compiled \
  --steps-dir tests/steps/generated
```

`yarn bdd record` drives Stagehand through each step, stores the deterministic action graph under `tests/artifacts/graph`, and compiles the resulting `.feature`/`.steps.ts` artifacts under `tests/features/compiled` and `tests/steps/generated`. Use `--dry-run`, `--skip-compile`, or `--base-url` to shape the authoring iteration without having to rewrite previous artifacts.

## Best Practices

- Keep specs narrow (one feature area, ~1 KB) so Stagehand can focus on deterministic interactions.
- Author via `yarn bdd record` once per feature, keep the compiled `.feature` and `.steps.ts` artifacts under version control, and only re-run the recorder when behavior changes.
- Refresh selectors via `yarn spec:collect-selectors` (or `yarn spec:selector-drift`) before relying on new graphs, so the registry stays accurate.
- Validate compiled outputs locally with `yarn bdd verify` before pushing to CI; the same guards run under the `pretest` hook.

## Pipeline Overview

```
Plain Text Spec ──────────► yarn bdd record ──────────► Stagehand action graph ──────────► compile (features + steps) ──────────► Playwright execution
```

All CLI commands live in `tests/scripts/`, so the same modules can be invoked manually or via scripting. See `tests/docs/architecture.md` for a deeper architecture walkthrough.

## Architecture & Design Principles

1. **Stagehand First**: Plain-text specs are fed directly into Stagehand; LLM heuristics no longer participate in the CI path.
2. **Graph Determinism**: Every run snapshots a Stagehand action graph (`tests/artifacts/graph/`), ensuring compilation produces the same `.feature` and `.steps.ts` files each time.
3. **Selectors as First-Class Citizens**: Selector collection, drift detection, and validation work against `tests/artifacts/selectors/registry.json`, so Playwright can reuse stable locators.
4. **Validation Gatekeepers**: Linting, coverage, selectors, and secret scans run via `yarn bdd verify`, so failures surface before Playwright executes.

| Stage | Module | CLI Entry Point | Responsibility | Key Dependencies |
|-------|--------|-----------------|----------------|------------------|
| Stagehand recording | `tests/scripts/stagehand/pipeline.ts` | `yarn bdd record` | Interpret plain-text specs with Stagehand, persist deterministic graphs, and trigger compilation. | `stagehand/wrapper`, Playwright cache helpers, `action-graph` compiler. |
| Graph persistence | `tests/scripts/action-graph/persistence.ts` | (implicit) | Store versioned graphs under `tests/artifacts/graph` for repeatable test determinism. | `fs`, JSON utilities. |
| Graph compilation | `tests/scripts/action-graph/compiler.ts` | `yarn bdd compile` | Convert action graphs into `.feature` and `.steps.ts` artifacts consumed by Playwright BDD. | `gherkin`, `playwright-bdd`, selector metadata. |
| Selector hygiene | `tests/scripts/collect-selectors.ts` | `yarn spec:collect-selectors` | Scan live routes, refresh the selector registry, and cache locators for deterministic tests. | Playwright Chromium adapter, registry utilities. |
| Drift validation | `tests/scripts/selector-drift.ts` | `yarn spec:selector-drift` | Compare fresh scans to the committed registry, report missing/updated selectors, and optionally patch the registry. | `collect-selectors`, structured logging. |
| Validation | `tests/scripts/validate-selectors.ts`, `tests/scripts/validate-coverage.ts` | `yarn bdd verify` | Ensure graphs reference known selectors, features match approved vocabulary, and both deliverable types stay consistent. | `types/validation-report`, `utils/secret-scanner`. |
| CI verification | `tests/scripts/ci-verify.ts` | `yarn bdd verify` | Aggregate lint, coverage, selector, and secret checks; package graphs, features, selectors, and reports for audits. | `gherkin-lint`, `scanFilesForSecrets`, artifact bundler. |

Shared utilities live under `tests/scripts/utils/`, and Zod schemas under `tests/scripts/types/` keep contracts explicit.

## Directory Structure

```
.
├── tests/
│   ├── qa-specs/           # Human-authored plain-text specifications
│   ├── artifacts/
│   │   ├── graph/           # Stagehand action graphs (JSON)
│   │   ├── selectors/       # Registry, drift reports, validation logs
│   │   ├── ci-bundle/       # Packaged artifacts for CI
│   │   ├── validation-report.json
│   │   ├── ci-report.json
│   │   └── step-vocabulary.json
│   ├── features/           # Compiled Gherkin files (compiled/)
│   ├── steps/              # Generated Playwright step definitions
│   ├── scripts/            # Pipeline automation modules and CLI cores
│   ├── config/             # Tooling configuration (e.g., `gherkinlint.json`)
│   ├── schemas/            # Validation rule sets (e.g., action-graph schema)
│   └── __tests__/          # Unit and integration coverage via `node:test`
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── tsconfig.cucumber.json
```

| Path | Purpose |
|------|---------|
| `tests/qa-specs/` | Plain-text feature descriptions that feed Stagehand. |
| `tests/artifacts/graph/` | Deterministic action graphs captured during authoring. |
| `tests/features/compiled/` | Compiled `.feature` files consumed by Playwright BDD. |
| `tests/steps/generated/` | Step definitions produced from the graphs. |
| `tests/artifacts/selectors/` | Selector registry, drift reports, validation output. |
| `tests/scripts/` | CLI modules for Stagehand recording, selector utilities, validation, and CI. |
| `tests/scripts/utils/` | Shared helpers for file ops, logging, and concurrency. |
| `tests/scripts/types/` | Zod schemas and TypeScript typings for artifacts. |
| `tests/config/` | Tooling config such as `gherkinlint.json`. |
| `tests/schemas/` | Validation contracts for graphs, selectors, and reports. |
| `tests/__tests__/` | Automated coverage for every pipeline slice. |

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

The runtime `selectorResolver` also understands text/type-based heuristics. When a recorded step lacks a registry ID, it tries these strategies in the default order `role,label,text,type,name,placeholder,css,testid`. The `SELECTOR_STRATEGY` environment variable can override that order (e.g., `SELECTOR_STRATEGY=text` forces text-first resolution), and recorded hints such as the button text (`LOG IN`) or input type (`submit`) help it reach the right element even when no ARIA attributes are available.

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
| `AUTHORING_MODE` | No | `true` | Enable authoring policies for Stagehand runs (CI should set or leave `false`). |
| `STAGEHAND_CACHE_DIR` | No | `tests/tmp/stagehand-cache` | Directory used by Stagehand to persist cached plans and actions. |
| `MOCK_LOGIN_APP` | No | `false` | When `true`, Playwright swaps in a mock login UI for rapid feedback loops. |
| `OPENROUTER_API_KEY` | No | - | Optional API key for OpenRouter; set this locally to route Stagehand recording calls through OpenRouter (ignored in CI). |
| `OPENROUTER_MODEL` | No | `gpt-4o-mini` | Model identifier sent to OpenRouter when the API key is present. |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1/chat/completions` | Override the OpenRouter API endpoint (handy for proxies or testing). |
| `E2E_BASE_URL` | Yes | - | Application endpoint used by Playwright, selectors, and Stagehand. |
| `E2E_USER_EMAIL` | Yes | - | Default QA login email. |
| `E2E_USER_PASSWORD` | Yes | - | Default QA login password. |
| `E2E_INVALID_PASSWORD` | No | `WrongPassword!123` | Negative-case password used in failing scenarios. |
| `E2E_UNKNOWN_EMAIL` | No | `unknown.user@example.com` | Placeholder email for unknown-account flows. |

### OpenRouter authoring (optional)

Set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`/`OPENROUTER_BASE_URL`) when you want Stagehand to send LLM requests through OpenRouter during local authoring runs. The key is only honored when `AUTHORING_MODE` permits authoring and CI-related flags (`CI`, `GITHUB_ACTIONS`, `BUILDKITE`) are absent, so automation jobs stay deterministic without needing OpenRouter credentials. Running with OpenRouter does incur token charges for whichever upstream model you pick, so tip the cache balance toward the Stagehand cache and refer to https://openrouter.ai/pricing for your current per-token cost estimates.

## Workflow Commands

### Stagehand-first authoring (recommended)

```bash
yarn bdd record <specPath> [--scenario <name>] [--graph-dir <dir>] [--feature-dir <dir>] [--steps-dir <dir>] [--base-url <url>] [--dry-run] [--skip-compile]
```

This command parses the plain-text spec, lets Stagehand execute each step, stores the resulting action graph, and compiles deterministic features and step defs. Skip compilation (`--skip-compile`), run a dry run (`--dry-run`), or override the base URL as needed.

### Umbrella CLI helpers

```bash
# Bootstrap the workspace
yarn bdd init

# Compile saved action graphs into deterministic artifacts
yarn bdd compile tests/artifacts/graph/<spec>__scenario.json --feature-dir tests/features/compiled --steps-dir tests/steps/generated [--dry-run] [--no-metadata]

# Run the Playwright suite using the current artifacts
yarn bdd run [playwright args]

# Validate the generated artifacts (mirrors yarn spec:ci-verify)
yarn bdd verify [--normalized <dir>] [--features <dir>] [--selectors <path>] [--vocabulary <path>] [--report <path>] [--ci-report <path>] [--bundle <dir>] [--timeout <ms>]
```

`yarn bdd init` ensures the expected artifact directories (`tests/artifacts`, `tests/features/compiled`, `tests/steps/generated`, etc.) exist and bootstraps `.env.local` from `.env.example`. `yarn bdd compile` reuses the same compiler powering `yarn spec:compile-graph`, producing `.feature` and `.steps.ts` outputs from saved action graphs. `yarn bdd run` proxies to `yarn test`, forwarding any Playwright arguments you supply (for example `--headed` or `--grep`). `yarn bdd verify` wraps `yarn spec:ci-verify`, running the schema, lint, coverage, selector, and secret scans and accepting the same CLI flags. Run `yarn bdd help` to show this overview at any time.

### Stagehand CLI Primer

```bash
# Bootstrap the deterministic workspace
yarn bdd init

# Record a plain-text spec with Stagehand and persist the graph
yarn bdd record tests/qa-specs/example-login.txt --graph-dir tests/artifacts/graph --feature-dir tests/features/compiled --steps-dir tests/steps/generated

# Recompile saved graphs into `.feature` + `.steps.ts` artifacts
yarn bdd compile tests/artifacts/graph/<spec>__scenario.json --feature-dir tests/features/compiled --steps-dir tests/steps/generated

# Run the Playwright suite with the latest artifacts
yarn bdd run [playwright args]

# Validate artifacts (lint, coverage, selectors, secrets)
yarn bdd verify [--graph-dir <dir>] [--features <dir>] [--selectors <path>] [--vocabulary <path>] [--report <path>] [--ci-report <path>] [--bundle <dir>] [--timeout <ms>]
```

`yarn bdd verify` wraps the same validation stack that previously lived under `spec:ci-verify`; the command now works directly off compiled features and Stagehand graphs.

### Supporting Commands

```bash
# Keep the selector registry up to date with the running app
yarn spec:collect-selectors --route /login --route /dashboard

# Detect selector drift and optionally sync the registry
yarn spec:selector-drift --base-url https://app.example.com --route /login --route /dashboard

# Run Playwright tests (used by `yarn bdd run`)-level automation
yarn test
yarn test:headed
yarn test:ui
yarn test:report
```

### Stagehand Recording Demo

```bash
# Record and compile the example login spec
yarn bdd record tests/qa-specs/example-login.txt --scenario "Happy path" --graph-dir tests/artifacts/graph --feature-dir tests/features/compiled --steps-dir tests/steps/generated

# Run Playwright against the recorded artifacts
yarn bdd run --headed
```

Recording replays Stagehand step-by-step, compiles the resulting graphs, and stores the deterministic artifacts so Playwright can run without rerunning authoring layers. `MOCK_LOGIN_APP` can still toggle a lightweight HTML shim during Playwright execution.

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

`yarn bdd verify` performs:

1. **Gherkin linting** across compiled `.feature` files.
2. **Vocabulary coverage** checks for every step recorded by Stagehand.
3. **Selector validation** against `tests/artifacts/selectors/registry.json` and the stored action graphs.
4. **Secret scanning** to prevent credential leaks.
5. **Artifact packaging** under `tests/artifacts/ci-bundle/` for downstream audits.

Exit codes mirror the validation stages so CI can fail fast with actionable feedback:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `3` | Gherkin lint failed |
| `4` | Step coverage failed |
| `5` | Selector validation failed |
| `6` | Secret scan failed |
| `7` | Verification timeout |
| `9` | Unknown error |

CI validation strictly consumes committed graphs, selectors, and compiled artifacts—no authoring steps run during the verification job.

## Troubleshooting

### Graph Compilation Issues

- Inspect the recorded Stagehand graphs if a scenario refuses to compile; confirm every step exposes deterministic selectors and actions.
- Re-run `yarn bdd record` for a fresh graph once the UI behaviour stabilizes.

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
5. Commit generated artifacts (`tests/artifacts/graph/`, `tests/features/compiled/`, `tests/steps/generated/`, reports) to keep CI deterministic.
6. Open a pull request.

## License

MIT

## Support

- Review this README and linked documentation.
- Inspect the example assets in `tests/`.
- Run `yarn spec:validate` for fast local diagnostics.
- If issues persist, open a GitHub issue with logs and reproduction steps.
