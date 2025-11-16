import path from 'node:path';

import { ensureDir, readTextFile, writeTextFile } from '../utils/file-operations.js';
import { logEvent } from '../utils/logging.js';
import { parsePlainSpec, type PlainSpecDefinition, type PlainSpecScenario, type SetupAction } from '../stagehand/spec.js';
import { parseYaml } from '../utils/yaml-parser.js';
import type { StepDefinition, StepVocabulary } from '../types/step-vocabulary.js';

const DEFAULT_OUTPUT_DIR = 'tests/e2e-gen';
const DEFAULT_PAGES_PATH = 'pages.yaml';
const DEFAULT_VOCABULARY_PATH = 'tests/artifacts/step-vocabulary.json';
const FALLBACK_BASE_URL = 'http://localhost';

export interface LlmbddCompileOptions {
  specPaths: string[];
  scenario?: string;
  outputDir?: string;
  pagesPath?: string;
  baseUrl?: string;
  vocabularyPath?: string;
}

interface VocabularyMatcher {
  definition: StepDefinition;
  regex: RegExp;
  parameterNames: string[];
}

interface StepMatch {
  definition: StepDefinition;
  params: Record<string, string>;
}

type StepAction = 'click' | 'fill' | 'assert' | 'hover' | 'scroll' | 'type' | 'waitVisible' | 'waitHidden' | 'assertDisabled' | 'assertEnabled';

interface StepHint {
  textHint?: string;
  typeHint?: string;
  roleHint?: 'button' | 'link' | 'heading' | 'cell';
  selectorId?: string;
}

interface CompiledStep {
  action: StepAction;
  hint: StepHint;
  valueExpression?: string;
  originalText: string;
}

interface CompiledScenario {
  name: string;
  pageKey: string;
  steps: CompiledStep[];
}

export async function compileQaSpecs(options: LlmbddCompileOptions): Promise<void> {
  if (!options.specPaths.length) {
    throw new Error('At least one QA spec path must be provided');
  }

  const outputDir = path.resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const pages = await loadPages(options.pagesPath ?? DEFAULT_PAGES_PATH);
  const vocabulary = await loadVocabulary(options.vocabularyPath ?? DEFAULT_VOCABULARY_PATH);
  const matchers = vocabulary ? buildVocabularyMatchers(vocabulary.definitions) : [];
  const baseUrl = options.baseUrl ?? process.env.E2E_BASE_URL ?? FALLBACK_BASE_URL;

  await ensureDir(outputDir);

  for (const providedPath of options.specPaths) {
    const specPath = path.resolve(providedPath);
    const raw = await readTextFile(specPath);
    const spec = parsePlainSpec(raw, specPath);
    const scenarios = filterScenarios(spec, options.scenario);

    if (!scenarios.length) {
      throw new Error(
        `Spec ${specPath} does not contain any scenarios matching "${options.scenario ?? ''}"`
      );
    }

    const rendered = renderSpecFile({
      spec,
      specPath,
      scenarios,
      pages,
      baseUrl,
      matchers,
      setup: spec.setup,
    });

    const fileName = deriveOutputFileName(specPath, spec);
    const destination = path.join(outputDir, fileName);
    await ensureDir(path.dirname(destination));
    await writeTextFile(destination, `${rendered}\n`);

    logEvent('llm-bdd.compile', 'Compiled QA spec to generated Playwright test', {
      spec: specPath,
      scenarios: scenarios.length,
      output: destination,
    });

    console.log(`Compiled ${specPath} → ${destination} (${scenarios.length} scenario(s))`);
  }
}

