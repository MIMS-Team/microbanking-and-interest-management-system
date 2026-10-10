// Approval-only compatibility service for the existing PostgreSQL banking API.
// Login sessions and email delivery are provided by lib/server; no second login is created.
import { randomInt, randomUUID } from 'node:crypto';
import { getDb, type Database, type Queryable } from '../db';
import type { Staff } from '../types';
import { HttpError } from '../http';
import { passwordHash, passwordMatches } from '../server/auth';
import { sendOtpEmail } from '../server/email';

async function approvalDatabase(): Promise<Database> {
  const database = await getDb();
  await database.transaction(async tx => {
    await tx.query(`CREATE TABLE IF NOT EXISTS banking_approval_challenges (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES staff(id),
      approval_id INTEGER NOT NULL REFERENCES approvals(id),
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await tx.query(`CREATE TABLE IF NOT EXISTS banking_approval_limits (
      user_id INTEGER PRIMARY KEY REFERENCES staff(id),
      attempts INTEGER NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  });
  return database;
}

function requireReviewer(user: Staff): void {
  if (user.role !== 'higher_manager' || user.status !== 'active') {
    throw new HttpError(403, 'An active higher manager must approve employee changes.');
  }
}

async function pendingRequest(tx: Queryable, user: Staff, approvalId: number): Promise<void> {
  // An ID in the login database must not authorize an unrelated banking identity.
  const { rows } = await tx.query(`SELECT a.id FROM approvals a JOIN staff s ON s.id=$2
    WHERE a.id=$1 AND a.type IN ('staff.create','staff.update') AND a.status='pending'
      AND a.requested_by<>s.id AND s.status='active' AND s.role='higher_manager'
      AND lower(s.email)=lower($3)
    FOR SHARE OF a,s`, [approvalId, user.id, user.email]);
  if (!rows.length) {
    throw new HttpError(400, 'Choose a pending employee request submitted by another staff member.');
  }
}

export async function issueApprovalCode(user: Staff, approvalId: number) {
  requireReviewer(user);
  const database = await approvalDatabase();
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const hash = passwordHash(code);
  const issued = await database.transaction(async tx => {
    await pendingRequest(tx, user, approvalId);
    const { rows } = await tx.query<{ attempts: number }>(`INSERT INTO banking_approval_limits(user_id,attempts)
      VALUES($1,1) ON CONFLICT(user_id) DO UPDATE SET
        attempts=CASE WHEN banking_approval_limits.window_start<now()-INTERVAL '15 minutes'
          THEN 1 ELSE banking_approval_limits.attempts+1 END,
        window_start=CASE WHEN banking_approval_limits.window_start<now()-INTERVAL '15 minutes'
          THEN now() ELSE banking_approval_limits.window_start END
      RETURNING attempts`, [user.id]);
    // Return rather than throw so the failed attempt remains committed.
    if (rows[0].attempts > 8) return false;
    // The per-reviewer limit row also serializes concurrent resends.
    await tx.query('UPDATE banking_approval_challenges SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL', [user.id]);
    await tx.query(`INSERT INTO banking_approval_challenges(id,user_id,approval_id,code_hash,expires_at)
      VALUES($1,$2,$3,$4,now()+INTERVAL '5 minutes')`, [id, user.id, approvalId, hash]);
    return true;
  });
  if (!issued) throw new HttpError(429, 'Too many approval codes requested. Please wait 15 minutes.');
  try {
    await sendOtpEmail({
      to: user.email,
      purpose: 'banking_approval',
      otpCode: code,
      subject: `MIMS: Employee approval #${approvalId}`,
      text: `Your code for employee approval #${approvalId} is ${code}. It expires in five minutes.`,
    });
  } catch (error) {
    await database.query('UPDATE banking_approval_challenges SET consumed_at=now() WHERE id=$1', [id]);
    throw error;
  }
  return { challenge_id: id, otp_required: true, message: 'Enter the six-digit code sent to your staff email. It expires in five minutes.' };
}

export async function verifyApprovalCode(user: Staff, approvalId: number, body: Record<string, unknown>): Promise<void> {
  requireReviewer(user);
  if (typeof body.challenge_id !== 'string' || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    throw new HttpError(400, 'Enter the six-digit approval code.');
  }
  const database = await approvalDatabase();
  const accepted = await database.transaction(async tx => {
    await pendingRequest(tx, user, approvalId);
    const { rows } = await tx.query<{ id: string; code_hash: string }>(`SELECT id,code_hash
      FROM banking_approval_challenges WHERE id=$1 AND user_id=$2 AND approval_id=$3
        AND consumed_at IS NULL AND expires_at>now() AND attempts<5 FOR UPDATE`,
    [body.challenge_id, user.id, approvalId]);
    const challenge = rows[0];
    if (!challenge) return false;
    if (!passwordMatches(body.code as string, challenge.code_hash)) {
      await tx.query('UPDATE banking_approval_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      return false;
    }
    await tx.query('UPDATE banking_approval_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
    return true;
  });
  // Throw after committing: wrong guesses count, and concurrent use is rejected.
  if (!accepted) throw new HttpError(400, 'The approval code is invalid, expired, or has reached its attempt limit. Request a new code.');
}
