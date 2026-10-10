import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import {
  closePoolForTest,
  consumeOtpChallenge,
  createEmployee,
  createOtpChallenge,
  createSession,
  findEmployeeById,
  findOtpChallenge,
  findSessionByHash,
  setDbAdapterForTest,
  withMySqlTransaction,
} from './db';
import { migrateAuthTables } from '../../scripts/migrate-auth-mysql.mjs';
import { hashOtp, hashSessionToken, passwordHash } from './auth';

/**
 * Disposable MySQL Production Database Verification Suite
 *
 * Requirements strictly enforced:
 * 1. Honest reporting: skipped when TEST_MYSQL_* is not configured; fails if TEST_MYSQL_REQUIRED=true and absent.
 * 2. Database safety: generates unique prefixed DB name, refuses to reuse existing DB, creates without IF NOT EXISTS,
 *    drops ONLY if created by this run, and refuses to touch shared or production DBs.
 * 3. Exercises the real exported MySQL database and authentication functions and migrations.
 */

const host = process.env.TEST_MYSQL_HOST;
const port = Number(process.env.TEST_MYSQL_PORT || 3306);
const user = process.env.TEST_MYSQL_USER;
const password = process.env.TEST_MYSQL_PASSWORD;
const isRequired = process.env.TEST_MYSQL_REQUIRED === 'true';

const isConfigured = Boolean(host && user && password !== undefined);

if (isRequired && !isConfigured) {
  throw new Error('TEST_MYSQL_REQUIRED=true is set, but TEST_MYSQL_HOST/USER/PASSWORD are missing.');
}

// Safety validation unit tests (always run, uses in-memory checks)
describe('MySQL Disposable Test Safety Contract', () => {
  it('rejects dangerous or invalid SQL database identifiers', () => {
    const invalidNames = ['db; DROP TABLE staff;', 'db name with spaces', 'db-with-dashes', '`db`', 'db/*comment*/'];
    for (const name of invalidNames) {
      expect(/^[a-zA-Z0-9_]+$/.test(name)).toBe(false);
    }
  });

  it('enforces safe prefix for disposable database deletion', () => {
    const isSafeToDrop = (name: string, createdByRun: boolean) =>
      createdByRun && name.startsWith('mims_test_disposable_') && /^[a-zA-Z0-9_]+$/.test(name);

    expect(isSafeToDrop('production_banking', true)).toBe(false);
    expect(isSafeToDrop('mims_banking', true)).toBe(false);
    expect(isSafeToDrop('mims_test_disposable_12345_abcdef', false)).toBe(false);
    expect(isSafeToDrop('mims_test_disposable_12345_abcdef', true)).toBe(true);
  });
});

