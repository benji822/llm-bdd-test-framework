# Setup DSL & Connectors Guide

## Overview

The Setup DSL enables test specs to declare data dependencies using a `setup:` block, and the connectors system maps those declarations to real HTTP/GraphQL/SQL actions via `connectors.yaml`.

This enables:
- **Idempotent test data creation** — Setup executes before UI steps; aliases allow cross-step references
- **No hardcoding credentials** — Environment variables in connectors.yaml keep secrets secure
- **Complex multi-step scenarios** — Example: "player claims reward" with pre-created player and reward records

## Spec Format

### Basic Setup Syntax

```yaml
Feature: Player rewards system

Setup:
- Create player with email "test@example.com" as $player
- Create reward with title "Golden Badge" as $reward
- Assign reward to player

Player claims reward:
- I am on the dashboard page
- I click the rewards button
- I should see the badge
```

**Rules:**
- `setup:` block precedes all scenarios (one per spec)
- Each setup line: `{Create|Delete|Update|Assign} {resource} with {key} {value} as {$alias}`
- Aliases (e.g., `$player`, `$reward`) are available in subsequent steps and other setup actions
- Reference aliases using `$alias.id`, `$alias.email`, etc. in downstream actions

## Connectors Configuration

### connectors.yaml Structure

```yaml
version: '1.0'

variables:
  - name: api_base_url
    value: '${API_BASE_URL}'
    env: API_BASE_URL

endpoints:
  player_api:
    type: http
    url: '${API_BASE_URL}/api'
  reward_api:
    type: http
    url: '${API_BASE_URL}/api'
  game_db:
    type: sql
    database: game_test
    connectionString: '${DATABASE_URL}'

actions:
  create_player:
    name: create_player
    resource: player
    operation: create
    endpoint: player_api
    payload:
      status: active
    idempotencyKey: player_uuid
  
  create_reward:
    name: create_reward
    resource: reward
    operation: create
    endpoint: reward_api
    payload:
      type: generic
      available: true
  
  assign_reward:
    name: assign_reward
    resource: reward
    operation: assign
    endpoint: reward_api
```

**Configuration Details:**

- **variables**: Global config values; env vars must be set before compile
- **endpoints**: HTTP, GraphQL, or SQL targets
  - `type`: `'http' | 'graphql' | 'sql'`
  - `url`: Endpoint URL (for HTTP/GraphQL); resolved from env vars
  - `database` / `connectionString`: Database config (for SQL)
- **actions**: Maps setup declarations to endpoint calls
  - `resource`: e.g., `"player"`, `"reward"` (matches setup block)
  - `operation`: `'create' | 'delete' | 'update' | 'assign'` (matches setup verb)
  - `endpoint`: Reference to an endpoint key
  - `payload`: Default fields (overridden by setup properties)
  - `idempotencyKey`: Optional unique key for replay safety

### Environment Variables

**Supported formats:**
- `${ENV_VAR_NAME}` — Variable expansion
- `<ENV_VAR_NAME>` — Alternative syntax

**Example:**
```yaml
endpoints:
  secured_api:
    type: http
    url: '${SECURE_API_URL}'
```

```bash
export SECURE_API_URL=https://api.example.com
yarn bdd compile specs/ --connectors connectors.yaml
```

## Execution Flow

### 1. Compile with Setup

```bash
yarn bdd compile specs/player-rewards.spec.txt \
  --pages pages.yaml \
  --connectors connectors.yaml \
  --out-dir tests/e2e-gen
```

**Steps:**
1. Parse spec (including `setup:` block)
2. Load connectors.yaml
3. Execute setup actions in order:
   - Match each setup action to a connector action
   - Call HTTP/GraphQL endpoint or SQL query
   - Collect response into alias (e.g., `$player.id = 123`)
4. Inject aliases into scenario steps
5. Generate Playwright spec with resolved values

### 2. Setup State Injection

After setup execution, aliases become available in steps:

```
Setup:
- Create player with email "alice@example.com" as $player

Scenario:
- I should see player ID 123  # $player.id injected as "123"
```

The compiler replaces `$player` references with actual data from the setup response.

## Real-World Example: Player Claims Reward

### Spec File

```yaml
Feature: Complete reward claim flow

Setup:
- Create player with email "reward-tester@example.com" as $player
- Create reward with title "Achievement Unlocked" as $reward
- Assign reward to player

Reward claim flow:
- I am on the dashboard page
- I click the profile button
- I navigate to rewards page
- I click the reward with title "Achievement Unlocked"
- I click the claim button
- I should see "Reward claimed successfully"
```

### Connectors Config

```yaml
endpoints:
  api:
    type: http
    url: '${API_BASE_URL}/api'

actions:
  create_player:
    resource: player
    operation: create
    endpoint: api
  
  create_reward:
    resource: reward
    operation: create
    endpoint: api
  
  assign_reward:
    resource: reward
    operation: assign
    endpoint: api
```

### Generated Playwright Test

```typescript
import { test, expect } from '@playwright/test';

const PAGES = { dashboard: '/dashboard', ... };

async function executeSetup(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  // [Real implementation would call HTTP endpoints here]
  state.$player = { id: '550e8400-e29b-41d4-a716-446655440000', email: '...' };
  state.$reward = { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', title: '...' };
  return state;
}

test.describe('Complete reward claim flow', () => {
  let setupState: Record<string, unknown>;
  
  test.beforeAll(async () => {
    setupState = await executeSetup();
  });

  test('Reward claim flow', async ({ page }) => {
    await page.goto(resolvePageUrl('dashboard'));
    // Steps execute with alias values available
    // ...
  });
});
```

## Idempotency

Setup actions include built-in idempotency keys to allow safe replays:

```yaml
actions:
  create_player:
    resource: player
    operation: create
    endpoint: player_api
    idempotencyKey: player_uuid  # Unique prefix ensures replays are safe
```

When the same spec runs twice:
1. First run: Create player (idempotencyKey = `player_uuid:2025-11-16T06:55:42Z`)
2. Second run: Connector detects duplicate key, returns existing player (no-op)

This allows:
- CI to run the same spec multiple times safely
- Local test reruns without data pollution
- Safe spec execution in parallel

## Limitations & Future Work

**Current implementation (mocked):**
- HTTP/GraphQL calls return mock responses with UUID
- SQL queries are not executed (stubbed)
- Environment variable resolution works; actual API calls do not

**Production ready (planned):**
- Real HTTP client integration (fetch/axios)
- GraphQL query execution
- SQL execution via driver
- Retry logic with exponential backoff
- Proper error handling and rollback

## Troubleshooting

### Q: Setup executes but aliases don't appear in steps

**A:** Ensure your spec uses correct alias syntax:
- ✅ Correct: `I claim reward as $player`
- ❌ Wrong: `I claim reward as player` (missing `$`)

### Q: Environment variable not found error

**A:** Set the required env var before compile:
```bash
export API_BASE_URL=https://api.example.com
yarn bdd compile specs/ --connectors connectors.yaml
```

### Q: Setup action not matching any connector action

**A:** Ensure `resource` and `operation` in setup match the connector action:
```yaml
Setup:
- Create player ...  # resource: player, operation: create

actions:
  create_player:
    resource: player
    operation: create  # Must match setup verb
```

### Q: Can I have multiple setup actions for same resource?

**A:** Yes. The first matching action is used. To create multiple records:
```yaml
Setup:
- Create player with email "alice@example.com" as $alice
- Create player with email "bob@example.com" as $bob
```

Both will execute (each with unique alias) as long as the connector allows it.
