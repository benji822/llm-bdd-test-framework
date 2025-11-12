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
  return new StagehandWrapper(
    page,
    new StagehandCtor({ env: 'LOCAL', verbose: 0 }),
    runtimeOptions,
  );
}

async function resolveStagehandCtor(): Promise<StagehandCtor> {
  const mockPath = path.join(
    process.cwd(),
    'tests',
    'mocks',
    'node_modules',
    '@browserbasehq',
    'stagehand',
    'index.js'
  );
  try {
    const mockModule = await import(pathToFileURL(mockPath).href);
    if (mockModule && 'Stagehand' in mockModule) {
      return (mockModule as { Stagehand: StagehandCtor }).Stagehand;
    }
    throw new Error('mock Stagehand missing');
  } catch {
    const realModule = await import('@browserbasehq/stagehand');
    return (realModule as { Stagehand: StagehandCtor }).Stagehand;
  }
}

export function createStubPage(): Page {
  return {
    url: () => 'about:blank',
  } as unknown as Page;
}
