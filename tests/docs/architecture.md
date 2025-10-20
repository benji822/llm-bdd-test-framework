# Pipeline Architecture

The pipeline is split into four transformation stages plus a CI verification loop. Each stage is implemented as a TypeScript module under `tests/scripts/` with matching unit/integration tests in `tests/__tests__/`.

```
Plain Text ──┐
             │  spec:questions           ┌──────────────┐
             ├─> Clarifications  ───────►│ generate LLm │
             │                           └──────────────┘
             │  spec:normalize           ┌──────────────┐
             ├─> Normalized YAML ───────►│ normalize    │─┐
Selector     │                           └──────────────┘ │
Registry ────┼────────────────────────────────────────────┼─► spec:features
             │  spec:features            ┌──────────────┐ │
Step         ├─> Gherkin Features ──────►│ feature gen  │─┘
Vocabulary   │                           └──────────────┘
             │  spec:ci-verify           ┌──────────────┐
             └─> CI Verification ───────►│ ci-verify    │
                                         └──────────────┘
```

## Core Modules

| Module | Description | Key Dependencies |
|--------|-------------|------------------|
| `generate-questions.ts` | Produces clarification Q&A from plain-text specs. | LLM provider abstraction, prompt renderer. |
| `normalize-yaml.ts` | Converts clarified specs into schema-validated YAML. | Zod schema, YAML sanitizer. |
| `generate-features.ts` | Generates `.feature` files and enforces step coverage/linting. | `validate-coverage`, gherkin-lint. |
| `collect-selectors.ts` | Harvests selectors with Playwright. | Playwright chromium runner. |
| `validate-selectors.ts` | Ensures YAML selectors exist in the registry. | `SelectorRegistry` schema. |
| `validate-coverage.ts` | Confirms every feature step matches vocabulary. | Step vocabulary JSON. |
| `ci-verify.ts` | Deterministic validation pipeline for CI. | All above validators, secret scanning, artifact bundling. |

### Shared Utilities

- `llm/` – provider factory (`LLM_PROVIDER=codex|claude`) with strict timeout/error handling.
- `utils/` – file I/O, logging, prompt rendering, sanitizers, YAML parsing.
- `types/` – Zod-powered type definitions for specs, selectors, validation reports, etc.

## Control Flow

1. **Authoring Loop (LLM required locally)**  
   - QA produces specification → `spec:questions` seeds clarifications.  
   - QA answers required questions.  
   - `spec:normalize` rejects if mandatory answers missing.  
   - `spec:features` ensures lint + vocabulary coverage, auto-repair fallback.

2. **Selector Hygiene (No LLM)**  
   - `spec:collect-selectors` updates `artifacts/selectors.json`.  
   - `spec:validate` reports missing selectors and coverage gaps.

3. **CI Verification (No LLM)**  
   - `spec:ci-verify` validates YAML schemas, lint, coverage, selector consistency.  
   - Secret scanning enforces SC-010 (no leaked credentials).  
   - Exit codes map to failure class (schema=2, lint=3, coverage=4, selectors=5, secrets=6).  
   - Artifacts packaged under `artifacts/ci-bundle/` and uploaded by CI workflow (`bdd-pipeline-ci.yml`).

## Testing Strategy

- **Unit Tests** – one per core script (US1–US4) covering happy path & failure modes.
- **Integration Tests** – multi-step flows verifying cross-module behavior (e.g., selectors collection + validation).
- **Node Test Runner** – uses built-in `node:test` with `tsx --test`.

## Extensibility Guidelines

- Prefer adding new Zod schemas/types under `tests/scripts/types`.
- Expose new scripts via CLI wrappers + yarn scripts for consistent invocation.
- Accompany each script change with unit test updates; add integration coverage when touching multiple modules.
- Keep prompts versioned; breaking changes require bumping prompt metadata.

## Operational Considerations

- **LLM Credentials**: stored in `.env.local` locally, CI loads via secrets. No LLM usage during CI.  
- **Selectors**: nightly `daily-selector-scan.yml` ensures registry freshness.  
- **Artifacts**: CI runs retain bundles for 30 days (FR-019a); local runs can inspect the same bundle for debugging.  
- **Logging**: all scripts emit structured JSON to stdout, making them CI-friendly and easily searchable.
