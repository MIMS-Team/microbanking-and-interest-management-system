import {randomBytes} from 'node:crypto';
import {createPostgresPool} from '../lib/postgres.mjs';
import {migratePostgres} from './migrate-postgres.mjs';
const ownedTargets=new WeakSet();
export const isOwnedPostgres=value=>ownedTargets.has(value);
export async function disposablePostgres({migrate=true}={}) {
  const url=process.env.TEST_DATABASE_URL;
  if(!url)throw new Error('TEST_DATABASE_URL must explicitly select a disposable PostgreSQL server. DATABASE_URL is never used for tests.');
  if(new URL(url).hostname.includes('-pooler.'))throw new Error('PostgreSQL test provisioning requires a direct connection.');
  const admin=createPostgresPool(url),name='mims_task_'+randomBytes(12).toString('hex');
  let created=false,pool,client;
  const close=async()=>{client?.release();client=null;await pool?.end();if(created){await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');created=false;}await admin.end();};
  try {
    await admin.query('CREATE DATABASE "'+name+'"');created=true;
    const target=new URL(url);target.pathname='/'+name;
    pool=createPostgresPool(target.toString());client=await pool.connect();
    if(migrate)await migratePostgres(client);
    const result={name,connection:client,pool,url:target.toString(),environment:{DATABASE_URL:target.toString(),MIMS_AUTH_DB_ADAPTER:'postgres'},close,
      retainForDemo:async()=>{client.release();client=null;await pool.end();created=false;await admin.end();}};
    Object.freeze(result.environment);Object.freeze(result);ownedTargets.add(result);return result;
  }catch(error){await close();throw error;}
}
