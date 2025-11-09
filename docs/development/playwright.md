---
globs:
  - 'tests/steps/**/*.ts'
  - 'playwright.config.ts'
  - '**/*.feature'
---

# Playwright and Selector Strategies

## Overview

We use Playwright for browser automation with BDD patterns, prioritizing accessibility-first selectors and maintaining a stable selector registry.

## Selector Strategy (Priority Order)

1. **Role + Accessible Name** (priority: 1)
   ```html
   <button role="button" aria-label="Submit order">Submit</button>
   ```
   → `button-submit-order`

2. **ARIA Label** (priority: 2)
   ```html
   <div aria-label="Discount applied">…</div>
   ```
   → `discount-applied`

3. **Data Test ID** (priority: 3)
   ```html
   <input data-testid="email-input" />
   ```
   → `email-input`

4. **Fallback CSS** (priority: 4) - only when unavoidable

## Selector Registry

Registry entries include stability tracking and accessibility metadata:

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

## When to Invoke Oracle

For Playwright work, consider using Oracle when:
- Designing new selector strategies or patterns
- Debugging complex element interaction issues
- Reviewing test stability and flakiness
- Planning major refactoring of test infrastructure

Example: "Use Oracle to review this selector strategy for accessibility and maintainability"

## Step Implementation Patterns

### Navigation Steps
```typescript
import { createBdd } from 'playwright-bdd';

const { Given } = createBdd();

Given('I am on the {word} page', async ({ page }, slug: string) => {
  const routes = {
    login: '/login',
    dashboard: '/dashboard',
  };
  await page.goto(routes[slug] ?? `/${slug}`);
});
```

### Interaction Steps
```typescript
const { When } = createBdd();

When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const locator = page.locator(`[data-testid='${field}-input']`);
  await locator.fill(value);
});

When(/^I click the (.+) button$/, async ({ page }, rawLabel: string) => {
  await page.getByRole('button', { name: rawLabel }).click();
});
```

### Assertion Steps
```typescript
import { expect } from '@playwright/test';
const { Then } = createBdd();

Then('I should see text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the URL should include {string}', async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});
```

## Controlled Vocabulary

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

## When to Ask Librarian

"Ask Librarian about Playwright locator strategies and best practices"

"Use Librarian to find accessibility testing patterns with Playwright"

## Best Practices

- Prefer semantic locators over CSS/XPath
- Use `data-testid` for elements without semantic meaning
- Maintain selector registry with `yarn spec:collect-selectors`
- Validate selectors against running app before CI
- Use Playwright's auto-waiting capabilities

## Oracle + Librarian Workflow

### Example: Improving Test Stability

**Step 1: Research (Librarian)**
```
"Use Librarian to research Playwright anti-flakiness patterns.
Search: microsoft/playwright repo
Focus on: locator stability, retry mechanisms"
```

**Step 2: Analyze (Oracle)**
```
"Based on Librarian's findings, use Oracle to analyze our current flakiness:
- Review selector strategies
- Identify timing issues
- Suggest stability improvements"
```

**Step 3: Implement (Main Agent)**
```
"Implement Oracle's stability recommendations.
Update selector registry and step implementations."
```

**Step 4: Validate (Oracle)**
```
"Use Oracle to review the stability improvements:
- Test reliability metrics
- Performance impact
- Maintenance overhead"
```

## Common Issues

### Element Not Found
- Check selector registry: `tests/artifacts/selectors/registry.json`
- Run a drift scan for suggestions: `yarn spec:selector-drift --base-url $E2E_BASE_URL --route /page`
- Recollect selectors: `yarn spec:collect-selectors --route /page`
- Verify app is running at `E2E_BASE_URL`

### Timing Issues
- Use Playwright's built-in waiting
- Avoid `sleep()` - use semantic waits instead
- Check network conditions in CI

### Accessibility Violations
- Use `page.getByRole()` for interactive elements
- Add ARIA labels where missing
- Validate with accessibility audit tools
