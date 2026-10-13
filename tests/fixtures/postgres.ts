import {disposablePostgres} from '../../scripts/disposable-postgres.mjs';
import {getDb} from '../../lib/db';
import {closePoolForTest} from '../../lib/server/db';
import {seedBankingFixture,fixturePolicies} from './banking-seed';
export async function postgresFixture(seed=true) {
  const owned=await disposablePostgres();
  Object.assign(process.env,owned.environment,fixturePolicies);
  const database=await getDb();
  try {if(seed)await database.transaction(seedBankingFixture);}catch(error){await closePoolForTest();await owned.close();throw error;}
  return {database,owned,close:async()=>{await closePoolForTest();await owned.close();},reset:async()=>{
    const tables=(await owned.connection.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','role_catalog','permission_catalog','role_permissions','database_guards')")).rows;
    await owned.connection.query('TRUNCATE '+tables.map(r=>'"'+r.tablename+'"').join(',')+' RESTART IDENTITY CASCADE');
  }};
}
