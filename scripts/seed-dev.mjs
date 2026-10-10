// scripts/seed-dev.mjs
// Explicit development-only seed script for local testing

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

const dataDir = join(process.cwd(), '.data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'mims_auth.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize tables if not already present
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
  INSERT OR IGNORE INTO branches (id, code, name) VALUES (2, 'KAN-CEN', 'Kandy Central');
`);

const devUsers = [
  {
    name: 'System Administrator',
    email: 'admin@mims.bank',
    password: 'AdminDev@2026!',
    role: 'admin',
    branchId: null,
  },
  {
    name: 'HR Approver (Higher Management)',
    email: 'hrmanager@mims.bank',
    password: 'HrManager@2026!',
    role: 'higher_manager',
    branchId: null,
  },
  {
    name: 'Colombo Branch Manager',
    email: 'manager.colombo@mims.bank',
    password: 'Manager@2026!',
    role: 'manager',
    branchId: 1,
  },
  {
    name: 'Colombo Front Desk Agent',
    email: 'agent.colombo@mims.bank',
    password: 'Agent@2026!',
    role: 'agent',
    branchId: 1,
  },
  {
    name: 'Deactivated Loan Agent',
    email: 'deactivated.agent@mims.bank',
    password: 'Deactivated@2026!',
    role: 'agent',
    branchId: 1,
    status: 'inactive',
  },
];

console.log('Seeding development database at:', dbPath);

for (const user of devUsers) {
  const existing = db.prepare('SELECT id FROM staff WHERE lower(email) = lower(?)').get(user.email);
  const pwdHash = hashPassword(user.password);
  const status = user.status || 'active';

  if (!existing) {
    const insertStaff = db.prepare(`
      INSERT INTO staff (full_name, email, password_hash, role, branch_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = insertStaff.run(user.name, user.email, pwdHash, user.role, user.branchId, status);
    const staffId = Number(result.lastInsertRowid);

    const insertAuth = db.prepare(`
      INSERT INTO staff_authentication (employee_id, password_hash)
      VALUES (?, ?)
    `);
    insertAuth.run(staffId, pwdHash);

    console.log(`[SEED] Created ${user.role}: ${user.email} (Status: ${status})`);
  } else {
    const staffId = Number(existing.id);
    db.prepare('UPDATE staff SET full_name = ?, role = ?, branch_id = ?, password_hash = ?, status = ? WHERE id = ?')
      .run(user.name, user.role, user.branchId, pwdHash, status, staffId);
    db.prepare('INSERT OR REPLACE INTO staff_authentication (employee_id, password_hash, failed_attempts, locked_until) VALUES (?, ?, 0, NULL)')
      .run(staffId, pwdHash);

    console.log(`[SEED] Updated ${user.role}: ${user.email} (Password: ${user.password})`);
  }
}

console.log('\n--- Development Credentials ---');
for (const u of devUsers) {
  console.log(`• Role: ${u.role.padEnd(16)} | Email: ${u.email.padEnd(26)} | Password: ${u.password}`);
}
console.log('-------------------------------\n');
db.close();
