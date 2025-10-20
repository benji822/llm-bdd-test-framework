import { createBdd } from 'playwright-bdd';

const { Given, When } = createBdd();

Given('I am on the {word} page', async ({ page }, slug: string) => {
  const routes: Record<string, string> = {
    login: '/login',
    dashboard: '/dashboard',
    cart: '/cart',
    profile: '/profile',
  };
  const route = routes[slug] ?? `/${slug}`;
  await page.goto(route);
});

When('I navigate to {string}', async ({ page }, path: string) => {
  await page.goto(path);
});
