import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

Given("User opens the login page.", async ({ page }) => {
  await page.locator("#mock-action").click();
});

Given("User enters a valid email and password combination.", async ({ page }) => {
  await page.locator("#mock-action").click();
});

Given("Submit button logs user in.", async ({ page }) => {
  await page.locator("#mock-action").click();
});

// Generated from action graph 50cb168b-cdb5-4c0d-a824-9bca0ea578dd (spec 3b2dab459499ec182dd4e397cfda79f56e4b5444bbfe74111790c71bc0dbd5a8) on 2025-11-10T07:35:31.344Z
