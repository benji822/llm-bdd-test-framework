import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { defineBddConfig } from 'playwright-bdd';

dotenv.config({ path: '.env.local', override: true });

const bddTestDir = defineBddConfig({
  features: 'tests/features/**/*.feature',
  steps: ['tests/steps/**/*.ts'],
  outputDir: 'tests/.features-gen',
});

export default defineConfig({
  testDir: bddTestDir,
  testMatch: /.*\.spec\.(ts|js)/,
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
});
