import { createBdd } from 'playwright-bdd';
import { ensureMockLoginApp } from './support/mock-login-app';

const { Given, When } = createBdd();

Given('I am on the {word} page', async ({ page }, slug: string) => {
  await ensureMockLoginApp(page);
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
  await ensureMockLoginApp(page);
  await page.goto(path);
});
