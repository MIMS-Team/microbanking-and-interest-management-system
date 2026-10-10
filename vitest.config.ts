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
    // Bound concurrent scrypt/embedded-database setup so the existing hook timeout
    // remains reliable on development machines and CI. All tests still execute.
    maxWorkers: 2,
    include: ['lib/server/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    exclude: ['tests/**', '**/node_modules/**'],
  },
});
