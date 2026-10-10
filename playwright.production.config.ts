import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.AUTH_VERIFY_URL;
if (!baseURL || !/^https:\/\/auth\.mims\.test:\d+$/.test(baseURL) || !process.env.AUTH_VERIFY_MAILBOX_TOKEN) {
  throw new Error('Use npm run test:e2e:production to provision isolated production verification.');
}

export default defineConfig({
  testDir: './tests/production',
  testMatch: process.env.AUTH_VERIFY_SMOKE==='1'?'smoke.spec.ts':'auth.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0, // Each runner invocation creates fresh fixtures and process limits.
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: 'test-results/production',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/production', open: 'never' }]],
  use: {
    baseURL,
    // Trust only this browser context's ephemeral self-signed endpoint. TLS,
    // HTTPS URLs and Secure-cookie enforcement remain active.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [{ name: 'production-chromium', use: {
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--host-resolver-rules=MAP auth.mims.test 127.0.0.1', '--no-proxy-server'] },
  } }],
});
