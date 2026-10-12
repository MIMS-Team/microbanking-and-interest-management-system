import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../../scripts/start-local.mjs', import.meta.url));
const loader = new URL('../../tests/fixtures/local-launcher-loader.mjs', import.meta.url).href;
const preload = 'data:text/javascript,' + encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(loader)}); globalThis.fetch = async () => new Response('', { status: 200 });`,
);
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mims-launcher-'));
  directories.push(directory);
  mkdirSync(join(directory, '.data'));
  const envFile = join(directory, '.env.local');
  const settings = 'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_USER=fixture\nDB_PASSWORD=fictional\nDB_NAME=fixture_demo\nMIMS_AUTH_DB_ADAPTER=sqlite\n';
  writeFileSync(envFile, settings);
  const appPort = await freePort();
  let inboxPort = await freePort();
  while (inboxPort === appPort) inboxPort = await freePort();
  const runtimePath = join(directory, '.data/local-project-runtime.json');
  const runtime = {
    url: `http://127.0.0.1:${appPort}`, inboxURL: `http://127.0.0.1:${inboxPort}`,
    database: 'fixture_demo', environmentFile: envFile,
    environmentModifiedAt: statSync(envFile).mtimeMs, authAdapter: 'mysql',
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: 'development', MIMS_LOCAL_APP_PORT: String(appPort), MIMS_LOCAL_INBOX_PORT: String(inboxPort),
    MIMS_AUTH_DB_ADAPTER: 'sqlite', MIMS_AUTH_DB_PATH: join(directory, 'unused.db'), MIMS_TEST_SENTINEL: 'fixture',
  };
  delete env.MIMS_LOCAL_ENV_FILE;
  return {
    directory, envFile, settings, runtime, runtimePath, env,
    saveRuntime: () => writeFileSync(runtimePath, JSON.stringify(runtime)),
    run: (args: string[] = []) => spawnSync(process.execPath, ['--import', preload, '--', launcher, ...args], {
      cwd: directory, env, encoding: 'utf8', timeout: 15000, windowsHide: true,
    }),
    child: () => JSON.parse(readFileSync(join(directory, 'launcher-child.json'), 'utf8')),
    didSpawn: () => existsSync(join(directory, 'launcher-child.json')),
  };
}

describe('Complete local launcher configuration', () => {
  it('forces canonical MySQL authentication despite SQLite in the shell and connection file', async () => {
    const f = await fixture();
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(f.child().environment).toEqual({ DB_NAME: 'fixture_demo', MIMS_AUTH_DB_ADAPTER: 'mysql', APP_URL: f.runtime.url });
    expect(JSON.parse(readFileSync(f.runtimePath, 'utf8')).authAdapter).toBe('mysql');
  });

  it('reuses a healthy runtime when its configuration matches', async () => {
    const f = await fixture();
    f.saveRuntime();
    const result = f.run([`--env-file=${f.envFile}`]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('MIMS is already running.');
    expect(f.didSpawn()).toBe(false);
  });

  it.each(['argument', 'environment'])('rejects a missing explicit file from the %s instead of reusing or falling back', async (source) => {
    const f = await fixture();
    f.saveRuntime();
    if (source === 'environment') f.env.MIMS_LOCAL_ENV_FILE = 'missing.env';
    const result = f.run(source === 'argument' ? ['--env-file=missing.env'] : []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('file not found');
    expect(result.stdout).not.toContain('already running');
    expect(f.didSpawn()).toBe(false);
  });

  it('uses the argument-selected database and gives it precedence over the environment selector', async () => {
    const f = await fixture();
    f.saveRuntime();
    f.env.MIMS_LOCAL_ENV_FILE = 'missing.env';
    const other = join(f.directory, 'other.env');
    writeFileSync(other, f.settings.replace('fixture_demo', 'other_demo'));
    const result = f.run([`--env-file=${other}`]);
    expect(result.status, result.stderr).toBe(0);
    expect(f.child().environment.DB_NAME).toBe('other_demo');
    expect(JSON.parse(readFileSync(f.runtimePath, 'utf8')).environmentFile).toBe(other);
  });

  it('rejects an unreachable explicit database without falling back to the working default', async () => {
    const f = await fixture();
    f.saveRuntime();
    const other = join(f.directory, 'unreachable.env');
    writeFileSync(other, f.settings.replace('127.0.0.1', 'unreachable.example.test'));
    const result = f.run([`--env-file=${other}`]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ECONNREFUSED');
    expect(f.didSpawn()).toBe(false);
  });

  it.each(['app', 'inbox'])('starts with the requested %s port instead of reusing different ports', async (kind) => {
    const f = await fixture();
    f.saveRuntime();
    let port = await freePort();
    while ([f.env.MIMS_LOCAL_APP_PORT, f.env.MIMS_LOCAL_INBOX_PORT].includes(String(port))) port = await freePort();
    f.env[kind === 'app' ? 'MIMS_LOCAL_APP_PORT' : 'MIMS_LOCAL_INBOX_PORT'] = String(port);
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    const saved = JSON.parse(readFileSync(f.runtimePath, 'utf8'));
    expect(saved[kind === 'app' ? 'url' : 'inboxURL']).toBe(`http://127.0.0.1:${port}`);
    expect(f.didSpawn()).toBe(true);
  });

  it.each(['edited file', 'SQLite adapter'])('requires a fresh launch after detecting an %s', async (reason) => {
    const f = await fixture();
    if (reason === 'SQLite adapter') f.runtime.authAdapter = 'sqlite';
    f.saveRuntime();
    if (reason === 'edited file') utimesSync(f.envFile, new Date(), new Date(Date.now() + 10000));
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(f.didSpawn()).toBe(true);
  });

  it('reports occupied ports when a different runtime is running', async () => {
    const f = await fixture();
    const server = createServer();
    await new Promise<void>(resolve => server.listen(Number(f.env.MIMS_LOCAL_APP_PORT), '127.0.0.1', resolve));
    try {
      f.runtime.database = 'different_demo';
      f.saveRuntime();
      const result = f.run();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Port ' + f.env.MIMS_LOCAL_APP_PORT + ' is already in use');
      expect(f.didSpawn()).toBe(false);
      expect(JSON.parse(readFileSync(f.runtimePath, 'utf8')).database).toBe('different_demo');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
