import { strict as assert } from 'node:assert';
import { ActionGraphBuilder, yamlToActionGraph } from '../scripts/action-graph/index.js';
import { randomUUID } from 'node:crypto';

async function runTests() {
  console.log('Testing ActionGraphBuilder...');

  // Test 1: Basic build
  {
    const specId = randomUUID();
    const graph = new ActionGraphBuilder()
      .setSpecId(specId)
      .setScenarioName('Login Test')
      .setAuthorship(true, 'llm')
      .addNode('step_0', 'navigate')
      .addGherkinStep('step_0', 'given', 'I am on the login page')
      .addNode('step_1', 'act')
      .addGherkinStep('step_1', 'when', 'I enter email')
      .addEdge('step_0', 'step_1', 'sequential')
      .build();

    assert(graph.graphId, 'Should have graphId');
    assert.equal(graph.version, '1.0');
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.metadata.specId, specId);
    assert.equal(graph.metadata.scenarioName, 'Login Test');
    console.log('✓ Basic build');
  }

  // Test 2: Instructions
  {
    const specId = randomUUID();
    const graph = new ActionGraphBuilder()
      .setSpecId(specId)
      .setScenarioName('Test')
      .addNode('step_0', 'act')
      .addNaturalInstruction('step_0', 'Fill the email field')
      .addDeterministicInstruction('step_0', 'email-input', 'fill', 'test@example.com')
      .build();

    const node = graph.nodes[0];
    assert.equal(node.instructions?.natural, 'Fill the email field');
    assert.equal(node.instructions?.deterministic?.selector, 'email-input');
    assert.equal(node.instructions?.deterministic?.action, 'fill');
    assert.equal(node.instructions?.deterministic?.value, 'test@example.com');
    console.log('✓ Natural and deterministic instructions');
  }

  // Test 3: Selectors
  {
    const specId = randomUUID();
    const graph = new ActionGraphBuilder()
      .setSpecId(specId)
      .setScenarioName('Test')
      .addNode('step_0', 'act')
      .addSelector('step_0', 'email-input', 'input[data-testid="email"]')
      .addSelector('step_0', 'password-input', 'input[data-testid="password"]')
      .build();

    const node = graph.nodes[0];
    assert.equal(node.selectors?.length, 2);
    assert.equal(node.selectors?.[0].id, 'email-input');
    assert.equal(node.selectors?.[1].id, 'password-input');
    console.log('✓ Add selectors');
  }

  // Test 4: Node metadata merges
  {
    const specId = randomUUID();
    const graph = new ActionGraphBuilder()
      .setSpecId(specId)
      .setScenarioName('Test')
      .addNode('step_0', 'act', { metadata: { retries: 2 } })
      .addMetadata('step_0', { testData: { email: 'tester@example.com' } })
      .build();

    const node = graph.nodes[0];
    assert.equal(node.metadata?.retries, 2);
    assert.deepEqual(node.metadata?.testData, { email: 'tester@example.com' });
    console.log('✓ Node metadata merges additional properties');
  }

  // Test 5: Sequential chains
  {
    const specId = randomUUID();
    const graph = new ActionGraphBuilder()
      .setSpecId(specId)
      .setScenarioName('Test')
      .addNode('step_0', 'navigate')
      .addNode('step_1', 'act')
      .addNode('step_2', 'act')
      .addNode('step_3', 'assert')
      .addSequentialChain('step_0', 'step_1', 'step_2', 'step_3')
      .build();

    assert.equal(graph.edges.length, 3);
    assert.equal(graph.edges[0].from, 'step_0');
    assert.equal(graph.edges[0].to, 'step_1');
    assert.equal(graph.edges[2].from, 'step_2');
    assert.equal(graph.edges[2].to, 'step_3');
    console.log('✓ Sequential chains');
  }

  // Test 6: Missing specId
  {
    try {
      new ActionGraphBuilder().setScenarioName('Test').addNode('step_0', 'act').build();
      assert(false, 'Should throw');
    } catch (e) {
      assert((e as Error).message.includes('specId'));
      console.log('✓ Throws on missing specId');
    }
  }

  // Test 7: Missing scenarioName
  {
    try {
      new ActionGraphBuilder().setSpecId(randomUUID()).addNode('step_0', 'act').build();
      assert(false, 'Should throw');
    } catch (e) {
      assert((e as Error).message.includes('scenarioName'));
      console.log('✓ Throws on missing scenarioName');
    }
  }

  // Test 8: No nodes
  {
    try {
      new ActionGraphBuilder()
        .setSpecId(randomUUID())
        .setScenarioName('Test')
        .build();
      assert(false, 'Should throw');
    } catch (e) {
      assert((e as Error).message.includes('At least one node'));
      console.log('✓ Throws when no nodes');
    }
  }

  console.log('\nTesting yamlToActionGraph...');

  // Test 9: YAML conversion with background + test data
  {
    const yamlSpec = {
      feature: 'User Authentication',
      background: {
        steps: [
          {
            type: 'given' as const,
            text: 'The app is running',
          },
          {
            type: 'and' as const,
            text: 'I authenticated through the API',
          },
        ],
      },
      scenarios: [
        {
          name: 'Successful login',
          tags: ['smoke', 'auth'],
          steps: [
            {
              type: 'given' as const,
              text: 'I am on the login page',
              selector: undefined,
            },
            {
              type: 'when' as const,
              text: 'I enter email as "test@example.com"',
              selector: 'email-input',
              testData: {
                email: 'test@example.com',
              },
            },
            {
              type: 'when' as const,
              text: 'I click the login button',
              selector: 'login-button',
            },
            {
              type: 'then' as const,
              text: 'I should see the welcome message',
              selector: 'welcome-heading',
            },
            {
              type: 'and' as const,
              text: 'The welcome message shows my name',
              selector: 'welcome-heading',
            },
          ],
          selectors: {
            'email-input': 'input[data-testid="email"]',
            'login-button': 'button[aria-label="Login"]',
            'welcome-heading': 'h1[role="heading"]',
            'login-page': '#login',
          },
        },
      ],
      metadata: {
        specId: randomUUID(),
        generatedAt: new Date().toISOString(),
        llmProvider: 'openai',
        llmModel: 'gpt-4',
        authoringMode: false,
        authoredBy: 'manual' as const,
      },
    };

    const builder = yamlToActionGraph(yamlSpec, 0);
    const graph = builder.build();

    assert.equal(graph.nodes.length, 7);
    assert.deepEqual(
      graph.nodes.map((node) => node.type),
      ['setup', 'setup', 'setup', 'act', 'act', 'assert', 'assert']
    );
    const emailNode = graph.nodes.find((node) => node.nodeId === 'step_1');
    assert.equal(emailNode?.selectors?.[0].id, 'email-input');
    assert.deepEqual(emailNode?.metadata?.testData, { email: 'test@example.com' });
    assert.equal(graph.edges[0].from, 'bg_0');
    assert.equal(graph.edges[0].to, 'bg_1');
    assert.equal(graph.edges[1].from, 'bg_1');
    assert.equal(graph.edges[1].to, 'step_0');
    assert.equal(graph.edges[graph.edges.length - 1].from, 'step_3');
    assert.equal(graph.edges[graph.edges.length - 1].to, 'step_4');
    assert.equal(graph.metadata.authorship?.authoredBy, 'manual');
    assert.equal(graph.metadata.authorship?.authoringMode, false);
    console.log('✓ YAML conversion with background/test data');
  }

  // Test 10: Invalid scenario index
  {
    const yamlSpec = {
      feature: 'Test',
      scenarios: [{ name: 'Test', steps: [] }],
      metadata: {
        specId: randomUUID(),
        generatedAt: new Date().toISOString(),
        llmProvider: 'openai',
        llmModel: 'gpt-4',
      },
    };

    try {
      yamlToActionGraph(yamlSpec, 5);
      assert(false, 'Should throw');
    } catch (e) {
      assert((e as Error).message.includes('Scenario at index 5'));
      console.log('✓ Invalid scenario index throws');
    }
  }

  console.log('\nAll ActionGraphBuilder tests passed!');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
