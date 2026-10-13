import mysql from 'mysql2/promise';
import {createPostgresPool} from '../lib/postgres.mjs';
import {preflightPostgres} from './preflight-postgres.mjs';
import {pathToFileURL} from 'node:url';

const identifier=name=>{if(!/^[a-z][a-z0-9_]*$/.test(name))throw new Error('Unsupported import identifier.');return '"'+name+'"';};
const referenceTables=new Set(['role_catalog','permission_catalog','role_permissions','database_guards']);

/** One consistent source snapshot, one atomic destination transaction. Import
 * accepts only the canonical versioned schema and a migrated EMPTY destination.
 * Sources remain read-only. Generated columns are recomputed and IDs preserved.
 */
export async function importMySqlToPostgres(source,target,{maxRows=100000}={}) {
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100000)throw new Error('Unsupported bounded import size.');
  await source.query("SET time_zone='+00:00'");
  await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  let destinationStarted=false;
  try{
    const [[migrations]]=await source.query("SELECT count(*) AS n FROM schema_migrations WHERE status='complete'");
    if(Number(migrations.n)!==11)throw new Error('Source must have all 11 canonical MySQL migrations. Upgrade and preflight the source before importing.');
    const {rows:versions}=await target.query("SELECT version FROM schema_migrations WHERE status='complete'");
    if(versions.length!==13)throw new Error('Destination must have all 13 PostgreSQL migrations.');
    const {rows:tables}=await target.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename");
    const {rows:columns}=await target.query("SELECT table_name,column_name,is_generated FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    const snapshots=[];let total=0;
    for(const {tablename:table} of tables){
      const [present]=await source.query('SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
      const available=new Set(present.map(r=>r.COLUMN_NAME));
      const names=columns.filter(c=>c.table_name===table&&c.is_generated==='NEVER').map(c=>c.column_name);
      if(names.some(n=>!available.has(n)))throw new Error('Source columns differ from the canonical PostgreSQL import contract: '+table);
      const [[count]]=await source.query('SELECT count(*) AS n FROM `'+table+'`');total+=Number(count.n);
      if(total>maxRows)throw new Error('Import exceeds the bounded 100,000-row adapter. Use a reviewed streaming migration for a larger database.');
      const [rows]=await source.query('SELECT '+names.map(n=>'`'+n+'`').join(',')+' FROM `'+table+'`');
      snapshots.push({table,names,rows});
    }
    await target.query('BEGIN');destinationStarted=true;
    // Fixed order locks exclude concurrent application writes during inspection.
    await target.query('LOCK TABLE '+tables.map(r=>identifier(r.tablename)).join(',')+' IN EXCLUSIVE MODE');
    for(const {tablename:table} of tables)if(!referenceTables.has(table)){
      if(Number((await target.query('SELECT count(*) AS n FROM '+identifier(table))).rows[0].n))throw new Error('Import destination contains application data. Existing records were preserved.');
    }
    const {rows:foreignKeys}=await target.query(`SELECT c.conname,t.relname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='f'`);
    for(const fk of foreignKeys)await target.query('ALTER TABLE '+identifier(fk.relname)+' ALTER CONSTRAINT '+identifier(fk.conname)+' DEFERRABLE INITIALLY IMMEDIATE');
    await target.query('SET CONSTRAINTS ALL DEFERRED');
    for(const {tablename:table} of tables)await target.query('ALTER TABLE '+identifier(table)+' DISABLE TRIGGER USER');
    // Replace the default catalog rather than unioning grants: an intentionally
    // revoked source permission must not be silently reintroduced at import.
    for(const table of ['role_permissions','permission_catalog','role_catalog','database_guards'])await target.query('DELETE FROM '+identifier(table));
    for(const {table,names,rows} of snapshots){
      // Static catalogs/guard keys installed by migrations are reconciled with
      // the source. All operational tables were verified empty under locks.
      const sql='INSERT INTO '+identifier(table)+'('+names.map(identifier).join(',')+') VALUES('+names.map((_,i)=>'$'+(i+1)).join(',')+')';
      for(const row of rows)await target.query(sql,names.map(n=>row[n]));
      if(!referenceTables.has(table)){
        const count=Number((await target.query('SELECT count(*) AS n FROM '+identifier(table))).rows[0].n);
        if(count!==rows.length)throw new Error('Imported row count mismatch: '+table);
      }
    }
    await target.query('SET CONSTRAINTS ALL IMMEDIATE');
    for(const fk of foreignKeys)await target.query('ALTER TABLE '+identifier(fk.relname)+' ALTER CONSTRAINT '+identifier(fk.conname)+' NOT DEFERRABLE');
    for(const {tablename:table} of tables){
      await target.query('ALTER TABLE '+identifier(table)+' ENABLE TRIGGER USER');
      if(columns.some(c=>c.table_name===table&&c.column_name==='id'&&c.is_generated==='NEVER')){
        const sequence=(await target.query('SELECT pg_get_serial_sequence($1,$2) AS name',[table,'id'])).rows[0].name;
        if(sequence)await target.query(`SELECT setval($1,COALESCE((SELECT MAX(id) FROM ${identifier(table)}),1),(SELECT count(*)>0 FROM ${identifier(table)}))`,[sequence]);
      }
    }
    const mismatches=(await target.query(`SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(SUM(l.amount),0)`)).rows;
    if(mismatches.length)throw new Error('Imported ledger does not reconcile. Destination transaction was rolled back.');
    const activeOwners=(await target.query(`SELECT a.id FROM savings_accounts a LEFT JOIN customer_accounts ca ON ca.account_id=a.id WHERE a.status='active' GROUP BY a.id HAVING count(ca.customer_id) NOT BETWEEN 1 AND 4`)).rows;
    if(activeOwners.length)throw new Error('Imported active account ownership is invalid. Destination transaction was rolled back.');
    await target.query('COMMIT');destinationStarted=false;
    const report=await preflightPostgres(target);
    return {source_read_only:true,rows:total,tables:snapshots.length,preflight:report};
  }catch(error){if(destinationStarted)await target.query('ROLLBACK');throw error;}
  finally{await source.rollback();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const envFile=process.argv.find(a=>a.startsWith('--env-file='))?.slice(11);if(envFile)process.loadEnvFile(envFile);
  const run=async()=>{
    const {SOURCE_MYSQL_HOST:host,SOURCE_MYSQL_USER:user,SOURCE_MYSQL_PASSWORD:password,SOURCE_MYSQL_NAME:database,MIGRATION_DATABASE_URL:targetURL}=process.env;
    if(!host||!user||password===undefined||!database||!targetURL)throw new Error('Explicit SOURCE_MYSQL_HOST/USER/PASSWORD/NAME and MIGRATION_DATABASE_URL required. No runtime database fallback is allowed.');
    if(new URL(targetURL).hostname.includes('-pooler.'))throw new Error('Import requires the direct PostgreSQL endpoint.');
    const source=await mysql.createConnection({host,user,password,database,port:Number(process.env.SOURCE_MYSQL_PORT||3306),dateStrings:true}),pool=createPostgresPool(targetURL),target=await pool.connect();
    try{console.log(JSON.stringify(await importMySqlToPostgres(source,target),null,2));}finally{await source.end();target.release();await pool.end();}
  };run().catch(error=>{console.error(error.message);process.exitCode=1;});
}
