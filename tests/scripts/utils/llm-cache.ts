import crypto from 'node:crypto';
import path from 'node:path';

import { ensureDir, fileExists, readTextFile, writeTextFile } from './file-operations';
import type { LLMCompletionResult } from '../llm';

interface CacheStore {
  version: number;
  entries: Record<string, CacheEntry>;
}

interface CacheEntry {
  completion: string;
  metadata: LLMCompletionResult['metadata'];
}

const CACHE_VERSION = 1;
const CACHE_DIR = path.resolve('tests/artifacts/cache');
const CACHE_PATH = path.join(CACHE_DIR, 'llm-cache.json');

let inMemoryStore: CacheStore | null = null;
let isDirty = false;

export function createPromptCacheKey(
  prompt: string,
  provider: string,
  model: string,
  extra?: Record<string, unknown>,
): string {
  const hash = crypto.createHash('sha256');
  hash.update(provider);
  hash.update(model);
  hash.update(prompt);
  if (extra) {
    hash.update(JSON.stringify(extra, Object.keys(extra).sort()));
  }
  return hash.digest('hex');
}

export async function getCachedCompletion(key: string): Promise<LLMCompletionResult | undefined> {
  if (process.env.LLM_CACHE?.toLowerCase() === 'off') {
    return undefined;
  }

  const store = await loadCacheStore();
  const entry = store.entries[key];
  if (!entry) {
    return undefined;
  }

  return {
    completion: entry.completion,
    metadata: entry.metadata,
  };
}

export async function setCachedCompletion(key: string, value: LLMCompletionResult): Promise<void> {
  if (process.env.LLM_CACHE?.toLowerCase() === 'off') {
    return;
  }

  const store = await loadCacheStore();
  store.entries[key] = {
    completion: value.completion,
    metadata: value.metadata,
  };
  isDirty = true;
  await persistCacheIfNeeded();
}

async function loadCacheStore(): Promise<CacheStore> {
  if (inMemoryStore) {
    return inMemoryStore;
  }

  if (!(await fileExists(CACHE_PATH))) {
    inMemoryStore = { version: CACHE_VERSION, entries: {} };
    return inMemoryStore;
  }

  try {
    const raw = await readTextFile(CACHE_PATH);
    const parsed = JSON.parse(raw) as CacheStore;
    if (parsed.version !== CACHE_VERSION || !parsed.entries) {
      inMemoryStore = { version: CACHE_VERSION, entries: {} };
      return inMemoryStore;
    }
    inMemoryStore = parsed;
    return inMemoryStore;
  } catch {
    inMemoryStore = { version: CACHE_VERSION, entries: {} };
    return inMemoryStore;
  }
}

async function persistCacheIfNeeded(): Promise<void> {
  if (!isDirty || !inMemoryStore) {
    return;
  }

  await ensureDir(CACHE_DIR);
  await writeTextFile(CACHE_PATH, `${JSON.stringify(inMemoryStore, null, 2)}\n`);
  isDirty = false;
}
