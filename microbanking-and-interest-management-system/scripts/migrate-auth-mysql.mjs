// scripts/migrate-auth-mysql.mjs
// Non-destructive migration script connecting authentication persistence to shared MySQL 8.0 database

import mysql from 'mysql2/promise';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const host = process.env.DB_HOST || process.env.MYSQL_HOST;
const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const user = process.env.DB_USER || process.env.MYSQL_USER;
const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : process.env.MYSQL_PASSWORD;
const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;

if (!host || !user || password === undefined || !database) {
  console.error('[MIGRATION-ERROR] Missing required database configuration.');
  console.error('Please explicitly set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables.');
  process.exit(1);
}

console.log(`[MIGRATION] Connecting to MySQL at ${host}:${port}/${database} as ${user}...`);

async function runMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });
    console.log('[MIGRATION] Connected to MySQL successfully.');
  } catch (err) {
    console.error(`[MIGRATION-ERROR] Failed to connect to MySQL: ${err.message}`);
    console.error('Ensure MySQL server is running and connection credentials in environment variables are correct.');
    process.exit(1);
  }

  try {
    // 1. Ensure MySQL authentication and staff tables exist non-destructively
    console.log('[MIGRATION] Ensuring shared authentication tables exist in MySQL...');
    await connection.execute(`
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

    await connection.execute(`
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

    await connection.execute(`
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

    await connection.execute(`
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

    await connection.execute(`
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

    await connection.execute(`
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

    // Ensure default branch exists
    await connection.execute(`INSERT IGNORE INTO \`branches\` (\`id\`, \`code\`, \`name\`) VALUES (1, 'COL-CEN', 'Colombo Central');`);

    // 2. Check if SQLite database exists to migrate records from
    const sqlitePath = join(process.cwd(), '.data', 'mims_auth.db');
    if (existsSync(sqlitePath)) {
      console.log('[MIGRATION] Migrating existing staff records from SQLite:', sqlitePath);
      const sqlite = new DatabaseSync(sqlitePath);
      const staffRows = sqlite.prepare('SELECT id, full_name, email, password_hash, role, branch_id, status FROM staff').all();

      for (const row of staffRows) {
        await connection.execute(
          `INSERT INTO \`staff\` (\`id\`, \`full_name\`, \`email\`, \`password_hash\`, \`role\`, \`branch_id\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE \`full_name\` = VALUES(\`full_name\`), \`role\` = VALUES(\`role\`), \`branch_id\` = VALUES(\`branch_id\`)`,
          [row.id, row.full_name, row.email, row.password_hash, row.role, row.branch_id, row.status]
        );

        await connection.execute(
          `INSERT INTO \`staff_authentication\` (\`employee_id\`, \`password_hash\`, \`failed_attempts\`)
           VALUES (?, ?, 0)
           ON DUPLICATE KEY UPDATE \`password_hash\` = VALUES(\`password_hash\`)`,
          [row.id, row.password_hash]
        );
        console.log(`[MIGRATION] Synchronized staff member #${row.id}: ${row.email} (${row.role})`);
      }
      sqlite.close();
    }

    console.log('[MIGRATION] Migration to MySQL completed successfully.');
  } finally {
    await connection.end();
  }
}

runMigration().catch((e) => {
  console.error('[MIGRATION-FATAL]', e);
  process.exit(1);
});
