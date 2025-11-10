# Pipeline Architecture

This document describes how the LLM-powered BDD pipeline is wired together inside the `tests/` workspace. All production code for the pipeline lives under `tests/scripts/` with matching unit and integration tests in `tests/__tests__/`.

## High-Level Flow

```
Plain Text Spec
   │  yarn spec:questions
   ▼
Clarification Markdown
   │  yarn spec:normalize / spec:normalize:batch
   ▼
Schema-Validated YAML
   │  yarn spec:validate-and-fix (optional gate)
   ▼
Gherkin Features
   │  yarn spec:features
   ▼
Playwright Step Execution

Auxiliary:
  • yarn spec:collect-selectors → updates selector registry
  • yarn spec:validate → coverage + selector drift checks
  • yarn spec:ci-verify → CI bundle + deterministic reporting
```

## Stagehand-first authoring CLI

`yarn bdd record <specPath>` interprets a plain-text spec (from `tests/qa-specs/`), drives Stagehand for each step, persists the resulting action graph, and compiles deterministic `.feature`/`.steps.ts` artifacts without the clarifications → normalization stages. It is the Stagehand-centric alternative for authors who prefer working directly with natural-language specs and want to keep CI runs deterministic.

Every CLI command in `package.json` is a thin wrapper around a TypeScript module that can also be imported for programmatic use.

## Stage Modules

| Stage | Module | CLI entry point | Responsibility | Key dependencies |
|-------|--------|-----------------|----------------|------------------|
| Clarification | `generate-questions.ts` | `tests/scripts/cli-questions.ts` (`yarn spec:questions`) | Render prompt, call LLM provider, persist Q&A markdown. | `llm/`, `prompt-loader`, `logging`. |
| Normalization | `normalize-yaml.ts` | `tests/scripts/cli-normalize.ts` (`yarn spec:normalize`, `yarn spec:normalize:batch`) | Convert spec + clarifications to normalized YAML, enforce schema, reuse cache when clarifications unchanged. | `llm/`, `utils/hash`, `utils/yaml-parser`, `types/yaml-spec`. |
| Selector hygiene | `collect-selectors.ts` | `tests/scripts/cli-collect-selectors.ts` (`yarn spec:collect-selectors`) | Crawl running app with Playwright and refresh `tests/artifacts/selectors/registry.json`. | Playwright Chromium adapter, `utils/file-operations`. |
| Optional pre-flight | `validate-and-fix-selectors.ts` | `tests/scripts/cli-validate-and-fix.ts` (`yarn spec:validate-and-fix`) | Validate selectors referenced in YAML against the live app, emit rich report, optionally auto-fix. | Playwright, `types/yaml-spec`, `utils/logging`. |
| Drift validation | `selector-drift.ts` | `tests/scripts/cli-selector-drift.ts` (`yarn spec:selector-drift`) | Compare fresh scans against the registry, emit drift reports, optionally apply updates. | `collect-selectors.ts`, selector registry helpers. |
| Feature generation | `generate-features.ts` | `tests/scripts/cli-features.ts` (`yarn spec:features`) | Produce `.feature` files, enforce vocabulary coverage, lint output. | `validate-coverage`, `gherkin-lint`, `step-vocabulary.json`. |
| Validation (headless) | `validate-selectors.ts`, `validate-coverage.ts` | `tests/scripts/cli-validate.ts` (`yarn spec:validate`) | Offline validation that compares YAML/features against selector registry and vocabulary. | `types/validation-report`, `artifacts/selectors/registry.json`. |
| CI verification | `ci-verify.ts` | `tests/scripts/cli-ci-verify.ts` (`yarn spec:ci-verify`) | Aggregate schema, lint, coverage, selector, and secret checks; package artifacts for CI. | `utils/secret-scanner`, `utils/logging`, `validate-*` modules. |
| Benchmarks (optional) | `benchmarks.ts` | `yarn spec:benchmarks` | Measure throughput across stages to catch regressions. | `utils/benchmark-runner`. |

All CLI files live alongside their modules so the same code can be invoked within tests.

## Supporting Layers

- **LLM Provider Abstraction (`tests/scripts/llm/`)**  
  Handles provider selection (`LLM_PROVIDER=codex|claude`), timeout enforcement, retries, and structured logging. Providers share a common interface so stages can swap models without code changes.

- **Utilities (`tests/scripts/utils/`)**  
  Shared building blocks for file I/O, hashing, YAML parsing, caching, concurrency, environment validation, and JSON logging. Modules are intentionally small so they can be reused across stages and tests.

- **Type Schemas (`tests/scripts/types/`)**  
  Zod schemas define contract shapes for normalized YAML, selector registries, CI reports, and validation issues. Code validates all external inputs (LLM responses, file reads) before use.

- **Testing**  
  Unit tests cover each module (e.g., `normalize-yaml.test.ts`, `ci-verify.test.ts`). Integration suites under `tests/__tests__/integration/` assert multi-stage flows such as “normalize → generate features → validate coverage”. Tests run with `node:test` via `tsx --test`.

## Artifacts and Directories

| Path | Purpose |
|------|---------|
| `tests/qa-specs/` | Plain-text specifications authored by QA. |
| `tests/clarifications/` | Markdown Q&A emitted by `spec:questions`. |
| `tests/normalized/` | Source of truth YAML documents. |
| `tests/features/` | Generated `.feature` files consumed by Playwright BDD. |
| `tests/artifacts/selectors/registry.json` | Selector registry refreshed by `spec:collect-selectors`. |
| `tests/artifacts/selectors/drift-report.json` | Output from `spec:selector-drift` highlighting missing/updated selectors. |
| `tests/artifacts/validation-report.json` | Output from selector validation. |
| `tests/artifacts/ci-report.json` & `tests/artifacts/ci-bundle/` | Deterministic reports produced during CI verification. |
| `tests/artifacts/step-vocabulary.json` | Approved step phrases used by coverage validator and feature generator. |

Artifacts are committed to Git for auditability and so CI can diff generated outputs.

## Execution Paths

1. **Authoring loop (LLM required locally)**  
   Run `spec:questions`, answer clarifications, call `spec:normalize`, optionally gate with `spec:validate-and-fix`, then generate features via `spec:features`. At each step the CLI records structured logs to stdout for observability.

2. **Validation loop (LLM-free)**  
   `spec:collect-selectors` refreshes the registry from a running application. `spec:selector-drift` compares live scans to the registry for suggested updates, and `spec:validate` provides fast feedback on selector or vocabulary gaps without invoking the LLM.

3. **CI verification (deterministic)**  
   Pipelines call `spec:ci-verify`, which applies schema validation, gherkin-lint, coverage checks, selector reconciliation, and secret scanning. Exit codes are stable: schema (2), lint (3), coverage (4), selectors (5), secrets (6), timeout (7). The run bundles inputs/outputs for later inspection.

## Extending the Pipeline

- Add new data contracts in `tests/scripts/types/` and validate all external inputs with Zod before use.
- Keep prompts versioned inside `tests/prompts/`; bump prompt metadata whenever the format changes.
- When introducing new CLI behavior, expose it through a top-level script in `package.json` so both humans and CI can call it consistently.
- Pair new stages with unit tests and, when they touch multiple files, add integration coverage.

## Operational Notes

- Configure environment variables in `.env.local`; `tests/scripts/utils/load-env` loads them automatically for every CLI entry point.
- Selector validation and collection commands assume the target app is reachable at `E2E_BASE_URL`. Provide `--base-url` overrides when needed.
- Logs are emitted as structured JSON lines so they can be shipped to observability tooling or grepped locally.
