import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GraphPersistence, generateGraphId } from '../scripts/action-graph/index.js';
import type { ActionGraph } from '../scripts/action-graph/index.js';
import { randomUUID } from 'node:crypto';

const testDir = join(process.cwd(), 'tests', 'tmp', 'test-graphs');

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
}

function setup() {
  cleanup();
  mkdirSync(testDir, { recursive: true });
}

function createTestGraph(specId: string, scenarioName = 'Login scenario'): ActionGraph {
  return {
    graphId: generateGraphId(),
    version: '1.0',
    nodes: [
      {
        nodeId: 'step_0',
        type: 'navigate',
        stepIndex: 0,
        gherkinStep: {
          keyword: 'given',
          text: 'I am on the login page',
        },
        execution: {
          state: 'pending',
        },
      },
      {
        nodeId: 'step_1',
        type: 'act',
        stepIndex: 1,
        gherkinStep: {
          keyword: 'when',
          text: 'I enter email',
        },
        instructions: {
          natural: 'Fill email field',
          deterministic: {
            selector: 'email-input',
            action: 'fill',
            value: 'test@example.com',
          },
        },
        selectors: [
          {
            id: 'email-input',
            locator: 'input[data-testid="email"]',
            verified: false,
          },
        ],
        execution: {
          state: 'pending',
        },
      },
    ],
    edges: [
      {
        from: 'step_0',
        to: 'step_1',
        type: 'sequential',
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      specId,
      scenarioName,
      authorship: {
        authoringMode: true,
        authoredBy: 'llm',
      },
    },
  };
}

async function runTests() {
  console.log('Testing GraphPersistence...');

  // Test 1: Write and read
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: true });
    const specId = randomUUID();
    const graph = createTestGraph(specId);

    const filePath = await persistence.write(graph);
    assert(filePath.includes(specId), 'File path should contain specId');
    assert(filePath.endsWith('.json'), 'File should be JSON');

    const read = await persistence.read(specId);
    assert(read, 'Should read graph back');
    assert.equal(read.graphId, graph.graphId);
    assert.equal(read.nodes.length, 2);
    assert.equal(read.edges.length, 1);
    cleanup();
    console.log('✓ Write and read');
  }

  // Test 2: Scenario disambiguation
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: true });
    const specId = randomUUID();

    await persistence.write(createTestGraph(specId, 'Login scenario'));
    await persistence.write(createTestGraph(specId, 'Reset password path'));

    const loginGraph = await persistence.read(specId, 'Login scenario');
    assert(loginGraph);
    assert.equal(loginGraph.metadata.scenarioName, 'Login scenario');

    const resetGraph = await persistence.read(specId, 'Reset password path');
    assert.equal(resetGraph?.metadata.scenarioName, 'Reset password path');

    await assert.rejects(async () => persistence.read(specId), /Multiple scenarios/);

    const loginVersions = await persistence.listBySpec(specId, 'Login scenario');
    assert(loginVersions.every((file) => file.includes('login-scenario')), 'Should filter by scenario slug');
    cleanup();
    console.log('✓ Scenario disambiguation enforced');
  }

  // Test 3: Non-existent graph
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: true });
    const read = await persistence.read(randomUUID());
    assert(read === null, 'Should return null for non-existent graph');
    cleanup();
    console.log('✓ Non-existent graph returns null');
  }

  // Test 4: Delete
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: true });
    const specId = randomUUID();
    const graph = createTestGraph(specId);

    const filePath = await persistence.write(graph);
    const fileName = filePath.split('/').pop()!;

    await persistence.delete(fileName);
    const versions = await persistence.listBySpec(specId);
    assert(!versions.includes(fileName), 'File should be deleted');
    cleanup();
    console.log('✓ Delete graph');
  }

  // Test 5: Clear all
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: true });
    const specId1 = randomUUID();
    const specId2 = randomUUID();

    await persistence.write(createTestGraph(specId1));
    await persistence.write(createTestGraph(specId2));

    let versions = await persistence.listBySpec(specId1);
    assert(versions.length > 0, 'Should have graphs');

    await persistence.clear();

    versions = await persistence.listBySpec(specId1);
    assert.equal(versions.length, 0, 'Should have no graphs after clear');
    cleanup();
    console.log('✓ Clear all graphs');
  }

  // Test 6: Non-versioned mode
  {
    setup();
    const persistence = new GraphPersistence({ graphDir: testDir, versioned: false });
    const specId = randomUUID();
    const graph = createTestGraph(specId);

    const filePath = await persistence.write(graph);
    assert(
      filePath.includes(`${specId}__login-scenario.json`),
      'Should include spec ID and scenario slug in filename'
    );
    assert(!filePath.match(/__v\d+\.json/), 'Should not have version suffix');

    const read = await persistence.read(specId);
    assert(read?.graphId === graph.graphId);
    cleanup();
    console.log('✓ Non-versioned mode');
  }

  console.log('\nAll GraphPersistence tests passed!');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  cleanup();
  process.exit(1);
});
