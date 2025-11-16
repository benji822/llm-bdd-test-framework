# Step Vocabulary Guide

All steps in your specs must match patterns in `tests/artifacts/step-vocabulary.json`. This document explains the vocabulary, how to add new patterns, and best practices.

## Why a Controlled Vocabulary?

- **Consistency**: All specs use the same approved wording.
- **Clarity**: New team members know what steps are available.
- **Validation**: Compiler catches typos and unsupported steps.
- **Discoverability**: Vocabulary serves as documentation.

## Current Vocabulary

```json
{
  "version": "1.0.1",
  "definitions": [
    {
      "pattern": "I am on the {page} page",
      "domain": "navigation",
      "parameters": [{ "name": "page", "type": "string" }],
      "examples": ["I am on the login page"]
    },
    {
      "pattern": "I enter {field} as {value}",
      "domain": "interaction",
      "parameters": [
        { "name": "field", "type": "string" },
        { "name": "value", "type": "string" }
      ],
      "examples": ["I enter email as \"user@example.com\""]
    },
    {
      "pattern": "I click the {element} button",
      "domain": "interaction",
      "examples": ["I click the login button"]
    },
    {
      "pattern": "I should see text {text}",
      "domain": "assertion",
      "examples": ["I should see text \"Welcome\""]
    }
  ]
}
```

### Pattern Syntax

Patterns use `{parameterName}` placeholders for values extracted from steps:

```plaintext
Pattern:   "I enter {field} as {value}"
Step:      "I enter email as \"user@example.com\""
Results:   field="email", value="user@example.com"
```

### Domains

Patterns are grouped by domain:

| Domain | Purpose | Examples |
|--------|---------|----------|
| `navigation` | Moving between pages | "I am on the X page" |
| `interaction` | Clicking, typing, scrolling | "I click the X button", "I enter X as Y" |
| `assertion` | Checking state | "I should see", "I should not see", "The X should be enabled" |

## Available Steps (Reference)

### Navigation

```plaintext
I am on the {page} page
```

**Example:** `I am on the login page`

Navigates to the page defined in `pages.yaml`.

### Interaction

```plaintext
I enter {field} as {value}
I click the {element} button
I hover over the {element}
I type {value} into {field}
I scroll to the {element}
```

**Examples:**
```plaintext
I enter email as "user@example.com"
I click the login button
I hover over the menu
I type "search term" into search
I scroll to the footer
```

### Assertion

```plaintext
I should see text {text}
I should see the {element}
I should not see the {element}
I wait for the {element} to be visible
I wait for the {element} to disappear
The {element} should be disabled
The {element} should be enabled
```

**Examples:**
```plaintext
I should see text "Welcome back"
I should see the login form
I should not see the error message
I wait for the modal to be visible
I wait for the loading spinner to disappear
The submit button should be enabled
```

## Adding New Patterns

If your specs need a step that's not in the vocabulary, add it.

### Step 1: Identify the Gap

Your spec uses a step that causes a compile error:

```plaintext
- I verify the cart has {count} items
  # Error: Step pattern not in vocabulary
```

### Step 2: Add to Vocabulary

Edit `tests/artifacts/step-vocabulary.json`:

```json
{
  "pattern": "I verify the cart has {count} items",
  "domain": "assertion",
  "parameters": [{ "name": "count", "type": "string" }],
  "examples": ["I verify the cart has 3 items"]
}
```

### Step 3: Recompile

```bash
yarn llm compile specs/...
```

The new pattern is now available for all specs.

### Step 4 (Optional): Document Usage

Add a comment in `tests/artifacts/step-vocabulary.json` for non-obvious patterns:

```json
{
  "pattern": "I verify the cart has {count} items",
  "domain": "assertion",
  "parameters": [{ "name": "count", "type": "string" }],
  "examples": ["I verify the cart has 3 items"],
  "notes": "Resolves via JavaScript: document.querySelectorAll('.cart-item').length"
}
```

## Best Practices

### 1. Use Consistent Wording

**Good:**
```plaintext
I click the login button
I click the submit button
I click the cancel button
```

**Bad (inconsistent):**
```plaintext
I click the login button
I press the submit button
I tap the cancel button
```

**Fix**: Standardize on one verb per action:
- "I click the X button" for all button clicks.
- "I enter X as Y" for all form inputs.

### 2. Be Specific in Parameter Names

**Good:**
```plaintext
I enter {field} as {value}
# field="email", value="user@example.com"
```

**Bad (ambiguous):**
```plaintext
I enter {x} as {y}
# What does x and y mean?
```

