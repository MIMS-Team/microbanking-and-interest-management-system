import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import mysql from 'mysql2/promise';
import { createLocalMailbox } from './local-mailbox.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('The local launcher cannot run in production.');

const dataDirectory = resolve('.data');
const runtimePath = resolve(dataDirectory, 'local-project-runtime.json');
const explicitEnvFile = process.argv.find((argument) => argument.startsWith('--env-file='))?.slice('--env-file='.length);
if (explicitEnvFile === '') throw new Error('--env-file requires a file path.');
const requestedEnvFile = explicitEnvFile ?? process.env.MIMS_LOCAL_ENV_FILE;
const appPort = Number(process.env.MIMS_LOCAL_APP_PORT || 3000);
const inboxPort = Number(process.env.MIMS_LOCAL_INBOX_PORT || 8025);
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) throw new Error('MIMS_LOCAL_APP_PORT must be a valid TCP port.');
if (!Number.isInteger(inboxPort) || inboxPort < 1 || inboxPort > 65535) throw new Error('MIMS_LOCAL_INBOX_PORT must be a valid TCP port.');
const url = `http://127.0.0.1:${appPort}`;
const inboxURL = `http://127.0.0.1:${inboxPort}`;

async function responds(url, timeout = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    await response.arrayBuffer();
    return response.ok;
  } catch { return false; }
}

function candidates() {
  if (requestedEnvFile) return [resolve(requestedEnvFile)];
  const paths = [];
  if (existsSync(resolve('.env.local'))) paths.push(resolve('.env.local'));
  if (existsSync(dataDirectory)) {
    paths.push(...readdirSync(dataDirectory)
      .filter((name) => /^disposable-demo(?:-[a-f0-9-]+)?\.env$/i.test(name))
      .map((name) => resolve(dataDirectory, name))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs));
  }
  return [...new Set(paths)];
}

async function selectDatabase() {
  const failures = [];
  for (const file of candidates()) {
    if (!existsSync(file)) { failures.push(`${file}: file not found`); continue; }
    let environment;
    try { environment = parseEnv(readFileSync(file, 'utf8')); }
    catch (error) { failures.push(`${file}: ${error.message}`); continue; }
    const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    if (required.some((key) => environment[key] === undefined || environment[key] === '')) {
      failures.push(`${file}: incomplete DB_* settings`);
      continue;
    }
    let connection;
    try {
      connection = await mysql.createConnection({
        host: environment.DB_HOST,
        port: Number(environment.DB_PORT),
        user: environment.DB_USER,
        password: environment.DB_PASSWORD,
        database: environment.DB_NAME,
        connectTimeout: 5000,
      });
      const [[identity]] = await connection.query('SELECT DATABASE() AS name');
      const [[migrations]] = await connection.query("SELECT COUNT(*) AS completed FROM schema_migrations WHERE status='complete'");
      const [[employees]] = await connection.query('SELECT COUNT(*) AS employees FROM staff');
      if (identity.name !== environment.DB_NAME || Number(migrations.completed) !== 12 || Number(employees.employees) < 1) {
        throw new Error('database is not a complete seeded MIMS database');
      }
      return { environment, file, database: identity.name, modifiedAt: statSync(file).mtimeMs };
    } catch (error) {
      failures.push(`${file}: ${error.code || error.message}`);
    } finally { await connection?.end(); }
  }
  const detail = failures.length ? `\nChecked:\n- ${failures.join('\n- ')}` : '';
  throw new Error(`No reachable seeded local MySQL database was found.${detail}\nAdd TEST_MYSQL_HOST/PORT/USER/PASSWORD for the isolated local MySQL server to .env.local, run npm run seed:dev, then retry npm run dev:full.`);
}

async function portAvailable(port) {
  const server = createServer();
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolveListen);
    });
    return true;
  } catch (error) {
    if (error.code === 'EADDRINUSE') return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
  }
}

const selected = await selectDatabase();
let existingStack = false;
if (existsSync(runtimePath)) {
  try {
    const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
    if (runtime.url === url && runtime.inboxURL === inboxURL &&
        runtime.environmentFile === selected.file && runtime.environmentModifiedAt === selected.modifiedAt &&
        runtime.database === selected.database && runtime.authAdapter === 'mysql' &&
        await responds(url + '/login') && await responds(inboxURL)) {
      console.log(`MIMS is already running.\nApplication: ${runtime.url}\nOTP inbox: ${runtime.inboxURL}\nDatabase: ${runtime.database}`);
      existingStack = true;
    }
  } catch { /* A stale runtime record is replaced only after successful startup. */ }
}

