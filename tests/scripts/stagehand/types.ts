import type { Page } from '@playwright/test';
import { z } from 'zod';

/**
 * Action metadata for deterministic caching and auditing
 */
export interface ActionMetadata {
  id: string;
  timestamp: string;
  duration: number;
  cached: boolean;
  cacheKey?: string;
  error?: string;
}

export interface StagehandActionDescriptor {
  selector?: string;
  description?: string;
  method?: string;
  arguments?: string[];
}

export interface StagehandActResult {
  metadata: ActionMetadata;
  instruction: string;
  actions: StagehandActionDescriptor[];
  message?: string;
  raw?: {
    success?: boolean;
    actionDescription?: string;
    message?: string;
  };
}

/**
 * Result from observe() call
 */
export interface ObserveAction {
  selector: string;
  description: string;
  instruction: string;
}

/**
 * Options for Stagehand runtime wrapper
 */
export interface StagehandRuntimeOptions {
  /** Enable caching of observations and actions */
  enableCache?: boolean;
  /** Cache directory path (overrides default or STAGEHAND_CACHE_DIR) */
  cacheDir?: string;
  /** Enable authoring mode (allow LLM calls in CI, can be set via AUTHORING_MODE env) */
  authoringMode?: boolean;
  /** Model to use (e.g., 'gpt-4o', 'claude-3-5-sonnet-latest') */
  model?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Stagehand-wrapped Playwright page
 */
export interface StagehandPage extends Page {
  /**
   * Discover actionable elements on the current page
   */
  observe(instruction: string): Promise<ObserveAction[]>;

  /**
   * Execute a natural language action
   */
  act(instruction: string): Promise<StagehandActResult>;

  /**
   * Extract structured data using a Zod schema
   */
  extract<T extends z.ZodSchema>(
    instruction: string,
    schema: T
  ): Promise<z.infer<T> & { _metadata: ActionMetadata }>;
}
