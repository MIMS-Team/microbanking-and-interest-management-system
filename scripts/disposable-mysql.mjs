import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {migrateDatabase} from './migrate-database.mjs';
const ownedDatabases=new WeakSet();
export function isOwnedDatabase(value) {return ownedDatabases.has(value);}

export async function disposableDatabase({migrate=true}={}) {
  const {TEST_MYSQL_HOST:host,TEST_MYSQL_USER:user,TEST_MYSQL_PASSWORD:password}=process.env;
  if (!host || !user || password===undefined) throw new Error('Required disposable MySQL verification needs TEST_MYSQL_HOST/USER/PASSWORD. Shared DB_* settings are never used.');
  const config={host,user,password,port:Number(process.env.TEST_MYSQL_PORT||3306),dateStrings:true,timezone:'Z'};
  const admin=await mysql.createConnection(config);
  const name='mims_task_'+randomBytes(12).toString('hex');
  let owned=false;
  let connection;
  let handle;
  const close=async()=>{
    await connection?.end();
    if (owned) {await admin.query('DROP DATABASE `'+name+'`');owned=false;}
    if(handle) ownedDatabases.delete(handle);
    await admin.end();
  };
  try {
    await admin.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    owned=true;
    connection=await mysql.createConnection({...config,database:name});
    await connection.query("SET time_zone = '+00:00'");
    if(migrate) await migrateDatabase(connection);
    handle={name,connection,config:{...config,database:name},close,
      environment: {DB_HOST:host,DB_PORT:String(config.port),DB_USER:user,DB_PASSWORD:password,DB_NAME:name,MIMS_AUTH_DB_ADAPTER:'mysql'}};
    ownedDatabases.add(handle);
    return handle;
  } catch(error) {await close();throw error;}
}
