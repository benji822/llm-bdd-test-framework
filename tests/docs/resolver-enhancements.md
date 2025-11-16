# Selector Resolver: Default Strategy Ordering, Scoping & Disambiguation

## Overview

The selector resolver (`tests/steps/support/selector-resolver.ts`) has been enhanced to provide:

1. **Default Strategy Ordering** - Enforces canonical strategy priority (role → label → text → type → name → placeholder → css → testid)
2. **Scoping Support** - Restrict selector resolution to container/component locators
3. **Ambiguity Detection** - Identify and report multiple matches with disambiguation guidance
4. **Enhanced Telemetry** - Track resolution strategy, selector, tokens, and match counts

## Default Strategy Ordering

The resolver now guarantees that unspecified strategies are always attempted in the documented order, even when:
- `SELECTOR_STRATEGY` environment variable provides a partial list
- Custom `strategyOrder` option is supplied

### Behavior

```typescript
// Explicit partial override via env var
process.env.SELECTOR_STRATEGY = 'text,name';

const options: SelectorResolverOptions = {
  // Will attempt: text, name, role, label, type, placeholder, css, testid
  // (remaining defaults appended automatically)
};
```

### Why This Matters

- **Predictability**: Tests behave consistently across environments
- **Fallback Safety**: If preferred strategies fail, defaults kick in
- **Documentation Accuracy**: Strategy order in docs matches runtime behavior

## Scoping Support

Restrict selector searches to a container element rather than the entire page:

```typescript
const modalDialog = page.locator('[role="dialog"]');
const options: SelectorResolverOptions = {
  scope: modalDialog,
  textHint: 'Save',
  roleHint: 'button',
};

const { locator } = await selectorResolver(page, 'save button', options);
// Only finds buttons within the dialog, not elsewhere on page
```

### Use Cases

- **Modal Dialogs**: Find buttons inside a modal
- **Form Sections**: Resolve inputs within a fieldset
- **Table Rows**: Target cells in a specific row
- **Shadow DOM**: Search within web components

### Implementation

All strategy helpers now support the `scope?: Locator` option:
- Registry strategies: Use `scope.locator(entry.selector)`
- Text heuristic: Use `scope.getByRole(role, { name: pattern })`
- Attribute heuristic: Use `scope.locator([attr*="value"])`
- Type heuristic: Use `scope.locator(selector)`

Default: `scope = page` (entire page)

## Ambiguity Detection & Handling

The resolver now counts matches and supports disambiguation policies:

```typescript
const options: SelectorResolverOptions = {
  textHint: 'Delete',
  roleHint: 'button',
  ambiguityPolicy: 'error', // or 'warn' or 'first'
};
```

### Policies

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `'first'` (default) | Use first match, log count in telemetry | Production: Accept first match |
| `'warn'` | Log warning to console, use first match | Staging: Alert but continue |
| `'error'` | Throw error with suggestions | Development: Catch ambiguity early |

### Error Messages

When `ambiguityPolicy: 'error'` and multiple matches found:

```
Ambiguous selector resolution for "getByRole('button', { name: /Save/i })": 2 elements matched.
Candidates:
  - getByRole('button', { name: /Save/i }) [text heuristic]
Suggestion: Add explicit aria-label, data-testid, or registry ID to disambiguate.
```

## Enhanced Telemetry

Each resolution logs telemetry with:

```typescript
interface SelectorResolverTelemetry {
  strategy: StrategyName | 'id';
  selector: string;
  entryId?: string;           // Registry entry ID if used
  tokens: string[];           // Tokenized hint/ID
  source: StrategySource;     // 'registry' | 'attribute' | 'heuristic'
  matchCount?: number;        // Number of DOM elements matched
  candidates?: Array<{        // Top ambiguous candidates (if multiple)
    selector: string;
    entryId?: string;
    reason: string;
  }>;
}
```

### Default Logger Output

```
[selector-resolver] strategy=text selector=getByRole('button', { name: /Save/i }) tokens=[save] matchCount=2
```

## Integration With Compiled Specs

Generated `@playwright/test` specs can now use all features:

```typescript
// In compiled step (from LLM compiler)
const { locator: locator0 } = await selectorResolver(page, undefined, {
  textHint: 'Save',
  roleHint: 'button',
  scope: page.locator('[role="dialog"]'),  // Restrict to dialog
  ambiguityPolicy: 'warn',                  // Log warnings
});
await locator0.click();
```

## Best Practices

### Strategy Order Customization

Only override if you have specific requirements:

```typescript
const options: SelectorResolverOptions = {
  strategyOrder: ['css', 'testid'], // Try CSS/testid first
  // role, label, text, type, name, placeholder are auto-appended
};
```

### Scoping

- Use scoping to disambiguate overlapping UI patterns
- Combine with `ambiguityPolicy: 'error'` in development
- Document why scoping is needed in test comments

### Ambiguity Policies

- **Development**: Use `'error'` to fail fast on ambiguous selectors
- **CI/Production**: Use `'warn'` or `'first'` (default) for robustness
- **Debugging**: Use `'warn'` to log all resolution attempts

## Validation & Testing

All enhancements are covered by comprehensive tests:

```bash
npm test -- --config playwright.unit.config.ts tests/unit/selector-resolver.test.ts
```

Test coverage includes:
- ✓ Default strategy order enforcement
- ✓ Partial env variable overrides
- ✓ Explicit strategyOrder option
- ✓ Scoped resolution
- ✓ Ambiguity detection
- ✓ Policy enforcement
- ✓ Enhanced error messages
- ✓ Telemetry logging
