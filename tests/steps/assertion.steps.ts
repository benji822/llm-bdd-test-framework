import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Then } = createBdd();

Then('I should see text {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the URL should include {string}', async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment));
});
