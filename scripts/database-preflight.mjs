import mysql from 'mysql2/promise';
import {pathToFileURL} from 'node:url';

// Reports identifiers and repair guidance, never credentials, OTP metadata or
// customer details. All checks are read-only; no repair is guessed or applied.
export async function preflightDatabase(connection) {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    const [columns]=await connection.query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE()');
    const schema=new Map();for(const c of columns){if(!schema.has(c.TABLE_NAME)) schema.set(c.TABLE_NAME,new Set());schema.get(c.TABLE_NAME).add(c.COLUMN_NAME);}
    const has=(table,...names)=>schema.has(table)&&names.every(n=>schema.get(table).has(n));
    const findings=[];
    const check=async(code,sql,repair)=>{const [rows]=await connection.query(sql);if(rows.length)findings.push({code,records:rows,repair});};
    if(has('schema_migrations','status')) await check('interrupted-migrations',"SELECT version,status,statement_index FROM schema_migrations WHERE status<>'complete'",'Inspect statement-index DDL and the matching source checksum. Restore a verified snapshot or explicitly repair the interrupted migration; do not mark it complete blindly.');
    if(has('customer_accounts','account_id')&&has('savings_accounts','status')) await check('ownership-count',`SELECT a.id,COUNT(ca.customer_id) AS owners FROM savings_accounts a LEFT JOIN customer_accounts ca ON ca.account_id=a.id
      WHERE a.status IN ('active','inactive','pending') GROUP BY a.id HAVING owners NOT BETWEEN 1 AND 4`,'Review documentary ownership evidence; do not fabricate historical owners.');
    if(has('customer_accounts','owner_slot')) await check('ownership-slots','SELECT account_id,owner_slot,COUNT(*) AS count FROM customer_accounts GROUP BY account_id,owner_slot HAVING owner_slot IS NULL OR owner_slot NOT BETWEEN 1 AND 4 OR count>1','Assign unique slots 1–4 to existing documented owners before migration.');
    if(has('customers','agent_id')&&has('staff','branch_id')) await check('customer-assignment',`SELECT c.id FROM customers c LEFT JOIN staff s ON s.id=c.agent_id
      WHERE c.status IN ('active','inactive','pending') AND (s.id IS NULL OR s.role<>'agent' OR s.status<>'active' OR NOT(s.branch_id <=> c.branch_id))`,'Complete an independently approved reassignment; retain assignment history.');
    if(has('savings_accounts','agent_id')&&has('staff','branch_id')) await check('account-assignment',`SELECT a.id FROM savings_accounts a LEFT JOIN staff s ON s.id=a.agent_id
      WHERE a.status IN ('active','inactive','pending') AND (s.id IS NULL OR s.role<>'agent' OR s.status<>'active' OR NOT(s.branch_id <=> a.branch_id))`,'Reassign the open account and its owners through the approved workflow.');
    if(has('rates','min_age','effective_from')) await check('invalid-products',`SELECT id FROM rates WHERE min_age<0 OR max_age<min_age OR max_age>150
      OR minimum_deposit<0 OR effective_to<effective_from`,'Review product age, minimum and effective dates; retain contracted FD terms.');
    if(has('rate_history','effective_at')) await check('ambiguous-rate-boundaries','SELECT rate_id,effective_at,COUNT(*) AS count FROM rate_history GROUP BY rate_id,effective_at HAVING count>1','Resolve conflicting historical rate evidence explicitly before migration 005. Never delete or invent financial history automatically.');
    if(has('savings_accounts','opened_at')&&has('rate_history','effective_at')) await check('missing-opening-rate',`SELECT a.id,a.rate_id FROM savings_accounts a WHERE NOT EXISTS(SELECT 1 FROM rate_history h
      WHERE h.rate_id=a.rate_id AND h.effective_at<=DATE(a.opened_at+INTERVAL 330 MINUTE)-INTERVAL 330 MINUTE)`,'Import approved historical rate evidence covering the opening business day. Accrual remains blocked without it.');
    if(has('ledger_entries','amount')&&has('savings_accounts','balance')) await check('ledger-reconciliation',`SELECT a.id,a.balance,COALESCE(SUM(l.amount),0) AS ledger_balance
      FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>ledger_balance`,'Reconcile against source records. Legacy baselines require the explicitly reviewed opening-balance migration, never an unexplained adjustment.');
    if(has('staff_authentication','password_hash')&&has('staff','password_hash')) await check('credential-shadow-mismatch',`SELECT s.id FROM staff s JOIN staff_authentication a ON a.employee_id=s.id WHERE NOT(s.password_hash <=> a.password_hash)`,'staff.password_hash is authoritative. Review compatibility consumers before synchronizing or removing the shadow; never recover plaintext.');
    if(has('approvals','target_version')) await check('invalid-approval-links',`SELECT id FROM approvals WHERE
      (type LIKE 'customer.%' AND NOT(entity_id <=> customer_id)) OR (type LIKE 'account.%' AND NOT(entity_id <=> account_id)) OR
      (type LIKE 'fd.%' AND NOT(entity_id <=> fixed_deposit_id)) OR (type IN ('staff.create','staff.update','agent.reassign') AND NOT(entity_id <=> employee_id))
      OR (type IN ('branch.create','branch.update') AND NOT(entity_id <=> target_branch_id))`,'Reconcile the actual documented target; stale or ambiguous requests must be rejected and resubmitted.');
    if(has('ownership_history','valid_from')&&has('ledger_entries','created_at')) await check('missing-ownership-history',`SELECT DISTINCT l.account_id FROM ledger_entries l WHERE NOT EXISTS(SELECT 1 FROM ownership_history h
      WHERE h.account_id=l.account_id AND h.valid_from<=l.created_at AND (h.valid_to IS NULL OR l.created_at<h.valid_to))`,'Import documented historical ownership intervals. Customer cash-flow reports cannot infer missing historical membership.');
    if(has('job_claims','lease_until')) await check('abandoned-jobs',"SELECT job,boundary,attempt,run_id FROM job_claims WHERE status='running' AND lease_until<=UTC_TIMESTAMP(3)",'Allow the bounded claim/recovery path to retry; inspect exhausted attempts before an explicit retry decision.');
    if(has('job_runs','owner_token')) await check('legacy-running-jobs',"SELECT id,job,boundary FROM job_runs WHERE status='running' AND owner_token IS NULL",'Unclaimed legacy job outcomes need operator inspection. Financial idempotency is preserved; never assume these jobs completed.');
    return {read_only:true,findings,table_count:schema.size};
  } finally {await connection.rollback();}
}

export async function assertForwardDataSafe(connection) {
  const report=await preflightDatabase(connection);
  const blocked=report.findings.filter(f=>f.code==='ambiguous-rate-boundaries');
  if(blocked.length) throw new Error('Forward migration preflight refused: '+blocked.map(f=>f.code+': '+f.repair).join('; '));
  return report;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const {PREFLIGHT_DB_HOST:host,PREFLIGHT_DB_USER:user,PREFLIGHT_DB_PASSWORD:password,PREFLIGHT_DB_NAME:database}=process.env;
  if(!host||!user||password===undefined||!database) throw new Error('Explicit read-only PREFLIGHT_DB_HOST/USER/PASSWORD/NAME are required.');
  const c=await mysql.createConnection({host,user,password,database,port:Number(process.env.PREFLIGHT_DB_PORT||3306),dateStrings:true,timezone:'Z'});
  try {const report=await preflightDatabase(c);console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;} finally {await c.end();}
}
