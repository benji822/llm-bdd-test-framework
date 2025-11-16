# LLM BDD Test Framework

A deterministic end-to-end testing framework that transforms plain-text QA specifications into executable Playwright test suites. **No runtime authoring, no LLM in CI**—pure, fast, deterministic tests.

## Architecture Overview

```
Plain-text specs (.txt)
    ↓
Compile → parse specs, load pages.yaml, execute setup (via connectors.yaml)
    ↓
Generated Playwright tests (.spec.ts) + resolved aliases
    ↓
Verify → headless selector validation (role, label, text, type, name, placeholder, css, testid)
    ↓
Run → Playwright executes tests with stable selectors
```

## Quick Start (5 minutes)

### 1. Install & Configure

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your E2E_BASE_URL
```

### 2. Create pages.yaml

Maps page names to routes:

```yaml
# pages.yaml
login: /login
dashboard: /dashboard
```

### 3. Create a spec

```plaintext
Feature: Simple login

User logs in:
- I am on the login page
- I enter email as "user@example.com"
- I enter password as "password123"
- I click the login button
- I should see text "Welcome"
```

### 4. Compile & run

```bash
# Generate Playwright spec
yarn llm compile specs/login.txt --pages pages.yaml --out-dir tests/e2e-gen

# Verify selectors (optional, requires running server)
yarn llm verify --base-url http://localhost:3000

# Run tests
yarn test
```

That's it. No recordings, no LLM calls during test execution, no flakiness.

---

## Table of Contents

- [Concepts](#concepts)
- [File Structure](#file-structure)
- [Workflow](#workflow)
  - [Creating Specs](#creating-specs)
  - [Setting Up Test Data](#setting-up-test-data)
  - [Using Selectors](#using-selectors)
  - [CI/CD Integration](#cicd-integration)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

---

## Concepts

### Plain-Text Specs

Write tests as readable English:

```plaintext
Feature: Player claims reward

Setup:
- Create player with email "alice@example.com" as $player
- Create reward with title "Golden Badge" as $reward

Player claims reward:
- I am on the dashboard page
- I click the rewards button
- I should see the reward with title "Golden Badge"
```

**Format rules:**
- `Feature:` header (required)
- `Setup:` block (optional, declares pre-test data)
- Scenario names ending in `:` (required)
- Steps prefixed with `-` (required)

### pages.yaml

Centralized route mapping:

```yaml
login: /login
dashboard: /dashboard
home: /
```

All scenarios reference page names (e.g., "I am on the login page"), and the compiler resolves them from this config. **Never hardcode routes in specs.**

### Step Vocabulary

Steps must match approved patterns in `tests/artifacts/step-vocabulary.json`:

```json
{
  "definitions": [
    {
      "pattern": "I am on the {page} page",
      "domain": "navigation"
    },
    {
      "pattern": "I click the {element} button",
      "domain": "interaction"
    },
    {
      "pattern": "I should see text {text}",
      "domain": "assertion"
    }
  ]
}
```

Steps that don't match raise a compile error. Add new patterns here before using them in specs.

### Selector Resolution

The runtime `selectorResolver` finds elements using multiple strategies in priority order:

1. **Registry ID** — Direct lookup in `tests/artifacts/selectors/registry.json`
2. **Role + text** — `getByRole('button', { name: /submit/i })`
3. **Label** — `getByLabel('email')`
4. **Text** — `getByText('Welcome')`
5. **Type** — `input[type='submit']`
6. **Name** — `input[name='username']`
7. **Placeholder** — `input[placeholder='Enter email']`
8. **CSS** — Fallback to explicit CSS selectors
9. **Test ID** — `[data-testid='..']`

**Best practice**: Ensure your app has semantic HTML (`role`, `aria-label`) and `data-testid` attributes on complex elements.

### Setup DSL & Connectors

Define test data in the `Setup:` block:

```yaml
Setup:
- Create player with email "alice@example.com" as $player
- Create reward with title "Achievement" as $reward
- Assign reward to player
```

The compiler loads `connectors.yaml` to map these declarations to real HTTP/GraphQL/SQL actions, executes them before scenarios, and injects the results (e.g., `$player.id = 123`) into steps.

**Idempotency**: Each action includes a unique key (SHA256 hash of resource + timestamp) so replay is safe—same spec can run multiple times without duplicating data.

---

## File Structure

```
.
├── README.md                 ← You are here
├── pages.yaml                ← Page name → route mappings
├── connectors.yaml           ← Setup action declarations (optional)
├── specs/                    ← Your plain-text QA specs
│   ├── login.txt
│   └── player-rewards.txt
├── tests/
│   ├── artifacts/
│   │   ├── selectors/
│   │   │   └── registry.json    ← Cached selector registry
│   │   └── step-vocabulary.json ← Approved step patterns
│   ├── e2e-gen/               ← Generated Playwright specs
│   └── steps/
│       └── support/
│           └── selector-resolver.ts  ← Selector resolution engine
├── playwright.config.ts
└── tsconfig.json
```

---

## Workflow

### Creating Specs

**Step 1: Create the spec file**

```plaintext
# specs/login.txt

