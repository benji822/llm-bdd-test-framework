# Agent instructions

- This file applies to the entire repository.
- The project is a deterministic Playwright BDD pipeline: specs → clarifications → normalized YAML → Gherkin → Playwright.
- Root npm scripts (`package.json`) drive the pipeline (`spec:questions`, `spec:normalize`, `spec:features`, etc.). Prefer these commands over ad-hoc scripts.
- Generated artefacts live under `tests/` (`qa-specs/`, `clarifications/`, `normalized/`, `features/`). Step definitions are under `tests/steps/`; CLI utilities under `tests/scripts/`.
- `tests/README.md` is the authoritative deep-dive on architecture, caching, and troubleshooting—consult it before modifying pipeline code.
- Playwright runtime configuration resides in `playwright.config.ts`; respect existing defaults (retries, workers, env loading).
