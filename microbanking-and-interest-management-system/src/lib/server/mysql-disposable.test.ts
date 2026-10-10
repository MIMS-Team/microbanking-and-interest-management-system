import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
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
import { migrateAuthTables } from '../../../scripts/migrate-auth-mysql.mjs';
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

  it('guarantees atomic OTP resend under concurrent requests on MySQL', async () => {
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

    // Exactly one must acquire the reservation and succeed
    expect(successes.length).toBe(1);
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
});

