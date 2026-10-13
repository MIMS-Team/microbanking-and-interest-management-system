import {randomBytes} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPostgresPool} from '../lib/postgres.mjs';
const identifier=name=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(name??''))throw new Error('Use a lowercase PostgreSQL role name.');return '"'+name+'"';};
const writable=['branches','staff','staff_authentication','employee_sessions','otp_challenges','otp_resend_reservations','authentication_audit','customers','rates','rate_history','savings_accounts','customer_accounts','fixed_deposits','approvals','money_operations','ledger_entries','interest_runs','interest_credits','interest_accruals','audit_logs','ownership_history','assignment_history','branch_hours','branch_holidays','job_runs','banking_approval_challenges','banking_approval_limits','database_guards','job_claims','backup_inventory','http_rate_buckets','http_rate_events','employee_invitations','employee_notifications','action_receipts'];
export async function grantPostgresApplication(client,role) {
  const name=identifier(role);
  await client.query('GRANT USAGE ON SCHEMA public TO '+name);
  await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO '+name);
  await client.query('GRANT INSERT,UPDATE,DELETE ON '+writable.map(identifier).join(',')+' TO '+name);
  await client.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO '+name);
  await client.query('GRANT EXECUTE ON FUNCTION permission_grant_locked(bigint,text) TO '+name);
  // No CREATE, TRUNCATE, ownership, migration writes, or administrative grants.
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
}
export async function provisionPostgresApplication({connectionString,applicationURL,role='mims_application'}) {
  const pool=createPostgresPool(connectionString),client=await pool.connect();
  const password=randomBytes(32).toString('hex');
  try {
    if((await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)throw new Error('Application role already exists. Existing credentials and grants were preserved.');
    await client.query('BEGIN');
    try {
      await client.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      await grantPostgresApplication(client,role);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}
    const url=new URL(applicationURL);url.username=role;url.password=password;
    return url.toString();
  }finally{client.release();await pool.end();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--env-file=.env.local'))process.loadEnvFile('.env.local');
  const run=async()=>{
    if(!process.env.MIGRATION_DATABASE_URL||!process.env.DATABASE_URL)throw new Error('Explicit MIGRATION_DATABASE_URL and DATABASE_URL required.');
    if(process.argv.includes('--grant-existing')){
      const pool=createPostgresPool(process.env.MIGRATION_DATABASE_URL),client=await pool.connect();
      try{await grantPostgresApplication(client,process.env.POSTGRES_APP_ROLE||decodeURIComponent(new URL(process.env.DATABASE_URL).username));console.log('Existing application role grants updated. Credentials were preserved.');}finally{client.release();await pool.end();}
      return;
    }
    const url=await provisionPostgresApplication({connectionString:process.env.MIGRATION_DATABASE_URL,applicationURL:process.env.DATABASE_URL,role:process.env.POSTGRES_APP_ROLE||'mims_application'});
    if(process.argv.includes('--write-local-env')){
      const source=await readFile('.env.local','utf8');
      await writeFile('.env.local',source.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+JSON.stringify(url)),{mode:0o600});
      console.log('Restricted application role created; .env.local updated. Credentials were not printed.');
    }else{
      await writeFile('.data/postgres-application.env','DATABASE_URL='+JSON.stringify(url)+'\n',{mode:0o600,flag:'wx'});
      console.log('Restricted application role created. Connection saved to .data/postgres-application.env.');
    }
  };
  run().catch(()=>{console.error('PostgreSQL role setup failed. Check explicit owner credentials, existing role names and permissions. Credentials were not printed.');process.exitCode=1;});
}
