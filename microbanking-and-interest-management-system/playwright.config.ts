import { defineConfig, devices } from '@playwright/test';
import { requireE2eTarget } from './scripts/auth-test-environment.mjs';

const isCI = !!process.env.CI;
requireE2eTarget();
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error('Use npm run test:e2e to start an owned, isolated browser test server.');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: isCI ? 15000 : 5000,
  },
  fullyParallel: false, // Run auth flows sequentially for deterministic state
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
