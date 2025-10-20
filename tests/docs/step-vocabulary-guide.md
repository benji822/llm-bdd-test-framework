# Step Vocabulary Maintenance Guide

The step vocabulary enforces deterministic Gherkin generation and execution by mapping natural-language patterns to Playwright step implementations.

## File Locations

- Vocabulary registry: `tests/artifacts/step-vocabulary.json`
- Step implementations: `tests/steps/*.steps.ts`
- Coverage validator: `tests/scripts/validate-coverage.ts`

## Adding New Steps

1. **Author Implementation**
   - Create or update a `.steps.ts` file under `tests/steps/`.
   - Export handlers via `Given/When/Then` from `playwright-bdd`.

2. **Update Vocabulary JSON**
   - Add an entry with fields:
     ```json
     {
       "pattern": "I click the {button} button",
       "domain": "interaction",
       "file": "tests/steps/interaction.steps.ts",
       "parameters": [
         { "name": "button", "type": "string" }
       ],
       "examples": ["I click the submit button"],
       "version": "1.1.0"
     }
     ```
   - `pattern` should match the phrasing used in features. Use `{parameter}` braces for dynamic segments.
   - `domain` is one of `auth`, `navigation`, `interaction`, `assertion`.
   - Bump the `version` string to signal a manual migration requirement (FR-007a).

3. **Document Migration**
   - Communicate the update to QA teams. Existing features must be reviewed manually before adopting new steps.
   - Prefer creating lint rules or scripts to detect deprecated patterns.

4. **Regenerate Features (Optional)**
   - If new patterns replace an older one, manually update affected features.
   - Run `yarn spec:validate` to ensure no coverage regressions.

## Removing Steps

- Deprecate first by notifying QA and updating documentation.
- Remove the definition only after all features stop using it; otherwise `spec:ci-verify` will fail with coverage gaps.

## Parameter Conventions

- Use descriptive parameter names (`{page}`, `{field}`, `{value}`).
- Prefer string parameters unless numeric enforcement is required.
- For selectors, keep placeholders in YAML but supply actual locators in the `selectors` map to avoid leaking sensitive data.

## Testing

- Update or add cases in `tests/__tests__/validate-coverage.test.ts`.
- Run `npx tsx --test tests/__tests__/validate-coverage.test.ts` to confirm coverage logic accepts new patterns.

## Versioning & Change Log

- Track changes in Git; consider keeping a `CHANGELOG.md` section describing vocabulary updates.
- Align vocabulary version with step implementation releases to help QA know when to refresh feature files.
