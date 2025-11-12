import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/unit',
  timeout: 30 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});
