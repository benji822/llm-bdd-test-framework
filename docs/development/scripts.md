---
globs:
  - 'tests/scripts/**/*.ts'
  - 'tests/scripts/cli-*.ts'
---

# Pipeline Automation and CLI Tools

## Overview

Pipeline automation lives entirely under `tests/scripts/`. Each module owns a clear responsibility and exposes CLI adapters so human authors and automation jobs share the same logic.

## Pipeline Architecture

```
Plain Text Spec ───► yarn bdd record ───► Stagehand action graph ───► compile (features + steps) ───► Playwright execution
```

Stagehand records deterministic actions, persists the graph (`tests/artifacts/graph/`), and uses `action-graph/compiler.ts` to drive Playwright when the tests run.

## Stagehand-first CLI Flow

`yarn bdd record` (see `tests/scripts/cli-bdd.ts`) parses natural-language specs, walks Stagehand step-by-step (`tests/scripts/stagehand/pipeline.ts`), stores the resulting action graph, and compiles `.feature` + `.steps.ts` outputs. Add `--dry-run` to inspect the graph without persistence, `--skip-compile` to stop early, or `--base-url` to override `E2E_BASE_URL`.

| Stage | Module(s) | CLI Command | Responsibility |
|-------|-----------|-------------|----------------|
| Stagehand recording | `tests/scripts/stagehand/pipeline.ts`, `tests/scripts/stagehand/recorder.ts` | `yarn bdd record` | Turn a plain-text spec into a deterministic action graph enriched with selectors and execution metadata. |
| Graph persistence | `tests/scripts/action-graph/persistence.ts` | (implicit) | Persist versioned graphs under `tests/artifacts/graph/` so CI replays the exact recorded actions. |
| Graph compilation | `tests/scripts/action-graph/compiler.ts` | `yarn bdd compile` | Convert the deterministic graph into `.feature` files and playable step definitions for Playwright. |
| Selector hygiene | `tests/scripts/collect-selectors.ts` | `yarn spec:collect-selectors` | Scan live routes with Playwright and refresh `tests/artifacts/selectors/registry.json`. |
| Drift validation | `tests/scripts/selector-drift.ts` | `yarn spec:selector-drift` | Compare fresh scans to the committed registry; report missing/updated selectors and optionally sync. |
| Validation & CI | `tests/scripts/validate-selectors.ts`, `tests/scripts/validate-coverage.ts`, `tests/scripts/ci-verify.ts` | `yarn bdd verify` | Ensure features step coverage, selectors, linting, and secret scans pass before Playwright runs. |

### Umbrella CLI `yarn bdd`

`tests/scripts/cli-bdd.ts` wires together bootstrap, Stagehand recording, compilation, execution, and verification. The subcommands share the same cores for friendly reporting and consistent error handling.

| Command | Module(s) | Responsibility |
|---------|-----------|----------------|
| `yarn bdd init` | `tests/scripts/cli-bdd.ts` | Create artifact directories and optionally bootstrap `.env.local`. |
| `yarn bdd record <spec>` | `tests/scripts/cli-bdd.ts`, `stagehand/pipeline.ts`, `action-graph/compiler.ts` | Run Stagehand, persist the graph, and compile features/steps. |
| `yarn bdd compile <graph>` | `tests/scripts/cli/compile-graph-core.ts` | Turn saved graphs into deterministic artifacts with metadata controls. |
| `yarn bdd run` | `tests/scripts/cli-bdd.ts` | Proxy to `yarn test`, ensuring Playwright executes the latest compiled outputs. |
| `yarn bdd verify` | `tests/scripts/cli/ci-verify-core.ts`, `tests/scripts/ci-verify.ts` | Run lint, coverage, selector, and secret scans; package artifacts. |

## CLI Entry Points

| Stage | Module | CLI Command | Responsibility |
|-------|--------|-------------|----------------|
| Stagehand recording | `stagehand/pipeline.ts` | `yarn bdd record` | Capture Stagehand actions and deterministic selectors for each spec. |
| Graph compilation | `action-graph/compiler.ts` | `yarn bdd compile`, `yarn bdd record` | Emit `.feature` and `.steps.ts` artifacts from action graphs. |
| Selector collection | `collect-selectors.ts` | `yarn spec:collect-selectors` | Refresh the selector registry via Playwright exploration. |
| Selector drift | `selector-drift.ts` | `yarn spec:selector-drift` | Detect missing/updated selectors compared to the registry. |
| Selector validation | `validate-selectors.ts` | Indirectly used by `yarn bdd verify` | Ensure every selector referenced in the graphs exists in the registry. |
| Coverage validation | `validate-coverage.ts` | Indirectly used by `yarn bdd verify` | Guarantee every feature step matches the approved vocabulary. |
| CI verification | `ci-verify.ts` | `yarn bdd verify` | Aggregate lint, coverage, selectors, secrets, and artifact bundling checks. |

## Shared Utilities

Shared helpers live under `tests/scripts/utils/`:
- `file-operations.ts` — Cross-platform I/O, directory scaffolding, JSON helpers.
- `yaml-parser.ts` — YAML parsing/serialization used by selectors and configs.
- `concurrent.ts` — Utility for running tasks in parallel (used by Stagehand recording).
- `logging.ts` — Structured JSON logging for CLI commands.
- `secret-scanner.ts` — Secret detection used by CI verification.

## Configuration Management

- Environment variables drive Stagehand cache dirs, `MOCK_LOGIN_APP`, and Playwright targets.
- Zod schemas in `tests/scripts/types/` define contracts for graphs, selectors, and validation reports.
- JSON schemas under `tests/schemas/` describe artifacts that must stay deterministic.

## Workflow Guidelines

- Use `yarn bdd record` for authoring specs from `tests/qa-specs/`.
- Commit generated artifacts (`tests/artifacts/graph/`, `tests/features/compiled/`, `tests/steps/generated/`) alongside pipeline code.
- Run `yarn bdd verify` before `yarn test` to avoid CI failures.
- Collect selectors via `yarn spec:collect-selectors` whenever UI selectors change.

## Best Practices

- Keep TypeScript code small and focused to minimize review bite size.
- Validate new stages with dedicated tests under `tests/__tests__/`.
- Document architecture changes in `tests/docs/` instead of relying on ad-hoc markdown files.
