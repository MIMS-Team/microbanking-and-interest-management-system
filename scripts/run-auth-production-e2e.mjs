import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, lstatSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { close, disposableDatabase, httpsProxy, listen, smtpMailbox } from './auth-browser-services.mjs';

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'mims-production-browser-')));
const owner = randomBytes(32).toString('hex');
writeFileSync(join(directory, 'owner'), owner, { flag: 'wx' });
const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
// Pass no development/test hooks to the production application, even if the
// caller ran another suite in this terminal. Missing .env values stay explicit.
for (const key of Object.keys(env)) {
  if (/^(MIMS_E2E_|MIMS_TEST_|TEST_MYSQL_|PLAYWRIGHT_|VITEST|E2E_TEST)/.test(key)) delete env[key];
}
delete env.MIMS_AUTH_DB_PATH;
delete env.MIMS_AUTH_DB_ADAPTER;
Object.assign(env, { MIMS_AUTH_DB_ADAPTER: 'mysql', EMAIL_PROVIDER: 'smtp', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: 'false', TRUST_PROXY: 'true', ANTI_ENUMERATION: 'true' });
const children = new Set();
let database, mailbox, proxy;
const paths = ['mims_auth.db', 'mims_auth.db-wal', 'mims_auth.db-shm', 'latest_otp.json', 'latest_otp.txt'];
function snapshot() {
  return paths.map(name => {
    const file = resolve('.data', name);
    return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
  });
}
const before = snapshot();
function launch(args, childEnv = env, pipe = false) {
  const child = spawn(process.execPath, args, { env: childEnv, windowsHide: true, detached: process.platform !== 'win32', stdio: pipe ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function finished(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Verification child exited: ${code}`)));
  });
}
async function stopChildren() {
  for (const child of [...children]) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ } }
        resolve();
      }, 5000).unref();
    });
  }
}
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; void stopChildren(); });

try {
  database = await disposableDatabase();
  Object.assign(env, database.env);
  mailbox = await smtpMailbox();
  Object.assign(env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mailbox.smtpPort), SMTP_FROM: 'security@example.test' });
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  const openssl = process.env.OPENSSL_BIN || 'openssl';
  const certificate = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=auth.mims.test', '-addext', 'subjectAltName=DNS:auth.mims.test', '-keyout', key, '-out', cert], { windowsHide: true, encoding: 'utf8' });
  if (certificate.error || certificate.status !== 0) throw new Error(`OpenSSL certificate generation failed: ${certificate.error?.message || certificate.stderr}`);
  const reservation = createServer();
  const appPort = await listen(reservation);
  await close(reservation);
  proxy = await httpsProxy({ key: readFileSync(key), cert: readFileSync(cert), appPort });
  env.APP_URL = `https://auth.mims.test:${proxy.port}`;
  // Always build current sources. The normal .next production output is retained;
  // the development runner's unique distDir remains separate and unchanged.
  await finished(launch(['node_modules/next/dist/bin/next', 'build', '--webpack']));
  if (interrupted) throw new Error('Verification interrupted.');
  const next = launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], env, true);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Production server startup timed out')), 60000);
    let output = '';
    next.stdout.on('data', chunk => {
      process.stdout.write(chunk); output += chunk;
      if (/Ready in/.test(output)) { clearTimeout(timer); resolve(); }
    });
    next.stderr.on('data', chunk => process.stderr.write(chunk));
    next.once('error', error => { clearTimeout(timer); reject(error); });
    next.once('exit', code => { clearTimeout(timer); reject(new Error(`Production server exited: ${code}`)); });
  });
  if (interrupted) throw new Error('Verification interrupted.');
  console.log(`Production auth verification: ${env.APP_URL}; disposable DB: ${database.name}`);
  const browserEnv = {
    ...env, AUTH_VERIFY_URL: env.APP_URL, AUTH_VERIFY_HTTP_URL: `http://auth.mims.test:${proxy.httpPort}`,
    AUTH_VERIFY_MAILBOX: mailbox.apiURL, AUTH_VERIFY_MAILBOX_TOKEN: mailbox.token,
  };
  await finished(launch(['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.production.config.ts', ...process.argv.slice(2)], browserEnv));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopChildren();
  const errors = [];
  for (const resource of [proxy, mailbox, database]) {
    try { await resource?.dispose(); } catch (error) { errors.push(error); }
  }
  try {
    if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory || readFileSync(join(directory, 'owner'), 'utf8') !== owner) {
      throw new Error('Production verification temporary directory ownership mismatch');
    }
    rmSync(directory, { recursive: true, force: false, maxRetries: 10, retryDelay: 100 });
  } catch (error) { errors.push(error); }
  if (JSON.stringify(before) !== JSON.stringify(snapshot())) errors.push(new Error('Development authentication data changed during production verification.'));
  if (errors.length) { errors.forEach(error => console.error(error)); process.exitCode = 1; }
  else console.log('Owned production verification services/database/certificate cleaned up; development database and OTP captures unchanged.');
}
