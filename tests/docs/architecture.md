# Stagehand Pipeline Architecture

This document describes the deterministic pipeline under `tests/`. All production code lives in `tests/scripts/`, with matching tests under `tests/__tests__/`.

## High-Level Flow

```
Plain Text Spec
   │  yarn bdd record
   ▼
Stagehand action graph
   │  yarn bdd compile
   ▼
Compiled `.feature` + `.steps.ts`
   │  yarn bdd run / yarn test
   ▼
Playwright execution
```

### Supporting Loops

- `yarn spec:collect-selectors` refreshes `tests/artifacts/selectors/registry.json` from the running app.
- `yarn spec:selector-drift` compares live scans against the registry and optionally updates it.
- `yarn bdd verify` enforces lint, coverage, selector, and secret checks before Playwright runs.

## Stage Modules

| Stage | Module | CLI | Responsibility | Dependencies |
|-------|--------|-----|----------------|-------------|
| Stagehand recording | `tests/scripts/stagehand/pipeline.ts` | `yarn bdd record` | Convert natural-language specs into deterministic action graphs with selectors/actions. | `stagehand/wrapper`, `action-graph/builder`, `tests/qa-specs/`.
| Graph persistence | `tests/scripts/action-graph/persistence.ts` | (implicit) | Persist graphs under `tests/artifacts/graph/` for traceability and replay. | `fs`, `uuid`.
| Graph compilation | `tests/scripts/action-graph/compiler.ts` | `yarn bdd compile`, `yarn bdd record` | Produce `.feature` files and Playwright step definitions derived from graphs. | `playwright-bdd`, `gherkin`, `tests/artifacts/selectors/registry.json`.
| Selector collection | `tests/scripts/collect-selectors.ts` | `yarn spec:collect-selectors` | Crawl routes with Playwright to capture selectors and update the registry. | Playwright Chromium adapter, registry utilities.
| Selector drift | `tests/scripts/selector-drift.ts` | `yarn spec:selector-drift` | Diff live scans vs registry and optionally apply updates for new/missing selectors. | `collect-selectors`, `tests/artifacts/selectors/registry.json`.
| Selector validation | `tests/scripts/validate-selectors.ts` | `yarn bdd verify` | Ensure graphs reference selectors present in the registry. | `tests/artifacts/graph/`, `ValidationReport` types.
| Coverage validation | `tests/scripts/validate-coverage.ts` | `yarn bdd verify` | Guarantee every feature step matches the approved vocabulary. | `tests/artifacts/step-vocabulary.json`.
| CI verification | `tests/scripts/ci-verify.ts` | `yarn bdd verify` | Aggregate validation gates, run secret scans, and bundle artifacts for CI. | `gherkin-lint`, `scanFilesForSecrets`, bundler helpers.

## Supporting Layers

- **LLM-Free Authoring**: Stagehand ghosts the UI using natural instructions; CI uses only the outputs.
- **Selector Registry**: `tests/artifacts/selectors/registry.json` captures stable locators; drift detection keeps it fresh.
- **CLI Helpers**: `tests/scripts/cli/` contains shared parsing logic for graph compilation and CI verification.
- **Shared Utilities**: `tests/scripts/utils/` hosts file operations, logging, concurrency, and secret scanning helpers.

## Documentation

- Use `tests/docs/architecture.md` to understand the high-level flow.
- Update `tests/docs/selector-best-practices.md` when selector strategies change.
- Keep `tests/docs/step-vocabulary-guide.md` aligned with `tests/artifacts/step-vocabulary.json` so coverage checks stay meaningful.
