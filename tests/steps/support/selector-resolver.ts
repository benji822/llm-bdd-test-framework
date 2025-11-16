import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import type { SelectorEntry, SelectorRegistry } from '../../scripts/types/selector-registry';

type StrategyName = 'role' | 'label' | 'text' | 'type' | 'name' | 'placeholder' | 'css' | 'testid';
type StrategySource = 'registry' | 'attribute' | 'heuristic';

const DEFAULT_STRATEGY_ORDER: StrategyName[] = [
  'role',
  'label',
  'text',
  'type',
  'name',
  'placeholder',
  'css',
  'testid',
];
const VALID_STRATEGIES = new Set<StrategyName>(DEFAULT_STRATEGY_ORDER);
const DEFAULT_REGISTRY_PATH = path.resolve('tests/artifacts/selectors/registry.json');

interface SelectorResolverOptions {
  registryPath?: string;
  strategyOrder?: StrategyName[];
  logger?: (event: SelectorResolverTelemetry) => void;
  expectedTagNames?: string[];
  textHint?: string;
  typeHint?: string;
  roleHint?: string;
  scope?: Locator;
  ambiguityPolicy?: 'error' | 'first' | 'warn';
}

interface SelectorResolverTelemetry {
  strategy: StrategyName | 'id';
  selector: string;
  entryId?: string;
  tokens: string[];
  source: StrategySource;
  matchCount?: number;
  candidates?: Array<{ selector: string; entryId?: string; reason: string }>;
}

interface SelectorResolution {
  locator: Locator;
  telemetry: SelectorResolverTelemetry;
}

let cachedRegistry: SelectorRegistry | undefined;

const defaultLogger = (event: SelectorResolverTelemetry): void => {
  console.info(
    `[selector-resolver] strategy=${event.strategy} selector=${event.selector}${
      event.entryId ? ` entryId=${event.entryId}` : ''
    } tokens=[${event.tokens.join(',')}]`
  );
};

