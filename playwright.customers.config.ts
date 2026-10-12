import { defineConfig } from '@playwright/test';
import production from './playwright.production.config';

export default defineConfig({
  ...production,
  testMatch: 'customers.spec.ts',
  outputDir: 'test-results/customers',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/customers', open: 'never' }]],
});
