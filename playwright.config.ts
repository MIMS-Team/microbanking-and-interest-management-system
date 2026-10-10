import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: isCI ? 60000 : 30000,
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
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000,
    extraHTTPHeaders: {
      'x-e2e-test': 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !isCI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      EMAIL_PROVIDER: 'console',
      NODE_ENV: 'development',
      E2E_TEST: 'true',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
    },
  },
});
