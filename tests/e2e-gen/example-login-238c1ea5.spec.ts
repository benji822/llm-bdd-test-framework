// QA spec: tests/qa-specs/example-login.txt
// Spec ID: 238c1ea5fe2a1c73890b261d566e118b77f02dd3b8f13e785bea66c43ec95489
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

test.describe("Customer login", () => {
  test("Happy path", async ({ page }) => {
    await page.goto(resolvePageUrl("login"));
    const { locator: locator0 } = await selectorResolver(page, undefined, { textHint: "email" });
    await locator0.fill(process.env.E2E_USER_EMAIL ?? "<E2E_USER_EMAIL>");
    const { locator: locator1 } = await selectorResolver(page, undefined, { textHint: "password" });
    await locator1.fill(process.env.E2E_USER_PASSWORD ?? "<E2E_USER_PASSWORD>");
    const { locator: locator2 } = await selectorResolver(page, undefined, { textHint: "login", typeHint: "button", roleHint: "button" });
    await locator2.click();
    const { locator: locator3 } = await selectorResolver(page, undefined, { textHint: "i text welcome back", roleHint: "heading" });
    await expect(locator3).toContainText("Welcome back");
  });
  test("Invalid password", async ({ page }) => {
    await page.goto(resolvePageUrl("login"));
    const { locator: locator0 } = await selectorResolver(page, undefined, { textHint: "email" });
    await locator0.fill(process.env.E2E_USER_EMAIL ?? "<E2E_USER_EMAIL>");
    const { locator: locator1 } = await selectorResolver(page, undefined, { textHint: "password" });
    await locator1.fill(process.env.E2E_INVALID_PASSWORD ?? "<E2E_INVALID_PASSWORD>");
    const { locator: locator2 } = await selectorResolver(page, undefined, { textHint: "login", typeHint: "button", roleHint: "button" });
    await locator2.click();
    const { locator: locator3 } = await selectorResolver(page, undefined, { textHint: "i text invalid credentials", roleHint: "heading" });
    await expect(locator3).toContainText("Invalid credentials");
  });
});
