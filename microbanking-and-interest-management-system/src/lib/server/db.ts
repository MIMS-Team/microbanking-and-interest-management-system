import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
  | 'session_revoked';

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
}

export interface AuditAttemptData {
  employee_id?: number | null;
  email: string;
  event_type: AuditEventType;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
}

let sqliteDbInstance: DatabaseSync | null = null;

function getSqliteDb(): DatabaseSync {
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

  // Schema creation matching MySQL 8.0 structure
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

  sqliteDbInstance = db;
  return db;
}

export function resetDatabase(): void {
  const db = getSqliteDb();
  db.exec(`
    DELETE FROM authentication_audit;
    DELETE FROM employee_sessions;
    DELETE FROM otp_challenges;
    DELETE FROM staff_authentication;
    DELETE FROM staff;
  `);
}

export async function findEmployeeByEmail(email: string): Promise<PublicEmployee | null> {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, full_name, email, role, branch_id, status, created_at
    FROM staff
    WHERE lower(email) = lower(?)
    LIMIT 1
  `);
  const row = stmt.get(email.trim()) as unknown as PublicEmployee | undefined;
  return row ?? null;
}

export async function findEmployeeWithAuthByEmail(email: string): Promise<EmployeeWithAuth | null> {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT s.id, s.full_name, s.email, s.role, s.branch_id, s.status, s.created_at,
           coalesce(a.password_hash, s.password_hash) as password_hash,
           coalesce(a.failed_attempts, 0) as failed_attempts,
           a.locked_until,
           a.last_login_at
    FROM staff s
    LEFT JOIN staff_authentication a ON a.employee_id = s.id
    WHERE lower(s.email) = lower(?)
    LIMIT 1
  `);
  const row = stmt.get(email.trim()) as unknown as EmployeeWithAuth | undefined;
  return row ?? null;
}

export async function findEmployeeById(id: number): Promise<PublicEmployee | null> {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, full_name, email, role, branch_id, status, created_at
    FROM staff
    WHERE id = ?
    LIMIT 1
  `);
  const row = stmt.get(id) as unknown as PublicEmployee | undefined;
  return row ?? null;
}

export async function getEmployeePasswordHash(employeeId: number): Promise<string | null> {
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
  const db = getSqliteDb();
  db.prepare(`
    UPDATE staff_authentication
    SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `).run(employeeId);
}

export async function lockEmployee(employeeId: number, lockedUntil: Date): Promise<void> {
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
    data.details ? JSON.stringify(data.details) : null
  );
}

export async function createOtpChallenge(data: CreateOtpData): Promise<void> {
  const db = getSqliteDb();
  const nowIso = new Date().toISOString();
  // Invalidate any previous unconsumed active OTPs for the same employee and purpose
  db.prepare(`
    UPDATE otp_challenges
    SET consumed_at = ?
    WHERE employee_id = ? AND purpose = ? AND consumed_at IS NULL
  `).run(nowIso, data.employee_id, data.purpose);

  db.prepare(`
    INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code_hash = excluded.code_hash,
      attempts = 0,
      expires_at = excluded.expires_at,
      consumed_at = NULL,
      metadata = excluded.metadata
  `).run(
    data.id,
    data.employee_id,
    data.purpose,
    data.code_hash,
    data.max_attempts ?? 5,
    data.expires_at.toISOString(),
    data.metadata ? JSON.stringify(data.metadata) : null,
    nowIso
  );
}

export async function findOtpChallenge(id: string, purpose: OtpPurpose): Promise<OtpChallengeRecord | null> {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, metadata, created_at
    FROM otp_challenges
    WHERE id = ? AND purpose = ?
    LIMIT 1
  `);
  const row = stmt.get(id, purpose) as unknown as OtpChallengeRecord | undefined;
  return row ?? null;
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const db = getSqliteDb();
  db.prepare(`
    UPDATE otp_challenges
    SET attempts = attempts + 1
    WHERE id = ?
  `).run(id);

  const stmt = db.prepare(`SELECT attempts FROM otp_challenges WHERE id = ?`);
  const row = stmt.get(id) as unknown as { attempts: number } | undefined;
  return row?.attempts ?? 0;
}

