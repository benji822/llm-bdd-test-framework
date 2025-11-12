import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

Given("User opens the login page.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/\"]").click();
});

Given("User enters a valid email and password combination.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/html[1]\"]").fill("100%");
});

Given("Submit button logs user in.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/html[1]\"]").click();
});

// Generated from action graph 3cb892a1-2d33-403f-814b-4c83aaa09d90 (spec 3b2dab459499ec182dd4e397cfda79f56e4b5444bbfe74111790c71bc0dbd5a8) on 2025-11-12T06:08:05.314Z