async function loadSelectorRegistry(
  customPath?: string
): Promise<SelectorRegistry | undefined> {
  if (!customPath && cachedRegistry) {
    return cachedRegistry;
  }

  const resolvedPath = path.resolve(customPath ?? DEFAULT_REGISTRY_PATH);
  try {
    const payload = await fs.readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(payload) as SelectorRegistry;
    if (!customPath) {
      cachedRegistry = parsed;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(
      `Failed to load selector registry at ${resolvedPath}: ${(error as Error).message}`
    );
  }
}

function buildTokens(idOrHint?: string): string[] {
  if (!idOrHint) {
    return [];
  }
  return idOrHint
    .split(/[^a-zA-Z0-9]+/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function parseStrategyOrder(
  options?: SelectorResolverOptions
): StrategyName[] {
  let result: StrategyName[] = [];

  // Option 1: explicit strategyOrder in options
  if (options?.strategyOrder && options.strategyOrder.length > 0) {
    result = options.strategyOrder.filter((strategy) => VALID_STRATEGIES.has(strategy));
    // Always append missing defaults in their canonical order
    const missing = DEFAULT_STRATEGY_ORDER.filter((s) => !result.includes(s));
    return [...result, ...missing];
  }

  // Option 2: SELECTOR_STRATEGY environment variable
  const envOverride = process.env.SELECTOR_STRATEGY;
  if (envOverride) {
    const candidates = envOverride
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .filter((value): value is StrategyName => VALID_STRATEGIES.has(value as StrategyName));
    if (candidates.length > 0) {
      // Always append missing defaults in their canonical order
      const missing = DEFAULT_STRATEGY_ORDER.filter((s) => !candidates.includes(s));
      return [...candidates, ...missing];
    }
  }

  // Default fallback
  return DEFAULT_STRATEGY_ORDER;
}

function matchesTokens(entry: SelectorEntry, tokens: string[]): boolean {
  if (!tokens.length) {
    return false;
  }
  const haystack = `${entry.id} ${entry.selector} ${entry.page}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTelemetry(
  strategy: StrategyName | 'id',
  selector: string,
  tokens: string[],
  source: StrategySource,
  entryId?: string,
  matchCount?: number,
  candidates?: Array<{ selector: string; entryId?: string; reason: string }>
): SelectorResolverTelemetry {
  return {
    strategy,
    selector,
    entryId,
    tokens,
    source,
    matchCount,
    candidates,
  };
}

function finalizeResolution(
  locator: Locator,
  telemetry: SelectorResolverTelemetry,
  logger: (event: SelectorResolverTelemetry) => void,
  ambiguityPolicy?: 'error' | 'first' | 'warn'
): SelectorResolution | undefined {
  if (ambiguityPolicy === 'error' && telemetry.matchCount && telemetry.matchCount > 1) {
    const candidatesList =
      telemetry.candidates
        ?.map((c) => `  - ${c.selector}${c.entryId ? ` (${c.entryId})` : ''} [${c.reason}]`)
        .join('\n') || '';
    const message =
      `Ambiguous selector resolution for "${telemetry.selector}": ` +
      `${telemetry.matchCount} elements matched.\n` +
      `Candidates:\n${candidatesList}\n` +
      `Suggestion: Add explicit aria-label, data-testid, or registry ID to disambiguate.`;
    throw new Error(message);
  }

  if (ambiguityPolicy === 'warn' && telemetry.matchCount && telemetry.matchCount > 1) {
    console.warn(
      `[selector-resolver] Ambiguous match: "${telemetry.selector}" resolved to ${telemetry.matchCount} elements. Using first.`
    );
  }

  logger(telemetry);
  return { locator, telemetry };
}

const REGISTRY_STRATEGIES: StrategyName[] = ['role', 'label', 'css', 'testid'];

async function resolveFromRegistry(
  page: Page,
  registry: SelectorRegistry | undefined,
  strategy: StrategyName,
  tokens: string[],
  logger: (event: SelectorResolverTelemetry) => void,
  options?: SelectorResolverOptions
): Promise<SelectorResolution | undefined> {
  if (!registry || !REGISTRY_STRATEGIES.includes(strategy)) {
    return undefined;
  }

  const entries = Object.values(registry.selectors)
    .filter((entry) => entry.type === strategy)
    .filter((entry) => matchesTokens(entry, tokens))
    .sort((a, b) => a.priority - b.priority);

  if (!entries.length) {
    return undefined;
  }

  for (const entry of entries) {
    const scope = options?.scope ?? page;
    const locator = scope.locator(entry.selector);
    const count = await locator.count();

    const resolution = await tryFinalizeResolution(
      locator,
      strategy,
      entry.selector,
      tokens,
      'registry',
      logger,
      options,
      entry.id,
      count > 0 ? count : undefined
    );

    if (resolution) {
      return resolution;
    }
  }

  return undefined;
}

async function resolveByAttribute(
  page: Page,
  attr: 'name' | 'placeholder',
  tokens: string[],
  logger: (event: SelectorResolverTelemetry) => void,
  options?: SelectorResolverOptions
): Promise<SelectorResolution | undefined> {
  if (!tokens.length) {
    return undefined;
  }

  for (const token of tokens) {
    const selector = `[${attr}*="${escapeAttributeValue(token)}"]`;
    const scope = options?.scope ?? page;
    const locator = scope.locator(selector);
    const count = await locator.count();

    if (count > 0) {
      const resolution = await tryFinalizeResolution(
        locator.first(),
        attr,
        selector,
        tokens,
        'attribute',
        logger,
        options,
        undefined,
        count > 1 ? count : undefined
      );
      if (resolution) {
        return resolution;
      }
    }
  }

  return undefined;
}

async function resolveByText(
  page: Page,
  tokens: string[],
  logger: (event: SelectorResolverTelemetry) => void,
  options?: SelectorResolverOptions
): Promise<SelectorResolution | undefined> {
  const candidates = new Set<string>();
  if (options?.textHint) {
    candidates.add(options.textHint);
  }
  tokens.forEach((token) => candidates.add(token));

  if (!candidates.size) {
    return undefined;
  }

  const role = (options?.roleHint as 'button' | 'link' | 'heading' | 'cell') ?? 'button';
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }
    const pattern = new RegExp(escapeForRegex(normalized), 'i');
    const scope = options?.scope ?? page;
    const locator = scope.getByRole(role, { name: pattern });
    const count = await locator.count();

    if (count > 0) {
      const resolution = await tryFinalizeResolution(
        locator.first(),
        'text',
        `getByRole('${role}', { name: ${pattern} })`,
        tokens,
        'heuristic',
        logger,
        options,
        undefined,
        count > 1 ? count : undefined
      );
      if (resolution) {
        return resolution;
      }
    }
  }

  return undefined;
}

async function resolveByType(
  page: Page,
  tokens: string[],
  logger: (event: SelectorResolverTelemetry) => void,
  options?: SelectorResolverOptions
): Promise<SelectorResolution | undefined> {
  const typeToken =
    options?.typeHint ??
    tokens.find((token) => ['submit', 'reset', 'button'].includes(token.toLowerCase()));

  if (!typeToken) {
    return undefined;
  }

  const normalizedType = typeToken.toLowerCase();
  const selectors = [
    `button[type='${normalizedType}']`,
    `input[type='${normalizedType}']`,
    `a[type='${normalizedType}']`,
  ];

  for (const selector of selectors) {
    const scope = options?.scope ?? page;
    const locator = scope.locator(selector);
    const count = await locator.count();

    if (count > 0) {
      const resolution = await tryFinalizeResolution(
        locator.first(),
        'type',
        selector,
        tokens,
        'heuristic',
        logger,
        options,
        undefined,
        count > 1 ? count : undefined
      );
      if (resolution) {
        return resolution;
      }
    }
  }

  return undefined;
}

async function matchesExpectedTag(
  locator: Locator,
  expected?: string[]
): Promise<boolean> {
  if (!expected?.length) {
    return true;
  }

  try {
    const handle = await locator.elementHandle();
    if (!handle) {
      return false;
    }

    try {
      const tagName = (await handle.evaluate((el) => el.tagName)).toLowerCase();
      return expected.some((value) => value === tagName);
    } finally {
      await handle.dispose();
    }
  } catch {
    return false;
  }
}

async function tryFinalizeResolution(
  locator: Locator,
  strategy: StrategyName | 'id',
  selector: string,
  tokens: string[],
  source: StrategySource,
  logger: (event: SelectorResolverTelemetry) => void,
  options?: SelectorResolverOptions,
  entryId?: string,
  matchCount?: number
): Promise<SelectorResolution | undefined> {
  if (!(await matchesExpectedTag(locator, options?.expectedTagNames))) {
    return undefined;
  }

  const telemetry = createTelemetry(
    strategy,
    selector,
    tokens,
    source,
    entryId,
    matchCount
  );
  return finalizeResolution(locator, telemetry, logger, options?.ambiguityPolicy);
}

export async function selectorResolver(
  page: Page,
  idOrHint?: string,
  options?: SelectorResolverOptions
): Promise<SelectorResolution> {
  const logger = options?.logger ?? defaultLogger;
  const tokens = buildTokens(idOrHint);
  const registry = await loadSelectorRegistry(options?.registryPath);

  // ID shortcut with scope support
  if (idOrHint && registry?.selectors[idOrHint]) {
    const entry = registry.selectors[idOrHint];
    const scope = options?.scope ?? page;
    const locator = scope.locator(entry.selector);
    const count = await locator.count();

    const resolution = await tryFinalizeResolution(
      locator,
      'id',
      entry.selector,
      tokens,
      'registry',
      logger,
      options,
      entry.id,
      count > 1 ? count : undefined
    );
    if (resolution) {
      return resolution;
    }
  }

  // Strategy iteration with documented default order enforcement
  const strategies = parseStrategyOrder(options);
  for (const strategy of strategies) {
    let resolution: SelectorResolution | undefined;
    if (strategy === 'name' || strategy === 'placeholder') {
      resolution = await resolveByAttribute(page, strategy, tokens, logger, options);
    } else if (strategy === 'text') {
      resolution = await resolveByText(page, tokens, logger, options);
    } else if (strategy === 'type') {
      resolution = await resolveByType(page, tokens, logger, options);
    } else {
      resolution = await resolveFromRegistry(page, registry, strategy, tokens, logger, options);
    }

    if (resolution) {
      return resolution;
    }
  }

  // Enhanced error message with strategy trace
  const strategyTrace = strategies.join(' → ');
  const hint = idOrHint ? `"${idOrHint}"` : 'selector';
  throw new Error(
    `selectorResolver could not resolve ${hint}.\n` +
    `Strategy order tried: ${strategyTrace}\n` +
    `Suggestion: Register this selector in the registry, add aria-label/data-testid, or provide an explicit hint.`
  );
}

export type {
  SelectorResolverOptions,
  SelectorResolverTelemetry,
  SelectorResolution,
};
