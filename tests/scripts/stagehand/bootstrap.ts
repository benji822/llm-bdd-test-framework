import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

import { StagehandWrapper } from './wrapper.js';
import type { StagehandRuntimeOptions } from './types.js';
import type { Stagehand, V3Options } from '@browserbasehq/stagehand';

type StagehandCtor = new (opts: V3Options) => Stagehand;

export async function createAuthoringStagehandWrapper(
  options: StagehandRuntimeOptions = {}
): Promise<StagehandWrapper> {
  const StagehandCtor = await resolveStagehandCtor();
  const cacheDir = process.env.STAGEHAND_CACHE_DIR ?? path.resolve('tests/tmp/stagehand-cache');
  process.env.AUTHORING_MODE = process.env.AUTHORING_MODE ?? 'true';
  const runtimeOptions: StagehandRuntimeOptions = {
    enableCache: true,
    authoringMode: true,
    cacheDir,
    ...options,
  };
  const page = createStubPage();
  const stagehandCtorOptions = buildStagehandCtorOptions();
  const stagehandInstance = new StagehandCtor(stagehandCtorOptions);
  if (typeof stagehandInstance.init === 'function') {
    await stagehandInstance.init();
  }
  return new StagehandWrapper(page, stagehandInstance, runtimeOptions);
}

async function resolveStagehandCtor(): Promise<StagehandCtor> {
  const forceMock = parseBooleanEnv(process.env.STAGEHAND_USE_MOCK) === true;
  if (!forceMock) {
    try {
      const realModule = await import('@browserbasehq/stagehand');
      return (realModule as { Stagehand: StagehandCtor }).Stagehand;
    } catch (error) {
      console.warn('Failed to load real Stagehand. Falling back to mock:', (error as Error).message);
    }
  }

  const mockPath = path.join(
    process.cwd(),
    'tests',
    'mocks',
    'node_modules',
    '@browserbasehq',
    'stagehand',
    'index.js'
  );

  const mockModule = await import(pathToFileURL(mockPath).href);
  if (mockModule && 'Stagehand' in mockModule) {
    console.info('Using mock Stagehand implementation (STAGEHAND_USE_MOCK=true).');
    return (mockModule as { Stagehand: StagehandCtor }).Stagehand;
  }

  throw new Error('Stagehand constructor could not be resolved');
}

export function createStubPage(): Page {
  return {
    url: () => 'about:blank',
  } as unknown as Page;
}

function buildStagehandCtorOptions(): V3Options {
  const opts: V3Options = {
    env: 'LOCAL',
    verbose: 0,
  };
  configureOpenRouterEnv(opts);
  return opts;
}

function configureOpenRouterEnv(opts: V3Options): void {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || isCiEnvironment()) {
    return;
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim();
  process.env.OPENAI_API_KEY = apiKey;
  if (baseUrl) {
    process.env.OPENAI_API_BASE_URL = baseUrl;
  } else if (!process.env.OPENAI_API_BASE_URL) {
    process.env.OPENAI_API_BASE_URL = 'https://openrouter.ai/api/v1';
  }

  const model = process.env.OPENROUTER_MODEL?.trim();
  if (model && model.length > 0) {
    opts.model = model;
  }

  console.info('Stagehand authoring routed through OpenRouter (OPENAI_API_BASE_URL/KEY set).');
}

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseBooleanEnv(value?: string): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_ENV_VALUES.has(normalized)) {
    return false;
  }
  return undefined;
}

function isCiEnvironment(): boolean {
  return (
    parseBooleanEnv(process.env.CI) === true ||
    parseBooleanEnv(process.env.GITHUB_ACTIONS) === true ||
    parseBooleanEnv(process.env.BUILDKITE) === true
  );
}
