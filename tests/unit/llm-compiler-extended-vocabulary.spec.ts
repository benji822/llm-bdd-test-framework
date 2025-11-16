import { test, expect } from '@playwright/test';
import { compileQaSpecs } from '../scripts/llm/compiler.js';
import { readTextFile, writeTextFile, ensureDir } from '../scripts/utils/file-operations.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';

test.describe('LLM Compiler: Extended Step Vocabulary', () => {
  const tempDir = path.resolve('.tmp-test-llm-vocab');

  test.beforeAll(async () => {
    await ensureDir(tempDir);
  });

  test.afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('compiles hover, scroll, type, visibility, and disabled assertions', async () => {
    const specPath = path.join(tempDir, 'rich-interactions.spec.txt');
    const pagesPath = path.join(tempDir, 'pages.yaml');
    const outputDir = path.join(tempDir, 'e2e-gen');

    // Create test spec with all new action types
    const spec = `Feature: Complex interactions

Perform hover, scroll, and type interactions:
- I am on the dashboard page
- I hover over the menu
- I scroll to the footer
- I type "search term" into search
- I should see the results
- I should not see the error message
- I wait for the loading spinner to disappear
- The submit button should be enabled
`;

    const pages = `dashboard: /dashboard
home: /home
`;

    await writeTextFile(specPath, spec);
    await writeTextFile(pagesPath, pages);

    // Compile the spec
    await compileQaSpecs({
      specPaths: [specPath],
      outputDir,
      pagesPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    // Read generated spec
    const files = await fs.readdir(outputDir);
    const specFiles = files.filter((f) => f.endsWith('.spec.ts'));

    expect(specFiles.length).toBeGreaterThan(0);
    const generatedPath = path.join(outputDir, specFiles[0]);
    const generated = await readTextFile(generatedPath);

    // Validate generated code includes all action handlers
    expect(generated).toContain('await locator');
    expect(generated).toContain('.hover()'); // hover action
    expect(generated).toContain('.scrollIntoViewIfNeeded()'); // scroll action
    expect(generated).toContain('.type('); // type action
    expect(generated).toContain('toBeHidden'); // visibility wait (disappear)
    expect(generated).toContain('toBeEnabled'); // disabled assertion
    expect(generated).toContain('toContainText'); // text assertion

    console.log('✓ Generated spec includes all new action types');
    console.log('Generated code includes: hover, scroll, type, visibility assertions, disabled/enabled checks');
  });

  test('infers action types from natural language when no vocabulary match', async () => {
    const specPath = path.join(tempDir, 'inferred-actions.spec.txt');
    const pagesPath = path.join(tempDir, 'pages-inferred.yaml');
    const outputDir = path.join(tempDir, 'e2e-gen-inferred');

    const spec = `Feature: Inferred actions

Actions inferred from text:
- I navigate to the login page
- I hover over the help icon
- I scroll down to the submit button
- The button should be enabled
- The error should disappear
`;

    const pages = `login: /login
`;

    await writeTextFile(specPath, spec);
    await writeTextFile(pagesPath, pages);

    await compileQaSpecs({
      specPaths: [specPath],
      outputDir,
      pagesPath,
      baseUrl: 'http://localhost:3000',
      vocabularyPath: 'tests/artifacts/step-vocabulary.json',
    });

    const files = await fs.readdir(outputDir);
    const specFiles = files.filter((f) => f.endsWith('.spec.ts'));

    const generatedPath = path.join(outputDir, specFiles[0]);
    const generated = await readTextFile(generatedPath);

    // Inferred actions should still generate valid Playwright code
    expect(generated).toContain('await page.goto');
    expect(generated).toContain('selectorResolver');
    console.log('✓ Inferred actions generate valid Playwright code');
  });
});
