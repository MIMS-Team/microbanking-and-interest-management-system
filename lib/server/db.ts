import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import mysql from 'mysql2/promise';

export type Role = 'agent' | 'manager' | 'higher_manager' | 'admin';
export type EmployeeStatus = 'active' | 'inactive';
export type OtpPurpose = 'login' | 'password_reset' | 'employee_creation' | 'employee_deactivation';

export type AuditEventType =
  | 'login_success'
  | 'wrong_password'
  | 'wrong_otp'
  | 'logout'
  | 'unauthorized'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'employee_creation_requested'
  | 'employee_creation_confirmed'
  | 'employee_updated'
  | 'employee_deactivation_requested'
  | 'employee_deactivation_confirmed'
  | 'employee_reactivated'
  | 'session_revoked'
  | 'otp_resent';

export interface PublicEmployee {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  branch_id: number | null;
  status: EmployeeStatus;
  created_at: string;
}

export interface EmployeeWithAuth extends PublicEmployee {
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
}

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
  }
}

export interface OtpChallengeRecord {
  id: string;
  employee_id: number;
  purpose: OtpPurpose;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  metadata: string | null;
  is_pending?: number;
  created_at: string;
}

export interface SessionWithEmployee {
  token_hash: string;
  employee_id: number;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  employee: PublicEmployee;
}

export interface CreateEmployeeData {
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  branch_id: number | null;
  status?: EmployeeStatus;
}

export interface UpdateEmployeeData {
  full_name?: string;
  email?: string;
  role?: Role;
  branch_id?: number | null;
  status?: EmployeeStatus;
  password_hash?: string;
}

export interface CreateSessionData {
  token_hash: string;
  employee_id: number;
  expires_at: Date;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface CreateOtpData {
  id: string;
  employee_id: number;
  purpose: OtpPurpose;
  code_hash: string;
  max_attempts?: number;
  expires_at: Date;
  metadata?: Record<string, unknown> | null;
  invalidatePrevious?: boolean;
  is_pending?: boolean;
  created_at?: Date;
}

export interface AuditAttemptData {
  employee_id?: number | null;
  email: string;
  event_type: AuditEventType;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
}

// ---------------------------------------------------------
// Adapter Selection & Configuration
// ---------------------------------------------------------

let testAdapterOverride: 'mysql' | 'sqlite' | null = null;
let mysqlPoolInstance: Pool | null = null;
let sqliteDbInstance: DatabaseSync | null = null;

export function setDbAdapterForTest(adapter: 'mysql' | 'sqlite' | null): void {
  testAdapterOverride = adapter;
}

export function getActiveDbAdapterName(): 'mysql' | 'sqlite' {
  if (testAdapterOverride) return testAdapterOverride;
  if (process.env.MIMS_AUTH_DB_ADAPTER === 'mysql') return 'mysql';
  if (process.env.MIMS_AUTH_DB_ADAPTER === 'sqlite') return 'sqlite';
  if (process.env.NODE_ENV === 'production') return 'mysql';
  if (process.env.DB_HOST && process.env.NODE_ENV !== 'test') return 'mysql';
  return 'sqlite';
}

function toIso(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
    return trimmed.replace(' ', 'T') + 'Z';
  }
  if (!val) return '';
  return String(val);
}

// ---------------------------------------------------------
// MySQL 8.0 Adapter Implementation
// ---------------------------------------------------------

export function getMySqlPool(): Pool {
  if (mysqlPoolInstance) return mysqlPoolInstance;

  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : process.env.MYSQL_PASSWORD;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;

  if (!host || !user || password === undefined || !database) {
    throw new Error(
      'Database configuration error: Missing required MySQL connection settings. ' +
      'Please explicitly specify DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables.'
    );
  }

  mysqlPoolInstance = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  });

  return mysqlPoolInstance;
}

// ---------------------------------------------------------
// SQLite Lightweight Test Adapter Implementation
// ---------------------------------------------------------

