# pages.yaml Guide

The `pages.yaml` file is a **central registry of page names and their routes**. All specs reference page names (e.g., "I am on the login page"), and the compiler resolves these to URLs using this config.

## Why pages.yaml?

- **DRY**: Define routes once; reuse across all specs.
- **Maintainability**: Change a route in one place.
- **Consistency**: Specs use semantic names ("login page"), not hardcoded URLs.
- **Multi-environment**: Different `.env` can have different base URLs; specs stay unchanged.

## Format

Simple YAML key-value pairs:

```yaml
# pages.yaml
login: /login
dashboard: /dashboard
home: /
profile: /user/profile
checkout: /cart/checkout
```

**Rules:**
- Keys are page identifiers (used in specs).
- Values are URL paths (relative to `E2E_BASE_URL`).
- No `/` suffix needed (compiler appends).

## Example Spec Usage

```plaintext
Feature: User authentication

User logs in:
- I am on the login page           # Resolved to /login
- I enter email as "user@..."
- I click the login button
- I should see text "Welcome"      # Will be on /dashboard by then
```

**How the compiler processes this:**

1. Parses step: "I am on the login page"
2. Extracts page key: "login"
3. Looks up `pages.yaml`: `login: /login`
4. Constructs full URL: `${E2E_BASE_URL}/login`
5. Generates Playwright code: `await page.goto('http://localhost:3000/login')`

## Multi-Environment Setup

**`.env.local` (local dev):**
```env
E2E_BASE_URL=http://localhost:3000
```

**`.env.staging`:**
```env
E2E_BASE_URL=https://staging.example.com
```

**`.env.prod`:**
```env
E2E_BASE_URL=https://app.example.com
```

**`pages.yaml` stays the same for all:**
```yaml
login: /login
dashboard: /dashboard
```

When you compile:
```bash
# Local dev
export E2E_BASE_URL=http://localhost:3000
yarn llm compile specs/...

# Staging
export E2E_BASE_URL=https://staging.example.com
yarn llm compile specs/...

# Production (in CI)
export E2E_BASE_URL=https://app.example.com
yarn llm compile specs/...
```

The generated tests adjust automatically.

## Advanced: Dynamic Page Keys

If your app has dynamic routes (e.g., `/user/123/profile`), define a static key that the test code can resolve:

```yaml
# pages.yaml
login: /login
dashboard: /dashboard
user_profile: /user/profile  # Static for now; test harness can make it dynamic
```

For complex routing, you can use a helper in the generated test:

```typescript
// In generated test fixture
function resolvePageUrl(pageKey: keyof typeof PAGES): string {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost';
  const path = PAGES[pageKey];
  
  // Handle dynamic substitutions if needed
  if (pageKey === 'user_profile' && process.env.TEST_USER_ID) {
    return `${baseUrl}/user/${process.env.TEST_USER_ID}/profile`;
  }
  
  return `${baseUrl}${path}`;
}
```

## Common Patterns

### Nested Routes

```yaml
# E-commerce app
product_list: /products
product_detail: /products/:id
cart: /cart
checkout: /checkout
order_confirmation: /orders/:id
```

The spec uses the semantic name:
```plaintext
- I am on the product list page      # /products
- I am on the cart page              # /cart
```

For dynamic `:id` routes, either:
1. Create a static helper page (like above).
2. Use environment variables in the spec step value.

### Admin Routes

```yaml
# Admin panel
dashboard: /admin
users: /admin/users
user_detail: /admin/users/:id
settings: /admin/settings
```

### Multi-Tenant

```yaml
login: /login
tenant_dashboard: /tenant/dashboard
tenant_settings: /tenant/settings
```

Compiler resolves these regardless of tenant ID (tests inject tenant context separately via setup or env vars).

## Validation

The compiler validates that every page reference in specs maps to an entry in `pages.yaml`.

**Valid spec:**
```plaintext
- I am on the login page      # ✓ pages.yaml has "login: /login"
```

**Invalid spec:**
```plaintext
- I am on the checkout page   # ✗ Not in pages.yaml → compile error
```

To fix, add to `pages.yaml`:
```yaml
checkout: /checkout
```

## Best Practices

1. **Use semantic names**: `login` not `lg`, `dashboard` not `dash`.
2. **Keep paths consistent**: If your app uses `/admin/dashboard`, use that in `pages.yaml`.
3. **One pages.yaml per environment**: Use the same file, but swap `E2E_BASE_URL` at compile time.
4. **Document unusual pages**: Add comments for routes that are generated or conditional.

```yaml
# pages.yaml
login: /login
dashboard: /dashboard
# Dynamically generated; tests inject user ID at runtime
user_profile: /user/profile
# Admin-only; tests require admin token
admin_panel: /admin
```

## Troubleshooting

### Compile Error: "No page key detected"

**Cause**: Step doesn't mention a page name, or page name isn't in `pages.yaml`.

**Fix**:
```plaintext
# Bad: ✗
- I navigate to the login form

# Good: ✓
- I am on the login page
```

And ensure `pages.yaml` has:
```yaml
login: /login
```

### URL Mismatch in Generated Tests

**Cause**: `pages.yaml` path doesn't match app routing.

**Fix**: Verify with curl or browser:
```bash
curl http://localhost:3000/login  # Should 200
```

Then check `pages.yaml`:
```yaml
login: /login  # ✓ Correct
```

### Same Page, Different Environments

**Cause**: Route path differs between staging and production.

**Solution**: Use environment-specific `pages.yaml` files or a resolver function:

```typescript
// In test fixture
function resolvePageUrl(pageKey: keyof typeof PAGES): string {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost';
  let path = PAGES[pageKey];
  
  // Adjust for production quirks
  if (baseUrl.includes('prod.example.com') && pageKey === 'checkout') {
    path = '/v2/checkout';  // Different in prod
  }
  
  return `${baseUrl}${path}`;
}
```

## Next Steps

- Create `pages.yaml` with your app's routes.
- Reference page names in specs: "I am on the {page} page".
- See [Selector Strategy](selector-strategy.md) for how selectors resolve on each page.
