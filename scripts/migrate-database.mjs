import { upgradeColumns } from '../database/migrations/003-upgrade.mjs';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Each SQL file uses a line containing -- statement-break for stored programs.
export function statements(sql) {
  return sql.includes('-- statement-break') ? sql.split('-- statement-break').map(s=>s.trim()).filter(Boolean)
    : sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
}
const files = ['001-auth.sql', '002-banking.sql', '003-integrity.sql'];
/** @param {import('mysql2/promise').Connection} connection
 * @param {{openingBalanceActorId?: number|null}} options */
export async function migrateDatabase(connection, {openingBalanceActorId=null}={}) {
  await connection.query("SET time_zone = '+00:00'");
  const [[locked]] = await connection.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':migrations'), 30) AS acquired");
  if (Number(locked.acquired) !== 1) throw new Error('Could not acquire migration lock.');
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL,
      status ENUM('running','complete','failed') NOT NULL, statement_index INT NOT NULL DEFAULT 0,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP NULL,
      error_text VARCHAR(1000) NULL) ENGINE=InnoDB`);
    for (const file of files) {
      const sql = (await readFile(new URL('../database/migrations/' + file, import.meta.url), 'utf8')).replaceAll('\r\n','\n');
      const upgradeSource = file==='003-integrity.sql' ? (await readFile(new URL('../database/migrations/003-upgrade.mjs',import.meta.url),'utf8')).replaceAll('\r\n','\n') : '';
      const checksum = createHash('sha256').update(sql+upgradeSource).digest('hex');
      const [[existing]] = await connection.query('SELECT * FROM schema_migrations WHERE version=?', [file]);
      if (existing && existing.checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
      if (existing?.status === 'complete') continue;
      if (existing) throw new Error(`Migration ${file} interrupted/failed at statement ${existing.statement_index}. Inspect committed DDL before explicit repair; automatic replay is unsafe.`);
      await connection.query("INSERT INTO schema_migrations(version,checksum,status) VALUES (?,?,'running')",[file,checksum]);
      try {
        if (file === '003-integrity.sql') await upgradeColumns(connection,openingBalanceActorId);
        const commands=statements(sql);
        for (const [index,command] of commands.entries()) {
          await connection.query('UPDATE schema_migrations SET statement_index=? WHERE version=?',[index,file]);
          await connection.query(command);
        }
        await connection.query("UPDATE schema_migrations SET status='complete',completed_at=CURRENT_TIMESTAMP WHERE version=?",[file]);
      } catch(error) {
        await connection.query("UPDATE schema_migrations SET status='failed',error_text=? WHERE version=?",[String(error.message).slice(0,1000),file]);
        throw error;
      }
    }
  } finally { await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':migrations'))"); }
}


export async function runMigration() {
  const {MIGRATION_DB_HOST:host,MIGRATION_DB_USER:user,MIGRATION_DB_PASSWORD:password,MIGRATION_DB_NAME:database}=process.env;
  if (!host || !user || password===undefined || !database) throw new Error('Explicit MIGRATION_DB_HOST/USER/PASSWORD/NAME required. Runtime credentials are not migration credentials.');
  const c=await mysql.createConnection({host,user,password,database,port:Number(process.env.MIGRATION_DB_PORT||3306)});
  try { await migrateDatabase(c,{openingBalanceActorId:process.env.MIGRATION_OPENING_BALANCE_ACTOR_ID?Number(process.env.MIGRATION_OPENING_BALANCE_ACTOR_ID):null}); } finally { await c.end(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runMigration().catch(error=>{console.error(error.message);process.exitCode=1;});
}