export function getSqliteDb(): DatabaseSync {
  if (sqliteDbInstance) return sqliteDbInstance;

  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  let dbPath = ':memory:';

  if (!isTest) {
    const dataDir = join(process.cwd(), '.data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    dbPath = join(dataDir, 'mims_auth.db');
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'higher_manager', 'manager', 'agent')),
      branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_authentication (
      employee_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employee_sessions (
      token_hash TEXT PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_employee ON employee_sessions(employee_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON employee_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('login', 'password_reset', 'employee_creation', 'employee_deactivation')),
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      metadata TEXT,
      is_pending INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otp_resend_reservations (
      challenge_id TEXT PRIMARY KEY REFERENCES otp_challenges(id) ON DELETE CASCADE,
      reservation_token TEXT NOT NULL,
      replacement_id TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_otp_employee_purpose ON otp_challenges(employee_id, purpose, created_at);

    CREATE TABLE IF NOT EXISTS authentication_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_email ON authentication_audit(email, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_employee ON authentication_audit(employee_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON authentication_audit(event_type, created_at);

    INSERT OR IGNORE INTO branches (id, code, name) VALUES (1, 'COL-CEN', 'Colombo Central');
  `);

  try {
    const cols = db.prepare(`PRAGMA table_info(otp_challenges)`).all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some((c) => c.name === 'is_pending')) {
      db.exec(`ALTER TABLE otp_challenges ADD COLUMN is_pending INTEGER NOT NULL DEFAULT 0;`);
    }
  } catch {}

  sqliteDbInstance = db;
  return db;
}

// ---------------------------------------------------------
// Transaction Management Helpers
// ---------------------------------------------------------

export async function closePoolForTest(): Promise<void> {
  if (mysqlPoolInstance) {
    await mysqlPoolInstance.end();
    mysqlPoolInstance = null;
  }
}

export async function withMySqlTransaction<T>(
  callback: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getMySqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors if connection closed
    }
    throw error;
  } finally {
    conn.release();
  }
}

export function withSqliteTransaction<T>(callback: (db: DatabaseSync) => T): T {
  const db = getSqliteDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = callback(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    throw error;
  }
}

export async function runInTransaction<T>(
  mysqlCallback: (conn: PoolConnection) => Promise<T>,
  sqliteCallback: (db: DatabaseSync) => T
): Promise<T> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    return withMySqlTransaction(mysqlCallback);
  }
  return withSqliteTransaction(sqliteCallback);
}

// ---------------------------------------------------------
// Unified Public Database Operations
// ---------------------------------------------------------

export async function resetDatabase(): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute('DELETE FROM authentication_audit');
    await pool.execute('DELETE FROM employee_sessions');
    await pool.execute('DELETE FROM otp_resend_reservations');
    await pool.execute('DELETE FROM otp_challenges');
    await pool.execute('DELETE FROM staff_authentication');
    await pool.execute('DELETE FROM staff');
    return;
  }

  const db = getSqliteDb();
  db.exec(`
    DELETE FROM authentication_audit;
    DELETE FROM employee_sessions;
    DELETE FROM otp_resend_reservations;
    DELETE FROM otp_challenges;
    DELETE FROM staff_authentication;
    DELETE FROM staff;
  `);
}

export async function findEmployeeByEmail(email: string): Promise<PublicEmployee | null> {
  const normalized = email.trim().toLowerCase();
  const adapter = getActiveDbAdapterName();

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE LOWER(email) = ? LIMIT 1`,
      [normalized]
    );
    const row = rows[0] as (PublicEmployee & RowDataPacket) | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      full_name: row.full_name,
      email: row.email,
      role: row.role as Role,
      branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
      status: row.status as EmployeeStatus,
      created_at: toIso(row.created_at),
    };
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, full_name, email, role, branch_id, status, created_at
    FROM staff
    WHERE lower(email) = ?
    LIMIT 1
  `);
  const row = stmt.get(normalized) as unknown as PublicEmployee | undefined;
  if (!row) return null;
  return {
    ...row,
    created_at: toIso(row.created_at),
  };
}

export async function findEmployeeWithAuthByEmail(email: string): Promise<EmployeeWithAuth | null> {
  const normalized = email.trim().toLowerCase();
  const adapter = getActiveDbAdapterName();

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.id, s.full_name, s.email, s.role, s.branch_id, s.status, s.created_at,
              COALESCE(a.password_hash, s.password_hash) as password_hash,
              COALESCE(a.failed_attempts, 0) as failed_attempts,
              a.locked_until,
              a.last_login_at
       FROM staff s
       LEFT JOIN staff_authentication a ON a.employee_id = s.id
       WHERE LOWER(s.email) = ?
       LIMIT 1`,
      [normalized]
    );
    const row = rows[0] as (EmployeeWithAuth & RowDataPacket) | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      full_name: row.full_name,
      email: row.email,
      role: row.role as Role,
      branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
      status: row.status as EmployeeStatus,
      created_at: toIso(row.created_at),
      password_hash: row.password_hash,
      failed_attempts: Number(row.failed_attempts),
      locked_until: row.locked_until ? toIso(row.locked_until) : null,
      last_login_at: row.last_login_at ? toIso(row.last_login_at) : null,
    };
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT s.id, s.full_name, s.email, s.role, s.branch_id, s.status, s.created_at,
           coalesce(a.password_hash, s.password_hash) as password_hash,
           coalesce(a.failed_attempts, 0) as failed_attempts,
           a.locked_until,
           a.last_login_at
    FROM staff s
    LEFT JOIN staff_authentication a ON a.employee_id = s.id
    WHERE lower(s.email) = ?
    LIMIT 1
  `);
  const row = stmt.get(normalized) as unknown as EmployeeWithAuth | undefined;
  if (!row) return null;
  return {
    ...row,
    created_at: toIso(row.created_at),
    locked_until: row.locked_until ? toIso(row.locked_until) : null,
    last_login_at: row.last_login_at ? toIso(row.last_login_at) : null,
  };
}

export async function findEmployeeById(id: number): Promise<PublicEmployee | null> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0] as (PublicEmployee & RowDataPacket) | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      full_name: row.full_name,
      email: row.email,
      role: row.role as Role,
      branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
      status: row.status as EmployeeStatus,
      created_at: toIso(row.created_at),
    };
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, full_name, email, role, branch_id, status, created_at
    FROM staff
    WHERE id = ?
    LIMIT 1
  `);
  const row = stmt.get(id) as unknown as PublicEmployee | undefined;
  if (!row) return null;
  return {
    ...row,
    created_at: toIso(row.created_at),
  };
}

export async function getEmployeePasswordHash(employeeId: number): Promise<string | null> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(a.password_hash, s.password_hash) as password_hash
       FROM staff s
       LEFT JOIN staff_authentication a ON a.employee_id = s.id
       WHERE s.id = ?
       LIMIT 1`,
      [employeeId]
    );
    const row = rows[0] as { password_hash: string } | undefined;
    return row?.password_hash ?? null;
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT coalesce(a.password_hash, s.password_hash) as password_hash
    FROM staff s
    LEFT JOIN staff_authentication a ON a.employee_id = s.id
    WHERE s.id = ?
    LIMIT 1
  `);
  const row = stmt.get(employeeId) as unknown as { password_hash: string } | undefined;
  return row?.password_hash ?? null;
}

export async function recordFailedLogin(employeeId: number): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
       VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 1, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE failed_attempts = failed_attempts + 1, updated_at = CURRENT_TIMESTAMP`,
      [employeeId, employeeId]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
    VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 1, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id) DO UPDATE SET
      failed_attempts = failed_attempts + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(employeeId, employeeId);
}

export async function clearFailedLoginAttempts(employeeId: number): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE staff_authentication SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?`,
      [employeeId]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    UPDATE staff_authentication
    SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `).run(employeeId);
}

export async function lockEmployee(employeeId: number, lockedUntil: Date): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const dateStr = lockedUntil.toISOString().slice(0, 19).replace('T', ' ');

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, locked_until, updated_at)
       VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 5, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), updated_at = CURRENT_TIMESTAMP`,
      [employeeId, employeeId, dateStr]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, locked_until, updated_at)
    VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 5, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id) DO UPDATE SET
      locked_until = ?,
      updated_at = CURRENT_TIMESTAMP
  `).run(employeeId, employeeId, lockedUntil.toISOString(), lockedUntil.toISOString());
}

export async function updateLastLogin(employeeId: number): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, last_login_at, updated_at)
       VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [employeeId, employeeId]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, last_login_at, updated_at)
    VALUES (?, (SELECT password_hash FROM staff WHERE id = ?), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id) DO UPDATE SET
      failed_attempts = 0,
      locked_until = NULL,
      last_login_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(employeeId, employeeId);
}

export async function recordAuthenticationAttempt(data: AuditAttemptData): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const detailsJson = data.details ? JSON.stringify(data.details) : null;

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `INSERT INTO authentication_audit (employee_id, email, event_type, ip_address, user_agent, details, created_at)
       VALUES (?, LOWER(?), ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        data.employee_id ?? null,
        data.email.trim(),
        data.event_type,
        data.ip_address ?? null,
        data.user_agent ?? null,
        detailsJson,
      ]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO authentication_audit (employee_id, email, event_type, ip_address, user_agent, details, created_at)
    VALUES (?, lower(?), ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    data.employee_id ?? null,
    data.email.trim(),
    data.event_type,
    data.ip_address ?? null,
    data.user_agent ?? null,
    detailsJson
  );
}

