import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createE2eEnvironment, removeE2eEnvironment, validateE2eEnvironment } from './e2e-environment.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('Run browser tests outside production.');
const owned = createE2eEnvironment();
const env = {
  ...process.env, ...owned, EMAIL_PROVIDER: 'test', MIMS_E2E_RELAX_RATE_LIMITS: 'true',
  PGLITE_DATA_DIR: 'memory://', DATABASE_URL: '', NEXT_TELEMETRY_DISABLED: '1',
};
delete env.E2E_TEST;
delete env.VITEST;
delete env.PLAYWRIGHT_TEST_BASE_URL;
const children = new Set();
let next;
let stopping = false;
let buildOwned = false;
const nextRoot = resolve('.next');
const build = join(nextRoot, `e2e-${owned.MIMS_E2E_TOKEN}`);
const developmentPaths = ['mims_auth.db', 'mims_auth.db-wal', 'mims_auth.db-shm', 'latest_otp.json', 'latest_otp.txt'];
function developmentSnapshot() {
  return developmentPaths.map(name => {
    const path = resolve('.data', name);
    return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
  });
}
let originalDevelopmentData;

function launch(args, options = {}) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true, ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function finished(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Child failed: ${code ?? signal}`)));
  });
}
async function stopChildren() {
  for (const child of children) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        if (process.platform !== 'win32') {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
        resolve();
      }, 5000).unref();
    });
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    void stopChildren();
  });
}

try {
  originalDevelopmentData = developmentSnapshot();
  mkdirSync(nextRoot, { recursive: true });
  if (lstatSync(nextRoot).isSymbolicLink() || realpathSync(nextRoot) !== nextRoot) throw new Error('Invalid E2E build parent.');
  mkdirSync(build); // A collision is a setup failure; never adopt an existing directory.
  writeFileSync(join(build, 'owner.json'), owned.MIMS_E2E_TOKEN, { flag: 'wx' });
  buildOwned = true;
  writeFileSync(join(build, 'tsconfig.json'), JSON.stringify({
    extends: resolve('tsconfig.json'), compilerOptions: { baseUrl: process.cwd() },
  }));
  await finished(launch(['--import', 'tsx', 'scripts/seed-e2e.ts']));
  if (stopping) throw new Error('E2E interrupted.');
  // Reserve an OS-assigned port; a collision after closing fails Next startup.
  // No request is sent until our own child reports readiness. Never reuse a server.
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  env.MIMS_E2E_BASE_URL = `http://127.0.0.1:${port}`;
  console.log(`Owned E2E directory: ${owned.MIMS_E2E_DIR}; server: ${env.MIMS_E2E_BASE_URL}`);
  next = launch(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dedicated E2E server startup timed out.')), 120000);
    let output = '';
    next.stdout.on('data', data => {
      process.stdout.write(data);
      output += data.toString();
      if (/Ready in/.test(output)) { clearTimeout(timeout); resolve(); }
    });
    next.stderr.on('data', data => process.stderr.write(data));
    next.once('error', error => { clearTimeout(timeout); reject(error); });
    next.once('exit', code => { clearTimeout(timeout); reject(new Error(`Dedicated server exited: ${code}`)); });
  });
  if (stopping) throw new Error('E2E interrupted.');
  await finished(launch(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { detached: process.platform !== 'win32' }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopChildren();
  const cleanupErrors = [];
  try {
    validateE2eEnvironment(owned);
    // This exact build directory is derived from this run's secret ownership token.
    if (buildOwned) {
      if (realpathSync(nextRoot) !== nextRoot || lstatSync(build).isSymbolicLink() || realpathSync(build) !== build ||
          readFileSync(join(build, 'owner.json'), 'utf8') !== owned.MIMS_E2E_TOKEN) throw new Error('Invalid owned build path.');
      rmSync(build, { recursive: true, force: false, maxRetries: 10, retryDelay: 100 });
    }
  } catch (error) { cleanupErrors.push(error); }
  try { removeE2eEnvironment(owned); } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) {
    cleanupErrors.forEach(error => console.error('Owned E2E cleanup failed:', error));
    process.exitCode = 1;
  } else {
    console.log('Owned E2E resources cleaned up.');
  }
  if (originalDevelopmentData && JSON.stringify(developmentSnapshot()) !== JSON.stringify(originalDevelopmentData)) {
    console.error('Development authentication data changed during this run.');
    process.exitCode = 1;
  } else if (originalDevelopmentData) {
    console.log('Development authentication database and OTP captures unchanged.');
  }
}
