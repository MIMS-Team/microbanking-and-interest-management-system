import {provisionPrincipals,fictionalPrincipals} from './database-principals.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {disposableDatabase} from './disposable-mysql.mjs';
import {seedBankingFixture} from '../tests/fixtures/banking-seed';
import {getDb} from '../lib/db';
import {closePoolForTest} from '../lib/server/db';

// Always CREATE a random database. No target-name argument and no runtime
// DB_* fallback: this command cannot seed an existing/shared database.
const output=process.env.MIMS_LOCAL_SEED_ENV_FILE
  ? path.resolve(process.env.MIMS_LOCAL_SEED_ENV_FILE)
  : path.resolve('.data','disposable-demo-'+randomUUID()+'.env');
if (process.env.MIMS_LOCAL_SEED_ENV_FILE && output !== path.resolve('.data','local-demo.env')) {
  throw new Error('Automatic local demo settings must be written to .data/local-demo.env.');
}
try {await import('node:fs/promises').then(fs=>fs.access(output));throw new Error('A demo settings file already exists; preserve it and choose a new explicit test session.');} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
const owned=await disposableDatabase();
Object.assign(process.env,owned.environment);
const db=await getDb();
try {
  await db.transaction(async tx=>{
    await seedBankingFixture(tx);
    await tx.query("UPDATE customers SET full_name=CONCAT('Fictional Customer ',id),email=CONCAT('customer',id,'@example.test'),address='Fictional test address'");
    await tx.query("UPDATE staff SET full_name=CONCAT('Fictional ',role,' ',id)");
    // An explicitly fictional always-open test calendar, never a deployment
    // assumption. Real financial policy selections remain unset in this file.
    for(let day=0;day<7;day++) await tx.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) SELECT id,$1,'00:00:00','23:59:59' FROM branches",[day]);
  });
  await mkdir('.data',{recursive:true});
  const principals=fictionalPrincipals();
  const [[client]]=await owned.connection.query<import('mysql2').RowDataPacket[]>("SELECT SUBSTRING_INDEX(USER(),'@',-1) AS host");
  await provisionPrincipals(owned.connection,{database:owned.name,host:client.host,...principals});
  const environment={...owned.environment,DB_USER:principals.application.user,DB_PASSWORD:principals.application.password};
  const file=output;
  await writeFile(file,Object.entries(environment).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600,flag:'wx'});
  console.log('Fictional database seeded:',owned.name);
  console.log('Local connection settings:',file);
  console.log('Logins: admin@btrust.local, higher@btrust.local, manager@btrust.local, agent@btrust.local');
  console.log('Dummy password: Demo@12345. npm run dev:full starts the local OTP inbox.');
  console.log('Financial policy and production email configuration were not changed.');
  console.log('Delete this disposable database explicitly when finished testing.');
  await closePoolForTest();await owned.retainForDemo();
  // Deliberately retain ONLY this newly created fictional demo database.
} catch(error) {await closePoolForTest();await owned.close();throw error;}
