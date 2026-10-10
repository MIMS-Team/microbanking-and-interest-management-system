import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { requireE2eTarget } from './auth-test-environment.mjs';

// Refuse the development default, shared databases and production environments.
const directory = requireE2eTarget();
const db = new DatabaseSync(process.env.MIMS_AUTH_DB_PATH);
try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      address TEXT, phone TEXT, email TEXT, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, branch_id INTEGER REFERENCES branches(id),
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff_authentication (
      employee_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT, last_login_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('BEGIN IMMEDIATE');
  // Reset only this run's authentication fixtures, including password-reset effects.
  for (const table of ['otp_resend_reservations', 'otp_challenges', 'employee_sessions', 'authentication_audit', 'staff_authentication', 'staff']) {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      db.exec(`DELETE FROM ${table}`);
    }
  }
  db.exec("INSERT OR IGNORE INTO branches (id, code, name) VALUES (1, 'TEST-ONE', 'Fictional Test Branch')");
  const fixtures = [
    ['Test Administrator', 'admin@example.test', 'AdminTest@2026!', 'admin', null, 'active'],
    ['Test Approver', 'approver@example.test', 'ApproverTest@2026!', 'higher_manager', null, 'active'],
    ['Test Manager', 'manager@example.test', 'ManagerTest@2026!', 'manager', 1, 'active'],
    ['Test Agent', 'agent@example.test', 'AgentTest@2026!', 'agent', 1, 'active'],
    ['Inactive Test Agent', 'inactive@example.test', 'InactiveTest@2026!', 'agent', 1, 'inactive'],
  ];
  for (const [name, email, password, role, branch, status] of fixtures) {
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    const inserted = db.prepare('INSERT INTO staff (full_name, email, password_hash, role, branch_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email, hash, role, branch, status);
    db.prepare('INSERT INTO staff_authentication (employee_id, password_hash) VALUES (?, ?)').run(inserted.lastInsertRowid, hash);
  }
  db.exec('COMMIT');
  const otpFile = join(directory, 'latest_otp.json');
  if (existsSync(otpFile)) unlinkSync(otpFile);
} finally {
  db.close();
}
