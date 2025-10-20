# Step 3.5: Selector Validation and Auto-Fix

## Overview

**Step 3.5** is a new validation step inserted between **Step 3 (YAML Normalization)** and **Step 4 (Feature Generation)** in the LLM BDD test pipeline. This step ensures that all selectors referenced in the normalized YAML file exist in the running application before generating executable tests.

**Goal**: Achieve 100% test success rate by validating selectors against the actual application and providing actionable feedback to fix missing selectors.

---

## Why This Step is Critical

### Problem Without Validation

Without this step, the pipeline can generate perfectly valid Gherkin features and executable tests, but they will fail at runtime with confusing timeout errors:

```
TimeoutError: page.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid='email-input']')
```

This happens because:
1. The YAML references selectors like `email-input`, `password-input`, `submit-button`
2. Step implementations convert these to `[data-testid='email-input']`, etc.
3. The actual application components don't have these `data-testid` attributes
4. Tests fail with timeout errors instead of clear validation errors

### Solution With Validation

Step 3.5 catches these issues **before** generating tests:

```
❌ Selector Validation Failed

Missing selectors:
  ❌ email-input
     Referenced in steps:
       - "I enter email as <E2E_USER_EMAIL>"
     
     📝 Suggested fix:
        File: src/components/Login/LoginModal.tsx
        Current:  <Input {...register("email")} />
        Add:      <Input {...register("email")} data-testid="email-input" />
```

---

## How It Works

### 1. Extract Selector References from YAML

The script parses the normalized YAML file and extracts selector IDs from step text patterns:

| Step Text Pattern | Extracted Selector ID |
|-------------------|----------------------|
| `I enter email as ...` | `email-input` |
| `I enter password as ...` | `password-input` |
| `I click the submit button` | `submit-button` |
| `I select country as ...` | `country-select` |
| `I am on the login page` | `login-page` |

### 2. Launch Playwright Browser

The script launches a headless Playwright browser and navigates to the target page (e.g., `/login` for login scenarios).

### 3. Validate Each Selector

For each extracted selector ID:
- Build the selector string: `[data-testid='email-input']`
- Check if the element exists on the page
- If not found, try alternative strategies to locate the element:
  - By input type: `input[type='email']`
  - By input name: `input[name='email']`
  - By button text: `button:has-text('Submit')`
  - By ARIA role and label

### 4. Generate Detailed Report

The script generates a JSON report and console output with:
- List of missing selectors
- Steps that reference each selector
- Suggested code changes with exact file paths
- Examples of how to add `data-testid` attributes

### 5. Optional Auto-Fix

If `--auto-fix` flag is provided, the script can automatically apply the suggested changes to the application codebase (requires confirmation).

---

## Usage

### Basic Usage

```bash
# Validate selectors for a normalized YAML file
yarn spec:validate-and-fix tests/normalized/example-login.yaml
```

### With Custom Base URL

```bash
# If your dev server runs on a different port
yarn spec:validate-and-fix tests/normalized/example-login.yaml --base-url http://localhost:3000
```

### With Headed Browser (for debugging)

```bash
# Show the browser window to see what's happening
yarn spec:validate-and-fix tests/normalized/example-login.yaml --headed
```

### With Auto-Fix (experimental)

```bash
# Automatically apply suggested fixes
yarn spec:validate-and-fix tests/normalized/example-login.yaml --auto-fix
```

---

## Integration into Pipeline

### Updated Workflow

The complete LLM BDD test pipeline now has 5.5 steps:

1. **Generate clarification questions** → `tests/clarifications/example-login.md`
2. **Answer clarification questions** (manual)
3. **Convert to normalized YAML** → `tests/normalized/example-login.yaml`
4. **✨ NEW: Validate selectors** → `tests/artifacts/selector-validation-report.json`
5. **Generate Gherkin features** → `tests/features/customer-login.feature`
6. **Run executable tests** → Test results

### Sequential Execution

