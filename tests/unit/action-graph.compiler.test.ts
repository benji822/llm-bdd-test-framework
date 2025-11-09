import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileActionGraph, generateFeatureContent, generateStepDefinitions } from '../scripts/action-graph/compiler.js';
import type { ActionGraph } from '../scripts/action-graph/types.js';
import { generateGraphId } from '../scripts/action-graph/persistence.js';

const tmpRoot = join(process.cwd(), 'tests', 'tmp', 'compiler-artifacts');

function cleanup(): void {
  if (existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true });
  }
}

function setup(): void {
  cleanup();
  mkdirSync(tmpRoot, { recursive: true });
}

function createGraph(): ActionGraph {
  const specId = '11111111-1111-1111-1111-111111111111';
  return {
    graphId: generateGraphId(),
    version: '1.0',
    nodes: [
      {
        nodeId: 'bg_0',
        type: 'setup',
        stepIndex: 0,
        gherkinStep: { keyword: 'given', text: 'the application is running' },
        execution: { state: 'pending' },
      },
      {
        nodeId: 'step_0',
        type: 'navigate',
        stepIndex: 1,
        gherkinStep: { keyword: 'given', text: 'I am on the login page' },
        instructions: {
          deterministic: {
            action: 'navigate',
            value: 'https://example.com/login',
          },
        },
        execution: { state: 'pending' },
      },
      {
        nodeId: 'step_1',
        type: 'act',
        stepIndex: 2,
        gherkinStep: { keyword: 'when', text: 'I enter email as "qa@example.com"' },
        instructions: {
          deterministic: {
            selector: 'email-input',
            action: 'fill',
            value: 'qa@example.com',
          },
        },
        selectors: [{ id: 'email-input', locator: 'input[data-testid="email"]', verified: true }],
        execution: { state: 'pending' },
      },
      {
        nodeId: 'step_2',
        type: 'act',
        stepIndex: 3,
        gherkinStep: { keyword: 'and', text: 'I click the submit button' },
        instructions: {
          deterministic: {
            selector: 'submit-button',
            action: 'click',
          },
        },
        selectors: [{ id: 'submit-button', locator: 'button[type="submit"]', verified: true }],
        execution: { state: 'pending' },
      },
      {
        nodeId: 'step_3',
        type: 'assert',
        stepIndex: 4,
        gherkinStep: { keyword: 'then', text: 'I should see text "Welcome back"' },
        instructions: {
          deterministic: {
            selector: 'welcome-heading',
            value: 'Welcome back',
          },
        },
        selectors: [{ id: 'welcome-heading', locator: 'h1', verified: true }],
        execution: { state: 'pending' },
      },
    ],
    edges: [
      { from: 'bg_0', to: 'step_0', type: 'sequential' },
      { from: 'step_0', to: 'step_1', type: 'sequential' },
      { from: 'step_1', to: 'step_2', type: 'sequential' },
      { from: 'step_2', to: 'step_3', type: 'sequential' },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      specId,
      scenarioName: 'Successful login',
      featureName: 'User Authentication',
      scenarioTags: ['smoke', 'auth'],
      authorship: {
        authoringMode: true,
        authoredBy: 'llm',
      },
    },
  };
}

async function run(): Promise<void> {
  console.log('Testing action-graph compiler...');
  setup();

  const graph = createGraph();

  // Feature generation
  {
    const feature = generateFeatureContent(graph);
    assert(feature.includes('Feature: User Authentication'));
    assert(feature.includes('Background:'));
    assert(feature.includes('Scenario: Successful login'));
    assert(feature.includes('@smoke @auth'));
    console.log('✓ Feature content contains expected sections');
  }

  // Step definitions
  {
    const steps = generateStepDefinitions(graph);
    assert(steps.includes('Given("I am on the login page"'));
    assert(steps.includes('await page.locator("input[data-testid=\\"email\\"]").fill("qa@example.com");'));
    assert(steps.includes('await expect(page.locator("h1")).toContainText("Welcome back");'));
    console.log('✓ Step definitions include deterministic actions');
  }

  // End-to-end compile writes files
  {
    const featureDir = join(tmpRoot, 'features');
    const stepsDir = join(tmpRoot, 'steps');

    const result = await compileActionGraph(graph, { featureDir, stepsDir });
    assert(existsSync(result.featurePath), 'Feature file should exist');
    assert(existsSync(result.stepsPath), 'Steps file should exist');

    const featureContent = readFileSync(result.featurePath, 'utf8');
    const stepsContent = readFileSync(result.stepsPath, 'utf8');
    assert(featureContent.includes('Feature:'), 'Feature file should contain header');
    assert(stepsContent.includes('createBdd'), 'Steps file should contain BDD bindings');

    console.log('✓ compileActionGraph writes artifacts to disk');
  }

  cleanup();
  console.log('\nAll action-graph compiler tests passed!');
}

run().catch((error) => {
  console.error('Compiler tests failed:', error);
  cleanup();
  process.exit(1);
});
