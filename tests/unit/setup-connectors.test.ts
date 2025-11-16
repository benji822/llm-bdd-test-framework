import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, writeTextFile, readTextFile } from '../scripts/utils/file-operations.js';
import { compileQaSpecs } from '../scripts/llm/compiler.js';
import { executeSetup, injectAliasesIntoSteps } from '../scripts/llm/connectors-executor.js';

test.describe('Setup DSL + Connectors', () => {
  const tempDir = path.resolve('.tmp-test-setup-connectors');
  const connectorsPath = path.join(tempDir, 'connectors.yaml');
  const pagesPath = path.join(tempDir, 'pages.yaml');
  const outputDir = path.join(tempDir, 'e2e-gen');

  test.beforeAll(async () => {
    await ensureDir(tempDir);

    // Create pages.yaml
    const pages = `login: /login
dashboard: /dashboard
home: /
rewards: /rewards
`;
    await writeTextFile(pagesPath, pages);

    // Create connectors.yaml with mock endpoints
    const connectors = `version: '1.0'

endpoints:
  player_api:
    type: http
    url: 'http://localhost:3001/api'
  reward_api:
    type: http
    url: 'http://localhost:3001/api'

actions:
  create_player:
    name: create_player
    resource: player
    operation: create
    endpoint: player_api
    payload:
      status: active
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
`;
    await writeTextFile(connectorsPath, connectors);
  });

  test.afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('Execute setup actions and build aliases', async () => {
    const state = await executeSetup(
      [
        {
          type: 'create',
          resource: 'player',
          properties: { email: 'alice@example.com', name: 'Alice' },
          alias: '$player',
        },
        {
          type: 'create',
          resource: 'reward',
          properties: { title: 'Golden Badge', points: '100' },
          alias: '$reward',
        },
        {
          type: 'assign',
          resource: 'reward',
          properties: { playerId: '$player.id', rewardId: '$reward.id' },
        },
      ],
      connectorsPath
    );

    // Verify all actions executed
    expect(state.executedActions.length).toBe(3);
    expect(state.executedActions[0].status).toBe('success');
    expect(state.executedActions[1].status).toBe('success');
    expect(state.executedActions[2].status).toBe('success');

    // Verify aliases were created
    expect(state.aliases).toHaveProperty('player');
    expect(state.aliases).toHaveProperty('reward');
    expect(state.aliases.player).toHaveProperty('id');
    expect(state.aliases.reward).toHaveProperty('id');
  });

  test('Inject aliases into steps', () => {
    const setupState = {
      executedActions: [],
      aliases: {
        player: { id: '123', email: 'alice@example.com', name: 'Alice' },
        reward: { id: '456', title: 'Golden Badge', points: 100 },
      },
    };

    const steps = [
      'I am on the dashboard page',
      'I click the rewards link',
      'I claim reward as $player',
      'I see the reward for $reward',
    ];

    const injected = injectAliasesIntoSteps(steps, setupState);

    // Verify $player.id and $reward.id substitutions
    expect(injected[2]).toContain('123'); // $player -> 123
    expect(injected[3]).toContain('456'); // $reward -> 456
    expect(injected[0]).toBe('I am on the dashboard page'); // Unchanged
  });

  test('Compile spec with setup, generate test with aliases', async () => {
    const specPath = path.join(tempDir, 'player-claims-reward.spec.txt');
    const spec = `Feature: Player claims reward

Setup:
- Create player with email "testplayer@example.com" as $player
- Create reward with title "First Victory" as $reward

Player claims reward:
- I am on the dashboard page
- I click the rewards button
- I claim reward as $player
- I should see the confirmation message
`;

    await writeTextFile(specPath, spec);

    // Compile with setup execution
    await compileQaSpecs({
      specPaths: [specPath],
      outputDir,
      pagesPath,
      connectorsPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    // Verify compiled spec exists
    const files = await fs.readdir(outputDir);
    const specFiles = files.filter((f) => f.endsWith('.spec.ts'));
    expect(specFiles.length).toBeGreaterThan(0);

    const generatedPath = path.join(outputDir, specFiles[0]);
    const generated = await readTextFile(generatedPath);

    // Verify structure
    expect(generated).toContain('import { test, expect } from \'@playwright/test\'');
    expect(generated).toContain('Player claims reward');
    expect(generated).toContain('selectorResolver');
    expect(generated).toContain('await page.goto');

    console.log('✓ Spec compiled with setup execution and alias injection');
  });

  test('Complex flow: Player claims reward end-to-end', async () => {
    const specPath = path.join(tempDir, 'complex-flow.spec.txt');
    const complexOutputDir = path.join(tempDir, 'e2e-gen-complex');

    const spec = `Feature: Complete reward claim flow

Setup:
- Create player with email "reward-tester@example.com" as $player
- Create reward with title "Achievement Unlocked" as $reward
- Assign reward to player

Reward claim flow:
- I am on the dashboard page
- I click the profile button
- I navigate to rewards page
- I click the first unclaimed reward
- I click the claim button
- I should see "Reward claimed successfully"
- The player balance should be updated
`;

    await writeTextFile(specPath, spec);

    // Execute setup and compile
    const setupState = await executeSetup(
      [
        {
          type: 'create',
          resource: 'player',
          properties: { email: 'reward-tester@example.com' },
          alias: '$player',
        },
        {
          type: 'create',
          resource: 'reward',
          properties: { title: 'Achievement Unlocked' },
          alias: '$reward',
        },
        {
          type: 'assign',
          resource: 'reward',
          properties: { playerId: '$player.id', rewardId: '$reward.id' },
        },
      ],
      connectorsPath
    );

    // Verify setup executed
    expect(setupState.executedActions).toHaveLength(3);
    expect(setupState.aliases).toHaveProperty('player');
    expect(setupState.aliases).toHaveProperty('reward');

    // Compile
    await compileQaSpecs({
      specPaths: [specPath],
      outputDir: complexOutputDir,
      pagesPath,
      connectorsPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    // Verify compilation
    const files = await fs.readdir(complexOutputDir);
    const specFiles = files.filter((f) => f.endsWith('.spec.ts'));
    expect(specFiles.length).toBeGreaterThan(0);

    const generatedPath = path.join(complexOutputDir, specFiles[0]);
    const generated = await readTextFile(generatedPath);

    // Verify the scenario is present
    expect(generated).toContain('Reward claim flow');
    expect(generated).toContain('selectorResolver');
    expect(generated).toContain('await page.goto');

    console.log('✓ Complex reward claim flow compiled successfully with setup state');
  });

  test('Idempotency: multiple runs produce stable results', async () => {
    const specPath = path.join(tempDir, 'idempotent.spec.txt');
    const idempotentOutputDir = path.join(tempDir, 'e2e-gen-idempotent');

    const spec = `Feature: Idempotent setup

Setup:
- Create player with email "idempotent-test@example.com" as $player

Basic navigation:
- I am on the dashboard page
`;

    await writeTextFile(specPath, spec);

    // First compilation
    await compileQaSpecs({
      specPaths: [specPath],
      outputDir: idempotentOutputDir,
      pagesPath,
      connectorsPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    const files1 = await fs.readdir(idempotentOutputDir);
    const spec1 = await readTextFile(path.join(idempotentOutputDir, files1[0]));

    // Clean and recompile
    await fs.rm(idempotentOutputDir, { recursive: true });
    await ensureDir(idempotentOutputDir);

    await compileQaSpecs({
      specPaths: [specPath],
      outputDir: idempotentOutputDir,
      pagesPath,
      connectorsPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    const files2 = await fs.readdir(idempotentOutputDir);
    const spec2 = await readTextFile(path.join(idempotentOutputDir, files2[0]));

    // Verify both are identical
    expect(spec1).toBe(spec2);
    console.log('✓ Idempotent compilation: multiple runs produce identical output');
  });

  test('Environment variable resolution in connectors', async () => {
    const envConnectorsPath = path.join(tempDir, 'connectors-env.yaml');
    const envConnectors = `version: '1.0'

endpoints:
  secured_api:
    type: http
    url: '\${SECURE_API_URL}'

actions:
  create_player:
    name: create_player
    resource: player
    operation: create
    endpoint: secured_api
`;

    await writeTextFile(envConnectorsPath, envConnectors);

    // Set environment variable
    process.env.SECURE_API_URL = 'https://api.example.com';

    const state = await executeSetup(
      [
        {
          type: 'create',
          resource: 'player',
          properties: { email: 'env-test@example.com' },
          alias: '$player',
        },
      ],
      envConnectorsPath
    );

    // Verify execution (should resolve env var without error)
    expect(state.executedActions[0].status).toBe('success');
    console.log('✓ Environment variables resolved in connectors');
  });
});