export async function createOtpChallenge(data: CreateOtpData): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;
  const expiresIso = data.expires_at.toISOString();

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const expiresFormatted = expiresIso.slice(0, 19).replace('T', ' ');
    const isPendingVal = data.is_pending ? 1 : 0;

    // Invalidate earlier unconsumed OTPs for same employee and purpose only if requested
    if (data.invalidatePrevious !== false) {
      await pool.execute(
        `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND purpose = ? AND consumed_at IS NULL`,
        [data.employee_id, data.purpose]
      );
    }

    const createdDate = data.created_at ?? new Date();
    const createdFormatted = createdDate.toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
      `INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, is_pending, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), attempts = 0, expires_at = VALUES(expires_at), consumed_at = NULL, metadata = VALUES(metadata), is_pending = VALUES(is_pending), created_at = VALUES(created_at)`,
      [
        data.id,
        data.employee_id,
        data.purpose,
        data.code_hash,
        data.max_attempts ?? 5,
        expiresFormatted,
        metadataJson,
        isPendingVal,
        createdFormatted,
      ]
    );
    return;
  }

  const db = getSqliteDb();
  const nowIso = new Date().toISOString();
  const createdIso = (data.created_at ?? new Date()).toISOString();
  const isPendingVal = data.is_pending ? 1 : 0;
  if (data.invalidatePrevious !== false) {
    db.prepare(`
      UPDATE otp_challenges
      SET consumed_at = ?
      WHERE employee_id = ? AND purpose = ? AND consumed_at IS NULL
    `).run(nowIso, data.employee_id, data.purpose);
  }

  db.prepare(`
    INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, is_pending, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code_hash = excluded.code_hash,
      attempts = 0,
      expires_at = excluded.expires_at,
      consumed_at = NULL,
      metadata = excluded.metadata,
      is_pending = excluded.is_pending,
      created_at = excluded.created_at
  `).run(
    data.id,
    data.employee_id,
    data.purpose,
    data.code_hash,
    data.max_attempts ?? 5,
    expiresIso,
    metadataJson,
    isPendingVal,
    createdIso
  );
}

export async function findOtpChallenge(
  id: string,
  purpose: OtpPurpose,
  includePending = false
): Promise<OtpChallengeRecord | null> {
  const adapter = getActiveDbAdapterName();
  const pendingClause = includePending ? '' : 'AND (is_pending = 0 OR is_pending IS NULL)';

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, metadata, is_pending, created_at
       FROM otp_challenges
       WHERE id = ? AND purpose = ? ${pendingClause}
       LIMIT 1`,
      [id, purpose]
    );
    const row = rows[0] as (OtpChallengeRecord & RowDataPacket) | undefined;
    if (!row) return null;
    return {
      id: row.id,
      employee_id: Number(row.employee_id),
      purpose: row.purpose,
      code_hash: row.code_hash,
      attempts: Number(row.attempts),
      max_attempts: Number(row.max_attempts),
      expires_at: toIso(row.expires_at),
      consumed_at: row.consumed_at ? toIso(row.consumed_at) : null,
      metadata: typeof row.metadata === 'object' && row.metadata !== null ? JSON.stringify(row.metadata) : (row.metadata ?? null),
      is_pending: Number(row.is_pending ?? 0),
      created_at: toIso(row.created_at),
    };
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, metadata, is_pending, created_at
    FROM otp_challenges
    WHERE id = ? AND purpose = ? ${pendingClause}
    LIMIT 1
  `);
  const row = stmt.get(id, purpose) as unknown as OtpChallengeRecord | undefined;
  if (!row) return null;
  return {
    ...row,
    expires_at: toIso(row.expires_at),
    consumed_at: row.consumed_at ? toIso(row.consumed_at) : null,
    is_pending: Number(row.is_pending ?? 0),
    created_at: toIso(row.created_at),
  };
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?`, [id]);
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT attempts FROM otp_challenges WHERE id = ?`, [id]);
    const row = rows[0] as { attempts: number } | undefined;
    return Number(row?.attempts ?? 0);
  }

  const db = getSqliteDb();
  db.prepare(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?`).run(id);
  const stmt = db.prepare(`SELECT attempts FROM otp_challenges WHERE id = ?`);
  const row = stmt.get(id) as unknown as { attempts: number } | undefined;
  return row?.attempts ?? 0;
}

/**
 * Atomically consumes an OTP challenge.
 * Returns true if this invocation successfully consumed the challenge; false if already consumed or invalid.
 */
export async function consumeOtpChallenge(id: string): Promise<boolean> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts`,
      [id]
    );
    return result.affectedRows > 0;
  }

  const db = getSqliteDb();
  const result = db.prepare(`
    UPDATE otp_challenges
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts
  `).run(new Date().toISOString(), id);
  return result.changes > 0;
}

export async function deleteOtpChallenge(id: string): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute('DELETE FROM otp_challenges WHERE id = ?', [id]);
    return;
  }

  const db = getSqliteDb();
  db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(id);
}

export function parseDateSafe(dateString: string): Date {
  if (!dateString) return new Date(0);
  const trimmed = dateString.trim();
  if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  const isoUtc = trimmed.replace(' ', 'T') + 'Z';
  const d = new Date(isoUtc);
  if (!isNaN(d.getTime())) {
    return d;
  }
  return new Date(trimmed);
}

export interface AcquiredResendReservation {
  reservationToken: string;
  originalChallenge: OtpChallengeRecord;
  replacementId: string;
}

/**
 * Atomically acquires a bounded database reservation to resend an OTP challenge.
 * Works across multi-process deployments. Ensures only one request can own the resend lease.
 * Creates replacement challenge in a pending state preventing premature verification.
 */
