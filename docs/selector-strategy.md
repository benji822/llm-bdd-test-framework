# Selector Strategy & Registry

The `selectorResolver` is a deterministic element-finding engine that uses multiple strategies in priority order. This document explains how it works, how to help it succeed, and when to register selectors manually.

## Resolution Strategy (Priority Order)

The resolver tries these techniques in order, returning the first match:

1. **Registry ID** — Direct lookup by ID in `tests/artifacts/selectors/registry.json`
2. **Role + Text** — `page.getByRole('button', { name: 'Submit' })`
3. **Label** — `page.getByLabel('Email')`
4. **Text** — `page.getByText('Welcome')`
5. **Type** — `input[type='submit']`, `input[type='text']`
6. **Name** — `input[name='username']`
7. **Placeholder** — `input[placeholder='Enter email']`
8. **CSS** — Fallback CSS selector (last resort)
9. **Test ID** — `[data-testid='...']`

### Example: Finding a Login Button

**Spec step:**
```plaintext
- I click the login button
```

**Resolver execution:**

```
Step: "I click the login button"
  ↓
Extract hint: "login button"
  ↓
Try role + text:
  page.getByRole('button', { name: /login/i })
  ↓
Success! Found 1 element
  ↓
Return locator, execute .click()
```

**If that had failed**, it would try:
- Text: `page.getByText(/login/i)`
- Type: `button[type='submit']` (if step implies submission)
- CSS: `button.login-btn` (if explicitly defined)

## Registry (tests/artifacts/selectors/registry.json)

For complex or ambiguous elements, register them with an ID:

```json
{
  "submit-button": {
    "id": "submit-button",
    "type": "testid",
    "selector": "button[data-testid='submit-button']",
    "priority": 1,
    "page": "/login",
    "accessible": true,
    "stability": "high",
    "lastSeen": "2025-11-16T10:00:00Z"
  },
  "email-input": {
    "id": "email-input",
    "type": "label",
    "selector": "input[aria-label='Email address']",
    "priority": 1,
    "page": "/login",
    "accessible": true,
    "stability": "high",
    "lastSeen": "2025-11-16T10:00:00Z"
  }
}
```

**How to add an entry:**

```json
{
  "my-element-id": {
    "id": "my-element-id",
    "type": "testid|label|role|css",
    "selector": "...",
    "priority": 1,
    "page": "/path/to/page"
  }
}
```

When the resolver can't find an element heuristically, register it here.

## Making Elements Discoverable

The best way to ensure reliable selector resolution is to add semantic HTML to your app.

### For Buttons

```html
<!-- Good ✓ -->
<button aria-label="Submit order">Submit</button>
<button data-testid="submit-button">Submit</button>

<!-- Also good -->
<button type="submit">Submit</button>

<!-- Bad ✗ -->
<div onclick="submit()">Submit</div>
```

The resolver finds these via:
- `aria-label` → "Submit order"
- `data-testid` → "submit-button"
- `role="button"` + text → "Submit"
- `type="submit"` → detected as submit button

### For Form Inputs

```html
<!-- Good ✓ -->
<label for="email">Email</label>
<input id="email" type="email" placeholder="your@email.com" />

<input aria-label="Email address" type="email" />
<input data-testid="email-input" type="email" />

<!-- Bad ✗ -->
<input type="text" />  <!-- No hints -->
```

The resolver finds these via:
- `aria-label` → "Email address"
- `<label>` + id → "Email"
- `data-testid` → "email-input"
- `placeholder` → "your@email.com"

### For Links

```html
<!-- Good ✓ -->
<a href="/dashboard" aria-label="Go to dashboard">Dashboard</a>
<a href="/dashboard">Dashboard</a>

<!-- Bad ✗ -->
<a href="/dashboard">Click here</a>  <!-- Ambiguous text -->
```

The resolver finds these via:
- `aria-label` → "Go to dashboard"
- Text → "Dashboard"

## Hints in Spec Steps

When you write a spec step, you're providing hints to the resolver:

```plaintext
- I click the login button
         ↑
      Hint: "login button"
```

The resolver extracts "login" and "button", then searches for an element that:
- Is a button (role="button" or `<button>` tag)
- Contains text matching "login"

**More complex examples:**

```plaintext
- I enter email as "user@..."
  # Hint: "email"
  # Resolver looks for: input with placeholder/label/aria-label containing "email"

- I click the first unclaimed reward
  # Hint: "first unclaimed reward"
  # Resolver looks for: button/link text matching "unclaimed reward"

- I should see the welcome message
  # Hint: "welcome message"
  # Resolver looks for: text containing "welcome" and "message"
```

## Ambiguity Handling

When multiple elements match (e.g., three "Submit" buttons), the resolver uses the `ambiguityPolicy` option:

- **`first`** (default) — Use the first match.
- **`error`** — Raise an error and list candidates.
- **`warn`** — Log a warning and use the first match.

In generated tests, ambiguity is resolved by:
1. Refining the text hint (e.g., "login button" not just "button").
2. Using a registry ID for explicit matching.
3. Adding `data-testid` to the element in the app.

