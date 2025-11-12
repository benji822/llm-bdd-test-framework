# Selector Best Practices

Reliable selectors keep the generated BDD tests stable and accessible. The selector registry (`tests/artifacts/selectors/registry.json`) is refreshed nightly via Playwright scanning, and `yarn spec:selector-drift` highlights any divergence in `tests/artifacts/selectors/drift-report.json`.

## Priority Ladder

1. **Role + Accessible Name** (`role`)  
   ```tsx
   <button role="button" aria-label="Submit order">Submit</button>
   ```
   Registry ID: `button-submit-order`

2. **ARIA Label** (`label`)  
   ```jsx
   <div aria-label="Discount applied">…</div>
   ```
   Registry ID: `discount-applied`

3. **Data Test ID** (`testid`)  
   ```html
   <input data-testid="email-input" />
   ```
   Registry ID: `email-input`

4. **Fallback CSS** (`css`) – avoid unless unavoidable; mark `accessible: false`.

## Authoring Guidelines

- Always prefer semantic HTML + ARIA attributes; they improve both accessibility and selector stability.
- Keep IDs kebab-cased and descriptive (`login-submit`, `profile-avatar-upload`).
- Never embed credentials or environment-specific tokens inside selectors.
- When using `data-testid`, isolate to test-only attributes; avoid reusing component `id` or `class` names.

## Registry Hygiene

- `collect-selectors.ts` deduplicates by ID, preferring higher-priority entries.
- The nightly workflow stores last-seen timestamps; remove selectors that go stale for >30 days.
- Review `accessible: false` entries to see if the application can expose a better alternative.
- `yarn spec:selector-drift --base-url <url> [--apply]` compares live scans to the committed registry so you can spot missing or updated selectors before they break scenarios.

## Validating Selectors

- `yarn spec:validate` and `yarn spec:ci-verify` both fail if YAML selectors reference missing IDs.
- Error messages include file + line numbers and may suggest accessible alternatives.

## Adding New Selectors

1. Update the application markup to include ARIA roles/labels or `data-testid`.
2. Run `yarn spec:collect-selectors --route <path>` locally (ensure `E2E_BASE_URL` is set).
3. Inspect `yarn spec:selector-drift --base-url <url> --route <path>` (add `--apply` to sync high-confidence fixes) and review `tests/artifacts/selectors/drift-report.json`.
4. Commit the updated `tests/artifacts/selectors/registry.json`.
5. Re-run `yarn spec:validate` to confirm there are no mismatches.

## Troubleshooting

- **Selector missing in registry** – confirm the page route is included in nightly scan routes; add if necessary.
- **Flaky selectors** – prefer roles/labels over dynamic CSS classes.
- **Registry empty** – ensure the app boots with the configured `E2E_BASE_URL`; nightly workflow requires the secret to point at a deployed environment.
- **Text-only buttons** – selectors without ARIA/testid metadata rely on `selectorResolver`’s text/type strategy (default order `role`,`label`,`text`,`type`,`name`,`placeholder`,`css`,`testid`). Tune `SELECTOR_STRATEGY` if you want to prioritize text or type heuristics (e.g., `SELECTOR_STRATEGY=text,type` for plain `LOG IN` buttons).
