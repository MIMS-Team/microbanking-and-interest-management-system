import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  acquireOtpResendReservation,
  closePoolForTest,
  createEmployee,
  createOtpChallenge,
  createSession,
  finalizeOtpResend,
  findEmployeeById,
  findOtpChallenge,
  findSessionByHash,
  setDbAdapterForTest,
  setTransactionFailureHookForTest,
  withMySqlTransaction,
} from './db';
import { migrateAuthTables } from '../../scripts/migrate-auth-mysql.mjs';
import {
  AuthError,
  confirmPasswordReset,
  hashOtp,
  hashSessionToken,
  passwordHash,
  passwordMatches,
  resendOtp,
  verifyLoginOtpChallenge,
} from './auth';
import {
  clearDispatchedEmailsForTest,
  getDispatchedEmailsForTest,
  setMockDeliveryFailureForTest,
} from './email';
import type { Staff } from '../types';
import { financialQueryable } from '../banking/financial-db';
import { createTransaction } from '../banking/transactions';
import { runInterest } from '../banking/interest';

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
    setTransactionFailureHookForTest(null);
    clearDispatchedEmailsForTest();
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

  it('exercises production confirmPasswordReset(): updates both hash locations, revokes sessions, and logs audit', async () => {
    const emp = await createEmployee({
      full_name: 'Reset Test Employee',
      email: `reset_prod_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('OldPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const sessionHash = hashSessionToken(`mysql_active_session_${Date.now()}`);
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

    // Invoke production reset function
    const success = await confirmPasswordReset(challengeId, '123456', 'NewPassword1!');
    expect(success).toBe(true);

    // 1. Both password-hash locations in MySQL must be updated consistently
    const [staffRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT password_hash FROM staff WHERE id = ?',
      [emp.id]
    );
    const [authRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT password_hash FROM staff_authentication WHERE employee_id = ?',
      [emp.id]
    );

    expect(staffRows.length).toBe(1);
    expect(authRows.length).toBe(1);
    expect(staffRows[0].password_hash).toBe(authRows[0].password_hash);

    // 2. Old password is rejected and new password is accepted
    expect(passwordMatches('NewPassword1!', staffRows[0].password_hash)).toBe(true);
    expect(passwordMatches('OldPassword1!', staffRows[0].password_hash)).toBe(false);

    // 3. Reset OTP is consumed and cannot be reused
    const challenge = await findOtpChallenge(challengeId, 'password_reset');
    expect(challenge?.consumed_at).not.toBeNull();

    // 4. All previous sessions are revoked
    const revokedSession = await findSessionByHash(sessionHash);
    expect(revokedSession?.revoked_at).not.toBeNull();

    // 5. Intended audit records exist
    const [auditRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT event_type FROM authentication_audit WHERE employee_id = ? ORDER BY id ASC',
      [emp.id]
    );
    const eventTypes = auditRows.map((r) => r.event_type);
    expect(eventTypes).toContain('password_reset_completed');
    expect(eventTypes).toContain('session_revoked');
  });

  it('rejects wrong OTP during production password reset and preserves state', async () => {
    const emp = await createEmployee({
      full_name: 'Wrong OTP Employee',
      email: `wrong_otp_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('InitialPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `wrong_otp_chal_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('456789'),
      expires_at: new Date(Date.now() + 300000),
    });

    await expect(
      confirmPasswordReset(challengeId, '000000', 'NewPassword1!')
    ).rejects.toThrow(AuthError);

    const challenge = await findOtpChallenge(challengeId, 'password_reset');
    expect(challenge?.consumed_at).toBeNull();

    const [staffRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT password_hash FROM staff WHERE id = ?',
      [emp.id]
    );
    expect(passwordMatches('InitialPassword1!', staffRows[0].password_hash)).toBe(true);
  });

  it('rejects expired OTP during production password reset', async () => {
    const emp = await createEmployee({
      full_name: 'Expired OTP Employee',
      email: `expired_otp_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('InitialPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `expired_otp_chal_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('111222'),
      expires_at: new Date(Date.now() - 5000), // Expired
    });

    await expect(
      confirmPasswordReset(challengeId, '111222', 'NewPassword1!')
    ).rejects.toThrow(/expired/i);
  });

  it('rejects reused OTP during production password reset', async () => {
    const emp = await createEmployee({
      full_name: 'Reused OTP Employee',
      email: `reused_otp_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('InitialPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `reused_otp_chal_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('777888'),
      expires_at: new Date(Date.now() + 300000),
    });

    await confirmPasswordReset(challengeId, '777888', 'FirstNewPassword1!');

    // Second attempt MUST be rejected
    await expect(
      confirmPasswordReset(challengeId, '777888', 'SecondNewPassword1!')
    ).rejects.toThrow(/already been used/i);
  });

  it('guarantees single winner under concurrent production password reset confirmations', async () => {
    const emp = await createEmployee({
      full_name: 'Concurrent Reset Employee',
      email: `concurrent_reset_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('StartPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const challengeId = `concurrent_reset_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('654321'),
      expires_at: new Date(Date.now() + 300000),
    });

    const results = await Promise.allSettled([
      confirmPasswordReset(challengeId, '654321', 'WinningPassword1!'),
      confirmPasswordReset(challengeId, '654321', 'WinningPassword1!'),
      confirmPasswordReset(challengeId, '654321', 'WinningPassword1!'),
      confirmPasswordReset(challengeId, '654321', 'WinningPassword1!'),
      confirmPasswordReset(challengeId, '654321', 'WinningPassword1!'),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);
  });

  it('rolls back production password reset on mid-transaction failure via controlled hook', async () => {
    const emp = await createEmployee({
      full_name: 'Rollback Reset Employee',
      email: `rollback_reset_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('InitialPassword1!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const sessionHash = hashSessionToken(`session_rollback_${Date.now()}`);
    await createSession({
      token_hash: sessionHash,
      employee_id: emp.id,
      expires_at: new Date(Date.now() + 8 * 3600 * 1000),
    });

    const challengeId = `rollback_challenge_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'password_reset',
      code_hash: hashOtp('987654'),
      expires_at: new Date(Date.now() + 300000),
    });

    // Inject controlled failure into the real production transaction helper
    setTransactionFailureHookForTest((step) => {
      if (step === 'after_staff_update') {
        throw new Error('Controlled production transaction failure');
      }
    });

    try {
      await expect(
        confirmPasswordReset(challengeId, '987654', 'AttemptedNewPassword1!')
      ).rejects.toThrow('Controlled production transaction failure');
    } finally {
      setTransactionFailureHookForTest(null);
    }

    // Password must remain unchanged in both tables
    const [staffRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT password_hash FROM staff WHERE id = ?',
      [emp.id]
    );
    const [authRows] = await testConn!.query<RowDataPacket[]>(
      'SELECT password_hash FROM staff_authentication WHERE employee_id = ?',
      [emp.id]
    );
    expect(passwordMatches('InitialPassword1!', staffRows[0].password_hash)).toBe(true);
    expect(passwordMatches('InitialPassword1!', authRows[0].password_hash)).toBe(true);

    // Session must remain valid and unrevoked
    const session = await findSessionByHash(sessionHash);
    expect(session?.revoked_at).toBeNull();

    // Challenge must remain unconsumed
    const challenge = await findOtpChallenge(challengeId, 'password_reset');
    expect(challenge?.consumed_at).toBeNull();
  });

  // Repeat to exercise different lock interleavings between acquisition and finalization.
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))('guarantees atomic OTP resend under concurrent requests on MySQL (round %i)', async () => {
    clearDispatchedEmailsForTest();

    const emp = await createEmployee({
      full_name: 'Concurrent Resend Employee',
      email: `concurrent_resend_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const originalOtp = '333444';
    const challengeId = `resend_concurrency_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'login',
      code_hash: hashOtp(originalOtp),
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(Date.now() - 35000),
    });

    // Dispatch 5 simultaneous resend requests for the exact same challenge
    const results = await Promise.allSettled([
      resendOtp(challengeId),
      resendOtp(challengeId),
      resendOtp(challengeId),
      resendOtp(challengeId),
      resendOtp(challengeId),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Exactly one must acquire the reservation and succeed. Include rejected
    // errors in failures so database deadlocks are visible in CI diagnostics.
    expect(successes.length, failures.map((result) => String(result.reason)).join('\n')).toBe(1);
    expect(failures.length).toBe(4);

    // Exactly one email must have been dispatched
    const dispatched = getDispatchedEmailsForTest();
    expect(dispatched.length).toBe(1);
    const replacementOtp = dispatched[0].code;

    const fulfilledResult = (successes[0] as PromiseFulfilledResult<{ challengeId: string }>).value;
    const newChallengeId = fulfilledResult.challengeId;

    // The replacement OTP must be valid and usable
    const verifySuccess = await verifyLoginOtpChallenge(newChallengeId, replacementOtp);
    expect(verifySuccess.employee.id).toBe(emp.id);

    // The original OTP must stop working after successful finalization
    await expect(verifyLoginOtpChallenge(challengeId, originalOtp)).rejects.toThrow(/already been (confirmed|used)/i);
  });

  it('preserves original challenge when OTP resend email dispatch fails on MySQL', async () => {
    clearDispatchedEmailsForTest();

    const emp = await createEmployee({
      full_name: 'Resend Email Fail Employee',
      email: `resend_fail_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const originalOtp = '555666';
    const challengeId = `resend_email_fail_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'login',
      code_hash: hashOtp(originalOtp),
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(Date.now() - 35000),
    });

    // Simulate email provider failure
    setMockDeliveryFailureForTest(true);
    try {
      await expect(resendOtp(challengeId)).rejects.toThrow(/Email delivery service returned an error/i);
    } finally {
      setMockDeliveryFailureForTest(false);
    }

    // Original challenge remains valid and usable
    const originalChallenge = await findOtpChallenge(challengeId, 'login');
    expect(originalChallenge?.consumed_at).toBeNull();

    const verifySuccess = await verifyLoginOtpChallenge(challengeId, originalOtp);
    expect(verifySuccess.employee.id).toBe(emp.id);
  });

  it('handles verification of original OTP while resend is pending on MySQL', async () => {
    clearDispatchedEmailsForTest();

    const emp = await createEmployee({
      full_name: 'Pending Resend Verification Employee',
      email: `pending_resend_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const originalOtp = '777888';
    const challengeId = `pending_resend_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'login',
      code_hash: hashOtp(originalOtp),
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(Date.now() - 35000),
    });

    const replacementId = `rep_${Date.now()}`;
    const reservation = await acquireOtpResendReservation(
      challengeId,
      {
        id: replacementId,
        employee_id: emp.id,
        purpose: 'login',
        code_hash: hashOtp('999000'),
        expires_at: new Date(Date.now() + 300000),
        is_pending: true,
      },
      30000
    );

    // Verify original code while resend is pending
    const originalVerified = await verifyLoginOtpChallenge(challengeId, originalOtp);
    expect(originalVerified.employee.id).toBe(emp.id);

    // Attempting to finalize resend after original has been verified must abort
    const finalization = await finalizeOtpResend(challengeId, replacementId, reservation.reservationToken);
    expect(finalization.finalized).toBe(false);
    expect(finalization.reason).toBe('ORIGINAL_ALREADY_CONSUMED');

    // Replacement must not be usable
    await expect(verifyLoginOtpChallenge(replacementId, '999000')).rejects.toThrow(/not found|expired/i);
  });

  it('recovers from abandoned resend reservation on MySQL', async () => {
    clearDispatchedEmailsForTest();

    const emp = await createEmployee({
      full_name: 'Abandoned Lease Employee',
      email: `abandoned_lease_${Date.now()}@ravindu.bank`,
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    const originalOtp = '123789';
    const challengeId = `abandoned_resend_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: emp.id,
      purpose: 'login',
      code_hash: hashOtp(originalOtp),
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(Date.now() - 35000),
    });

    // Simulate dead worker process leaving expired reservation in database
    const expiredLease = new Date(Date.now() - 10000).toISOString().slice(0, 19).replace('T', ' ');
    await testConn!.query(
      `INSERT INTO otp_resend_reservations (challenge_id, reservation_token, replacement_id, lease_expires_at)
       VALUES (?, 'dead_worker_token', 'abandoned_pending_id', ?)`,
      [challengeId, expiredLease]
    );

    // New resend request must detect expired reservation, clear it, and succeed
    const resendResult = await resendOtp(challengeId);
    expect(resendResult.challengeId).toBeTruthy();

    const dispatched = getDispatchedEmailsForTest();
    expect(dispatched.length).toBe(1);
    const replacementOtp = dispatched[0].code;

    // Replacement OTP works
    const verifySuccess = await verifyLoginOtpChallenge(resendResult.challengeId, replacementOtp);
    expect(verifySuccess.employee.id).toBe(emp.id);
  });

  describe('MySQL transaction and interest integration', () => {
    let financialAgent: Staff;
    let administrator: Staff;
    let nextAccountNumber = 1;

    async function connectFinancialTest(): Promise<Connection> {
      return mysql.createConnection({
        host,
        port,
        user,
        password,
        database: disposableDbName,
      });
    }

    async function transaction<T>(
      connection: Connection | PoolConnection,
      work: (tx: ReturnType<typeof financialQueryable>) => Promise<T>,
    ): Promise<T> {
      await connection.beginTransaction();
      try {
        const result = await work(financialQueryable(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    async function createActiveAccount(connection: Connection, balance = '0.00'): Promise<number> {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO savings_accounts
           (account_number, branch_id, agent_id, rate_id, balance, minimum_balance, status)
         VALUES (?, 1, ?, 1, ?, 500.00, 'active')`,
        [`FIN-SA-${nextAccountNumber++}`, financialAgent.id, balance],
      );
      return result.insertId;
    }

    async function withAccountTransaction<T>(
      work: (connection: Connection) => Promise<T>,
    ): Promise<T> {
      const connection = await connectFinancialTest();
      try {
        return await work(connection);
      } finally {
        await connection.end();
      }
    }

    beforeAll(async () => {
      await migrateAuthTables(testConn!);
      const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`;
      const [agentResult] = await testConn!.execute<ResultSetHeader>(
        `INSERT INTO staff (full_name, email, password_hash, role, branch_id, status)
         VALUES ('Financial Test Agent', ?, 'unused', 'agent', 1, 'active')`,
        [`financial_agent_${suffix}@example.test`],
      );
      const [adminResult] = await testConn!.execute<ResultSetHeader>(
        `INSERT INTO staff (full_name, email, password_hash, role, branch_id, status)
         VALUES ('Financial Test Admin', ?, 'unused', 'admin', NULL, 'active')`,
        [`financial_admin_${suffix}@example.test`],
      );
      financialAgent = {
        id: agentResult.insertId,
        full_name: 'Financial Test Agent',
        email: `financial_agent_${suffix}@example.test`,
        role: 'agent',
        branch_id: 1,
        status: 'active',
      };
      administrator = {
        id: adminResult.insertId,
        full_name: 'Financial Test Admin',
        email: `financial_admin_${suffix}@example.test`,
        role: 'admin',
        branch_id: null,
        status: 'active',
      };

      await testConn!.execute(`CREATE TABLE rates (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product VARCHAR(20) NOT NULL,
        name VARCHAR(80) NOT NULL UNIQUE,
        term_months INT NOT NULL DEFAULT 0,
        annual_rate DECIMAL(6,3) NOT NULL,
        minimum_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        min_age INT NOT NULL DEFAULT 0,
        max_age INT NOT NULL DEFAULT 120
      ) ENGINE=InnoDB`);
      await testConn!.execute(`CREATE TABLE savings_accounts (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        account_number VARCHAR(24) NOT NULL UNIQUE,
        branch_id INT NOT NULL,
        agent_id INT NOT NULL,
        rate_id INT NOT NULL,
        balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        minimum_balance DECIMAL(14,2) NOT NULL DEFAULT 500.00,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        CONSTRAINT fk_fin_test_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
        CONSTRAINT fk_fin_test_agent FOREIGN KEY (agent_id) REFERENCES staff(id),
        CONSTRAINT fk_fin_test_rate FOREIGN KEY (rate_id) REFERENCES rates(id)
      ) ENGINE=InnoDB`);
      await testConn!.execute(`CREATE TABLE fixed_deposits (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        fd_number VARCHAR(24) NOT NULL UNIQUE,
        source_account_id INT NOT NULL,
        rate_id INT NOT NULL,
        principal DECIMAL(14,2) NOT NULL,
        annual_rate DECIMAL(6,3) NOT NULL,
        term_months INT NOT NULL,
        auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        maturity_date DATE NOT NULL,
        closed_at TIMESTAMP NULL,
        CONSTRAINT fk_fin_test_fd_account FOREIGN KEY (source_account_id) REFERENCES savings_accounts(id),
        CONSTRAINT fk_fin_test_fd_rate FOREIGN KEY (rate_id) REFERENCES rates(id)
      ) ENGINE=InnoDB`);
      await testConn!.execute(
        `INSERT INTO rates (id, product, name, annual_rate, minimum_balance)
         VALUES (1, 'savings', 'Financial Test Savings', 4.500, 500.00)`,
      );

      const migration = await readFile(
        new URL('../../database/person-4-financial-schema.sql', import.meta.url),
        'utf8',
      );
      let delimiter = ';';
      let statement = '';
      for (const line of migration.split(/\r?\n/)) {
        const delimiterLine = /^DELIMITER\s+(.+)$/.exec(line.trim());
        if (delimiterLine) {
          delimiter = delimiterLine[1];
          continue;
        }
        statement += `${line}\n`;
        if (line.trimEnd().endsWith(delimiter)) {
          const sql = statement.trimEnd().slice(0, -delimiter.length).trim();
          if (sql) await testConn!.execute(sql);
          statement = '';
        }
      }
      if (statement.trim()) await testConn!.execute(statement.trim());
    });

    it('retries a financial request without duplicate ledger entries', async () => {
      const accountId = await createActiveAccount(testConn!);
      const input = {
        type: 'deposit',
        account_id: accountId,
        amount: '100.0',
        idempotency_key: `retry-${Date.now()}`,
      };
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, input));
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        ...input,
        amount: '100.00',
      }));

      const [accounts] = await testConn!.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ?',
        [accountId],
      );
      const [entries] = await testConn!.execute<RowDataPacket[]>(
        'SELECT id FROM ledger_entries WHERE account_id = ?',
        [accountId],
      );
      expect(accounts[0].balance).toBe('100.00');
      expect(entries).toHaveLength(1);
      await expect(transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        ...input,
        amount: '101.00',
      }))).rejects.toThrow(/different transaction details/i);
    });

    it('rolls back operation, balance, and ledger together after a failure', async () => {
      const accountId = await createActiveAccount(testConn!);
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'deposit',
        account_id: accountId,
        amount: '1000.00',
        idempotency_key: `rollback-opening-${Date.now()}`,
      }));
      const [before] = await testConn!.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ?',
        [accountId],
      );
      const [beforeEntries] = await testConn!.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM ledger_entries WHERE account_id = ?',
        [accountId],
      );

      await expect(withAccountTransaction(connection => transaction(connection, async tx => {
        await createTransaction(tx, financialAgent, {
          type: 'withdrawal',
          account_id: accountId,
          amount: '100.00',
          owner_verified: true,
          idempotency_key: `rollback-withdrawal-${Date.now()}`,
        });
        throw new Error('Injected financial transaction failure');
      }))).rejects.toThrow('Injected financial transaction failure');

      const [after] = await testConn!.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ?',
        [accountId],
      );
      const [afterEntries] = await testConn!.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM ledger_entries WHERE account_id = ?',
        [accountId],
      );
      expect(after[0].balance).toBe(before[0].balance);
      expect(afterEntries[0].count).toBe(beforeEntries[0].count);
    });

    it('serializes concurrent withdrawals and preserves the minimum balance', async () => {
      const accountId = await createActiveAccount(testConn!);
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'deposit',
        account_id: accountId,
        amount: '1000.00',
        idempotency_key: `concurrent-opening-${Date.now()}`,
      }));
      const requests = [1, 2].map(index => withAccountTransaction(connection =>
        transaction(connection, tx => createTransaction(tx, financialAgent, {
          type: 'withdrawal',
          account_id: accountId,
          amount: '400.00',
          owner_verified: true,
          idempotency_key: `concurrent-withdrawal-${Date.now()}-${index}`,
        })),
      ));
      const results = await Promise.allSettled(requests);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);

      const [rows] = await testConn!.execute<RowDataPacket[]>(
        `SELECT a.balance, SUM(l.amount) AS ledger_balance
         FROM savings_accounts a
         JOIN ledger_entries l ON l.account_id = a.id
         WHERE a.id = ?
         GROUP BY a.id`,
        [accountId],
      );
      expect(rows[0].balance).toBe('600.00');
      expect(rows[0].ledger_balance).toBe('600.00');
    });

    it('posts both sides of a transfer atomically with reconciled balances', async () => {
      const sourceId = await createActiveAccount(testConn!);
      const destinationId = await createActiveAccount(testConn!);
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'deposit',
        account_id: sourceId,
        amount: '1000.00',
        idempotency_key: `transfer-opening-${Date.now()}`,
      }));
      const input = {
        type: 'transfer',
        account_id: sourceId,
        destination_account_id: destinationId,
        amount: '200.00',
        owner_verified: true,
        idempotency_key: `transfer-${Date.now()}`,
      };
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, input));
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, input));

      const [rows] = await testConn!.execute<RowDataPacket[]>(
        `SELECT a.id, a.balance, COALESCE(SUM(l.amount), 0) AS ledger_balance
         FROM savings_accounts a
         LEFT JOIN ledger_entries l ON l.account_id = a.id
         WHERE a.id IN (?, ?)
         GROUP BY a.id
         ORDER BY a.id`,
        [sourceId, destinationId],
      );
      expect(rows.map(row => row.balance)).toEqual(['800.00', '200.00']);
      expect(rows.map(row => row.ledger_balance)).toEqual(['800.00', '200.00']);
      const [entries] = await testConn!.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM ledger_entries
         WHERE account_id IN (?, ?) AND type IN ('transfer_in', 'transfer_out')`,
        [sourceId, destinationId],
      );
      expect(entries[0].count).toBe(2);
    });

    it('does not pay savings or FD interest twice under concurrent or repeated runs', async () => {
      const [accountResult] = await testConn!.execute<ResultSetHeader>(
        `INSERT INTO savings_accounts
           (account_number, branch_id, agent_id, rate_id, balance, minimum_balance, status, opened_at)
         VALUES (?, 1, ?, 1, 1000.00, 500.00, 'active', UTC_TIMESTAMP() - INTERVAL 60 DAY)`,
        [`FIN-INTEREST-${nextAccountNumber++}`, financialAgent.id],
      );
      const accountId = accountResult.insertId;
      const [openingOperation] = await testConn!.execute<ResultSetHeader>(
        `INSERT INTO money_operations
           (reference, actor_id, idempotency_key, request_fingerprint, type, description, created_at)
         VALUES (?, ?, ?, REPEAT('0', 64), 'deposit', 'Interest test opening', UTC_TIMESTAMP() - INTERVAL 60 DAY)`,
        [`FIN-OPEN-${Date.now()}`, financialAgent.id, `interest-opening-${Date.now()}`],
      );
      await testConn!.execute(
        `INSERT INTO ledger_entries
           (operation_id, account_id, type, amount, balance_before, balance_after, created_at)
         VALUES (?, ?, 'deposit', 1000.00, 0.00, 1000.00, UTC_TIMESTAMP() - INTERVAL 60 DAY)`,
        [openingOperation.insertId, accountId],
      );
      await testConn!.execute(
        `INSERT INTO fixed_deposits
           (fd_number, source_account_id, rate_id, principal, annual_rate, term_months, status,
            opened_at, maturity_date)
         VALUES (?, ?, 1, 10000.00, 12.000, 3, 'active',
                 UTC_TIMESTAMP() - INTERVAL 60 DAY, DATE_ADD(CURRENT_DATE, INTERVAL 3 MONTH))`,
        [`FIN-FD-${Date.now()}`, accountId],
      );
      const [periodRows] = await testConn!.execute<RowDataPacket[]>(
        `SELECT DATE_FORMAT(
           DATE_SUB(
             DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')),
             INTERVAL DAYOFMONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) DAY
           ),
           '%Y-%m'
         ) AS period`,
      );
      const period = String(periodRows[0].period);
      const user = administrator;
      const firstRun = await withAccountTransaction(connection =>
        transaction(connection, tx => runInterest(tx, user, { period })),
      );
      const [afterFirst] = await testConn!.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ?',
        [accountId],
      );
      expect(Number(afterFirst[0].balance)).toBeGreaterThan(1000);

      const concurrent = await Promise.allSettled([
        withAccountTransaction(connection =>
          transaction(connection, tx => runInterest(tx, user, { period })),
        ),
        withAccountTransaction(connection =>
          transaction(connection, tx => runInterest(tx, user, { period })),
        ),
      ]);
      expect(concurrent.every(result => result.status === 'fulfilled')).toBe(true);
      await withAccountTransaction(connection =>
        transaction(connection, tx => runInterest(tx, user, { period })),
      );

      const [credits] = await testConn!.execute<RowDataPacket[]>(
        `SELECT fixed_deposit_id, amount FROM interest_credits
         WHERE account_id = ? AND period = ? ORDER BY fixed_deposit_id`,
        [accountId, period],
      );
      const [savingsExpected] = await testConn!.execute<RowDataPacket[]>(
        `SELECT ROUND(SUM(amount), 2) AS amount
         FROM interest_accruals
         WHERE account_id = ? AND DATE_FORMAT(accrual_date, '%Y-%m') = ?`,
        [accountId, period],
      );
      const [dailyCalculation] = await testConn!.execute<RowDataPacket[]>(
        `SELECT amount,
                CAST(ROUND(minimum_balance * annual_rate / 100 / 365, 6) AS DECIMAL(18,6)) AS expected
         FROM interest_accruals
         WHERE account_id = ? AND minimum_balance > 0
         ORDER BY accrual_date LIMIT 1`,
        [accountId],
      );
      const [afterRepeated] = await testConn!.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ?',
        [accountId],
      );
      const [reconciliation] = await testConn!.execute<RowDataPacket[]>(
        `SELECT a.balance, SUM(l.amount) AS ledger_balance
         FROM savings_accounts a
         JOIN ledger_entries l ON l.account_id = a.id
         WHERE a.id = ? GROUP BY a.id`,
        [accountId],
      );
      expect(credits).toHaveLength(2);
      expect(credits.every(credit => Number(credit.amount) > 0)).toBe(true);
      const savingsCredit = credits.find(credit => credit.fixed_deposit_id === null);
      const fixedCredit = credits.find(credit => credit.fixed_deposit_id !== null);
      if (!savingsCredit || !fixedCredit) throw new Error('Expected savings and fixed-deposit interest credits.');
      expect(savingsCredit.amount).toBe(savingsExpected[0].amount);
      expect(fixedCredit.amount).toBe('100.00');
      expect(dailyCalculation[0].amount).toBe(dailyCalculation[0].expected);
      expect(afterRepeated[0].balance).toBe(afterFirst[0].balance);
      expect(reconciliation[0].balance).toBe(reconciliation[0].ledger_balance);
      expect(firstRun.message).toContain(period);
    });

    it('rejects inactive accounts and transfers that would breach the minimum balance', async () => {
      const accountId = await createActiveAccount(testConn!);
      await transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'deposit',
        account_id: accountId,
        amount: '1000.00',
        idempotency_key: `boundary-opening-${Date.now()}`,
      }));
      await expect(transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'withdrawal',
        account_id: accountId,
        amount: '500.01',
        owner_verified: true,
        idempotency_key: `minimum-boundary-${Date.now()}`,
      }))).rejects.toThrow(/minimum balance/i);
      await testConn!.execute(`UPDATE savings_accounts SET status = 'inactive' WHERE id = ?`, [accountId]);
      await expect(transaction(testConn!, tx => createTransaction(tx, financialAgent, {
        type: 'deposit',
        account_id: accountId,
        amount: '1.00',
        idempotency_key: `inactive-boundary-${Date.now()}`,
      }))).rejects.toThrow(/must be active/i);
    });
  });
});
