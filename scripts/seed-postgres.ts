import {writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {disposablePostgres} from './disposable-postgres.mjs';
import {seedBankingFixture} from '../tests/fixtures/banking-seed';
import {getDb} from '../lib/db';
import {closePoolForTest} from '../lib/server/db';
import {provisionPostgresApplication} from './postgres-principals.mjs';
const envFile=process.argv.find(a=>a.startsWith('--env-file='))?.slice(11);
if(envFile)process.loadEnvFile(envFile);
// Like the MySQL demo command, this always creates a NEW random database.
// It never falls back to DATABASE_URL and never inserts weak demo credentials
// into the connected Neon application database.
const owned=await disposablePostgres();
Object.assign(process.env,owned.environment);
try {
  const db=await getDb();await db.transaction(async tx=>{
    await seedBankingFixture(tx);
    await tx.query("UPDATE customers SET full_name=CONCAT('Fictional Customer ',id),email=CONCAT('customer',id,'@example.test'),address='Fictional test address'");
    await tx.query("UPDATE staff SET full_name=CONCAT('Fictional ',role,' ',id)");
    for(let day=0;day<7;day++)await tx.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) SELECT id,$1,'00:00:00','23:59:59' FROM branches",[day]);
  });
  const url=await provisionPostgresApplication({connectionString:owned.url,applicationURL:owned.url,role:'mims_demo_'+randomUUID().replaceAll('-','').slice(0,16)});
  const output='.data/disposable-postgres-'+randomUUID()+'.env';await mkdir('.data',{recursive:true});
  await writeFile(output,'DATABASE_URL='+JSON.stringify(url)+'\nMIMS_AUTH_DB_ADAPTER=postgres\n',{mode:0o600,flag:'wx'});
  await closePoolForTest();await owned.retainForDemo();
  console.log('Fictional PostgreSQL demo ready. Connection file:',output);
  console.log('Run npm run dev:full -- --env-file='+output);
  console.log('Demo logins: admin@btrust.local, higher@btrust.local, manager@btrust.local, agent@btrust.local. Password: Demo@12345');
}catch(error){await closePoolForTest();await owned.close();throw error;}
