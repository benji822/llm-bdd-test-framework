import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

Given("I am on the login page", async ({ page }) => {
  await page.goto("http://localhost:4200/login");
});

When("I enter email as <E2E_USER_EMAIL>", async ({ page }) => {
  await page.locator("[data-testid='email-input']").fill("qa.user@example.com");
});

When("I enter password as <E2E_USER_PASSWORD>", async ({ page }) => {
  await page.locator("[data-testid='password-input']").fill("SuperSecure123!");
});

When("I click the submit button", async ({ page }) => {
  await page.locator("[data-testid='submit-button']").click();
});

Then("I should see text Welcome back", async ({ page }) => {
  await expect(page.locator("[data-testid='dashboard-heading']")).toBeVisible();
});

// Generated from action graph 4e426729-ecde-4fa2-a73f-70094748f338 (spec b9aa49ee-bcc2-4af6-be87-50f4d1c0d585) on 2025-11-09T09:28:19.583Z
