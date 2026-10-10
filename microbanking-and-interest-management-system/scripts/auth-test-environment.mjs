import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Only the E2E runner creates this marker. Incoming requests never select test mode.
export function requireE2eTarget(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Authentication E2E configuration is prohibited in production.');
  if (env.MIMS_AUTH_E2E !== 'true' || !env.MIMS_AUTH_E2E_DIR || !env.MIMS_AUTH_E2E_RUN_ID || !env.MIMS_AUTH_DB_PATH) {
    throw new Error('E2E requires an explicit owned temporary directory, run ID and authentication database path.');
  }
  const directory = realpathSync(env.MIMS_AUTH_E2E_DIR);
  const root = realpathSync(tmpdir());
  const child = relative(root, directory);
  if (!child || child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child) ||
      !basename(directory).startsWith('mims-auth-e2e-') ||
      resolve(env.MIMS_AUTH_DB_PATH) !== join(directory, 'mims_auth.db') ||
      readFileSync(join(directory, '.owner'), 'utf8') !== env.MIMS_AUTH_E2E_RUN_ID) {
    throw new Error('E2E database must belong to this run in an owned temporary directory.');
  }
  return directory;
}

export function isolatedE2eDirectory(env = process.env) {
  // Ignore all test flags in production, retaining normal protections.
  if (env.NODE_ENV === 'production' || env.MIMS_AUTH_E2E !== 'true') return null;
  return requireE2eTarget(env);
}

export function authDatabasePath(env = process.env, cwd = process.cwd()) {
  const directory = isolatedE2eDirectory(env);
  return directory ? join(directory, 'mims_auth.db') : resolve(cwd, env.MIMS_AUTH_DB_PATH || join('.data', 'mims_auth.db'));
}

export function authDataDirectory(env = process.env, cwd = process.cwd()) {
  return dirname(authDatabasePath(env, cwd));
}
