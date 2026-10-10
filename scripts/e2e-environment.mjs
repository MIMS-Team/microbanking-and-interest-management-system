import { mkdtempSync, realpathSync, lstatSync, readFileSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// Only a server-owned directory directly under the OS temporary directory is valid.
// A header, E2E_TEST, or a database path alone never enables test behavior.
/** @param {Record<string, string | undefined>} env */
export function validateE2eEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('E2E configuration is prohibited in production.');
  const dir = env.MIMS_E2E_DIR;
  const token = env.MIMS_E2E_TOKEN;
  if (!dir || !token || !/^[a-f0-9]{64}$/.test(token)) throw new Error('An owned E2E temporary target is required.');
  const absolute = resolve(dir);
  if (!basename(absolute).startsWith('mims-auth-e2e-') ||
      realpathSync(dirname(absolute)) !== realpathSync(tmpdir()) ||
      lstatSync(absolute).isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error('Invalid E2E temporary directory.');
  }
  const marker = join(absolute, 'owner.json');
  if (lstatSync(marker).isSymbolicLink()) throw new Error('Invalid E2E ownership marker.');
  const owner = JSON.parse(readFileSync(marker, 'utf8'));
  if (owner.token !== token || owner.directory !== absolute || owner.kind !== 'mims-auth-e2e') {
    throw new Error('E2E temporary directory ownership mismatch.');
  }
  const dbPath = join(absolute, 'auth.db');
  const otpPath = join(absolute, 'latest_otp.json');
  if (env.MIMS_AUTH_DB_PATH !== dbPath || env.MIMS_TEST_OTP_PATH !== otpPath || env.MIMS_AUTH_DB_ADAPTER !== 'sqlite') {
    throw new Error('E2E database and OTP capture must use the owned temporary directory.');
  }
  for (const path of [dbPath, otpPath]) {
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error('E2E files cannot be symbolic links.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { directory: absolute, dbPath, otpPath };
}

export function createE2eEnvironment() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'mims-auth-e2e-')));
  const token = randomBytes(32).toString('hex');
  try {
    writeFileSync(join(directory, 'owner.json'), JSON.stringify({ kind: 'mims-auth-e2e', directory, token }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    // This exact, freshly created path is owned by this call. Remove only if empty.
    if (realpathSync(dirname(directory)) === realpathSync(tmpdir()) && realpathSync(directory) === directory) rmdirSync(directory);
    throw error;
  }
  return {
    NODE_ENV: 'development', MIMS_E2E_DIR: directory, MIMS_E2E_TOKEN: token,
    MIMS_AUTH_DB_ADAPTER: 'sqlite', MIMS_AUTH_DB_PATH: join(directory, 'auth.db'),
    MIMS_TEST_OTP_PATH: join(directory, 'latest_otp.json'),
  };
}

export function removeE2eEnvironment(env) {
  const { directory } = validateE2eEnvironment(env);
  rmSync(directory, { recursive: true, force: false, maxRetries: 10, retryDelay: 100 });
}

export function hasOwnedE2eEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production' || !env.MIMS_E2E_DIR) return false;
  try { validateE2eEnvironment(env); return true; } catch { return false; }
}