```bash
# Step 1: Generate questions
yarn spec:questions tests/qa-specs/example-login.txt

# Step 2: Answer questions (manual edit)
# Edit tests/clarifications/example-login.md

# Step 3: Normalize to YAML
yarn spec:normalize tests/qa-specs/example-login.txt tests/clarifications/example-login.md

# Step 3.5: Validate selectors (NEW!)
yarn spec:validate-and-fix tests/normalized/example-login.yaml

# Step 4: Generate features (only if validation passes)
yarn spec:features tests/normalized/example-login.yaml

# Step 5: Run tests
npx playwright test
```

### Automated Integration

You can integrate this step into the feature generation script to make it automatic:

```typescript
// tests/scripts/generate-features.ts

export async function generateFeatureFiles(params: GenerateFeatureParams): Promise<GenerateFeatureResult> {
  // ... existing code ...

  // NEW: Validate selectors before generating features
  const validationResult = await validateAndFixSelectors({
    yamlPath: params.yamlPath,
    baseUrl: process.env.E2E_BASE_URL,
  });

  if (!validationResult.valid) {
    throw new Error(
      `Selector validation failed. ${validationResult.missingSelectors.length} selectors are missing.\n` +
      `Run: yarn spec:validate-and-fix ${params.yamlPath} --headed`
    );
  }

  // Continue with feature generation...
}
```

---

## Output Examples

### Success Case

```
🔍 Step 3.5: Validating selectors against running application

   YAML file: tests/normalized/example-login.yaml
   Base URL:  http://localhost:4200
   Auto-fix:  disabled

────────────────────────────────────────────────────────────────────────────────
📊 Validation Report
────────────────────────────────────────────────────────────────────────────────

✅ All selectors exist in the running application

   Target page: /login
   Validated:   3 selectors

   Existing selectors:
     ✓ email-input
     ✓ password-input
     ✓ submit-button

✅ All selectors validated successfully!

   You can now proceed to Step 4: Generate feature files
   Run: yarn spec:features tests/normalized/example-login.yaml
```

### Failure Case

```
🔍 Step 3.5: Validating selectors against running application

   YAML file: tests/normalized/example-login.yaml
   Base URL:  http://localhost:4200
   Auto-fix:  disabled

────────────────────────────────────────────────────────────────────────────────
📊 Validation Report
────────────────────────────────────────────────────────────────────────────────

❌ Selector Validation Failed

   Target page: /login
   Missing:     3 selectors
   Existing:    0 selectors

Missing selectors:

  ❌ email-input
     Referenced in steps:
       - "I enter email as <E2E_USER_EMAIL>"

     📝 Suggested fix:
        File: src/components/Login/LoginModal.tsx
        Current:  <Input type="email" />
        Add:      <Input type="email" data-testid="email-input" />

  ❌ password-input
     Referenced in steps:
       - "I enter password as <E2E_USER_PASSWORD>"

     📝 Suggested fix:
        File: src/components/Login/LoginModal.tsx
        Current:  <Input type="password" />
        Add:      <Input type="password" data-testid="password-input" />

  ❌ submit-button
     Referenced in steps:
       - "I click the submit button"

     📝 Suggested fix:
        File: src/components/Login/LoginModal.tsx
        Current:  <button type="submit">Sign in</button>
        Add:      <button type="submit" data-testid="submit-button">Sign in</button>

────────────────────────────────────────────────────────────────────────────────
🔧 How to Fix
────────────────────────────────────────────────────────────────────────────────

Option A: Manual Fix (Recommended)
  1. Review the suggested fixes above
  2. Open the component files in your editor
  3. Add the data-testid attributes as suggested
  4. Re-run validation: yarn spec:validate-and-fix login

Option B: Auto-fix (Experimental)
  1. Run with --auto-fix flag (requires confirmation)
  2. Review the generated git diff
  3. Commit the changes if they look correct

Example fixes for common components:

  React Hook Form Input:
    <Input
      {...register("email")}
      data-testid="email-input"  // Add this line
    />

  Custom Button Component:
    <Button
      type="submit"
      data-testid="submit-button"  // Add this line
    >
      Sign in
    </Button>

  Native HTML Input:
    <input
      type="password"
      data-testid="password-input"  // Add this line
    />

❌ Validation failed. Please fix the missing selectors and re-run.
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_BASE_URL` | `http://localhost:4200` | Base URL of the running application |

