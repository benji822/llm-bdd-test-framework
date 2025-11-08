import type { Page } from '@playwright/test';
import { z } from 'zod';
import { Stagehand } from '@browserbasehq/stagehand';
import { StagehandCache } from './cache';
import {
  ActionMetadata,
  ObserveAction,
  StagehandRuntimeOptions,
  StagehandPage,
} from './types';

/**
 * Stagehand runtime wrapper over Playwright page
 *
 * Provides observe(), act(), extract() methods with caching and policy guards.
 * Integrates seamlessly with existing Playwright tests.
 */
export class StagehandWrapper {
  private playwrightPage: Page;
  private stagehand: Stagehand;
  private cache: StagehandCache;
  private options: Required<StagehandRuntimeOptions>;

  constructor(
    playwrightPage: Page,
    stagehand: Stagehand,
    options: StagehandRuntimeOptions = {}
  ) {
    this.playwrightPage = playwrightPage;
    this.stagehand = stagehand;
    this.options = {
      enableCache: options.enableCache ?? true,
      cacheDir: options.cacheDir ?? '.stagehand-cache',
      authoringMode: options.authoringMode ?? false,
      model: options.model ?? 'gpt-4o',
      timeoutMs: options.timeoutMs ?? 30000,
    };

    this.cache = new StagehandCache(this.options.cacheDir);
  }

  /**
   * Observe available actions on the current page
   *
   * Returns suggested actions that can be taken. Cached for deterministic CI.
   */
  async observe(instruction: string): Promise<ObserveAction[]> {
    const cacheKey = this.cache.generateKey(`observe:${instruction}`);

    // Try cache first if enabled
    if (this.options.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== null) {
        return cached as ObserveAction[];
      }
    }

    // If not cached, enforce authoring policy before any LLM calls
    if (!this.cache.has(cacheKey)) {
      this.ensureAuthoringAllowed('observe', instruction);
    }

    // Call Stagehand to observe
    const startTime = Date.now();
    try {
      const observations = await this.stagehand.observe(instruction);

      // Transform to our format
      const actions: ObserveAction[] = observations.map((obs) => ({
        selector: obs.selector,
        description: obs.description,
        instruction,
      }));

      // Cache result
      if (this.options.enableCache) {
        this.cache.set(cacheKey, actions, instruction);
      }

      return actions;
    } catch (error) {
      throw new Error(
        `Stagehand observe failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a natural language action
   *
   * Returns metadata for auditing and determinism tracking.
   */
  async act(instruction: string): Promise<ActionMetadata> {
    const actionId = this.generateActionId();
    const startTime = Date.now();
    const cacheKey = this.cache.generateKey(`act:${instruction}`);

    const metadata: ActionMetadata = {
      id: actionId,
      timestamp: new Date().toISOString(),
      duration: 0,
      cached: false,
    };

    try {
      // Check cache first
      if (this.options.enableCache && this.cache.has(cacheKey)) {
        metadata.cached = true;
        metadata.cacheKey = cacheKey;
        metadata.duration = Date.now() - startTime;
        return metadata;
      }

      // Not cached: enforce authoring policy
      this.ensureAuthoringAllowed('act', instruction);

      // Execute via Stagehand
      await this.stagehand.act(instruction);

      metadata.duration = Date.now() - startTime;
      metadata.cacheKey = cacheKey;

      // Store in cache for future runs
      if (this.options.enableCache) {
        this.cache.set(cacheKey, { success: true }, instruction);
      }

      return metadata;
    } catch (error) {
      metadata.duration = Date.now() - startTime;
      metadata.error = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Stagehand act failed: ${metadata.error}\n  Instruction: ${instruction}`
      );
    }
  }

  /**
   * Extract structured data from the page
   *
   * Uses Zod schema for type-safe extraction with metadata.
   */
  async extract<T extends z.ZodSchema>(
    instruction: string,
    schema: T
  ): Promise<z.infer<T> & { _metadata: ActionMetadata }> {
    const actionId = this.generateActionId();
    const startTime = Date.now();
    const cacheKey = this.cache.generateKey(
      `extract:${instruction}:${JSON.stringify(schema)}`
    );

    const metadata: ActionMetadata = {
      id: actionId,
      timestamp: new Date().toISOString(),
      duration: 0,
      cached: false,
      cacheKey,
    };

    try {
      // Try cache first
      if (this.options.enableCache) {
        const cached = this.cache.get(cacheKey);
        if (cached !== null) {
          metadata.cached = true;
          metadata.duration = Date.now() - startTime;
          return {
            ...(cached as z.infer<T>),
            _metadata: metadata,
          };
        }
      }

      // Not cached: enforce authoring policy
      this.ensureAuthoringAllowed('extract', instruction);

      // Extract via Stagehand
      const result = await this.stagehand.extract(instruction, schema);

      metadata.duration = Date.now() - startTime;

      // Result is already validated by Stagehand
      const validated = result as z.infer<T>;

      if (this.options.enableCache) {
        this.cache.set(cacheKey, validated, instruction);
      }

      return {
        ...validated,
        _metadata: metadata,
      };
    } catch (error) {
      metadata.duration = Date.now() - startTime;
      metadata.error = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Stagehand extract failed: ${metadata.error}\n  Instruction: ${instruction}`
      );
    }
  }

  /**
   * Get the underlying Playwright page
   */
  getPlaywrightPage(): Page {
    return this.playwrightPage;
  }

  /**
   * Get the underlying Stagehand instance
   */
  getStagehand(): Stagehand {
    return this.stagehand;
  }

  /**
   * Get cache stats for debugging/auditing
   */
  getCacheStats(): { cacheDir: string; enabled: boolean } {
    return {
      cacheDir: this.options.cacheDir,
      enabled: this.options.enableCache,
    };
  }

  /**
   * Clear all cached observations and actions
   */
  clearCache(): void {
    this.cache.clear();
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private isCi(): boolean {
    return (
      process.env.CI === 'true' ||
      process.env.GITHUB_ACTIONS === 'true' ||
      process.env.BUILDkite === 'true'
    );
  }

  private ensureAuthoringAllowed(operation: 'observe' | 'act' | 'extract', instruction: string) {
    if (this.isCi() && !this.options.authoringMode) {
      throw new Error(
        `Authoring disabled in CI for ${operation}. Enable authoringMode or provide cached result.\n  Instruction: ${instruction}`
      );
    }
  }
}

/**
 * Factory to create Stagehand wrapper for Playwright page
 */
export async function createStagehandWrapper(
  page: Page,
  options: StagehandRuntimeOptions = {}
): Promise<StagehandWrapper> {
  // Initialize Stagehand with Playwright page
  const stagehand = new Stagehand({
    env: 'LOCAL',
    verbose: 0,
  });

  // Pass Playwright page to Stagehand
  await stagehand.init();

  return new StagehandWrapper(page, stagehand, options);
}
