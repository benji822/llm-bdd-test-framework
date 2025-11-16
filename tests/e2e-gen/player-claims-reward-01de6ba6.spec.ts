// QA spec: tests/qa-specs/player-claims-reward.txt
// Spec ID: 01de6ba602c597f26d84cc4991dbabc1d4a65058939152872636350b46edb8e1
import { test, expect } from '@playwright/test';
import { selectorResolver } from '../steps/support/selector-resolver.js';

const PAGES = {
  "login": "/login",
  "dashboard": "/dashboard",
  "cart": "/cart",
  "profile": "/profile"
} as const;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost";

function resolvePageUrl(pageKey: keyof typeof PAGES): string {
  const route = PAGES[pageKey];
  if (!route) {
    throw new Error('Unknown page key: ' + pageKey);
  }
  return route.startsWith('http') ? route : new URL(route, BASE_URL).toString();
}

// Setup helpers
async function executeSetup(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  // create player
  // state.player = await createplayer(...)
  // create reward
  // state.reward = await createreward(...)
  // assign reward
  // state.reward = await assignreward(...)
  return state;
}

test.describe("Player claims reward", () => {
  let setupState: Record<string, unknown>;
  test.beforeAll(async () => {
    setupState = await executeSetup();
  });

  test("Happy path", async ({ page }) => {
    await page.goto(resolvePageUrl("dashboard"));
    await page.waitForLoadState('networkidle');
    const { locator: locator0 } = await selectorResolver(page, undefined, { textHint: "i am dashboard", typeHint: "button", roleHint: "button" });
    await locator0.click();
    const { locator: locator1 } = await selectorResolver(page, undefined, { textHint: "i complete task button", typeHint: "button", roleHint: "button" });
    await locator1.click();
    const { locator: locator2 } = await selectorResolver(page, undefined, { textHint: "i task completed message", roleHint: "heading" });
    await expect(locator2).toBeVisible();
    const { locator: locator3 } = await selectorResolver(page, undefined, { textHint: "i claim reward button", typeHint: "button", roleHint: "button" });
    await locator3.click();
    const { locator: locator4 } = await selectorResolver(page, undefined, { textHint: "i badge unlock my inventory", roleHint: "heading" });
    await expect(locator4).toBeVisible();
  });
  test("Task already completed", async ({ page }) => {
    await page.goto(resolvePageUrl("dashboard"));
    await page.waitForLoadState('networkidle');
    const { locator: locator0 } = await selectorResolver(page, undefined, { textHint: "i am dashboard", typeHint: "button", roleHint: "button" });
    await locator0.click();
    const { locator: locator1 } = await selectorResolver(page, undefined, { textHint: "i task completed message", roleHint: "heading" });
    await expect(locator1).toBeVisible();
    const { locator: locator2 } = await selectorResolver(page, undefined, { textHint: "i claim reward button", typeHint: "button", roleHint: "button" });
    await locator2.click();
    const { locator: locator3 } = await selectorResolver(page, undefined, { textHint: "i already claimed message", roleHint: "heading" });
    await expect(locator3).toBeVisible();
  });
});
