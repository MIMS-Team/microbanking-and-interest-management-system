import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPostgresPool} from '../lib/postgres.mjs';

export const postgresMigrationDirectory=new URL('../database/postgres/',import.meta.url);
export async function migratePostgres(client) {
  // Session advisory locks must use the direct endpoint, not transaction pooling.
  await client.query("SELECT pg_advisory_lock(hashtext(current_database()),hashtext('mims:postgres:migrations'))");
  try {
    const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'")).rows;
    const existing=(await client.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name;
    if(!existing&&tables.length)throw new Error('Migration requires an empty PostgreSQL database or an existing versioned MIMS schema. Existing tables were preserved.');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,
      status text NOT NULL CHECK(status='complete'),completed_at timestamp NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'))`);
    const files=(await readdir(postgresMigrationDirectory)).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort();
    for(const file of files) {
      const sql=await readFile(new URL(file,postgresMigrationDirectory),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
      const previous=(await client.query('SELECT checksum,status FROM schema_migrations WHERE version=$1',[file])).rows[0];
      if(previous){if(previous.checksum!==checksum||previous.status!=='complete')throw new Error('PostgreSQL migration checksum/status mismatch: '+file);continue;}
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version,checksum,status) VALUES($1,$2,'complete')",[file,checksum]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw new Error('PostgreSQL migration failed: '+file,{cause:error});}
    }
    return files.length;
  } finally {await client.query("SELECT pg_advisory_unlock(hashtext(current_database()),hashtext('mims:postgres:migrations'))");}
}

export async function runPostgresMigration() {
  const url=process.env.MIGRATION_DATABASE_URL;
  if(!url)throw new Error('Set MIGRATION_DATABASE_URL explicitly. Runtime credentials are never used for migrations.');
  if(new URL(url).hostname.includes('-pooler.'))throw new Error('MIGRATION_DATABASE_URL must use the direct PostgreSQL endpoint.');
  const pool=createPostgresPool(url),client=await pool.connect();
  try {console.log('PostgreSQL migrations verified:',await migratePostgres(client));}finally{client.release();await pool.end();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--env-file=.env.local'))process.loadEnvFile('.env.local');
  runPostgresMigration().catch(error=>{console.error(error.message);process.exitCode=1;});
}