export async function acquireOtpResendReservation(
  originalChallengeId: string,
  replacementData: CreateOtpData,
  leaseDurationMs = 30000
): Promise<AcquiredResendReservation> {
  const adapter = getActiveDbAdapterName();
  const now = new Date();
  const newToken = randomBytes(24).toString('hex');

  if (adapter === 'mysql') {
    return withMySqlTransaction(async (conn) => {
      // 1. Lock and inspect original challenge
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, metadata, is_pending, created_at
         FROM otp_challenges
         WHERE id = ?
         FOR UPDATE`,
        [originalChallengeId]
      );
      const row = rows[0] as (OtpChallengeRecord & RowDataPacket) | undefined;
      if (!row) {
        throw new AuthError('Verification challenge not found or has expired.', 404, 'CHALLENGE_NOT_FOUND');
      }
      if (Number(row.is_pending) === 1) {
        throw new AuthError('Cannot resend a pending challenge.', 400, 'INVALID_CHALLENGE_STATE');
      }
      if (row.consumed_at) {
        throw new AuthError('This verification code has already been confirmed.', 400, 'ALREADY_CONSUMED');
      }
      const expiresAtMs = parseDateSafe(String(row.expires_at)).getTime();
      if (expiresAtMs <= Date.now()) {
        throw new AuthError('Verification challenge has expired.', 400, 'CHALLENGE_EXPIRED');
      }
      const createdAtMs = parseDateSafe(String(row.created_at)).getTime();
      const elapsedSeconds = Math.floor((Date.now() - createdAtMs) / 1000);
      const isE2E = process.env.E2E_TEST === 'true';
      if (!isE2E && elapsedSeconds < 30) {
        const wait = 30 - elapsedSeconds;
        throw new AuthError(`Please wait ${wait} seconds before requesting a new code.`, 429, 'COOLDOWN_ACTIVE');
      }

      // 2. Lock and inspect existing reservation
      const [resRows] = await conn.execute<RowDataPacket[]>(
        `SELECT challenge_id, reservation_token, replacement_id, lease_expires_at
         FROM otp_resend_reservations
         WHERE challenge_id = ?
         FOR UPDATE`,
        [originalChallengeId]
      );
      const existing = resRows[0] as {
        challenge_id: string;
        reservation_token: string;
        replacement_id: string;
        lease_expires_at: string;
      } | undefined;

      const leaseExpires = new Date(Date.now() + leaseDurationMs);
      const leaseExpiresFormatted = leaseExpires.toISOString().slice(0, 19).replace('T', ' ');

      if (existing) {
        const leaseUntilMs = parseDateSafe(String(existing.lease_expires_at)).getTime();
        if (leaseUntilMs > Date.now()) {
          throw new AuthError('A verification resend is currently in progress. Please wait before retrying.', 429, 'CONCURRENT_RESEND_IN_PROGRESS');
        }
        // Abandoned lease recovery: clean up stale pending challenge
        await conn.execute(`DELETE FROM otp_challenges WHERE id = ? AND is_pending = 1`, [existing.replacement_id]);
        await conn.execute(
          `UPDATE otp_resend_reservations
           SET reservation_token = ?, replacement_id = ?, lease_expires_at = ?, created_at = CURRENT_TIMESTAMP
           WHERE challenge_id = ?`,
          [newToken, replacementData.id, leaseExpiresFormatted, originalChallengeId]
        );
      } else {
        await conn.execute(
          `INSERT INTO otp_resend_reservations (challenge_id, reservation_token, replacement_id, lease_expires_at, created_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [originalChallengeId, newToken, replacementData.id, leaseExpiresFormatted]
        );
      }

      // 3. Insert replacement challenge in pending state (is_pending = 1)
      const repExpiresFormatted = replacementData.expires_at.toISOString().slice(0, 19).replace('T', ' ');
      const repMetadataJson = replacementData.metadata ? JSON.stringify(replacementData.metadata) : null;
      await conn.execute(
        `INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, is_pending, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [
          replacementData.id,
          replacementData.employee_id,
          replacementData.purpose,
          replacementData.code_hash,
          replacementData.max_attempts ?? 5,
          repExpiresFormatted,
          repMetadataJson,
        ]
      );

      const originalChallenge: OtpChallengeRecord = {
        id: row.id,
        employee_id: Number(row.employee_id),
        purpose: row.purpose,
        code_hash: row.code_hash,
        attempts: Number(row.attempts),
        max_attempts: Number(row.max_attempts),
        expires_at: toIso(row.expires_at),
        consumed_at: row.consumed_at ? toIso(row.consumed_at) : null,
        metadata: typeof row.metadata === 'object' && row.metadata !== null ? JSON.stringify(row.metadata) : (row.metadata ?? null),
        is_pending: Number(row.is_pending ?? 0),
        created_at: toIso(row.created_at),
      };

      return {
        reservationToken: newToken,
        originalChallenge,
        replacementId: replacementData.id,
      };
    });
  }

  // SQLite implementation
  return withSqliteTransaction((db) => {
    const row = db.prepare(`
      SELECT id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, metadata, is_pending, created_at
      FROM otp_challenges
      WHERE id = ?
    `).get(originalChallengeId) as (OtpChallengeRecord & { is_pending: number }) | undefined;

    if (!row) {
      throw new AuthError('Verification challenge not found or has expired.', 404, 'CHALLENGE_NOT_FOUND');
    }
    if (Number(row.is_pending) === 1) {
      throw new AuthError('Cannot resend a pending challenge.', 400, 'INVALID_CHALLENGE_STATE');
    }
    if (row.consumed_at) {
      throw new AuthError('This verification code has already been confirmed.', 400, 'ALREADY_CONSUMED');
    }
    const expiresAtMs = parseDateSafe(String(row.expires_at)).getTime();
    if (expiresAtMs <= Date.now()) {
      throw new AuthError('Verification challenge has expired.', 400, 'CHALLENGE_EXPIRED');
    }
    const createdAtMs = parseDateSafe(String(row.created_at)).getTime();
    const elapsedSeconds = Math.floor((Date.now() - createdAtMs) / 1000);
    const isE2E = process.env.E2E_TEST === 'true';
    if (!isE2E && elapsedSeconds < 30) {
      const wait = 30 - elapsedSeconds;
      throw new AuthError(`Please wait ${wait} seconds before requesting a new code.`, 429, 'COOLDOWN_ACTIVE');
    }

    const existing = db.prepare(`
      SELECT challenge_id, reservation_token, replacement_id, lease_expires_at
      FROM otp_resend_reservations
      WHERE challenge_id = ?
    `).get(originalChallengeId) as {
      challenge_id: string;
      reservation_token: string;
      replacement_id: string;
      lease_expires_at: string;
    } | undefined;

    const leaseExpires = new Date(Date.now() + leaseDurationMs);
    const leaseExpiresIso = leaseExpires.toISOString();

    if (existing) {
      const leaseUntilMs = parseDateSafe(String(existing.lease_expires_at)).getTime();
      if (leaseUntilMs > Date.now()) {
        throw new AuthError('A verification resend is currently in progress. Please wait before retrying.', 429, 'CONCURRENT_RESEND_IN_PROGRESS');
      }
      db.prepare(`DELETE FROM otp_challenges WHERE id = ? AND is_pending = 1`).run(existing.replacement_id);
      db.prepare(`
        UPDATE otp_resend_reservations
        SET reservation_token = ?, replacement_id = ?, lease_expires_at = ?, created_at = CURRENT_TIMESTAMP
        WHERE challenge_id = ?
      `).run(newToken, replacementData.id, leaseExpiresIso, originalChallengeId);
    } else {
      db.prepare(`
        INSERT INTO otp_resend_reservations (challenge_id, reservation_token, replacement_id, lease_expires_at, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(originalChallengeId, newToken, replacementData.id, leaseExpiresIso);
    }

    const repExpiresIso = replacementData.expires_at.toISOString();
    const repMetadataJson = replacementData.metadata ? JSON.stringify(replacementData.metadata) : null;
    db.prepare(`
      INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, is_pending, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1, ?)
    `).run(
      replacementData.id,
      replacementData.employee_id,
      replacementData.purpose,
      replacementData.code_hash,
      replacementData.max_attempts ?? 5,
      repExpiresIso,
      repMetadataJson,
      now.toISOString()
    );

    return {
      reservationToken: newToken,
      originalChallenge: {
        ...row,
        expires_at: toIso(row.expires_at),
        consumed_at: row.consumed_at ? toIso(row.consumed_at) : null,
        created_at: toIso(row.created_at),
        is_pending: Number(row.is_pending ?? 0),
      },
      replacementId: replacementData.id,
    };
  });
}

/**
 * Atomically finalizes an OTP replacement and invalidates the original challenge.
 * Rechecks the original challenge; if it was verified or invalidated during email delivery,
 * does NOT leave replacement usable.
 */
export async function finalizeOtpResend(
  originalChallengeId: string,
  replacementId: string,
  reservationToken: string
): Promise<{ finalized: boolean; reason?: string }> {
  const adapter = getActiveDbAdapterName();

  if (adapter === 'mysql') {
    return withMySqlTransaction(async (conn) => {
      // Match acquisition's lock order: original challenge, then reservation.
      // Reversing these locks can deadlock with another concurrent resend.
      const [chalRows] = await conn.execute<RowDataPacket[]>(
        `SELECT consumed_at, expires_at FROM otp_challenges WHERE id = ? FOR UPDATE`,
        [originalChallengeId]
      );
      const orig = chalRows[0] as { consumed_at: string | null; expires_at: string } | undefined;

      const [resRows] = await conn.execute<RowDataPacket[]>(
        `SELECT reservation_token, replacement_id FROM otp_resend_reservations WHERE challenge_id = ? FOR UPDATE`,
        [originalChallengeId]
      );
      const reservation = resRows[0] as { reservation_token: string; replacement_id: string } | undefined;
      if (!reservation || reservation.reservation_token !== reservationToken) {
        return { finalized: false, reason: 'RESERVATION_LOST' };
      }

      if (!orig || orig.consumed_at !== null || parseDateSafe(String(orig.expires_at)).getTime() <= Date.now()) {
        await conn.execute(`DELETE FROM otp_challenges WHERE id = ?`, [replacementId]);
        await conn.execute(`DELETE FROM otp_resend_reservations WHERE challenge_id = ?`, [originalChallengeId]);
        return { finalized: false, reason: orig?.consumed_at ? 'ORIGINAL_ALREADY_CONSUMED' : 'ORIGINAL_EXPIRED' };
      }

      await conn.execute(
        `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL`,
        [originalChallengeId]
      );
      await conn.execute(`UPDATE otp_challenges SET is_pending = 0 WHERE id = ?`, [replacementId]);
      await conn.execute(`DELETE FROM otp_resend_reservations WHERE challenge_id = ?`, [originalChallengeId]);
      return { finalized: true };
    });
  }

  return withSqliteTransaction((db) => {
    const reservation = db.prepare(`
      SELECT reservation_token, replacement_id FROM otp_resend_reservations WHERE challenge_id = ?
    `).get(originalChallengeId) as { reservation_token: string; replacement_id: string } | undefined;

    if (!reservation || reservation.reservation_token !== reservationToken) {
      return { finalized: false, reason: 'RESERVATION_LOST' };
    }

    const orig = db.prepare(`
      SELECT consumed_at, expires_at FROM otp_challenges WHERE id = ?
    `).get(originalChallengeId) as { consumed_at: string | null; expires_at: string } | undefined;

    if (!orig || orig.consumed_at !== null || parseDateSafe(String(orig.expires_at)).getTime() <= Date.now()) {
      db.prepare(`DELETE FROM otp_challenges WHERE id = ?`).run(replacementId);
      db.prepare(`DELETE FROM otp_resend_reservations WHERE challenge_id = ?`).run(originalChallengeId);
      return { finalized: false, reason: orig?.consumed_at ? 'ORIGINAL_ALREADY_CONSUMED' : 'ORIGINAL_EXPIRED' };
    }

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`).run(nowIso, originalChallengeId);
    db.prepare(`UPDATE otp_challenges SET is_pending = 0 WHERE id = ?`).run(replacementId);
    db.prepare(`DELETE FROM otp_resend_reservations WHERE challenge_id = ?`).run(originalChallengeId);
    return { finalized: true };
  });
}

/**
 * Releases resend reservation upon email delivery failure.
 * Removes pending replacement and preserves original challenge validity.
 */
export async function releaseOtpResendReservation(
  originalChallengeId: string,
  replacementId: string,
  reservationToken: string
): Promise<void> {
  const adapter = getActiveDbAdapterName();

  if (adapter === 'mysql') {
    return withMySqlTransaction(async (conn) => {
      await conn.execute(`DELETE FROM otp_challenges WHERE id = ? AND is_pending = 1`, [replacementId]);
      await conn.execute(
        `DELETE FROM otp_resend_reservations WHERE challenge_id = ? AND reservation_token = ?`,
        [originalChallengeId, reservationToken]
      );
    });
  }

  return withSqliteTransaction((db) => {
    db.prepare(`DELETE FROM otp_challenges WHERE id = ? AND is_pending = 1`).run(replacementId);
    db.prepare(`DELETE FROM otp_resend_reservations WHERE challenge_id = ? AND reservation_token = ?`).run(
      originalChallengeId,
      reservationToken
    );
  });
}

export async function createSession(data: CreateSessionData): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const expiresIso = data.expires_at.toISOString();

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const expiresFormatted = expiresIso.slice(0, 19).replace('T', ' ');
    await pool.execute(
      `INSERT INTO employee_sessions (token_hash, employee_id, created_at, last_activity_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)
       ON DUPLICATE KEY UPDATE revoked_at = NULL, last_activity_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at)`,
      [
        data.token_hash,
        data.employee_id,
        expiresFormatted,
        data.ip_address ?? null,
        data.user_agent ?? null,
      ]
    );
    return;
  }

  const db = getSqliteDb();
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO employee_sessions (token_hash, employee_id, created_at, last_activity_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_hash) DO UPDATE SET
      revoked_at = NULL,
      last_activity_at = excluded.last_activity_at,
      expires_at = excluded.expires_at
  `).run(
    data.token_hash,
    data.employee_id,
    nowIso,
    nowIso,
    expiresIso,
    data.ip_address ?? null,
    data.user_agent ?? null
  );
}

export async function findSessionByHash(tokenHash: string): Promise<SessionWithEmployee | null> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.token_hash, s.employee_id, s.created_at, s.last_activity_at, s.expires_at, s.revoked_at, s.ip_address, s.user_agent,
              e.id, e.full_name, e.email, e.role, e.branch_id, e.status, e.created_at as emp_created_at
       FROM employee_sessions s
       JOIN staff e ON e.id = s.employee_id
       WHERE s.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );
    const row = rows[0] as (RowDataPacket & {
      token_hash: string;
      employee_id: number;
      created_at: string;
      last_activity_at: string;
      expires_at: string;
      revoked_at: string | null;
      ip_address: string | null;
      user_agent: string | null;
      id: number;
      full_name: string;
      email: string;
      role: Role;
      branch_id: number | null;
      status: EmployeeStatus;
      emp_created_at: string;
    }) | undefined;

    if (!row) return null;
    return {
      token_hash: row.token_hash,
      employee_id: Number(row.employee_id),
      created_at: toIso(row.created_at),
      last_activity_at: toIso(row.last_activity_at),
      expires_at: toIso(row.expires_at),
      revoked_at: row.revoked_at ? toIso(row.revoked_at) : null,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      employee: {
        id: Number(row.id),
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
        status: row.status,
        created_at: toIso(row.emp_created_at),
      },
    };
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT s.token_hash, s.employee_id, s.created_at, s.last_activity_at, s.expires_at, s.revoked_at, s.ip_address, s.user_agent,
           e.id, e.full_name, e.email, e.role, e.branch_id, e.status, e.created_at as emp_created_at
    FROM employee_sessions s
    JOIN staff e ON e.id = s.employee_id
    WHERE s.token_hash = ?
    LIMIT 1
  `);
  const row = stmt.get(tokenHash) as unknown as {
    token_hash: string;
    employee_id: number;
    created_at: string;
    last_activity_at: string;
    expires_at: string;
    revoked_at: string | null;
    ip_address: string | null;
    user_agent: string | null;
    id: number;
    full_name: string;
    email: string;
    role: Role;
    branch_id: number | null;
    status: EmployeeStatus;
    emp_created_at: string;
  } | undefined;

  if (!row) return null;

  return {
    token_hash: row.token_hash,
    employee_id: row.employee_id,
    created_at: toIso(row.created_at),
    last_activity_at: toIso(row.last_activity_at),
    expires_at: toIso(row.expires_at),
    revoked_at: row.revoked_at ? toIso(row.revoked_at) : null,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    employee: {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      branch_id: row.branch_id,
      status: row.status,
      created_at: toIso(row.emp_created_at),
    },
  };
}

export async function updateSessionActivity(tokenHash: string): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE employee_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET last_activity_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), tokenHash);
}

export async function setSessionLastActivityForTest(tokenHash: string, date: Date): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const dateIso = date.toISOString();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE employee_sessions SET last_activity_at = ? WHERE token_hash = ?`,
      [dateIso.slice(0, 19).replace('T', ' '), tokenHash]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`UPDATE employee_sessions SET last_activity_at = ? WHERE token_hash = ?`).run(dateIso, tokenHash);
}

