import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import mysql from 'mysql2/promise';

// This creates only an isolated local Docker server and a factory-owned demo.
// DB_* and TEST_MYSQL_* from the user's shell are never provisioning targets.
export const localMysqlSettingsPath = resolve('.data/local-mysql.env');
export const localDemoPath = resolve('.data/local-demo.env');

async function command(executable, args, { environment = process.env, quiet = false, timeout = 300_000 } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', data => { stdout += data; if (!quiet) process.stdout.write(data); });
    child.stderr.on('data', data => { if (!quiet) process.stderr.write(data); });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${executable} timed out. Retry npm run dev:full.`)); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolveCommand(stdout.trim());
      else reject(new Error(`${executable} exited with code ${code}.`));
    });
  });
}

export async function ensureLocalDemo() {
  try {
    await command('docker', ['info', '--format', '{{.OSType}}'], { quiet: true, timeout: 15_000 });
    await command('docker', ['compose', 'version'], { quiet: true, timeout: 15_000 });
  } catch {
    throw new Error('Automatic local setup needs Docker with Compose and a running Linux container engine. Install/start Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux), then retry npm run dev:full. No .env.local or separate MySQL installation is needed. Existing MySQL users can select a seeded database with --env-file=PATH.');
  }

  mkdirSync(resolve('.data'), { recursive: true });
  if (!existsSync(localMysqlSettingsPath)) {
    writeFileSync(localMysqlSettingsPath, `MIMS_LOCAL_MYSQL_ROOT_PASSWORD=${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  }
  const settings = parseEnv(readFileSync(localMysqlSettingsPath, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(settings.MIMS_LOCAL_MYSQL_ROOT_PASSWORD || '')) {
    throw new Error('Invalid .data/local-mysql.env. Restore this clone\'s original settings; do not replace credentials for an existing MySQL volume.');
  }
  // Every checkout owns its own container/volume. Moving a clone creates a new
  // project rather than reaching into another checkout's database.
  const project = 'mims-local-' + createHash('sha256').update(resolve('.')).digest('hex').slice(0, 12);
  const compose = ['compose', '--project-name', project, '--env-file', localMysqlSettingsPath, '--file', resolve('compose.local.yaml')];
  const dockerEnvironment = { ...process.env, ...settings };
  console.log('Starting this clone\'s local MySQL demo (first startup downloads the image)...');
  await command('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '180', 'mysql'], { environment: dockerEnvironment });
  const binding = await command('docker', [...compose, 'port', 'mysql', '3306'], { environment: dockerEnvironment, quiet: true });
  const match = /^127\.0\.0\.1:(\d+)$/.exec(binding);
  if (!match) throw new Error('Docker did not publish MySQL on a loopback port. Check compose.local.yaml.');
  const port = match[1];
  const rootPassword = settings.MIMS_LOCAL_MYSQL_ROOT_PASSWORD;
  // Health checks can pass while the image's initialization server is running.
  // Wait for authenticated TCP access before migrations and provisioning.
  const deadline = Date.now() + 60_000;
  while (true) {
    let connection;
    try {
      connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(port), user: 'root', password: rootPassword, connectTimeout: 3000 });
      await connection.query('SELECT 1');
      break;
    } catch {
      if (Date.now() >= deadline) throw new Error('Local MySQL did not accept its generated credentials. Check Docker logs and preserve .data/local-mysql.env and the database volume.');
      await new Promise(resolveWait => setTimeout(resolveWait, 1000));
    } finally { await connection?.end(); }
  }

  if (!existsSync(localDemoPath)) {
    console.log('Applying migrations and seeding fictional employees and banking data...');
    await command(process.execPath, ['--import', 'tsx', 'scripts/seed-disposable.ts'], {
      environment: {
        ...process.env, NODE_ENV: 'development', TEST_MYSQL_HOST: '127.0.0.1', TEST_MYSQL_PORT: port,
        TEST_MYSQL_USER: 'root', TEST_MYSQL_PASSWORD: rootPassword, MIMS_LOCAL_SEED_ENV_FILE: localDemoPath,
        MIMS_AUTH_DB_ADAPTER: 'mysql',
      },
    });
  } else {
    // Docker may assign a different host port after its container is recreated.
    const environment = parseEnv(readFileSync(localDemoPath, 'utf8'));
    if (environment.DB_HOST !== '127.0.0.1' || !/^mims_task_[a-f0-9]+$/.test(environment.DB_NAME || '')) {
      throw new Error('Invalid .data/local-demo.env. Restore this clone\'s original demo settings.');
    }
    if (environment.DB_PORT !== port) {
      environment.DB_PORT = port;
      writeFileSync(localDemoPath, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
    }
  }
  return localDemoPath;
}
