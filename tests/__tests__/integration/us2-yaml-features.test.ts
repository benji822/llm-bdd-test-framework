import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { generateFeatureFiles } from '../../scripts/generate-features';
import { normalizeYamlSpecification } from '../../scripts/normalize-yaml';
import { validateFeatureCoverage } from '../../scripts/validate-coverage';
import { generateClarificationQuestions } from '../../scripts/generate-questions';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../../scripts/llm';
import { parseYaml } from '../../scripts/utils/yaml-parser';

class ClarificationProvider extends LLMProvider {
  readonly name = 'codex' as const;

  async generateCompletion(): Promise<LLMCompletionResult> {
    return {
      completion: `# Clarifications: shopping-cart\n\n## Question 1\n\n**Source**: line 1\n**Q**: Should we support discount codes?\n**Why it matters**: Impacts scenario coverage\n**A**: _[Pending answer]_\n**Required**: Yes\n`,
      metadata: { provider: 'codex', model: 'stub', tokensUsed: 70, responseTime: 200 },
    };
  }
}

class NormalizeProvider extends LLMProvider {
  readonly name = 'codex' as const;

  async generateCompletion(): Promise<LLMCompletionResult> {
    return {
      completion: `feature: Shopping cart\nscenarios:\n  - name: Apply valid discount\n    steps:\n      - type: given\n        text: I am on the cart page\n      - type: when\n        text: I enter discount code as "SPRING"\n      - type: then\n        text: I should see text "Discount applied"\n    selectors:\n      discount-input: "input[data-testid='discount']"\n      discount-banner: "div[role='status']"\nmetadata:\n  specId: "33333333-3333-3333-3333-333333333333"\n  generatedAt: "2025-10-18T12:00:00Z"\n  llmProvider: "codex"\n  llmModel: "stub-model"\n`,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 220, responseTime: 420 },
    };
  }
}

class FeatureProvider extends LLMProvider {
  readonly name = 'codex' as const;

  async generateCompletion(): Promise<LLMCompletionResult> {
    return {
      completion: `Feature: Shopping cart\n  Scenario: Apply valid discount\n    Given I am on the cart page\n    When I enter discount code as "SPRING"\n    Then I should see text "Discount applied"`,
      metadata: { provider: 'codex', model: 'stub-model', tokensUsed: 200, responseTime: 400 },
    };
  }
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us2-e2e-'));
});

afterEach(async () => {
  delete process.env.LLM_MODEL;
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('YAML to feature file and coverage validation pipeline', async () => {
  const specPath = path.join(tempDir, 'specs/shopping-cart.txt');
  const clarificationsPath = path.join(tempDir, 'clarifications/shopping-cart.md');
  const yamlPath = path.join(tempDir, 'normalized/shopping-cart.yaml');
  const featureDir = path.join(tempDir, 'features');
  const vocabularyPath = path.join(tempDir, 'artifacts/step-vocabulary.json');

  await fs.mkdir(path.dirname(specPath), { recursive: true });
  await fs.writeFile(
    specPath,
    'Customers can apply discount codes in the shopping cart to reduce totals before checkout.',
    'utf8',
  );

  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });
  await fs.writeFile(
    vocabularyPath,
    JSON.stringify(
      {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        definitions: [
          {
            pattern: 'I am on the {page} page',
            domain: 'navigation',
            file: 'tests/steps/navigation.steps.ts',
            parameters: [{ name: 'page', type: 'string' }],
            examples: ['I am on the cart page'],
            version: '1.0.0',
          },
          {
            pattern: 'I enter {field} code as {value}',
            domain: 'interaction',
            file: 'tests/steps/interaction.steps.ts',
            parameters: [
              { name: 'field', type: 'string' },
              { name: 'value', type: 'string' },
            ],
            examples: ['I enter discount code as "SPRING"'],
            version: '1.0.0',
          },
          {
            pattern: 'I should see text {text}',
            domain: 'assertion',
            file: 'tests/steps/assertion.steps.ts',
            parameters: [{ name: 'text', type: 'string' }],
            examples: ['I should see text "Discount applied"'],
            version: '1.0.0',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  await generateClarificationQuestions({
    specPath,
    outputPath: clarificationsPath,
    provider: new ClarificationProvider(),
  });

  const clarifications = await fs.readFile(clarificationsPath, 'utf8');
  await fs.writeFile(clarificationsPath, clarifications.replace('_[Pending answer]_', 'Yes, coupon codes up to 50%'), 'utf8');

  process.env.LLM_MODEL = 'stub-model';
  await normalizeYamlSpecification({
    specPath,
    clarificationsPath,
    outputPath: yamlPath,
    provider: new NormalizeProvider(),
  });

  const normalizedYaml = await fs.readFile(yamlPath, 'utf8');
  assert.equal(parseYaml<Record<string, unknown>>(normalizedYaml)?.feature, 'Shopping cart');

  const generationResult = await generateFeatureFiles({
    yamlPath,
    outputDir: featureDir,
    provider: new FeatureProvider(),
    vocabularyPath,
  });

  assert.equal(generationResult.metadata.model, 'stub-model');

  await validateFeatureCoverage({
    featurePaths: generationResult.outputPaths,
    vocabularyPath,
  });

  const featureContent = await fs.readFile(generationResult.outputPaths[0], 'utf8');
  assert.ok(featureContent.includes('Feature: Shopping cart'));
  assert.ok(featureContent.includes('# Generated by codex stub-model'));
  assert.match(featureContent, /I enter discount code as "SPRING"|I enter discount code as "<E2E_USER_EMAIL>"/);
});