Feature: User authentication

Happy path:
- I am on the login page
- I enter email as "user@example.com"
- I enter password as "mypassword"
- I click the login button
- I should see text "Dashboard"

Invalid password:
- I am on the login page
- I enter email as "user@example.com"
- I enter password as "wrong"
- I click the login button
- I should see text "Invalid credentials"
```

**Step 2: Compile**

```bash
yarn llm compile specs/login.txt \
  --pages pages.yaml \
  --base-url http://localhost:3000 \
  --out-dir tests/e2e-gen
```

**Step 3: Run**

```bash
yarn test tests/e2e-gen/
```

### Setting Up Test Data

Use the `Setup:` block to declare pre-test data, and `connectors.yaml` to define how to create it:

**spec:**
```yaml
Feature: Player claims reward

Setup:
- Create player with email "alice@example.com" as $player
- Create reward with title "Golden Badge" as $reward

Player claims reward:
- I am on the dashboard page
- I click rewards
- I should see the reward with title "Golden Badge"
```

**connectors.yaml:**
```yaml
version: '1.0'

endpoints:
  api:
    type: http
    url: '${API_BASE_URL}/api'

actions:
  create_player:
    resource: player
    operation: create
    endpoint: api
    payload:
      status: active

  create_reward:
    resource: reward
    operation: create
    endpoint: api
```

**Compile with setup:**
```bash
export API_BASE_URL=http://localhost:3001
yarn llm compile specs/player-rewards.txt \
  --pages pages.yaml \
  --connectors connectors.yaml \
  --out-dir tests/e2e-gen
