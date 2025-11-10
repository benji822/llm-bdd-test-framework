import { test as bddTest } from 'playwright-bdd';
import { ensureMockLoginApp } from '../steps/support/mock-login-app.js';

export const test = bddTest.extend({
  page: async ({ page }, use) => {
    if (process.env.MOCK_LOGIN_APP === 'true') {
      await ensureMockLoginApp(page);
    }
    await use(page);
  },
});
