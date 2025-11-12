import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

When("User nagivate to login page.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/html[1]\"]").click();
});

When("User enters a valid email and password combination.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/html[1]\"]").fill("");
});

When("click on login button to log user incorrect.", async ({ page }) => {
  await page.locator("[data-testid=\"xpath=/\"]").click();
});

// Generated from action graph 7e664c0a-f2bd-4e8a-86f1-97434bb1f86b (spec 6df3a1b0be9cd838f50e6dae7445c46ffef03968acfa325c1b694c7b2a05c49d) on 2025-11-12T07:48:24.184Z