```

The compiler:
1. Executes setup actions in order (mocked HTTP calls, or real if API endpoints are running)
2. Builds aliases: `$player = { id: 123, email: "alice@example.com", ... }`
3. Injects aliases into scenario steps: `"I should see player ID 123"`
4. Generates Playwright spec with resolved values

**Idempotency**: If the spec runs twice, setup actions generate the same idempotency key and return the same data without duplicating records.

### Using Selectors

**For simple cases**, let the resolver use text hints:

```plaintext
- I click the login button         # Finds <button>Login</button>
- I click the submit button        # Finds <button type="submit">
- I enter email as "user@..."      # Finds <input placeholder="email">
```

**For ambiguous cases**, register selectors in `tests/artifacts/selectors/registry.json`:

```json
{
  "email-input": {
    "id": "email-input",
    "type": "testid",
    "selector": "input[data-testid='email-input']",
    "priority": 1,
    "page": "/login"
  }
}
```

Then reference in your step:
```plaintext
- I enter email as "user@example.com"  # Resolved via text + role hints
```

Or use explicit registry ID (advanced):
```typescript
// In generated test code:
const { locator } = await selectorResolver(page, 'email-input', {
  textHint: 'email'
});
```

### CI/CD Integration

**GitHub Actions Example:**

```yaml
name: E2E Tests

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: yarn

      - run: yarn install --frozen-lockfile
      - run: npx playwright install --with-deps

      - name: Compile specs
        run: |
          yarn llm compile specs/*.txt \
            --pages pages.yaml \
            --out-dir tests/e2e-gen
        env:
          API_BASE_URL: ${{ secrets.API_BASE_URL }}

      - name: Run tests
        run: yarn test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}

      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

**Key principles:**
- Specs are committed to git.
- Generated `.spec.ts` files are **not** committed (they're ephemeral).
- `connectors.yaml` is committed.
- Environment variables (secrets) are set in the CI environment, not in files.
- Compile step executes setup, generates tests, then Playwright runs them.

---

## Commands Reference

### Compile

```bash
yarn llm compile <spec> [options]

Options:
  --pages <path>          Path to pages.yaml (default: pages.yaml)
  --connectors <path>     Path to connectors.yaml (optional)
  --out-dir <dir>         Output directory (default: tests/e2e-gen)
  --base-url <url>        Base URL for tests (default: http://localhost)
  --vocabulary <path>     Path to step-vocabulary.json (default: tests/artifacts/step-vocabulary.json)
  --scenario <name>       Compile only this scenario (optional)
```

**Example:**
```bash
yarn llm compile specs/login.txt \
  --pages pages.yaml \
  --base-url http://localhost:3000 \
  --out-dir tests/e2e-gen
```

### Verify

```bash
yarn llm verify [options]

Options:
  --base-url <url>     Base URL for selector verification
  --spec-dir <dir>     Generated spec directory (default: tests/e2e-gen)
  --out-dir <dir>      Report output directory (default: tests/artifacts)
```

**Example:**
```bash
yarn llm verify --base-url http://localhost:3000 --spec-dir tests/e2e-gen
```

Outputs `tests/artifacts/verification-report.json` with pass/fail for each selector.

### Test Execution

```bash
# Run all tests
yarn test

# Run in headed mode (see browser)
yarn test:headed

# Run UI mode (interactive)
yarn test:ui

# View report
yarn test:report
```

---

## Troubleshooting

### Compile Fails with "Step pattern not in vocabulary"

**Cause**: Your spec uses a step that doesn't match `tests/artifacts/step-vocabulary.json`.

**Fix**:
1. Add the pattern to `tests/artifacts/step-vocabulary.json`:
   ```json
   {
     "pattern": "I {action} the {element}",
     "domain": "interaction"
   }
   ```
2. Recompile: `yarn llm compile specs/...`

### Verification Fails: "No matching element for hint"

**Cause**: The selector resolver couldn't find the element with the given hints.

**Fix**:
1. Ensure your app is running at the `--base-url`.
2. Check browser console for errors (may block element visibility).
3. Add semantic HTML to your app:
   - Use `role="button"`, `aria-label="..."`, or `data-testid="..."`
4. Register the selector manually:
   ```json
   {
     "login-button": {
       "id": "login-button",
       "type": "testid",
       "selector": "button[data-testid='login-button']",
       "page": "/login"
     }
   }
   ```

### Generated Spec Not Running

**Cause**: Playwright config or environment variable missing.

**Fix**:
1. Check `E2E_BASE_URL` is set: `echo $E2E_BASE_URL`
2. Verify `playwright.config.ts` references the generated directory:
   ```typescript
   export default defineConfig({
     testDir: 'tests/e2e-gen',
   });
   ```
3. Check generated spec has valid syntax:
   ```bash
   cat tests/e2e-gen/*.spec.ts | head -20
   ```

### Setup Actions Not Executing

**Cause**: `connectors.yaml` not provided or setup actions don't match any connector action.

**Fix**:
1. Pass `--connectors connectors.yaml` to compile:
   ```bash
   yarn llm compile specs/... --connectors connectors.yaml
   ```
2. Verify resource + operation match in `connectors.yaml`:
   ```yaml
   # spec: "Create player..."
   # connectors.yaml must have:
   actions:
     create_player:
       resource: player
       operation: create
   ```
3. Check environment variables are set:
   ```bash
   export API_BASE_URL=http://localhost:3001
   yarn llm compile specs/... --connectors connectors.yaml
   ```

### Idempotency Key Collision

**Cause**: Same setup action runs twice with slightly different timestamp.

**Why it's OK**: The connector system uses a stable hash (first 16 chars of `SHA256(resource:timestamp)`), so replays within the same second are idempotent. If you run the spec after 1 second, a new record is created (as expected).

**To reuse data**: Explicitly set the idempotency key in `connectors.yaml`:
```yaml
actions:
  create_player:
    resource: player
    operation: create
    endpoint: api
    idempotencyKey: player_uuid  # Fixed key → always returns same record
```

---

## Documentation

- **[pages.yaml Guide](docs/pages-yaml.md)** — Understand page name mappings and routing.
- **[connectors.yaml Guide](docs/setup-connectors-guide.md)** — Set up HTTP/GraphQL/SQL actions for test data.
- **[Selector Strategy & Registry](docs/selector-strategy.md)** — Deep dive on selector resolution and best practices.
- **[Step Vocabulary](docs/step-vocabulary.md)** — Approved patterns and how to extend them.
- **[CI/CD Workflows](docs/ci-workflows.md)** — Real-world GitHub Actions and other CI examples.

---

## Contributing

1. **Create a spec** under `specs/`.
2. **Compile**: `yarn llm compile specs/... --pages pages.yaml --out-dir tests/e2e-gen`
3. **Test locally**: `yarn test tests/e2e-gen/`
4. **Commit**: Add spec + any changes to `connectors.yaml` or `pages.yaml`.
5. **Do NOT commit** generated `tests/e2e-gen/` files (they're ephemeral).

---

## License

MIT

## Support

- Review the Quick Start above.
- Check [Troubleshooting](#troubleshooting) for common issues.
- Open an issue on GitHub with spec + error logs.