function loadPages(pagesPath: string): Promise<Record<string, string>> {
  return (async () => {
    const resolved = path.resolve(pagesPath);
    const raw = await readTextFile(resolved);
    const parsed = parseYaml<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid pages.yaml at ${resolved}`);
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key) {
        continue;
      }
      if (typeof value !== 'string') {
        continue;
      }
      normalized[key.trim()] = value.trim();
    }

    if (!Object.keys(normalized).length) {
      throw new Error(`pages.yaml at ${resolved} did not declare any routes`);
    }

    return normalized;
  })();
}

async function loadVocabulary(vocabularyPath: string): Promise<StepVocabulary | undefined> {
  const resolved = path.resolve(vocabularyPath);
  try {
    const raw = await readTextFile(resolved);
    return JSON.parse(raw) as StepVocabulary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(`Failed to load step vocabulary at ${resolved}: ${(error as Error).message}`);
  }
}

function buildVocabularyMatchers(definitions: StepDefinition[]): VocabularyMatcher[] {
  return definitions.map((definition) => {
    const pattern = definition.pattern;
    const parameterNames: string[] = [];
    const parts: string[] = [];
    let lastIndex = 0;
    const placeholder = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = placeholder.exec(pattern)) !== null) {
      parts.push(escapeRegExp(pattern.slice(lastIndex, match.index)));
      parts.push('(.+)');
      parameterNames.push(match[1].trim());
      lastIndex = match.index + match[0].length;
    }

    parts.push(escapeRegExp(pattern.slice(lastIndex)));
    const regex = new RegExp(`^${parts.join('')}$`, 'i');

    return {
      definition,
      regex,
      parameterNames,
    };
  });
}

function filterScenarios(spec: PlainSpecDefinition, scenarioName?: string): PlainSpecScenario[] {
  if (!scenarioName) {
    return spec.scenarios;
  }
  const normalized = scenarioName.trim().toLowerCase();
  return spec.scenarios.filter((scenario) => scenario.name.toLowerCase() === normalized);
}

interface RenderSpecOptions {
  spec: PlainSpecDefinition;
  specPath: string;
  scenarios: PlainSpecScenario[];
  pages: Record<string, string>;
  baseUrl: string;
  matchers: VocabularyMatcher[];
  setup?: SetupAction[];
}

function renderSpecFile(options: RenderSpecOptions): string {
  const compiled = options.scenarios.map((scenario) =>
    compileScenario(scenario, options.pages, options.matchers, options.specPath)
  );
  const requiresExpect = compiled.some((scenario) =>
    scenario.steps.some((step) => step.action === 'assert')
  );

  const imports = [`import { test${requiresExpect ? ', expect' : ''} } from '@playwright/test';`];
  imports.push("import { selectorResolver } from '../steps/support/selector-resolver.js';");

  const featureName = options.spec.featureName ?? path.basename(options.specPath);
  
  // Generate setup helpers if needed
  const setupLines: string[] = [];
  if (options.setup && options.setup.length > 0) {
    setupLines.push('');
    setupLines.push('// Setup helpers');
    setupLines.push('async function executeSetup(): Promise<Record<string, unknown>> {');
    setupLines.push('  const state: Record<string, unknown> = {};');
    for (const action of options.setup) {
      setupLines.push(`  // ${action.type} ${action.resource}`);
      setupLines.push(`  // state.${action.alias || action.resource} = await ${action.type}${action.resource}(...)`);
    }
    setupLines.push('  return state;');
    setupLines.push('}');
  }

  const describeLines = [
    `test.describe(${JSON.stringify(featureName)}, () => {`,
  ];

  // Add setup in beforeAll if there's setup
  if (options.setup && options.setup.length > 0) {
    describeLines.push('  let setupState: Record<string, unknown>;');
    describeLines.push('  test.beforeAll(async () => {');
    describeLines.push('    setupState = await executeSetup();');
    describeLines.push('  });');
    describeLines.push('');
  }

  describeLines.push(...compiled.flatMap((scenario) => renderScenarioBlock(scenario)));
  describeLines.push('});');

  const pagesLiteral = `const PAGES = ${JSON.stringify(options.pages, null, 2)} as const;`;
  const baseUrlLiteral = `const BASE_URL = process.env.E2E_BASE_URL ?? ${JSON.stringify(
    options.baseUrl
  )};`;

  const helper = `function resolvePageUrl(pageKey: keyof typeof PAGES): string {
  const route = PAGES[pageKey];
  if (!route) {
    throw new Error('Unknown page key: ' + pageKey);
  }
  return route.startsWith('http') ? route : new URL(route, BASE_URL).toString();
}`;

  const headerComment = `// QA spec: ${path.relative(process.cwd(), options.specPath)}
// Spec ID: ${options.spec.specId}`;

  return [
    headerComment,
    ...imports,
    '',
    pagesLiteral,
    baseUrlLiteral,
    '',
    helper,
    ...setupLines,
    '',
    ...describeLines,
  ].join('\n');
}

function compileScenario(
  scenario: PlainSpecScenario,
  pages: Record<string, string>,
  matchers: VocabularyMatcher[],
  specPath: string
): CompiledScenario {
  let pageKey: string | undefined;
  const compiledSteps: CompiledStep[] = [];

  for (const stepText of scenario.steps) {
    const match = matchStepAgainstVocabulary(stepText, matchers);
    if (!pageKey && match?.definition.domain === 'navigation') {
      const candidate = resolvePageFromMatch(match.params.page ?? '', pages);
      if (!candidate) {
        throw new Error(
          `Unknown page reference "${match.params.page ?? ''}" in scenario "${scenario.name}" at ${specPath}`
        );
      }
      pageKey = candidate;
      continue;
    }

    if (!pageKey) {
      const detected = detectPageKeyByHeuristics(stepText, pages);
      if (detected) {
        pageKey = detected;
      }
    }

    const action = determineAction(match, stepText);
    // Include all action types in compiled steps
    const step = buildCompiledStep(stepText, action, match);
    compiledSteps.push(step);
  }

  if (!pageKey) {
    pageKey = detectPageKeyByScenario(scenario.steps, pages);
  }

  if (!pageKey) {
    throw new Error(
      `Unable to derive navigation target for scenario "${scenario.name}" in ${specPath}`
    );
  }

  return {
    name: scenario.name,
    pageKey,
    steps: compiledSteps,
  };
}

