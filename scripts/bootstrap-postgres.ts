import {createPostgresPool} from '../lib/postgres.mjs';
import {passwordHash} from '../lib/server/auth';
const envFile=process.argv.find(a=>a.startsWith('--env-file='))?.slice(11);
if(envFile)process.loadEnvFile(envFile);
const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.BOOTSTRAP_ADMIN_PASSWORD,name=process.env.BOOTSTRAP_ADMIN_NAME||'Administrator';
const higherEmail=process.env.BOOTSTRAP_HIGHER_EMAIL?.trim().toLowerCase(),higherPassword=process.env.BOOTSTRAP_HIGHER_PASSWORD,higherName=process.env.BOOTSTRAP_HIGHER_NAME||'Higher Manager';
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('Explicit MIGRATION_DATABASE_URL required for initial bootstrap.');
if(!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<12||password.length>128||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a unique 12–128 character BOOTSTRAP_ADMIN_PASSWORD containing uppercase, lowercase and a number.');
if(!higherEmail||higherEmail===email||!/^\S+@\S+\.\S+$/.test(higherEmail)||!higherPassword||higherPassword===password||higherPassword.length<12||higherPassword.length>128||!/[A-Z]/.test(higherPassword)||!/[a-z]/.test(higherPassword)||!/[0-9]/.test(higherPassword))throw new Error('Set a different BOOTSTRAP_HIGHER_EMAIL and a different strong BOOTSTRAP_HIGHER_PASSWORD. Two initial users are required for independent employee approvals.');
const pool=createPostgresPool(process.env.MIGRATION_DATABASE_URL),client=await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE staff IN EXCLUSIVE MODE');
  if((await client.query('SELECT count(*) AS count FROM staff')).rows[0].count!==0)throw new Error('Bootstrap requires an empty staff table. Existing users were preserved. Use the approved employee workflow.');
  for(const initial of [{name,email,password,role:'admin'},{name:higherName,email:higherEmail,password:higherPassword,role:'higher_manager'}]){
    const hash=passwordHash(initial.password);
    const id=(await client.query("INSERT INTO staff(full_name,email,password_hash,role,status) VALUES($1,$2,$3,$4,'active') RETURNING id",[initial.name,initial.email,hash,initial.role])).rows[0].id;
    await client.query('INSERT INTO staff_authentication(employee_id,password_hash) VALUES($1,$2)',[id,hash]);
    await client.query("INSERT INTO authentication_audit(employee_id,email,event_type,details) VALUES($1,$2,'employee_creation_confirmed',$3)",[id,initial.email,JSON.stringify({purpose:'explicit-initial-bootstrap'})]);
  }
  await client.query('COMMIT');console.log('Initial administrator and independent higher manager created. Configure SMTP before signing in. No demo users or financial policies were installed.');
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