### Example: Resolving Ambiguity

**The problem:**
```html
<button>Submit</button>  <!-- Many on the page -->
<button>Submit</button>
<button>Submit</button>
```

**The spec step:**
```plaintext
- I click the submit button  # Too vague
```

**The fix (choose one):**

*Option 1: Be more specific*
```plaintext
- I click the login submit button
  # or
- I click the save changes button
```

*Option 2: Use a test ID*
```html
<button data-testid="login-submit">Submit</button>
```

*Option 3: Register in the registry*
```json
{
  "login-submit-button": {
    "id": "login-submit-button",
    "type": "testid",
    "selector": "button[data-testid='login-submit']",
    "page": "/login"
  }
}
```

## Environment Variables in Selectors

You can use environment variables in registry selectors:

```json
{
  "user-profile-link": {
    "id": "user-profile-link",
    "type": "css",
    "selector": "a[href='/user/${CURRENT_USER_ID}/profile']",
    "page": "/dashboard"
  }
}
```

At runtime, the resolver resolves `${CURRENT_USER_ID}` from `process.env`.

## Selector Drift Detection

Over time, your app's HTML changes, and selectors may break. The verifier detects this:

**During `yarn llm verify`:**
```
Scenario: User logs in
  Step 0: I am on the login page ✓
  Step 1: I enter email as "user@..." ✓
  Step 2: I click the login button ✗
    Error: No matching element for hint: "login button"
    Suggestion: Check if the button text changed or role changed
```

**To fix:**
1. Check the app's HTML (browser DevTools).
2. Update the spec step if text changed.
3. Update the registry if selectors changed.
4. Add `data-testid` to make selectors stable.

## Testing Selectors Locally

### Manual Verification

Open the app in a browser and inspect the element:

```javascript
// In browser console
// Find the login button
document.querySelector('button:has-text("Login")')  // Pseudo-code

// Or use Playwright locator syntax
// (in Playwright test context)
page.getByRole('button', { name: 'Login' })
```

### Using yarn llm verify

```bash
# Run headless verification
yarn llm verify --base-url http://localhost:3000 --spec-dir tests/e2e-gen

# Check the report
cat tests/artifacts/verification-report.json | jq '.scenarios[].steps'
```

## Best Practices

1. **Prefer semantic HTML** over CSS selectors.
   - ✓ `aria-label`, `aria-describedby`, `<label>`
   - ✓ `role="button"`, `role="link"`
   - ✗ `.btn-primary.active:nth-child(3)`

2. **Use data-testid for complex elements.**
   ```html
   <div data-testid="user-card">...</div>
   ```

3. **Keep selectors stable.**
   - CSS classes change with design refactors.
   - `data-testid` stays the same.

4. **Be specific in step hints.**
   - "I click the save changes button" (good)
   - "I click the button" (vague)

5. **Register ambiguous selectors in the registry.**
   ```json
   {
     "confirm-dialog-yes-button": {
       "id": "confirm-dialog-yes-button",
       "type": "testid",
       "selector": "button[data-testid='confirm-yes']"
     }
   }
   ```

6. **Document special cases.**
   ```json
   {
     "dynamic-user-menu": {
       "id": "dynamic-user-menu",
       "type": "text",
       "selector": "Note: Uses current logged-in user's name",
       "page": "/dashboard"
     }
   }
   ```

## Troubleshooting

### "selectorResolver could not resolve {hint}"

**Cause**: No element matches the hint, or the element is hidden/not in the DOM.

**Checklist:**
1. Is the element visible in the browser? (Check with DevTools.)
2. Does the element have a `role`, `aria-label`, or `data-testid`?
3. Is the page loaded? (Navigation step missing?)
4. Is there a loading spinner blocking the element?

**Fixes:**
- Add `aria-label` or `data-testid` to the element.
- Register it in the registry with an explicit selector.
- Wait for loading states: "I wait for the loading spinner to disappear"

### Selector Works Locally, Fails in CI

**Cause**: Page loads differently in CI (maybe slower, or different auth state).

**Fixes:**
1. Add explicit waits:
   ```plaintext
   - I am on the login page
   - I wait for the page to load  # or similar
   - I click the login button
   ```

2. Register the selector so it's not heuristic:
   ```json
   {
     "ci-robust-button": {
       "id": "ci-robust-button",
       "type": "testid",
       "selector": "button[data-testid='login']"
     }
   }
   ```

### Selector Registry Grows Too Large

**Cause**: Too many manual registrations, registry becomes hard to maintain.

**Solution**: Fix the app's HTML instead.
- Add `data-testid` to elements.
- Add `aria-label` to buttons.
- Use semantic `<button>`, `<label>`, roles.

Then you can delete registry entries and use heuristic resolution.

## Next Steps

- Add `aria-label` and `data-testid` to your app.
- Run `yarn llm verify` to check selector health.
- See [Step Vocabulary](step-vocabulary.md) for how steps map to elements.
- See [setup-connectors-guide.md](setup-connectors-guide.md) for test data setup.
