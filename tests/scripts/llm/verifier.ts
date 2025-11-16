import path from 'node:path';
import fs from 'node:fs/promises';

import type { Locator, Page } from '@playwright/test';
import { chromium } from '@playwright/test';

import { logEvent } from '../utils/logging.js';
import { ensureDir, readTextFile, writeTextFile } from '../utils/file-operations.js';

export interface HeadlessVerifierOptions {
  baseUrl?: string;
  outputDir?: string;
  specDir?: string;
}

interface StepVerification {
  stepIndex: number;
  originalText: string;
  action: string;
  hint?: Record<string, unknown>;
  resolved: boolean;
  error?: string;
  selector?: string;
}

interface ScenarioVerification {
  scenarioName: string;
  pageKey: string;
  pageUrl: string;
  steps: StepVerification[];
  passed: boolean;
  error?: string;
}

interface VerificationReport {
  timestamp: string;
  baseUrl: string;
  specDir: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  scenarios: ScenarioVerification[];
}

const DEFAULT_SPEC_DIR = 'tests/e2e-gen';
const DEFAULT_OUTPUT_DIR = 'tests/artifacts';
const FALLBACK_BASE_URL = 'http://localhost';

export async function verifySelectors(options: HeadlessVerifierOptions): Promise<void> {
  const baseUrl = options.baseUrl ?? process.env.E2E_BASE_URL ?? FALLBACK_BASE_URL;
  const specDir = path.resolve(options.specDir ?? DEFAULT_SPEC_DIR);
  const outputDir = path.resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);

  await ensureDir(outputDir);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    baseUrl,
    specDir,
    totalScenarios: 0,
    passedScenarios: 0,
    failedScenarios: 0,
    scenarios: [],
  };

  try {
    // Check if spec dir exists
    try {
      await fs.stat(specDir);
    } catch {
      console.warn(`Spec directory not found: ${specDir}`);
      logEvent('llm-bdd.verify', 'Spec directory not found', {
        specDir,
      });
      return;
    }

    const specFiles = await fs.readdir(specDir);
    const tsFiles = specFiles.filter((f) => f.endsWith('.spec.ts'));

    if (!tsFiles.length) {
      console.warn(`No spec files found in ${specDir}`);
      logEvent('llm-bdd.verify', 'No spec files to verify', {
        specDir,
      });
      return;
    }

    for (const file of tsFiles) {
      const filePath = path.join(specDir, file);
      const content = await readTextFile(filePath);
      const scenarios = extractScenariosFromSpec(content);

      for (const scenario of scenarios) {
        report.totalScenarios += 1;
        const verification = await verifyScenario(page, baseUrl, scenario);
        report.scenarios.push(verification);

        if (verification.passed) {
          report.passedScenarios += 1;
        } else {
          report.failedScenarios += 1;
        }
      }
    }

    const reportPath = path.join(outputDir, 'verification-report.json');
    await writeTextFile(reportPath, JSON.stringify(report, null, 2));

    logEvent('llm-bdd.verify', 'Selector verification completed', {
      totalScenarios: report.totalScenarios,
      passed: report.passedScenarios,
      failed: report.failedScenarios,
      reportPath,
    });

    if (report.failedScenarios > 0) {
      console.error(
        `\nVerification failed: ${report.failedScenarios}/${report.totalScenarios} scenarios had unresolvable selectors`
      );
      console.error(`Details: ${reportPath}`);
      process.exit(1);
    }

    console.log(
      `\nVerification passed: ${report.passedScenarios}/${report.totalScenarios} scenarios verified`
    );
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

interface ExtractedScenario {
  name: string;
  pageKey: string;
  steps: ExtractedStep[];
}

interface ExtractedStep {
  index: number;
  action: string;
  hint?: Record<string, unknown>;
}

function extractScenariosFromSpec(content: string): ExtractedScenario[] {
  const scenarios: ExtractedScenario[] = [];

  // Match test("Scenario Name", async ({ page }) => { ... });
  const testRegex = /test\s*\(\s*(['"`])(.+?)\1\s*,\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*\{/g;

  let testMatch;
  while ((testMatch = testRegex.exec(content)) !== null) {
    const testName = testMatch[2];
    const testBodyStart = testMatch.index + testMatch[0].length;

    // Find matching closing brace for the test
    let braceCount = 1;
    let testBodyEnd = testBodyStart;
    for (let i = testBodyStart; i < content.length && braceCount > 0; i += 1) {
      if (content[i] === '{') {
        braceCount += 1;
      } else if (content[i] === '}') {
        braceCount -= 1;
      }
      testBodyEnd = i;
    }

    const testBody = content.slice(testBodyStart, testBodyEnd);

    // Extract page key from resolvePageUrl call
    const pageKeyMatch = /resolvePageUrl\s*\(\s*(['"`])(.+?)\1\s*\)/.exec(testBody);
    const pageKey = pageKeyMatch ? pageKeyMatch[2] : '';

    // Extract steps - match selectorResolver calls more carefully
    const steps: ExtractedStep[] = [];

    // Match const { locator: locatorX } = await selectorResolver(...);
    const stepRegex =
      /const\s*{\s*locator:\s*(\w+)\s*}\s*=\s*await\s+selectorResolver\s*\(\s*page\s*,\s*undefined\s*,\s*([^)]*)\s*\)\s*;/g;

    let stepIndex = 0;
    let stepMatch;
    while ((stepMatch = stepRegex.exec(testBody)) !== null) {
      const hintStr = stepMatch[2]?.trim() || '';
      let hint: Record<string, unknown> = {};

      if (hintStr && hintStr !== 'undefined') {
        try {
          // Replace quotes to make it valid JSON
          const jsonStr = hintStr
            .replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '"$1":')
            .replace(/:\s*(['"])([^'"]*)\1/g, (match, q, val) => `: "${val}"`);
          hint = JSON.parse(jsonStr);
        } catch {
          hint = {};
        }
      }

      steps.push({
        index: stepIndex,
        action: 'unknown',
        hint,
      });
      stepIndex += 1;
    }

    if (pageKey) {
      scenarios.push({
        name: testName,
        pageKey,
        steps,
      });
    }
  }

  return scenarios;
}

async function verifyScenario(
  page: Page,
  baseUrl: string,
  scenario: ExtractedScenario
): Promise<ScenarioVerification> {
  const verification: ScenarioVerification = {
    scenarioName: scenario.name,
    pageKey: scenario.pageKey,
    pageUrl: '',
    steps: [],
    passed: false,
  };

  try {
    // Construct page URL
    if (!scenario.pageKey) {
      verification.error = 'No page key detected';
      return verification;
    }

    // Try to build URL from page key
    // For now, just append to baseUrl
    verification.pageUrl = `${baseUrl}/${scenario.pageKey.toLowerCase()}`;

    // Navigate to the page
    try {
      await page.goto(verification.pageUrl, { waitUntil: 'networkidle', timeout: 5000 });
    } catch (error) {
      verification.error = `Failed to navigate to ${verification.pageUrl}: ${(error as Error).message}`;
      return verification;
    }

    // Verify each step
    for (const step of scenario.steps) {
      const stepVerification: StepVerification = {
        stepIndex: step.index,
        originalText: '',
        action: step.action,
        hint: step.hint,
        resolved: false,
      };

      try {
        // Try to resolve the hint as a locator
        const hint = step.hint || {};
        const textHint = (hint.textHint as string) || '';
        const roleHint = (hint.roleHint as string) || 'button';

        let locator: Locator | undefined;

        // Try by role + text
        if (textHint) {
          const pattern = new RegExp(textHint.split(/\s+/).join('.*'), 'i');
          locator = page.getByRole(roleHint as any, { name: pattern }).first();
        } else {
          locator = page.getByRole(roleHint as any).first();
        }

        if (locator) {
          const count = await locator.count();
          if (count > 0) {
            stepVerification.resolved = true;
            stepVerification.selector = locator.toString();
          } else {
            stepVerification.error = `No matching element for hint: ${JSON.stringify(hint)}`;
          }
        }
      } catch (error) {
        stepVerification.error = `Error resolving hint: ${(error as Error).message}`;
      }

      verification.steps.push(stepVerification);
    }

    // Scenario passes if all steps resolved
    verification.passed = verification.steps.every((s) => s.resolved);
  } catch (error) {
    verification.error = `Unexpected error: ${(error as Error).message}`;
  }

  return verification;
}
