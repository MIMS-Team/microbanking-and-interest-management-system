import {randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import {pathToFileURL} from 'node:url';

const identifier=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_]{1,64}$/.test(value))throw new Error('Invalid database/principal identifier.');return '`'+value+'`';};
// Called explicitly by a database administrator. Never invoked by migration,
// application startup or seeding. Credentials must come from a secret manager.
export async function provisionPrincipals(admin,{database,host='localhost',migration,application,backup}) {
  identifier(database);
  if(!/^[a-zA-Z0-9_.:-]+$/.test(host)) throw new Error('Use a specific database client host. Wildcard hosts are refused.');
  const schema=identifier(database);
  const account=p=>{identifier(p.user);if(typeof p.password!=='string'||p.password.length<16)throw new Error('Explicit strong principal credentials required.');return admin.escape(p.user)+'@'+admin.escape(host);};
  for(const p of [migration,application,backup]) await admin.query('CREATE USER '+account(p)+' IDENTIFIED BY '+admin.escape(p.password));
  const migrator=account(migration),app=account(application),dump=account(backup);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX,REFERENCES,TRIGGER,CREATE VIEW,SHOW VIEW,CREATE ROUTINE,ALTER ROUTINE,EXECUTE ON ${schema}.* TO ${migrator}`);
  await admin.query(`GRANT SELECT,SHOW VIEW ON ${schema}.* TO ${app}`);
  // Append-only tables get INSERT and only PK UPDATE for locking reads. Their
  // triggers reject even identity updates, so a grant never permits rewriting.
  const append=['ledger_entries','money_operations','audit_logs','authentication_audit','rate_history','interest_accruals','interest_credits'];
  for(const table of append) await admin.query(`GRANT INSERT,UPDATE (id) ON ${schema}.${identifier(table)} TO ${app}`);
  const mutable=['branches','staff','staff_authentication','customers','savings_accounts','customer_accounts','fixed_deposits','approvals','rates','employee_sessions','otp_challenges','otp_resend_reservations','banking_approval_challenges','banking_approval_limits','interest_runs','job_runs','job_claims'];
  const [tables]=await admin.query('SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=?',[database]);
  const present=new Set(tables.map(t=>t.TABLE_NAME));
  for(const table of mutable) if(present.has(table)) await admin.query(`GRANT INSERT,UPDATE,DELETE ON ${schema}.${identifier(table)} TO ${app}`);
  await admin.query(`GRANT INSERT,UPDATE (name) ON ${schema}.database_guards TO ${app}`);
  for(const table of ['ownership_history','assignment_history']) await admin.query(`GRANT INSERT,UPDATE (valid_to) ON ${schema}.${identifier(table)} TO ${app}`);
  await admin.query(`GRANT INSERT,UPDATE (deleted_at,exported_at) ON ${schema}.backup_inventory TO ${app}`);
  await admin.query(`GRANT SELECT,SHOW VIEW,TRIGGER,EXECUTE ON ${schema}.* TO ${dump}`);
  // SHOW_ROUTINE is necessary for --routines on MySQL 8.0.20+, but reveals
  // routine definitions globally. This application has no stored routines:
  // backups deliberately omit --routines under the restricted backup account.
  for(const table of ['job_runs','job_claims','database_guards']) await admin.query(`GRANT INSERT,UPDATE ON ${schema}.${identifier(table)} TO ${dump}`);
  await admin.query(`GRANT INSERT,UPDATE (deleted_at,exported_at) ON ${schema}.backup_inventory TO ${dump}`);
}
export function fictionalPrincipals() {
  const suffix=randomBytes(6).toString('hex');
  const make=role=>({user:'mims_'+role+'_'+suffix,password:randomBytes(24).toString('hex')});
  return {migration:make('migration'),application:make('application'),backup:make('backup')};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const run=async()=>{
  const {PRINCIPALS_DB_HOST:host,PRINCIPALS_DB_USER:user,PRINCIPALS_DB_PASSWORD:password,PRINCIPALS_DB_NAME:database,PRINCIPAL_CLIENT_HOST:clientHost}=process.env;
  if(!host||!user||password===undefined||!database||!clientHost) throw new Error('Explicit PRINCIPALS_DB_* administrator settings and a specific PRINCIPAL_CLIENT_HOST are required.');
  const admin=await mysql.createConnection({host,user,password,database,port:Number(process.env.PRINCIPALS_DB_PORT||3306)});
  try {
    const principal=prefix=>({user:process.env[prefix+'_DB_USER'],password:process.env[prefix+'_DB_PASSWORD']});
    await provisionPrincipals(admin,{database,host:clientHost,migration:principal('MIGRATION'),application:principal('APP'),backup:principal('BACKUP')});
    console.log('Separate database principals provisioned. No credentials are logged.');
  } finally {await admin.end();}
  };
  await run().catch(error=>{
    const code=/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'CONFIGURATION';
    console.error('Database principal provisioning failed ('+code+'). Review operator grants, configuration and existing account names. Credentials are not logged.');
    process.exitCode=1;
  });
}
