import { disposableDatabase } from '../../scripts/disposable-mysql.mjs';
import { getDb } from '../../lib/db';
import { closePoolForTest } from '../../lib/server/db';
import { seedBankingFixture, fixturePolicies } from './banking-seed';

export async function bankingFixture(seed=true) {
  const owned=await disposableDatabase();
  Object.assign(process.env,owned.environment,fixturePolicies);
  const database=await getDb();
  try {if(seed) await database.transaction(seedBankingFixture);}
  catch(error) {await closePoolForTest();await owned.close();throw error;}
  return {database,owned,close:async()=>{await closePoolForTest();await owned.close();},reset:async()=>{
    // Only the connection returned by the owned CREATE DATABASE reaches here.
    const [tables]=await owned.connection!.query<import('mysql2').RowDataPacket[]>("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME<>'schema_migrations'");
    await owned.connection!.query('SET FOREIGN_KEY_CHECKS=0');
    try {for(const row of tables) await owned.connection!.query('TRUNCATE TABLE `'+row.TABLE_NAME+'`');}
    finally {await owned.connection!.query('SET FOREIGN_KEY_CHECKS=1');}
  }};
}