if (!existingStack) {
if (!await portAvailable(appPort)) throw new Error(`Port ${appPort} is already in use and no matching healthy tracked MIMS runtime was found. Stop the existing stack or set MIMS_LOCAL_APP_PORT.`);
if (!await portAvailable(inboxPort)) throw new Error(`Port ${inboxPort} is already in use and no matching healthy tracked MIMS runtime was found. Stop the existing stack or set MIMS_LOCAL_INBOX_PORT.`);

const mailbox = await createLocalMailbox({ inboxPort, getRecipients: async () => {
  const connection = await mysql.createConnection({
    host: selected.environment.DB_HOST, port: Number(selected.environment.DB_PORT),
    user: selected.environment.DB_USER, password: selected.environment.DB_PASSWORD,
    database: selected.database, connectTimeout: 5000,
  });
  try {
    const [recipients] = await connection.query('SELECT email, role FROM staff');
    return recipients;
  } finally { await connection.end(); }
} });
const schedulerKey = randomBytes(32).toString('hex');
const environment = {
  ...process.env,
  ...selected.environment,
  NODE_ENV: 'development',
  MIMS_AUTH_DB_ADAPTER: 'mysql',
  NEXT_TELEMETRY_DISABLED: '1',
  APP_URL: url,
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(mailbox.smtpPort),
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_FROM: 'MIMS Local <security@example.test>',
  TRUST_PROXY: 'false',
  ANTI_ENUMERATION: 'true',
  SCHEDULER_KEY: schedulerKey,
};
for (const key of Object.keys(environment)) {
  if (/^(MIMS_E2E_|MIMS_TEST_|TEST_MYSQL_|PLAYWRIGHT_|VITEST|E2E_TEST)/.test(key)) delete environment[key];
}
delete environment.MIMS_AUTH_DB_PATH;

const child = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(appPort),
], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });

const ownerToken = randomBytes(32).toString('hex');
let ready = false;
let stopping = false;
let draining = false;
let deliveryTimer;
let startupTimer;

async function drainNotifications() {
  if (!ready || stopping || draining) return;
  draining = true;
  try {
    const response = await fetch(url + '/api/operations', {
      method: 'POST', headers: { Authorization: `Bearer ${schedulerKey}`, Origin: url }, signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) console.error(`Local employee delivery worker returned ${response.status}.`);
  } catch (error) {
    if (!stopping) console.error(`Local employee delivery worker failed: ${error.message}`);
  } finally { draining = false; }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupTimer);
  clearInterval(deliveryTimer);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
  }
  await mailbox.close();
}

child.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (!ready && /Ready in/.test(data.toString())) {
    ready = true;
    clearTimeout(startupTimer);
    mkdirSync(dataDirectory, { recursive: true });
    writeFileSync(runtimePath, JSON.stringify({
      ownerToken, supervisorPid: process.pid, appPid: child.pid, url, inboxURL: mailbox.inboxURL,
      smtpPort: mailbox.smtpPort, database: selected.database, environmentFile: selected.file,
      environmentModifiedAt: selected.modifiedAt, authAdapter: environment.MIMS_AUTH_DB_ADAPTER,
      started: new Date().toISOString(),
    }, null, 2));
    console.log(`\nMIMS local stack is ready.\nApplication: ${url}\nOTP inbox: ${mailbox.inboxURL}\nDatabase: ${selected.database}\nVerify: npm run dev:verify\n`);
    void drainNotifications();
    deliveryTimer = setInterval(drainNotifications, 60_000);
  }
});
child.stderr.on('data', (data) => process.stderr.write(data));
child.once('error', (error) => { console.error(error.message); process.exitCode = 1; void stop(); });
child.once('exit', (code) => { if (!stopping) process.exitCode = code ?? 1; void stop(); });
startupTimer = setTimeout(() => {
  console.error('Next.js did not become ready within 120 seconds.');
  process.exitCode = 1;
  void stop();
}, 120_000);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop());
}