export async function consumeOtpChallenge(id: string): Promise<void> {
  const db = getSqliteDb();
  db.prepare(`
    UPDATE otp_challenges
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).run(new Date().toISOString(), id);
}

export async function createSession(data: CreateSessionData): Promise<void> {
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
    data.expires_at.toISOString(),
    data.ip_address ?? null,
    data.user_agent ?? null
  );
}

export async function findSessionByHash(tokenHash: string): Promise<SessionWithEmployee | null> {
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
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    employee: {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      branch_id: row.branch_id,
      status: row.status,
      created_at: row.emp_created_at,
    },
  };
}

export async function updateSessionActivity(tokenHash: string): Promise<void> {
  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET last_activity_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), tokenHash);
}

export async function setSessionLastActivityForTest(tokenHash: string, date: Date): Promise<void> {
  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET last_activity_at = ?
    WHERE token_hash = ?
  `).run(date.toISOString(), tokenHash);
}

export async function revokeSession(tokenHash: string): Promise<void> {
  const db = getSqliteDb();
  db.prepare(`
    UPDATE employee_sessions
    SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), tokenHash);
}

export async function revokeAllEmployeeSessions(employeeId: number): Promise<void> {
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
  return rows;
}

export async function createEmployee(data: CreateEmployeeData): Promise<PublicEmployee> {
  const db = getSqliteDb();
  const normalizedEmail = data.email.trim().toLowerCase();

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

  return row;
}

export async function updateEmployee(id: number, data: UpdateEmployeeData): Promise<PublicEmployee | null> {
  const db = getSqliteDb();
  const current = await findEmployeeById(id);
  if (!current) return null;

  const nextName = data.full_name !== undefined ? data.full_name.trim() : current.full_name;
  const nextEmail = data.email !== undefined ? data.email.trim().toLowerCase() : current.email;
  const nextRole = data.role !== undefined ? data.role : current.role;
  const nextBranch = data.branch_id !== undefined ? data.branch_id : current.branch_id;
  const nextStatus = data.status !== undefined ? data.status : current.status;

  db.prepare(`
    UPDATE staff
    SET full_name = ?, email = ?, role = ?, branch_id = ?, status = ?
    WHERE id = ?
  `).run(nextName, nextEmail, nextRole, nextBranch, nextStatus, id);

  if (data.password_hash) {
    db.prepare(`
      UPDATE staff SET password_hash = ? WHERE id = ?
    `).run(data.password_hash, id);

    db.prepare(`
      INSERT INTO staff_authentication (employee_id, password_hash, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(employee_id) DO UPDATE SET
        password_hash = ?,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, data.password_hash, data.password_hash);
  }

  if (nextStatus === 'inactive') {
    await revokeAllEmployeeSessions(id);
  }

  return findEmployeeById(id);
}

export async function updatePasswordHash(employeeId: number, passwordHash: string): Promise<void> {
  const db = getSqliteDb();
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

  await revokeAllEmployeeSessions(employeeId);
}

export async function deactivateEmployee(id: number): Promise<boolean> {
  const db = getSqliteDb();
  const result = db.prepare(`
    UPDATE staff
    SET status = 'inactive'
    WHERE id = ?
  `).run(id);

  if (result.changes > 0) {
    await revokeAllEmployeeSessions(id);
    return true;
  }
  return false;
}

export async function countActiveAdmins(): Promise<number> {
  const db = getSqliteDb();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM staff
    WHERE role = 'admin' AND status = 'active'
  `);
  const row = stmt.get() as unknown as { count: number } | undefined;
  return row?.count ?? 0;
}