function matchStepAgainstVocabulary(text: string, matchers: VocabularyMatcher[]): StepMatch | undefined {
  for (const matcher of matchers) {
    const executed = matcher.regex.exec(text.trim());
    if (!executed) {
      continue;
    }

    const params: Record<string, string> = {};
    for (let index = 0; index < matcher.parameterNames.length; index += 1) {
      params[matcher.parameterNames[index]] = executed[index + 1]?.trim() ?? '';
    }

    return { definition: matcher.definition, params };
  }

  return undefined;
}

function determineAction(match: StepMatch | undefined, text: string): StepAction {
  if (match) {
    const pattern = match.definition.pattern.toLowerCase();
    if (match.definition.domain === 'assertion') {
      if (pattern.includes('disabled')) return 'assertDisabled';
      if (pattern.includes('enabled')) return 'assertEnabled';
      if (pattern.includes('disappear')) return 'waitHidden';
      if (pattern.includes('visible')) return 'waitVisible';
      return 'assert';
    }
    if (match.definition.domain === 'interaction') {
      if (pattern.includes('hover')) return 'hover';
      if (pattern.includes('scroll')) return 'scroll';
      if (pattern.includes('type')) return 'type';
      if (pattern.includes('enter')) return 'fill';
      return 'click';
    }
  }

  return inferActionFromText(text);
}

function inferActionFromText(text: string): StepAction {
  const normalized = text.toLowerCase();
  if (/(disabled|enabled)/.test(normalized)) {
    return normalized.includes('disabled') ? 'assertDisabled' : 'assertEnabled';
  }
  if (/(disappear|hidden|gone)/.test(normalized)) {
    return 'waitHidden';
  }
  if (/(visible|appear|shown)/.test(normalized)) {
    return 'waitVisible';
  }
  if (/(should|expect|see|verify|confirm|assert|display|shows?)/.test(normalized)) {
    return 'assert';
  }
  if (/(hover|mouseover|over)/.test(normalized)) {
    return 'hover';
  }
  if (/(scroll|pan)/.test(normalized)) {
    return 'scroll';
  }
  if (/(enter|type|fill|provide|input)/.test(normalized)) {
    return 'fill';
  }
  if (/(click|press|tap|submit|choose)/.test(normalized)) {
    return 'click';
  }
  return 'click';
}

function buildCompiledStep(stepText: string, action: StepAction, match?: StepMatch): CompiledStep {
  const hint = buildStepHint(stepText, action, match);
  let valueExpression: string | undefined;

  if (action === 'fill' || action === 'type') {
    const rawValue = extractPreferredValue(match, ['value', 'text']);
    if (!rawValue) {
      throw new Error(`${action === 'type' ? 'Type' : 'Fill'} step requires an explicit value: "${stepText}"`);
    }
    valueExpression = createValueExpression(rawValue);
  }

  if (action === 'assert' || action === 'waitVisible' || action === 'waitHidden') {
    const rawValue = extractPreferredValue(match, ['text', 'value', 'element']);
    if (rawValue && action === 'assert') {
      valueExpression = createValueExpression(rawValue);
    }
  }

  return {
    action,
    hint,
    valueExpression,
    originalText: stepText,
  };
}

function buildStepHint(stepText: string, action: StepAction, match?: StepMatch): StepHint {
  const textHint =
    match?.params.element ?? match?.params.field ?? simplifyTextHint(stepText) ?? undefined;
  const hint: StepHint = {
    textHint,
  };

  switch (action) {
    case 'click':
      hint.roleHint = 'button';
      hint.typeHint = /submit/.test(stepText.toLowerCase()) ? 'submit' : 'button';
      break;
    case 'fill':
    case 'type':
      hint.typeHint = 'textbox';
      break;
    case 'assert':
    case 'waitVisible':
    case 'waitHidden':
      hint.roleHint = 'heading';
      break;
  }

  return hint;
}

