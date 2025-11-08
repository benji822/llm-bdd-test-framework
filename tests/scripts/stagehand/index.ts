/**
 * Stagehand runtime wrapper - main export
 *
 * Provides Playwright-integrated Stagehand observe/act/extract with caching.
 */

export { StagehandWrapper, createStagehandWrapper } from './wrapper';
export { StagehandCache } from './cache';
export type {
  ActionMetadata,
  ObserveAction,
  StagehandRuntimeOptions,
  StagehandPage,
} from './types';

import { Page } from '@playwright/test';
import { createStagehandWrapper } from './wrapper';
import type { StagehandPage, StagehandRuntimeOptions } from './types';

/**
 * Decorate a Playwright page with Stagehand methods.
 */
export async function withStagehand(
  page: Page,
  options: StagehandRuntimeOptions = {}
): Promise<StagehandPage> {
  const wrapper = await createStagehandWrapper(page, options);
  const p = page as unknown as StagehandPage;
  p.observe = (instruction: string) => wrapper.observe(instruction);
  p.act = (instruction: string) => wrapper.act(instruction);
  p.extract = (instruction, schema) => wrapper.extract(instruction, schema);
  return p;
}
