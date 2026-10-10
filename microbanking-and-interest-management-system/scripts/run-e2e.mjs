import { fork, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireE2eTarget } from './auth-test-environment.mjs';

export function createE2eRun() {
  const directory = mkdtempSync(join(tmpdir(), 'mims-auth-e2e-'));
  const id = randomUUID();
  writeFileSync(join(directory, '.owner'), id);
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...process.env, NODE_ENV: 'development', VITEST: 'false',
    MIMS_AUTH_E2E: 'true', MIMS_AUTH_E2E_DIR: directory, MIMS_AUTH_E2E_RUN_ID: id,
    MIMS_AUTH_DB_PATH: join(directory, 'mims_auth.db'), MIMS_AUTH_DB_ADAPTER: 'sqlite',
    MIMS_AUTH_E2E_RELAX_LIMITS: 'true', EMAIL_PROVIDER: 'test', NEXT_TELEMETRY_DISABLED: '1',
  };
  return { env, directory, id };
}

export function cleanupE2eRun(run) {
  // Resolve and verify ownership before recursive removal, including on Windows.
  const directory = requireE2eTarget(run.env);
  const cacheRoot = resolve('.next', 'e2e');
  const cache = resolve(cacheRoot, run.id);
  if (!/^[0-9a-f-]{36}$/.test(run.id) || run.env.MIMS_AUTH_E2E_RUN_ID !== run.id || cache !== join(cacheRoot, run.id)) throw new Error('Invalid E2E cache owner.');
  rmSync(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export async function runE2e(args = []) {
  if (process.env.NODE_ENV === 'production') throw new Error('Run browser tests in a development/test environment.');
  const run = createE2eRun();
  console.log(`[E2E] Owned temporary database: ${run.env.MIMS_AUTH_DB_PATH}`);
  let server;
  let browser;
  const stop = () => { browser?.kill(); if (server?.connected) server.send('shutdown'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const seeded = spawnSync(process.execPath, ['scripts/seed-e2e.mjs'], { env: run.env, stdio: 'inherit' });
    if (seeded.error || seeded.status !== 0) throw seeded.error || new Error('E2E seed failed.');
    server = fork('scripts/e2e-server.mjs', [], { env: run.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const baseURL = await new Promise((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dedicated E2E server setup timed out.')), 120000);
      server.once('message', (message) => { clearTimeout(timeout); resolveReady(message.baseURL); });
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Dedicated E2E server exited during setup (${code}).`)); });
    });
    console.log(`[E2E] Dedicated server: ${baseURL}`);
    browser = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...args], {
      env: { ...run.env, PLAYWRIGHT_TEST_BASE_URL: baseURL }, stdio: 'inherit',
    });
    return await new Promise((resolveDone, reject) => {
      browser.once('error', reject);
      browser.once('exit', (code) => resolveDone(code ?? 1));
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (server && server.exitCode === null && server.signalCode === null) {
      await new Promise((resolveStopped) => {
        const timeout = setTimeout(() => server.kill(), 5000);
        server.once('exit', () => { clearTimeout(timeout); resolveStopped(); });
        if (server.connected) server.send('shutdown');
        else server.kill();
      });
    }
    cleanupE2eRun(run);
    console.log(`[E2E] Removed owned temporary database: ${run.directory}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runE2e(process.argv.slice(2)); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
