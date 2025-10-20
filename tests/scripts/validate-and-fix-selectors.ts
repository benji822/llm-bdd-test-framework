import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

import { readTextFile, writeTextFile, ensureDir } from './utils/file-operations';
import { NormalizedYamlSchema, type NormalizedYaml } from './types/yaml-spec';
import { parseYaml } from './utils/yaml-parser';
import { logEvent } from './utils/logging';

export interface SelectorValidationResult {
  valid: boolean;
  missingSelectors: MissingSelector[];
  existingSelectors: ExistingSelector[];
  targetPage: string;
  timestamp: string;
}

export interface MissingSelector {
  id: string;
  referencedInSteps: string[];
  suggestedFix?: SelectorFix;
}

export interface ExistingSelector {
  id: string;
  selector: string;
  found: boolean;
}

export interface SelectorFix {
  componentPath: string;
  lineNumber?: number;
  currentCode: string;
  suggestedCode: string;
  elementType: 'input' | 'button' | 'select' | 'div' | 'span' | 'unknown';
}

export interface ValidateAndFixOptions {
  yamlPath: string;
  baseUrl?: string;
  autoFix?: boolean;
  outputPath?: string;
  headless?: boolean;
}

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
const DEFAULT_OUTPUT_PATH = path.resolve('tests/artifacts/selector-validation-report.json');

/**
 * Step 3.5: Validate selectors against running application
 * 
 * This function:
 * 1. Extracts selector references from normalized YAML
 * 2. Launches Playwright to check if selectors exist in the running app
 * 3. Generates a detailed report with suggested fixes
 * 4. Optionally applies fixes to the application codebase
 */
