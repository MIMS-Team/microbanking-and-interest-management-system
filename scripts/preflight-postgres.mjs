import {pathToFileURL} from 'node:url';
import {createPostgresPool} from '../lib/postgres.mjs';
import {postgresMigrationDirectory} from './migrate-postgres.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function preflightPostgres(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    const findings=[];
    const check=async(code,sql)=>{const rows=(await client.query(sql)).rows;if(rows.length)findings.push({code,records:rows});};
    const migrations=(await client.query('SELECT version,checksum,status FROM schema_migrations')).rows;
    for(const file of (await readdir(postgresMigrationDirectory)).filter(n=>/^\d{3}-.+\.sql$/.test(n))){
      const checksum=createHash('sha256').update(await readFile(new URL(file,postgresMigrationDirectory))).digest('hex');
      if(!migrations.some(r=>r.version===file&&r.status==='complete'&&r.checksum===checksum))findings.push({code:'migration-mismatch',version:file});
    }
    await check('disabled-protections',"SELECT c.relname AS table,t.tgname AS trigger FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled<>'O'");
    await check('ledger-reconciliation',`SELECT a.id,a.balance,COALESCE(SUM(l.amount),0) AS ledger_balance FROM savings_accounts a
      LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(SUM(l.amount),0)`);
    await check('ownership-count',`SELECT a.id,count(ca.customer_id) AS owners FROM savings_accounts a LEFT JOIN customer_accounts ca ON ca.account_id=a.id
      WHERE a.status IN ('active','inactive') GROUP BY a.id HAVING count(ca.customer_id) NOT BETWEEN 1 AND 4`);
    await check('credential-shadow-mismatch','SELECT s.id FROM staff s JOIN staff_authentication a ON a.employee_id=s.id WHERE s.password_hash IS DISTINCT FROM a.password_hash');
    await check('customer-assignment',`SELECT c.id FROM customers c JOIN staff s ON s.id=c.agent_id WHERE c.status IN ('active','inactive','pending')
      AND (s.role<>'agent' OR s.status<>'active' OR s.branch_id IS DISTINCT FROM c.branch_id)`);
    await check('missing-opening-rate',`SELECT a.id FROM savings_accounts a WHERE NOT EXISTS(SELECT 1 FROM rate_history h
      WHERE h.rate_id=a.rate_id AND h.effective_at<=(a.opened_at+INTERVAL '330 minutes')::date-INTERVAL '330 minutes')`);
    await check('abandoned-jobs',"SELECT job,boundary,attempt,run_id FROM job_claims WHERE status='running' AND lease_until<=clock_timestamp() AT TIME ZONE 'UTC'");
    return {read_only:true,migrations:migrations.length,findings};
  }finally{await client.query('ROLLBACK');}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--env-file=.env.local'))process.loadEnvFile('.env.local');
  const run=async()=>{
    if(!process.env.PREFLIGHT_DATABASE_URL)throw new Error('Explicit read-only PREFLIGHT_DATABASE_URL required.');
    const pool=createPostgresPool(process.env.PREFLIGHT_DATABASE_URL),client=await pool.connect();
    try{const report=await preflightPostgres(client);console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;}finally{client.release();await pool.end();}
  };run().catch(error=>{console.error(error.message);process.exitCode=1;});
}