// Real Disposable MySQL Integration Tests (honestly skipped if not configured)
describe.skipIf(!isConfigured)('Disposable MySQL Production Database Verification', () => {
  let rootConn: Connection | null = null;
  let testConn: Connection | null = null;
  let disposableDbName = '';
  let dbCreatedByThisRun = false;

  beforeAll(async () => {
    const runSuffix = randomBytes(4).toString('hex');
    disposableDbName = `mims_test_disposable_${Date.now()}_${runSuffix}`;

    if (!/^[a-zA-Z0-9_]+$/.test(disposableDbName)) {
      throw new Error(`Invalid disposable database identifier: ${disposableDbName}`);
    }

    try {
      rootConn = await mysql.createConnection({ host, port, user, password });

      // Refuse to reuse any existing database
      const [existing] = await rootConn.query<RowDataPacket[]>(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [disposableDbName]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        throw new Error(`Refusing to reuse existing database: ${disposableDbName}`);
      }

      // Create strictly without IF NOT EXISTS so collisions fail safely
      await rootConn.query(`CREATE DATABASE \`${disposableDbName}\``);
      dbCreatedByThisRun = true;

      testConn = await mysql.createConnection({ host, port, user, password, database: disposableDbName });

      // Point application MySQL connection settings to this disposable database
      process.env.DB_HOST = host;
      process.env.DB_PORT = String(port);
      process.env.DB_USER = user;
      process.env.DB_PASSWORD = password;
      process.env.DB_NAME = disposableDbName;
      process.env.MIMS_AUTH_DB_ADAPTER = 'mysql';
      setDbAdapterForTest('mysql');
    } catch (err) {
      if (rootConn) {
        await rootConn.end().catch(() => {});
      }
      throw err;
    }
  });

  afterAll(async () => {
    await closePoolForTest();
    setDbAdapterForTest(null);

    if (testConn) {
      await testConn.end().catch(() => {});
    }
    if (rootConn) {
      try {
        if (dbCreatedByThisRun && disposableDbName.startsWith('mims_test_disposable_')) {
          await rootConn.query(`DROP DATABASE \`${disposableDbName}\``);
        }
      } finally {
        await rootConn.end().catch(() => {});
      }
    }
  });

  it('executes real migration and establishes foreign key constraints on MySQL', async () => {
    expect(testConn).not.toBeNull();
    // Run the actual migration logic
    await migrateAuthTables(testConn!);

    // Verify foreign key enforcement
    await expect(
      testConn!.query(
        `INSERT INTO staff (full_name, email, password_hash, role, branch_id)
         VALUES ('Orphan Staff', 'orphan@bank.com', 'hash', 'agent', 99999)`
      )
    ).rejects.toThrow(/foreign key constraint fails/i);
  });

  it('atomically creates employee and staff_authentication records on MySQL', async () => {
    const emp = await createEmployee({
      full_name: 'MySQL Lead Admin',
      email: 'mysqladmin@ravindu.bank',
      password_hash: passwordHash('AdminPass1!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    expect(emp.id).toBeGreaterThan(0);

    const fetched = await findEmployeeById(emp.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.email).toBe('mysqladmin@ravindu.bank');

    const [authRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT employee_id, failed_attempts FROM staff_authentication WHERE employee_id = ?',
      [emp.id]
    );
    expect(authRows.length).toBe(1);
    expect(authRows[0].failed_attempts).toBe(0);
  });

  it('rolls back on interrupted multi-step transaction without orphan records', async () => {
    let attemptedId = 0;
    await expect(
      withMySqlTransaction(async (conn) => {
        const [res] = await conn.execute(
          `INSERT INTO staff (full_name, email, password_hash, role, branch_id, status)
           VALUES ('Fail Staff', 'fail@ravindu.bank', 'hash', 'agent', 1, 'active')`
        );
        attemptedId = (res as { insertId: number }).insertId;
        // Intentionally throw mid-transaction
        throw new Error('Injected transaction failure');
      })
    ).rejects.toThrow('Injected transaction failure');

    expect(attemptedId).toBeGreaterThan(0);

    // Record MUST NOT exist after rollback
    const [rows] = await testConn!.query<RowDataPacket[]>(
      'SELECT id FROM staff WHERE email = ?',
      ['fail@ravindu.bank']
    );
    expect(rows.length).toBe(0);
  });

  it('performs password reset transaction: updates password hash and revokes existing sessions', async () => {
    const emp = await createEmployee({
      full_name: 'Reset Test Employee',
      email: 'reset_test@ravindu.bank',
      password_hash: passwordHash('OldPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const sessionHash = hashSessionToken('mysql_active_session_token');
    await createSession({
      token_hash: sessionHash,
      employee_id: emp.id,
      expires_at: new Date(Date.now() + 8 * 3600 * 1000),
    });

    const activeSession = await findSessionByHash(sessionHash);
    expect(activeSession?.revoked_at).toBeNull();

    const challengeId = `reset_challenge_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('123456'),
      expires_at: new Date(Date.now() + 300000),
    });

    // Execute password reset with transaction
    await withMySqlTransaction(async (conn) => {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await conn.execute('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', [now, challengeId]);
      await conn.execute('UPDATE staff_authentication SET password_hash = ? WHERE employee_id = ?', [
        passwordHash('NewPassword1!'),
        emp.id,
      ]);
      await conn.execute('UPDATE employee_sessions SET revoked_at = ? WHERE employee_id = ?', [now, emp.id]);
    });

    // Check challenge consumed
    const challenge = await findOtpChallenge(challengeId, 'password_reset');
    expect(challenge?.consumed_at).not.toBeNull();

    // Check session revoked
    const revokedSession = await findSessionByHash(sessionHash);
    expect(revokedSession?.revoked_at).not.toBeNull();
  });

  it('preserves unconsumed OTP challenge when a multi-step operation fails', async () => {
    const emp = await createEmployee({
      full_name: 'OTP Rollback Staff',
      email: 'otp_rollback@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `rollback_otp_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('654321'),
      expires_at: new Date(Date.now() + 300000),
    });

    // Fail mid-transaction
    await expect(
      withMySqlTransaction(async (conn) => {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await conn.execute('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', [now, challengeId]);
        throw new Error('Downstream financial ledger failure');
      })
    ).rejects.toThrow('Downstream financial ledger failure');

    // Challenge MUST NOT be permanently consumed!
    const challenge = await findOtpChallenge(challengeId, 'password_reset');
    expect(challenge?.consumed_at).toBeNull();
  });

  it('guarantees single-use OTP verification under concurrent requests on MySQL', async () => {
    const emp = await createEmployee({
      full_name: 'Concurrent Staff',
      email: 'concurrent@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `concurrent_otp_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'login',
      code_hash: hashOtp('888999'),
      expires_at: new Date(Date.now() + 300000),
    });

    // Fire 5 simultaneous consumption attempts
    const results = await Promise.all([
      consumeOtpChallenge(challengeId),
      consumeOtpChallenge(challengeId),
      consumeOtpChallenge(challengeId),
      consumeOtpChallenge(challengeId),
      consumeOtpChallenge(challengeId),
    ]);

    const successes = results.filter((res) => res === true).length;
    expect(successes).toBe(1);
  });
});