export async function setSessionExpiresAtForTest(tokenHash: string, date: Date): Promise<void> {
  const adapter = getActiveDbAdapterName();
  const dateIso = date.toISOString();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE employee_sessions SET expires_at = ? WHERE token_hash = ?`,
      [dateIso.slice(0, 19).replace('T', ' '), tokenHash]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`UPDATE employee_sessions SET expires_at = ? WHERE token_hash = ?`).run(dateIso, tokenHash);
}

export async function revokeSession(tokenHash: string): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), tokenHash);
}

export async function revokeAllEmployeeSessions(employeeId: number): Promise<void> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    await pool.execute(
      `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
      [employeeId]
    );
    return;
  }

  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET revoked_at = ?
    WHERE employee_id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), employeeId);
}

export async function listEmployees(filters?: {
  role?: Role;
  status?: EmployeeStatus;
  branch_id?: number | null;
}): Promise<PublicEmployee[]> {
  const adapter = getActiveDbAdapterName();

  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    let query = `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE 1=1`;
    const params: (string | number)[] = [];

    if (filters?.role) {
      query += ` AND role = ?`;
      params.push(filters.role);
    }
    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.branch_id !== undefined && filters.branch_id !== null) {
      query += ` AND branch_id = ?`;
      params.push(filters.branch_id);
    }

    query += ` ORDER BY id ASC`;
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      full_name: r.full_name,
      email: r.email,
      role: r.role as Role,
      branch_id: r.branch_id !== null ? Number(r.branch_id) : null,
      status: r.status as EmployeeStatus,
      created_at: toIso(r.created_at),
    }));
  }

  const db = getSqliteDb();
  let query = `
    SELECT id, full_name, email, role, branch_id, status, created_at
    FROM staff
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters?.role) {
    query += ` AND role = ?`;
    params.push(filters.role);
  }
  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters?.branch_id !== undefined && filters.branch_id !== null) {
    query += ` AND branch_id = ?`;
    params.push(filters.branch_id);
  }

  query += ` ORDER BY id ASC`;
  const rows = db.prepare(query).all(...params) as unknown as PublicEmployee[];
  return rows.map((r) => ({
    ...r,
    created_at: toIso(r.created_at),
  }));
}

export async function createEmployee(data: CreateEmployeeData): Promise<PublicEmployee> {
  const normalizedEmail = data.email.trim().toLowerCase();
  return runInTransaction(
    async (conn) => {
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO staff (full_name, email, password_hash, role, branch_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          data.full_name.trim(),
          normalizedEmail,
          data.password_hash,
          data.role,
          data.branch_id ?? null,
          data.status ?? 'active',
        ]
      );

      const newId = result.insertId;
      await conn.execute(
        `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
         VALUES (?, ?, 0, CURRENT_TIMESTAMP)`,
        [newId, data.password_hash]
      );

      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE id = ? LIMIT 1`,
        [newId]
      );
      const row = rows[0] as (PublicEmployee & RowDataPacket) | undefined;
      if (!row) throw new Error('Failed to retrieve newly created employee.');
      return {
        id: Number(row.id),
        full_name: row.full_name,
        email: row.email,
        role: row.role as Role,
        branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
        status: row.status as EmployeeStatus,
        created_at: toIso(row.created_at),
      };
    },
    (db) => {
      db.prepare(`
        INSERT INTO staff (full_name, email, password_hash, role, branch_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        data.full_name.trim(),
        normalizedEmail,
        data.password_hash,
        data.role,
        data.branch_id ?? null,
        data.status ?? 'active'
      );

      const row = db.prepare(`SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE email = ?`)
        .get(normalizedEmail) as unknown as PublicEmployee;

      db.prepare(`
        INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      `).run(row.id, data.password_hash);

      return {
        ...row,
        created_at: toIso(row.created_at),
      };
    }
  );
}

export async function updateEmployee(id: number, data: UpdateEmployeeData): Promise<PublicEmployee | null> {
  const current = await findEmployeeById(id);
  if (!current) return null;

  const nextName = data.full_name !== undefined ? data.full_name.trim() : current.full_name;
  const nextEmail = data.email !== undefined ? data.email.trim().toLowerCase() : current.email;
  const nextRole = data.role !== undefined ? data.role : current.role;
  const nextBranch = data.branch_id !== undefined ? data.branch_id : current.branch_id;
  const nextStatus = data.status !== undefined ? data.status : current.status;

  return runInTransaction(
    async (conn) => {
      await conn.execute(
        `UPDATE staff SET full_name = ?, email = ?, role = ?, branch_id = ?, status = ? WHERE id = ?`,
        [nextName, nextEmail, nextRole, nextBranch, nextStatus, id]
      );

      if (data.password_hash) {
        await conn.execute(`UPDATE staff SET password_hash = ? WHERE id = ?`, [data.password_hash, id]);
        await conn.execute(
          `INSERT INTO staff_authentication (employee_id, password_hash, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = CURRENT_TIMESTAMP`,
          [id, data.password_hash]
        );
      }

      if (nextStatus === 'inactive') {
        await conn.execute(
          `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
          [id]
        );
      }

      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE id = ? LIMIT 1`,
        [id]
      );
      const row = rows[0] as (PublicEmployee & RowDataPacket) | undefined;
      if (!row) return null;
      return {
        id: Number(row.id),
        full_name: row.full_name,
        email: row.email,
        role: row.role as Role,
        branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
        status: row.status as EmployeeStatus,
        created_at: toIso(row.created_at),
      };
    },
    (db) => {
      db.prepare(`
        UPDATE staff
        SET full_name = ?, email = ?, role = ?, branch_id = ?, status = ?
        WHERE id = ?
      `).run(nextName, nextEmail, nextRole, nextBranch, nextStatus, id);

      if (data.password_hash) {
        db.prepare(`UPDATE staff SET password_hash = ? WHERE id = ?`).run(data.password_hash, id);
        db.prepare(`
          INSERT INTO staff_authentication (employee_id, password_hash, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(employee_id) DO UPDATE SET
            password_hash = ?,
            updated_at = CURRENT_TIMESTAMP
        `).run(id, data.password_hash, data.password_hash);
      }

      if (nextStatus === 'inactive') {
        db.prepare(`
          UPDATE employee_sessions
          SET revoked_at = ?
          WHERE employee_id = ? AND revoked_at IS NULL
        `).run(new Date().toISOString(), id);
      }

      const row = db.prepare(`SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE id = ?`)
        .get(id) as unknown as PublicEmployee | undefined;
      if (!row) return null;
      return {
        ...row,
        created_at: toIso(row.created_at),
      };
    }
  );
}

export async function updatePasswordHash(employeeId: number, passwordHash: string): Promise<void> {
  return runInTransaction(
    async (conn) => {
      await conn.execute(`UPDATE staff SET password_hash = ? WHERE id = ?`, [passwordHash, employeeId]);
      await conn.execute(
        `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
         VALUES (?, ?, 0, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP`,
        [employeeId, passwordHash]
      );
      await conn.execute(
        `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
        [employeeId]
      );
    },
    (db) => {
      db.prepare(`UPDATE staff SET password_hash = ? WHERE id = ?`).run(passwordHash, employeeId);
      db.prepare(`
        INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(employee_id) DO UPDATE SET
          password_hash = ?,
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).run(employeeId, passwordHash, passwordHash);
      db.prepare(`
        UPDATE employee_sessions
        SET revoked_at = ?
        WHERE employee_id = ? AND revoked_at IS NULL
      `).run(new Date().toISOString(), employeeId);
    }
  );
}

export async function deactivateEmployee(id: number): Promise<boolean> {
  return runInTransaction(
    async (conn) => {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE staff SET status = 'inactive' WHERE id = ?`,
        [id]
      );
      if (result.affectedRows > 0) {
        await conn.execute(
          `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
          [id]
        );
        return true;
      }
      return false;
    },
    (db) => {
      const result = db.prepare(`UPDATE staff SET status = 'inactive' WHERE id = ?`).run(id);
      if (result.changes > 0) {
        db.prepare(`
          UPDATE employee_sessions
          SET revoked_at = ?
          WHERE employee_id = ? AND revoked_at IS NULL
        `).run(new Date().toISOString(), id);
        return true;
      }
      return false;
    }
  );
}

let testTransactionFailureHook: ((step: string) => void) | null = null;
export function setTransactionFailureHookForTest(hook: ((step: string) => void) | null): void {
  testTransactionFailureHook = hook;
}

/**
 * Atomically consumes password reset OTP challenge, updates staff and authentication password hashes,
 * resets lockout/attempts, and revokes all active employee sessions in a single transaction.
 * If any step fails or challenge was already consumed, transaction rolls back and returns false.
 */
export async function confirmPasswordResetTransaction(
  challengeId: string,
  employeeId: number,
  newPasswordHash: string
): Promise<boolean> {
  return runInTransaction(
    async (conn) => {
      const [otpRes] = await conn.execute<ResultSetHeader>(
        `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts`,
        [challengeId]
      );
      if (otpRes.affectedRows === 0) {
        return false;
      }

      await conn.execute(
        `UPDATE staff SET password_hash = ? WHERE id = ?`,
        [newPasswordHash, employeeId]
      );

      if (testTransactionFailureHook) {
        testTransactionFailureHook('after_staff_update');
      }

      await conn.execute(
        `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
         VALUES (?, ?, 0, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP`,
        [employeeId, newPasswordHash]
      );

      await conn.execute(
        `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
        [employeeId]
      );

      return true;
    },
    (db) => {
      const nowIso = new Date().toISOString();
      const otpRes = db.prepare(`
        UPDATE otp_challenges
        SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts
      `).run(nowIso, challengeId);

      if (otpRes.changes === 0) {
        return false;
      }

      db.prepare(`UPDATE staff SET password_hash = ? WHERE id = ?`).run(newPasswordHash, employeeId);

      if (testTransactionFailureHook) {
        testTransactionFailureHook('after_staff_update');
      }

      db.prepare(`
        INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(employee_id) DO UPDATE SET
          password_hash = ?,
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).run(employeeId, newPasswordHash, newPasswordHash);

      db.prepare(`
        UPDATE employee_sessions
        SET revoked_at = ?
        WHERE employee_id = ? AND revoked_at IS NULL
      `).run(nowIso, employeeId);

      return true;
    }
  );
}

/**
 * Atomically consumes employee creation OTP challenge and provisions both staff and
 * staff_authentication records in a single transaction on the same connection.
 */
export async function confirmEmployeeCreationTransaction(
  challengeId: string,
  employeeData: CreateEmployeeData
): Promise<PublicEmployee | null> {
  const normalizedEmail = employeeData.email.trim().toLowerCase();
  return runInTransaction(
    async (conn) => {
      const [otpRes] = await conn.execute<ResultSetHeader>(
        `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts`,
        [challengeId]
      );
      if (otpRes.affectedRows === 0) {
        return null;
      }

      const [insertRes] = await conn.execute<ResultSetHeader>(
        `INSERT INTO staff (full_name, email, password_hash, role, branch_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          employeeData.full_name.trim(),
          normalizedEmail,
          employeeData.password_hash,
          employeeData.role,
          employeeData.branch_id ?? null,
          employeeData.status ?? 'active',
        ]
      );
      const newId = insertRes.insertId;

      await conn.execute(
        `INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
         VALUES (?, ?, 0, CURRENT_TIMESTAMP)`,
        [newId, employeeData.password_hash]
      );

      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE id = ? LIMIT 1`,
        [newId]
      );
      const row = rows[0] as (PublicEmployee & RowDataPacket) | undefined;
      if (!row) throw new Error('Failed to retrieve newly confirmed employee.');
      return {
        id: Number(row.id),
        full_name: row.full_name,
        email: row.email,
        role: row.role as Role,
        branch_id: row.branch_id !== null ? Number(row.branch_id) : null,
        status: row.status as EmployeeStatus,
        created_at: toIso(row.created_at),
      };
    },
    (db) => {
      const nowIso = new Date().toISOString();
      const otpRes = db.prepare(`
        UPDATE otp_challenges
        SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts
      `).run(nowIso, challengeId);

      if (otpRes.changes === 0) {
        return null;
      }

      db.prepare(`
        INSERT INTO staff (full_name, email, password_hash, role, branch_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        employeeData.full_name.trim(),
        normalizedEmail,
        employeeData.password_hash,
        employeeData.role,
        employeeData.branch_id ?? null,
        employeeData.status ?? 'active'
      );

      const row = db.prepare(`SELECT id, full_name, email, role, branch_id, status, created_at FROM staff WHERE email = ?`)
        .get(normalizedEmail) as unknown as PublicEmployee;

      db.prepare(`
        INSERT INTO staff_authentication (employee_id, password_hash, failed_attempts, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      `).run(row.id, employeeData.password_hash);

      return {
        ...row,
        created_at: toIso(row.created_at),
      };
    }
  );
}

/**
 * Atomically consumes employee deactivation OTP challenge, marks staff status inactive,
 * and revokes all active employee sessions in a single transaction on the same connection.
 */
export async function confirmEmployeeDeactivationTransaction(
  challengeId: string,
  targetEmployeeId: number
): Promise<boolean> {
  return runInTransaction(
    async (conn) => {
      const [otpRes] = await conn.execute<ResultSetHeader>(
        `UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts`,
        [challengeId]
      );
      if (otpRes.affectedRows === 0) {
        return false;
      }

      const [updateRes] = await conn.execute<ResultSetHeader>(
        `UPDATE staff SET status = 'inactive' WHERE id = ?`,
        [targetEmployeeId]
      );
      if (updateRes.affectedRows === 0) {
        throw new Error('Target employee record was not found to deactivate.');
      }

      await conn.execute(
        `UPDATE employee_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`,
        [targetEmployeeId]
      );

      return true;
    },
    (db) => {
      const nowIso = new Date().toISOString();
      const otpRes = db.prepare(`
        UPDATE otp_challenges
        SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND attempts <= max_attempts
      `).run(nowIso, challengeId);

      if (otpRes.changes === 0) {
        return false;
      }

      const updateRes = db.prepare(`UPDATE staff SET status = 'inactive' WHERE id = ?`).run(targetEmployeeId);
      if (updateRes.changes === 0) {
        throw new Error('Target employee record was not found to deactivate.');
      }

      db.prepare(`
        UPDATE employee_sessions
        SET revoked_at = ?
        WHERE employee_id = ? AND revoked_at IS NULL
      `).run(nowIso, targetEmployeeId);

      return true;
    }
  );
}

export async function countActiveAdmins(): Promise<number> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM staff WHERE role = 'admin' AND status = 'active'`
    );
    const row = rows[0] as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  const db = getSqliteDb();
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM staff WHERE role = 'admin' AND status = 'active'`);
  const row = stmt.get() as unknown as { count: number } | undefined;
  return row?.count ?? 0;
}

