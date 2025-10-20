import { createBdd } from 'playwright-bdd';

const { When } = createBdd();

When('I enter {word} as {string}', async ({ page }, field: string, value: string) => {
  const locator = `[data-testid='${field}-input']`;
  await page.fill(locator, value);
});

When('I select {word} as {string}', async ({ page }, field: string, value: string) => {
  const locator = `[data-testid='${field}-select']`;
  await page.selectOption(locator, { label: value });
});

When('I click the {word} button', async ({ page }, element: string) => {
  // Map element names to button labels or selectors
  const buttonMap: Record<string, string> = {
    submit: 'Sign in',
    login: 'Sign in',
    save: 'Save',
    cancel: 'Cancel',
  };

  const label = buttonMap[element] ?? element;
  await page.getByRole('button', { name: label }).click();
});