### 3. Use Domain Grouping

Organize vocabulary by domain so specs are readable:

```json
{
  "definitions": [
    { "pattern": "I am on the {page} page", "domain": "navigation" },
    { "pattern": "I click the {element} button", "domain": "interaction" },
    { "pattern": "I should see text {text}", "domain": "assertion" }
  ]
}
```

### 4. Provide Examples

Every pattern should have at least one example:

```json
{
  "pattern": "I enter {field} as {value}",
  "examples": ["I enter email as \"user@example.com\""]
}
```

Examples help users understand how to use the pattern.

### 5. Keep Patterns Simple

**Good (simple, reusable):**
```plaintext
I click the {element} button
I hover over the {element}
I scroll to the {element}
```

**Bad (overspecific):**
```plaintext
I click the submit button on the login form
I hover over the dropdown menu in the navbar
I scroll to the product details section
```

Overspecific patterns reduce reusability. Instead, let the spec provide context:

```plaintext
Feature: User login
  - I am on the login page
  - I click the submit button       # Clear from context it's login submit
  - I should see text "Welcome"
```

## Step Compilation

The compiler converts vocabulary patterns into Playwright selector resolution code. Here's how:

### Pattern → Generated Code

**Pattern:**
```json
{
  "pattern": "I click the {element} button"
}
```

**Step in spec:**
```plaintext
I click the submit button
```

**Generated code:**
```typescript
const { locator: locator0 } = await selectorResolver(page, undefined, {
  textHint: 'submit button',
  roleHint: 'button',
  typeHint: 'button'
});
await locator0.click();
```

The compiler:
1. Extracts parameters from the step.
2. Calls `selectorResolver` with hints.
3. Generates Playwright action code.

## Extending Vocabulary Safely

### Adding a New Domain

If you have many new steps in a domain, create a new section:

```json
{
  "definitions": [
    // ... existing patterns ...
    {
      "pattern": "I open the {menu} menu",
      "domain": "menu-interaction",
      "examples": ["I open the user menu"]
    },
    {
      "pattern": "I select {option} from the {menu} menu",
      "domain": "menu-interaction",
      "examples": ["I select Logout from the user menu"]
    }
  ]
}
```

### Adding a Parameter Type

If your steps need complex data (not just strings), you can hint at it in the vocabulary:

```json
{
  "pattern": "I wait {seconds} seconds",
  "domain": "timing",
  "parameters": [{ "name": "seconds", "type": "number" }],
  "examples": ["I wait 3 seconds"]
}
```

The compiler still treats it as a string at compile time, but the documentation is clear.

## Troubleshooting

### "Pattern not found in vocabulary"

**Cause**: Your spec step doesn't match any pattern.

**Fix**: 
1. Check the exact wording matches a pattern in `tests/artifacts/step-vocabulary.json`.
2. If not, add the pattern (see "Adding New Patterns").

**Example:**
```plaintext
# Bad: ✗
I navigate to the user profile page

# Good: ✓
I am on the profile page  # Matches "I am on the {page} page"
```

### "Ambiguous pattern match"

**Cause**: Step could match multiple patterns.

**Example:**
```plaintext
Pattern 1: "I click the {element}"
Pattern 2: "I click the {element} button"

Step: "I click the submit button"
# Matches both!
```

**Fix**: Make patterns mutually exclusive:
```json
{
  "pattern": "I click the {element} button",
  "domain": "interaction"
},
{
  "pattern": "I click the {element} link",
  "domain": "interaction"
}
```

Or be specific in the step:
```plaintext
I click the submit button   # Matches "I click the {element} button"
I click the profile link    # Matches "I click the {element} link"
```

### "Parameter not extracted correctly"

**Cause**: Step text doesn't match pattern placeholders exactly.

**Example:**
```plaintext
Pattern:  "I enter {field} as {value}"
Step:     "I enter the email as \"user@example.com\""
#         ↑ extra word "the"
# Mismatch!
```

**Fix**: Remove extra words or update the pattern:

```plaintext
# Option 1: Change the step
I enter email as "user@example.com"

# Option 2: Update the pattern
Pattern: "I enter the {field} as {value}"
```

## Next Steps

- Review the current vocabulary in `tests/artifacts/step-vocabulary.json`.
- Add domain-specific patterns for your app (e.g., "I fill the cart with X items").
- Use `yarn llm compile` to validate your patterns.
- See [Selector Strategy](selector-strategy.md) for how steps resolve elements.
- See [setup-connectors-guide.md](setup-connectors-guide.md) for test data setup.