export async function getAuditLogsForTest(
  email?: string
): Promise<Array<{ id: number; employee_id: number | null; email: string; event_type: string; created_at: string }>> {
  const adapter = getActiveDbAdapterName();
  if (adapter === 'mysql') {
    const pool = getMySqlPool();
    if (email) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, employee_id, email, event_type, created_at FROM authentication_audit WHERE LOWER(email) = LOWER(?) ORDER BY id DESC`,
        [email.trim()]
      );
      return (rows as RowDataPacket[]).map((r) => ({
        id: Number(r.id),
        employee_id: r.employee_id !== null ? Number(r.employee_id) : null,
        email: r.email,
        event_type: r.event_type,
        created_at: toIso(r.created_at),
      }));
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, employee_id, email, event_type, created_at FROM authentication_audit ORDER BY id DESC`
    );
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      employee_id: r.employee_id !== null ? Number(r.employee_id) : null,
      email: r.email,
      event_type: r.event_type,
      created_at: toIso(r.created_at),
    }));
  }

  const db = getSqliteDb();
  if (email) {
    const rows = db.prepare(`
      SELECT id, employee_id, email, event_type, created_at
      FROM authentication_audit
      WHERE lower(email) = lower(?)
      ORDER BY id DESC
    `).all(email.trim());
    return (rows as unknown as Array<{ id: number; employee_id: number | null; email: string; event_type: string; created_at: string }>).map((r) => ({
      ...r,
      created_at: toIso(r.created_at),
    }));
  }
  const rows = db.prepare(`
    SELECT id, employee_id, email, event_type, created_at
    FROM authentication_audit
    ORDER BY id DESC
  `).all();
  return (rows as unknown as Array<{ id: number; employee_id: number | null; email: string; event_type: string; created_at: string }>).map((r) => ({
    ...r,
    created_at: toIso(r.created_at),
  }));
}