export async function validateAndFixSelectors(
  options: ValidateAndFixOptions
): Promise<SelectorValidationResult> {
  const {
    yamlPath,
    baseUrl = DEFAULT_BASE_URL,
    autoFix = false,
    outputPath = DEFAULT_OUTPUT_PATH,
    headless = true,
  } = options;

  // Step 1: Load and parse YAML
  const yamlContent = await readTextFile(path.resolve(yamlPath));
  const normalized = NormalizedYamlSchema.parse(parseYaml<NormalizedYaml>(yamlContent));

  // Step 2: Extract selector references from steps
  const selectorRefs = extractSelectorReferences(normalized);
  
  if (selectorRefs.size === 0) {
    logEvent('selector-validation.no-refs', 'No selector references found in YAML', { yamlPath });
    return {
      valid: true,
      missingSelectors: [],
      existingSelectors: [],
      targetPage: '/',
      timestamp: new Date().toISOString(),
    };
  }

  // Step 3: Determine target page from YAML metadata or scenarios
  const targetPage = determineTargetPage(normalized);

  // Step 4: Launch Playwright and validate selectors
  let browser: Browser | undefined;
  let page: Page | undefined;
  
  try {
    browser = await chromium.launch({ headless });
    page = await browser.newPage();
    
    const url = new URL(targetPage, baseUrl).toString();
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch (error) {
      throw new Error(
        `❌ Cannot connect to application at ${url}\n` +
        `   Make sure the dev server is running: yarn dev\n` +
        `   Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 5: Check each selector
    const missingSelectors: MissingSelector[] = [];
    const existingSelectors: ExistingSelector[] = [];

    for (const [selectorId, steps] of selectorRefs) {
      const selector = buildSelector(selectorId);
      const found = await checkSelectorExists(page, selector);

      if (found) {
        existingSelectors.push({ id: selectorId, selector, found: true });
      } else {
        // Try to find the element using alternative strategies
        const suggestedFix = await findElementAndSuggestFix(page, selectorId, targetPage);
        
        missingSelectors.push({
          id: selectorId,
          referencedInSteps: steps,
          suggestedFix,
        });
      }
    }

    const result: SelectorValidationResult = {
      valid: missingSelectors.length === 0,
      missingSelectors,
      existingSelectors,
      targetPage,
      timestamp: new Date().toISOString(),
    };

    // Step 6: Save report
    await ensureDir(path.dirname(outputPath));
    await writeTextFile(outputPath, JSON.stringify(result, null, 2));

    // Step 7: Apply auto-fix if requested
    if (autoFix && missingSelectors.length > 0) {
      await applyAutoFixes(missingSelectors);
    }

    return result;

  } finally {
    await page?.close();
    await browser?.close();
  }
}

/**
 * Extract selector references from YAML step text
 */
function extractSelectorReferences(normalized: NormalizedYaml): Map<string, string[]> {
  const refs = new Map<string, string[]>();

  for (const scenario of normalized.scenarios) {
    for (const step of scenario.steps) {
      const stepRefs = extractSelectorsFromStepText(step.text);
      
      for (const ref of stepRefs) {
        const existing = refs.get(ref) ?? [];
        existing.push(step.text);
        refs.set(ref, existing);
      }
    }
  }

  return refs;
}

/**
 * Extract selector IDs from step text patterns
 */
function extractSelectorsFromStepText(stepText: string): string[] {
  const refs: string[] = [];

  // Pattern: "I enter {field} as ..." → "{field}-input"
  const enterMatch = stepText.match(/I enter (\w+) as/);
  if (enterMatch) refs.push(`${enterMatch[1]}-input`);

  // Pattern: "I click the {element} button" → "{element}-button"
  const clickMatch = stepText.match(/I click the (\w+) button/);
  if (clickMatch) refs.push(`${clickMatch[1]}-button`);

  // Pattern: "I select {field} as ..." → "{field}-select"
  const selectMatch = stepText.match(/I select (\w+) as/);
  if (selectMatch) refs.push(`${selectMatch[1]}-select`);

  // Pattern: "I am on the {page} page" → "{page}-page"
  const pageMatch = stepText.match(/I am on the (\w+) page/);
  if (pageMatch) refs.push(`${pageMatch[1]}-page`);

  return refs;
}

/**
 * Determine target page from YAML
 */
function determineTargetPage(normalized: NormalizedYaml): string {
  // Check metadata first
  if (normalized.metadata && 'targetPage' in normalized.metadata) {
    return (normalized.metadata as any).targetPage;
  }

  // Infer from feature name
  const featureName = normalized.feature.toLowerCase();
  if (featureName.includes('login')) return '/login';
  if (featureName.includes('signup') || featureName.includes('register')) return '/signup';
  if (featureName.includes('dashboard')) return '/my-account';
  if (featureName.includes('profile')) return '/my-account/profile';

  return '/';
}

/**
 * Build selector string from ID
 */
function buildSelector(selectorId: string): string {
  return `[data-testid="${selectorId}"]`;
}

/**
 * Check if selector exists on the page
 */
async function checkSelectorExists(page: Page, selector: string): Promise<boolean> {
  try {
    const element = await page.locator(selector).first();
    return await element.count() > 0;
  } catch {
    return false;
  }
}

/**
 * Find element using alternative strategies and suggest fix
 */
async function findElementAndSuggestFix(
  page: Page,
  selectorId: string,
  targetPage: string
): Promise<SelectorFix | undefined> {
  const elementType = inferElementType(selectorId);
  const componentPath = inferComponentPath(targetPage, selectorId);

  // Try to find the element using alternative strategies
  let currentCode = '';
  let suggestedCode = '';

  if (selectorId.endsWith('-input')) {
    const fieldName = selectorId.replace('-input', '');
    
    // Try to find input by type or name
    const inputSelector = `input[type="${fieldName}"], input[name="${fieldName}"]`;
    const found = await checkSelectorExists(page, inputSelector);
    
    if (found) {
      const inputType = await page.locator(inputSelector).first().getAttribute('type');
      currentCode = `<input type="${inputType}" />`;
      suggestedCode = `<input type="${inputType}" data-testid="${selectorId}" />`;
    } else {
      currentCode = `<Input />`;
      suggestedCode = `<Input data-testid="${selectorId}" />`;
    }
  } else if (selectorId.endsWith('-button')) {
    const buttonName = selectorId.replace('-button', '');
    
    // Try to find button by text content
    const buttonText = buttonName.charAt(0).toUpperCase() + buttonName.slice(1);
    const buttonSelector = `button:has-text("${buttonText}")`;
    const found = await checkSelectorExists(page, buttonSelector);
    
    if (found) {
      currentCode = `<button type="submit">${buttonText}</button>`;
      suggestedCode = `<button type="submit" data-testid="${selectorId}">${buttonText}</button>`;
    } else {
      currentCode = `<Button />`;
      suggestedCode = `<Button data-testid="${selectorId}" />`;
    }
  }

  if (!currentCode) {
    return undefined;
  }

  return {
    componentPath,
    currentCode,
    suggestedCode,
    elementType,
  };
}

/**
 * Infer element type from selector ID
 */
function inferElementType(selectorId: string): SelectorFix['elementType'] {
  if (selectorId.endsWith('-input')) return 'input';
  if (selectorId.endsWith('-button')) return 'button';
  if (selectorId.endsWith('-select')) return 'select';
  return 'unknown';
}

/**
 * Infer component file path from target page
 */
function inferComponentPath(targetPage: string, selectorId: string): string {
  if (targetPage === '/login') {
    return 'src/components/Login/LoginModal.tsx';
  }
  if (targetPage === '/signup') {
    return 'src/components/SignUp/SignUpModal.tsx';
  }
  if (targetPage.startsWith('/my-account')) {
    return 'src/components/Profile/ProfilePage.tsx';
  }
  
  return `src/pages${targetPage}.tsx`;
}

/**
 * Apply auto-fixes to application codebase
 */
async function applyAutoFixes(missingSelectors: MissingSelector[]): Promise<void> {
  console.log('\n🔧 Auto-fix is not yet implemented.');
  console.log('   This feature requires manual review to ensure code changes are safe.');
  console.log('   Please review the suggested fixes in the report and apply them manually.\n');
  
  // Future implementation:
  // - Read component files
  // - Find matching code patterns
  // - Apply suggested changes
  // - Write updated files
  // - Generate git diff for review
}

