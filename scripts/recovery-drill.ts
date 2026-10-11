import {disposableDatabase} from './disposable-mysql.mjs';
import {restoreDisposableBackup} from './database-backup.mjs';
import {preflightDatabase} from './database-preflight.mjs';

const file=process.env.RECOVERY_BACKUP_FILE,key=process.env.RECOVERY_BACKUP_KEY;
if(!file||!key) throw new Error('Explicit RECOVERY_BACKUP_FILE and separately supplied RECOVERY_BACKUP_KEY are required.');
const owned=await disposableDatabase({migrate:false});
try {
  await restoreDisposableBackup(owned,file,{key,mysqlBinary:process.env.MYSQL_BINARY||'mysql'});
  const [versions]=await owned.connection.query('SELECT version,checksum,status FROM schema_migrations ORDER BY version');
  const [[counts]]=await owned.connection.query(`SELECT (SELECT COUNT(*) FROM staff) AS employees,
    (SELECT COUNT(*) FROM employee_sessions) AS sessions,(SELECT COUNT(*) FROM approvals) AS approvals,
    (SELECT COUNT(*) FROM ledger_entries) AS ledger_entries,(SELECT SUM(balance) FROM savings_accounts) AS balance`);
  const report=await preflightDatabase(owned.connection);
  console.log(JSON.stringify({target:owned.name,versions,counts,preflight:report},null,2));
  if(report.findings.some((f:{code:string})=>f.code==='ledger-reconciliation'||f.code==='interrupted-migrations')) throw new Error('Recovery verification failed; review the reported identifiers.');
} finally {await owned.close();}