/**
 * Reusable helper to execute production MySQL DDL schema.
 * Shared between migration script and MySQL integration test suite.
 */
export async function applyMySqlSchema(connOrPool: { execute: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`branches\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`code\` VARCHAR(12) NOT NULL,
      \`name\` VARCHAR(100) NOT NULL,
      \`address\` TEXT DEFAULT NULL,
      \`phone\` VARCHAR(12) DEFAULT NULL,
      \`email\` VARCHAR(254) DEFAULT NULL,
      \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`code\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`staff\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`full_name\` VARCHAR(120) NOT NULL,
      \`email\` VARCHAR(254) NOT NULL,
      \`password_hash\` TEXT NOT NULL,
      \`role\` ENUM('admin', 'higher_manager', 'manager', 'agent') NOT NULL,
      \`branch_id\` INT DEFAULT NULL,
      \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`email\` (\`email\`),
      KEY \`branch_id\` (\`branch_id\`),
      CONSTRAINT \`staff_ibfk_branch\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\` (\`id\`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`staff_authentication\` (
      \`employee_id\` INT NOT NULL,
      \`password_hash\` TEXT NOT NULL,
      \`failed_attempts\` INT NOT NULL DEFAULT 0,
      \`locked_until\` TIMESTAMP NULL DEFAULT NULL,
      \`last_login_at\` TIMESTAMP NULL DEFAULT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`employee_id\`),
      CONSTRAINT \`fk_staff_auth_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`staff\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`employee_sessions\` (
      \`token_hash\` VARCHAR(64) NOT NULL,
      \`employee_id\` INT NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_activity_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`expires_at\` TIMESTAMP NOT NULL,
      \`revoked_at\` TIMESTAMP NULL DEFAULT NULL,
      \`ip_address\` VARCHAR(45) DEFAULT NULL,
      \`user_agent\` TEXT DEFAULT NULL,
      PRIMARY KEY (\`token_hash\`),
      KEY \`idx_sessions_employee\` (\`employee_id\`),
      KEY \`idx_sessions_expires_at\` (\`expires_at\`),
      CONSTRAINT \`fk_sessions_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`staff\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`otp_challenges\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`employee_id\` INT NOT NULL,
      \`purpose\` ENUM('login', 'password_reset', 'employee_creation', 'employee_deactivation') NOT NULL,
      \`code_hash\` VARCHAR(128) NOT NULL,
      \`attempts\` INT NOT NULL DEFAULT 0,
      \`max_attempts\` INT NOT NULL DEFAULT 5,
      \`expires_at\` TIMESTAMP NOT NULL,
      \`consumed_at\` TIMESTAMP NULL DEFAULT NULL,
      \`metadata\` JSON DEFAULT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_otp_employee_purpose\` (\`employee_id\`, \`purpose\`, \`created_at\`),
      CONSTRAINT \`fk_otp_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`staff\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    CREATE TABLE IF NOT EXISTS \`authentication_audit\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`employee_id\` INT DEFAULT NULL,
      \`email\` VARCHAR(254) NOT NULL,
      \`event_type\` VARCHAR(50) NOT NULL,
      \`ip_address\` VARCHAR(45) DEFAULT NULL,
      \`user_agent\` TEXT DEFAULT NULL,
      \`details\` JSON DEFAULT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_audit_email\` (\`email\`, \`created_at\`),
      KEY \`idx_audit_employee\` (\`employee_id\`, \`created_at\`),
      KEY \`idx_audit_event\` (\`event_type\`, \`created_at\`),
      CONSTRAINT \`fk_audit_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`staff\` (\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connOrPool.execute(`
    INSERT IGNORE INTO \`branches\` (\`id\`, \`code\`, \`name\`) VALUES (1, 'COL-CEN', 'Colombo Central');
  `);
}
