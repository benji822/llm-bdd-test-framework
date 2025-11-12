---
globs:
  - '.github/**/*.yml'
  - '.github/**/*.yaml'
  - 'tests/scripts/cli-ci-verify.ts'
---

# CI/CD Integration and Validation

## Overview

CI pipelines verify stagehand-generated artifacts deterministically. `yarn bdd verify` aggregates feature linting, vocabulary coverage, selector validation, secret scanning, and artifact bundling, ensuring Playwright only depends on pre-built assets.

## `yarn bdd verify` checks

1. **Gherkin lint** on features under `tests/features/compiled/`.
2. **Vocabulary coverage** via `tests/artifacts/step-vocabulary.json`.
3. **Selector validation** against `tests/artifacts/graph/` and the registry (`tests/artifacts/selectors/registry.json`).
4. **Secret scanning** for committed artifacts and validation reports.
5. **Artifact bundling** under `tests/artifacts/ci-bundle/`.

Exit codes provide clarity:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `3` | Gherkin lint failed |
| `4` | Step coverage failed |
| `5` | Selector validation failed |
| `6` | Secret scan failed |
| `7` | Verification timeout |
| `9` | Unknown error |

## CI Policy Guard

`yarn ci:policy` (also wired into the `pretest` hook) ensures deterministic preconditions on every node:

- `AUTHORING_MODE` and `MOCK_LOGIN_APP` must remain disabled in CI.
- `tests/artifacts/graph/`, `tests/features/compiled/`, and `tests/steps/generated/` must contain compiled artifacts before tests run.
- `tests/artifacts/selectors/registry.json` must exist so selectors stay consistent.

The policy throws descriptive errors when a required artifact is missing or a forbidden flag is enabled.

## GitHub Actions Example

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

      - name: Validate artifacts
        run: yarn bdd verify

      - name: Run Playwright tests
        run: yarn test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}

      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

- Commit generated artifacts (`tests/artifacts/graph/`, `tests/features/compiled/`, `tests/steps/generated/`, selectors) so CI never replays Stagehand.
- Run `yarn bdd verify` locally before pushing; the same exit codes surface as CI.
- Keep `MOCK_LOGIN_APP` and `AUTHORING_MODE` disabled when preparing artifacts for CI.
