import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/server/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    exclude: ['tests/**', '**/node_modules/**'],
  },
});
