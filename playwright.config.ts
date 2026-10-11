import { defineConfig, devices } from '@playwright/test';
import { validateE2eEnvironment } from './scripts/e2e-environment.mjs';

validateE2eEnvironment();
const baseURL = process.env.MIMS_E2E_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(baseURL)) {
  throw new Error('Use npm run test:e2e to start an owned loopback server.');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000, // Allow cold Next.js compilation plus the real 30-second resend cooldown.
  expect: {
    timeout: 30000,
  },
  fullyParallel: false, // Run auth flows sequentially for deterministic state
  workers: 1,
  retries: 0, // Stateful reset tests must not retry against a partially changed fixture.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Traces and screenshots retain failure evidence without recording every
    // independent employee context throughout long OTP workflows.
    video: 'off',
    actionTimeout: 30000,
    navigationTimeout: 60000, // First visits compile routes on the dedicated dev server.
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'edge',use:{...devices['Desktop Edge'],channel:'msedge'}},
  ],
});