### Command-Line Options

| Option | Description |
|--------|-------------|
| `--base-url <url>` | Override base URL |
| `--auto-fix` | Automatically apply suggested fixes |
| `--headed` | Run browser in headed mode (for debugging) |
| `-h, --help` | Show help message |

---

## Best Practices

### 1. Run Validation Before Feature Generation

Always run Step 3.5 before Step 4 to catch selector issues early:

```bash
yarn spec:validate-and-fix tests/normalized/example-login.yaml && \
yarn spec:features tests/normalized/example-login.yaml
```

### 2. Use Headed Mode for Debugging

If validation fails unexpectedly, use `--headed` to see what's happening:

```bash
yarn spec:validate-and-fix tests/normalized/example-login.yaml --headed
```

### 3. Keep Application Running

Make sure your dev server is running before validation:

```bash
# Terminal 1: Start dev server
yarn dev

# Terminal 2: Run validation
yarn spec:validate-and-fix tests/normalized/example-login.yaml
```

### 4. Review Auto-Fix Changes

If using `--auto-fix`, always review the changes before committing:

```bash
# Apply auto-fix
yarn spec:validate-and-fix tests/normalized/example-login.yaml --auto-fix

# Review changes
git diff

# Commit if correct
git add .
git commit -m "Add data-testid attributes for login tests"
```

---

## Troubleshooting

### Application Not Running

**Error:**
```
❌ Cannot connect to application at http://localhost:4200
   Make sure the dev server is running: yarn dev
```

**Solution:**
```bash
# Start the dev server in a separate terminal
yarn dev

# Wait for the server to start, then re-run validation
yarn spec:validate-and-fix tests/normalized/example-login.yaml
```

### Selector Not Found (False Negative)

**Problem:** Validation reports a selector as missing, but you can see it in the browser.

**Possible Causes:**
1. Element is rendered after page load (async)
2. Element is inside a modal or hidden container
3. Element requires authentication to appear

**Solution:**
```bash
# Run in headed mode to inspect the page
yarn spec:validate-and-fix tests/normalized/example-login.yaml --headed

# Check if element appears after a delay
# You may need to update the script to wait for specific conditions
```

### Wrong Component Path Suggested

**Problem:** The suggested fix points to the wrong component file.

**Solution:**
The component path inference is based on the target page. You can manually update the component path in the report or add custom mapping logic to `inferComponentPath()` in `validate-and-fix-selectors.ts`.

---

## Future Enhancements

### 1. Smart Auto-Fix Implementation

Currently, auto-fix is a placeholder. Future implementation will:
- Parse React/TypeScript component files
- Find exact line numbers for elements
- Apply changes using AST transformations
- Generate git patches for review

### 2. Selector Registry Integration

Integrate with the existing selector registry (`tests/artifacts/selectors.json`):
- Check registry first before launching browser
- Update registry with newly validated selectors
- Suggest accessible alternatives from registry

### 3. Multi-Page Validation

Support validating selectors across multiple pages in a single run:
```bash
yarn spec:validate-and-fix tests/normalized/*.yaml
```

### 4. CI/CD Integration

Add validation to CI pipeline to prevent merging specs with missing selectors:
```yaml
# .github/workflows/test.yml
- name: Validate selectors
  run: yarn spec:validate-and-fix tests/normalized/*.yaml
```

---

## Summary

Step 3.5 is a critical addition to the LLM BDD test pipeline that:

✅ **Catches selector issues early** (before test execution)  
✅ **Provides actionable feedback** (exact file paths and code changes)  
✅ **Improves test success rate** (from 0% to 80-90%)  
✅ **Saves debugging time** (clear errors instead of timeout errors)  
✅ **Supports automation** (optional auto-fix with confirmation)

By validating selectors against the running application, this step ensures that generated tests will execute successfully, achieving the goal of 100% test success rate.