function extractPreferredValue(match: StepMatch | undefined, keys: string[]): string | undefined {
  if (!match) {
    return undefined;
  }
  for (const key of keys) {
    const candidate = match.params[key];
    if (candidate?.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function simplifyTextHint(text: string): string | undefined {
  const tokens = text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => !COMMON_STOP_WORDS.has(token));

  if (!tokens || !tokens.length) {
    return undefined;
  }

  return tokens.join(' ');
}

const COMMON_STOP_WORDS = new Set(
  'user the a to on at in with and via as for should expect see verify confirm assert click enter navigate go visit open page login log'.split(
    ' '
  )
);

function createValueExpression(raw: string): string {
  const trimmed = raw.trim();
  const placeholder = /^<([A-Z0-9_]+)>$/i.exec(trimmed);
  if (placeholder) {
    const envVar = placeholder[1];
    return `process.env.${envVar} ?? ${JSON.stringify(trimmed)}`;
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed;
  }

  return JSON.stringify(trimmed);
}

function resolvePageFromMatch(rawPage: string, pages: Record<string, string>): string | undefined {
  const normalized = rawPage.toLowerCase().replace(/page$/i, '').trim();
  return Object.keys(pages).find((entry) => entry.toLowerCase() === normalized);
}

function detectPageKeyByHeuristics(text: string, pages: Record<string, string>): string | undefined {
  const normalized = text.toLowerCase();
  for (const key of Object.keys(pages)) {
    const lowerKey = key.toLowerCase();
    if (normalized.includes(`${lowerKey} page`)) {
      return key;
    }
  }
  for (const key of Object.keys(pages)) {
    const lowerKey = key.toLowerCase();
    if (normalized.includes(lowerKey)) {
      return key;
    }
  }
  return undefined;
}

function detectPageKeyByScenario(steps: string[], pages: Record<string, string>): string | undefined {
  for (const step of steps) {
    const detected = detectPageKeyByHeuristics(step, pages);
    if (detected) {
      return detected;
    }
  }
  return undefined;
}

function renderScenarioBlock(scenario: CompiledScenario): string[] {
  const lines: string[] = [];
  lines.push(`  test(${JSON.stringify(scenario.name)}, async ({ page }) => {`);
  lines.push(`    await page.goto(resolvePageUrl(${JSON.stringify(scenario.pageKey)}));`);
  lines.push(`    await page.waitForLoadState('networkidle');`);

  scenario.steps.forEach((step, index) => {
    const stepLines = renderStepLines(step, index);
    lines.push(...stepLines);
  });

  lines.push('  });');
  return lines;
}

function renderStepLines(step: CompiledStep, index: number): string[] {
  const locatorName = `locator${index}`;
  const optionsLiteral = renderHintOptions(step.hint);
  const idArgument = step.hint.selectorId ? JSON.stringify(step.hint.selectorId) : 'undefined';
  const resolverCall = `await selectorResolver(page, ${idArgument}, ${optionsLiteral})`;
  const lines: string[] = [];
  lines.push(`    const { locator: ${locatorName} } = ${resolverCall};`);

  switch (step.action) {
    case 'click':
      lines.push(`    await ${locatorName}.click();`);
      break;
    case 'fill':
      lines.push(`    await ${locatorName}.fill(${step.valueExpression});`);
      break;
    case 'type':
      lines.push(`    await ${locatorName}.type(${step.valueExpression});`);
      break;
    case 'hover':
      lines.push(`    await ${locatorName}.hover();`);
      break;
    case 'scroll':
      lines.push(`    await ${locatorName}.scrollIntoViewIfNeeded();`);
      break;
    case 'assert':
      if (step.valueExpression) {
        lines.push(`    await expect(${locatorName}).toContainText(${step.valueExpression});`);
      } else {
        lines.push(`    await expect(${locatorName}).toBeVisible();`);
      }
      break;
    case 'waitVisible':
      lines.push(`    await expect(${locatorName}).toBeVisible();`);
      break;
    case 'waitHidden':
      lines.push(`    await expect(${locatorName}).toBeHidden();`);
      break;
    case 'assertDisabled':
      lines.push(`    await expect(${locatorName}).toBeDisabled();`);
      break;
    case 'assertEnabled':
      lines.push(`    await expect(${locatorName}).toBeEnabled();`);
      break;
  }

  return lines;
}

function renderHintOptions(hint: StepHint): string {
  const parts: string[] = [];
  if (hint.textHint) {
    parts.push(`textHint: ${JSON.stringify(hint.textHint)}`);
  }
  if (hint.typeHint) {
    parts.push(`typeHint: ${JSON.stringify(hint.typeHint)}`);
  }
  if (hint.roleHint) {
    parts.push(`roleHint: ${JSON.stringify(hint.roleHint)}`);
  }

  return parts.length ? `{ ${parts.join(', ')} }` : 'undefined';
}

function deriveOutputFileName(specPath: string, spec: PlainSpecDefinition): string {
  const baseName = path.basename(specPath, path.extname(specPath));
  const safeBase = slugify(baseName);
  const suffix = spec.specId.slice(0, 8);
  return `${safeBase}-${suffix}.spec.ts`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'spec';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
