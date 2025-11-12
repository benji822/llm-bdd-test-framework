---
globs:
  - 'tests/**/*.ts'
  - 'tests/**/*.js'
  - '**/*.feature'
  - 'tests/qa-specs/**/*.txt'
---

# BDD Testing Guidelines

## Overview

Plain-text QA specs in `tests/qa-specs/` drive Stagehand, which records deterministic action graphs. These graphs compile to `.feature` files and Playwright step definitions, ensuring CI runs only against committed artifacts.

## When to Invoke Oracle

Use Oracle when you're:
- Designing new Stagehand stages or selector validation logic
- Investigating flaky Playwright tests linked to generated graphs
- Reviewing CI validity flows or bundling artifacts
- Planning cross-cutting changes to selectors, vocabulary, or policy guards

Example: “Use Oracle to review the Stagehand graph compiler for stability and maintainability.”

## Pipeline Stages

### 1. Spec Authoring
- Keep specs focused (ideally < 1 KB per feature area).
- Write steps in natural language that describe observable behavior.
- Store the spec under `tests/qa-specs/` for Stagehand intake.

### 2. Stagehand Recording
- Run `yarn bdd record <spec>` to let Stagehand act through each instruction.
- Graphs live under `tests/artifacts/graph/` with deterministic selectors and metadata.
- Use `--dry-run` or `--skip-compile` to iterate without persisting compiled files.

### 3. Graph Compilation
- `yarn bdd compile <graph.json>` produces `.feature` and `.steps.ts` files consumed by `playwright-bdd`.
- Compiled artifacts appear under `tests/features/compiled` and `tests/steps/generated`.
- Features include metadata comments linking back to the originating graph for traceability.

### 4. Selector Hygiene
- `yarn spec:collect-selectors` crawls routes to refresh `tests/artifacts/selectors/registry.json`.
- `yarn spec:selector-drift` compares live scans against the committed registry to highlight missing or updated locators.

### 5. Validation & CI
- `yarn bdd verify` lints features, checks vocabulary coverage, validates selectors against graphs, scans for secrets, and bundles artifacts.
- `yarn ci:policy` ensures artifact directories exist and forbids authoring-mode flags inside CI.

## Shared Utilities

- `tests/scripts/utils/file-operations.ts` handles directories, JSON, and file read/write helpers.
- `tests/scripts/utils/logging.ts` emits structured events consumed by CLI wrappers.
- `tests/scripts/utils/secret-scanner.ts` powers secret detection used by CI.
- `tests/scripts/utils/concurrent.ts` coordinates parallel workloads (Stagehand recording, selector scanning).

## Common Issues

### Graph Compilation Failures
- Inspect `tests/artifacts/graph/*.json` for nodes missing selectors or deterministic actions.
- Re-record the spec with `yarn bdd record --dry-run` to capture the latest UI state.

### Selector Not Found
- Ensure the selector appears in `tests/artifacts/selectors/registry.json` after running `yarn spec:collect-selectors`.
- Validate the route/locator combination that Stagehand records matches the current UI.

### Vocabulary Coverage Gaps
- `tests/artifacts/step-vocabulary.json` defines approved step patterns.
- Adjust feature text or add new vocabulary entries while keeping the curated dictionary versioned.

### CI Policy Failures
- Run `yarn ci:policy` locally if CI rejects the run; it reports missing graphs/features/selectors early.
- Disable `AUTHORING_MODE` and `MOCK_LOGIN_APP` before packaging artifacts for CI.

## Oracle + Librarian Workflow

### Example: Validating a New Selector Strategy

**Step 1: Research (Librarian)**
```
"Use Librarian to research selector stabilization patterns in Playwright-based suites. Focus on caching and accessible locators."
```

**Step 2: Analyze (Oracle)**
```
"Design a selector strategy that prioritizes roles/labels, avoids brittle CSS, and integrates with `collect-selectors`."
```

**Step 3: Implement (Main Agent)**
```
"Update Stagehand recorder helpers, extend the selector registry schema, and document the approach."
```

**Step 4: Validate (Oracle)**
```
"Review the updated pipeline: graph recording, selectors, and Playwright steps for resilience." 
```
