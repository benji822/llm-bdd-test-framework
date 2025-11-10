import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { defineBddConfig } from 'playwright-bdd';

dotenv.config({ path: '.env.local', override: true });

const bddTestDir = defineBddConfig({
  features: 'tests/features/**/*.feature',
  steps: ['tests/steps/generated/**/*.ts'],
  outputDir: 'tests/.features-gen',
  importTestFrom: './tests/fixtures/stagehand-bdd.js',
  disableWarnings: { importTestFrom: true },
});

// Allow controlled tweaking of Chromium launch from env without code edits.
const extraChromeArgs = (process.env.PW_EXTRA_CHROME_ARGS ?? '')
  .split(/\s+/)
  .filter(Boolean);
const ignoreNoSandbox = process.env.PW_IGNORE_NO_SANDBOX === 'true';

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
    launchOptions: {
      // Extra args can be provided as a single string, e.g.:
      //   PW_EXTRA_CHROME_ARGS="--single-process --no-zygote"
      args: extraChromeArgs,
      // Point to a specific Chrome/Chromium if needed:
      executablePath: process.env.PW_CHROME_PATH,
      // Try SUID sandbox when available by removing Playwright's default --no-sandbox.
      ignoreDefaultArgs: ignoreNoSandbox ? ['--no-sandbox'] : undefined,
      // Optionally choose a Chrome channel (e.g., 'chrome', 'chrome-beta').
      channel: process.env.PW_CHANNEL as any,
    },
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
