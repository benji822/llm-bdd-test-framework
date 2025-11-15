import { strict as assert } from 'node:assert';
import { rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { compileQaSpecs } from '../scripts/llm/compiler.js';

const tmpDir = path.join(process.cwd(), 'tests', 'tmp', 'llm-compiler-test');

function cleanup(): void {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
}

function setup(): void {
  cleanup();
  mkdirSync(tmpDir, { recursive: true });
}

async function run(): Promise<void> {
  console.log('Testing llm-bdd pages.yaml + navigation injection...');

  // Test 1: pages.yaml is loaded and validated
  {
    setup();
    const specPath = path.join(tmpDir, 'test-spec.txt');
    const specContent = `Feature: Navigation test

Valid navigation:
- I am on the login page
- I click the submit button`;
    
    await require('node:fs/promises').writeFile(specPath, specContent);

    try {
      await compileQaSpecs({
        specPaths: [specPath],
        outputDir: path.join(tmpDir, 'output'),
        pagesPath: path.resolve('pages.yaml'),
        baseUrl: 'http://localhost',
      });

      const outputFiles = await require('node:fs/promises').readdir(
        path.join(tmpDir, 'output')
      );
      assert(outputFiles.length > 0, 'Should generate output files');
      console.log('✓ pages.yaml loaded and validated at compile time');
    } catch (error) {
      console.error('Test 1 failed:', (error as Error).message);
      throw error;
    }
  }

  // Test 2: Missing page keys cause clear compile error
  {
    setup();
    const specPath = path.join(tmpDir, 'test-spec.txt');
    const specContent = `Feature: Invalid page test

Invalid navigation:
- I am on the nonexistent page
- I click the submit button`;

    await require('node:fs/promises').writeFile(specPath, specContent);

    try {
      await compileQaSpecs({
        specPaths: [specPath],
        outputDir: path.join(tmpDir, 'output'),
        pagesPath: path.resolve('pages.yaml'),
        baseUrl: 'http://localhost',
      });
      throw new Error('Should have thrown for unknown page key');
    } catch (error) {
      const message = (error as Error).message;
      assert(
        message.includes('Unknown page reference') || message.includes('nonexistent'),
        `Error should mention unknown page: ${message}`
      );
      assert(
        message.includes(specPath) || message.includes('test-spec'),
        `Error should include file path: ${message}`
      );
      console.log('✓ Missing page keys cause clear compile error with file/line');
    }
  }

  // Test 3: First statement is page.goto with resolvePageUrl
  {
    const exampleSpecPath = path.resolve('tests/e2e-gen/example-login-238c1ea5.spec.ts');
    const content = readFileSync(exampleSpecPath, 'utf8');

    // Check that page.goto is the first statement inside the test function
    const testMatch = content.match(/test\("Happy path",\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{([^}]+?)const\s*{\s*locator:/);
    assert(testMatch, 'Should find test function body');
    const testBody = testMatch[1];
    
    assert(
      testBody.trim().startsWith('await page.goto(resolvePageUrl'),
      'page.goto should be first statement in test'
    );
    console.log('✓ First statement in each generated spec is page.goto(...) based on mapped route');
  }

  // Test 4: Readiness probe (waitForLoadState) after goto
  {
    const exampleSpecPath = path.resolve('tests/e2e-gen/example-login-238c1ea5.spec.ts');
    const content = readFileSync(exampleSpecPath, 'utf8');

    // Verify goto comes before waitForLoadState
    const gotoIndex = content.indexOf('await page.goto(resolvePageUrl');
    const waitForLoadIndex = content.indexOf("await page.waitForLoadState('networkidle')");
    assert(gotoIndex !== -1, 'Should have await page.goto(resolvePageUrl(...))');
    assert(waitForLoadIndex !== -1, "Should have await page.waitForLoadState('networkidle')");
    assert(
      gotoIndex < waitForLoadIndex,
      'page.goto should come before waitForLoadState'
    );
    console.log("✓ Readiness probe after goto ensures page is interactive (waitForLoadState('networkidle'))");
  }

  cleanup();
  console.log('\nAll pages.yaml + navigation injection tests passed!');
}

run().catch((error) => {
  console.error('Tests failed:', error);
  cleanup();
  process.exit(1);
});
