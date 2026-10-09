import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { hashPassword } from './auth/password';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Next's development hot reload must reuse the connection instead of opening
// several embedded databases against the same directory.
const globalDb = globalThis as typeof globalThis & { btrustDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalDb.btrustDb) globalDb.btrustDb = initializeDatabase().catch(error => {
    delete globalDb.btrustDb;
    throw error;
  });
  return globalDb.btrustDb;
}

async function initializeDatabase(): Promise<Database> {
  let database: Database;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => ({ rows: (await pool.query(sql, params)).rows as T[] }),
      transaction: async <T>(work: (tx: Queryable) => Promise<T>) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await work({ query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] }) });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_EMBEDDED_DB !== 'true') {
      throw new Error('Set DATABASE_URL for production, or explicitly set ALLOW_EMBEDDED_DB=true for a local demonstration.');
    }
    const dataDirectory = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'postgres');
    if (dataDirectory !== 'memory://') await mkdir(path.dirname(dataDirectory), {recursive: true});
    const embedded = new PGlite(dataDirectory);
    await embedded.waitReady;
    database = {
      query: async <T>(sql: string, params: unknown[] = []) => ({ rows: (await embedded.query<T>(sql, params)).rows }),
      transaction: <T>(work: (tx: Queryable) => Promise<T>) => embedded.transaction(tx => work({
        query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query<R>(sql, params)).rows }),
      })),
      close: () => embedded.close(),
    };
  }

  const schema = await readFile(path.join(process.cwd(),'database','schema.sql'),'utf8');
  await database.transaction(async tx => {
    // Serialize first-start migrations across ordinary PostgreSQL app processes.
    if (process.env.DATABASE_URL) await tx.query('SELECT pg_advisory_xact_lock(9182053)');
    // Both drivers support simple SQL without parameters. PGlite's query permits
    // one statement, so split using a dollar-quote aware scanner below.
    for (const statement of splitSql(schema)) await tx.query(statement);
    if ((!process.env.DATABASE_URL || process.env.SEED_DEMO === 'true') && process.env.SEED_DEMO !== 'false') {
      await seedDemo(tx);
    }
  });
  return database;
}

/** Preserve semicolons inside PL/pgSQL $$ function bodies. */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '', quoted = false, dollarQuoted = false, comment = false;
  for (let i = 0; i < sql.length; i++) {
    const character = sql[i];
    if (!quoted && !dollarQuoted && character === '-' && sql[i+1] === '-') comment = true;
    if (comment) { if (character === '\n') { comment = false; current += '\n'; } continue; }
    if (!quoted && character === '$' && sql[i+1] === '$') { dollarQuoted = !dollarQuoted; current += '$$'; i++; continue; }
    if (!dollarQuoted && character === "'") {
      if (quoted && sql[i+1] === "'") { current += "''"; i++; continue; }
      quoted = !quoted;
    }
    if (character === ';' && !quoted && !dollarQuoted) { if (current.trim()) statements.push(current.trim()); current = ''; }
    else current += character;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function seedDemo(tx: Queryable): Promise<void> {
  if (Number((await tx.query<{ count: string|number }>('SELECT count(*) AS count FROM staff')).rows[0].count) !== 0) return;
  await tx.query(`INSERT INTO branches(code,name,address,phone) VALUES
    ('CLB','Colombo Central','42 Galle Road, Colombo 03','0112345678'),
    ('KDY','Kandy','18 Temple Street, Kandy','0812234567'),
    ('GLL','Galle','7 Main Street, Galle','0912234567')`);
  const passwordHash = hashPassword('Demo@12345');
  await tx.query(`INSERT INTO staff(full_name,email,password_hash,role,branch_id) VALUES
    ('Kasun Silva','agent@btrust.local',$1,'agent',1),
    ('Nadeesha Perera','manager@btrust.local',$1,'manager',1),
    ('Admin User','admin@btrust.local',$1,'admin',NULL),
    ('Dinithi Fernando','higher@btrust.local',$1,'higher_manager',NULL),
    ('Sahan Jayawardena','kandy.agent@btrust.local',$1,'agent',2),
    ('Amali Wickramasinghe','kandy.manager@btrust.local',$1,'manager',2)`,[passwordHash]);
  await tx.query(`INSERT INTO rates(product,name,term_months,annual_rate,minimum_balance) VALUES
    ('savings','Regular savings',0,4.5,500),
    ('fixed','Three month fixed deposit',3,8.0,10000),
    ('fixed','Six month fixed deposit',6,9.0,10000),
    ('fixed','Twelve month fixed deposit',12,10.0,10000)`);
  await tx.query(`INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by)
    SELECT id,annual_rate,'2020-01-01'::timestamptz,3 FROM rates`);

  const customers = [
    ['Kamal Perera','198512300123','1985-05-02','15 Flower Road, Colombo','0771234567','kamal.perera@example.com'],
    ['Nimali Fernando','199023400456','1990-08-22','28 Lake Drive, Colombo','0772345678','nimali.f@example.com'],
    ['Dinesh Jayawardena','198834500789','1988-11-15','8 Station Road, Dehiwala','0713456789','dinesh.j@example.com'],
    ['Sanduni Silva','199545600123','1995-04-10','62 Park Street, Colombo','0764567890','sanduni.s@example.com'],
    ['Ruwan Wickramasinghe','198156700456','1981-06-16','32 Hill Street, Nugegoda','0775678901','ruwan.w@example.com'],
    ['Tharushi Bandara','199867800789','1998-03-05','10 Queen Road, Colombo','0786789012','tharushi.b@example.com'],
    ['Ashan Dias','199078900123','1990-09-26','95 High Level Road, Colombo','0717890123','ashan.d@example.com'],
    ['Malini Rodrigo','197889000456','1978-12-11','45 School Lane, Maharagama','0758901234','malini.r@example.com'],
    ['Chamath Senanayake','199990100789','1999-02-14','23 Temple Road, Kandy','0779012345','chamath.s@example.com'],
    ['Isuri Dissanayake','199201200123','1992-07-08','7 Lake Road, Kandy','0720123456','isuri.d@example.com'],
    ['Sajith Rathnayake','198903300456','1989-05-21','68 Galle Road, Colombo','0741234567','sajith.r@example.com'],
    ['Pavithra Ekanayake','199704400789','1997-10-03','18 Palm Grove, Colombo','0762345678','pavithra.e@example.com'],
  ];
  for (const [index, values] of customers.entries()) {
    const branch = index === 8 || index === 9 ? 2 : 1;
    await tx.query(`INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,email,branch_id,agent_id,status,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP-INTERVAL '90 days')`,
      [`CUS-${String(index+1).padStart(6,'0')}`,...values,branch,branch===1?1:5,index===11?'pending':'active']);
  }
  const balances = ['245000','78000','152500','46500','520000','68000','99500','185000','134000','87500','12000'];
  for (const [index, balance] of balances.entries()) {
    const branch = index === 8 || index === 9 ? 2 : 1;
    const accountId = index+1;
    await tx.query(`INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,balance,status,opened_at)
      VALUES($1,$2,$3,1,$4,'active',CURRENT_TIMESTAMP-INTERVAL '85 days')`,
      [`SA-${String(accountId).padStart(8,'0')}`,branch,branch===1?1:5,balance]);
    await tx.query('INSERT INTO customer_accounts(customer_id,account_id) VALUES($1,$1)',[accountId]);
    const operation = (await tx.query<{id:number}>(`INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description,created_at)
      VALUES($1,$2,$3::text,$3::text,'deposit','Opening cash deposit',CURRENT_TIMESTAMP-INTERVAL '85 days') RETURNING id`,
      [`BT-SEED-${accountId}`,branch===1?1:5,`seed-${accountId}`])).rows[0];
    await tx.query(`INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at)
      VALUES($1,$2,'deposit',$3,0,$3,CURRENT_TIMESTAMP-INTERVAL '85 days')`,[operation.id,accountId,balance]);
  }
  // A joint account demonstrates the customer_accounts junction table.
  await tx.query('INSERT INTO customer_accounts(customer_id,account_id) VALUES(2,1)');
  for (const fd of [{account:1,principal:'100000',rate:3,term:6,annual:9},{account:5,principal:'200000',rate:4,term:12,annual:10}]) {
    const id = (await tx.query<{id:number}>(`INSERT INTO fixed_deposits(fd_number,source_account_id,rate_id,principal,annual_rate,term_months,status,opened_at,maturity_date)
      VALUES($1,$2,$3,$4,$5,$6::integer,'active',CURRENT_TIMESTAMP-INTERVAL '60 days',(CURRENT_DATE-60+($6::integer||' months')::interval)::date) RETURNING id`,
      [`FD-${String(fd.account).padStart(8,'0')}`,fd.account,fd.rate,fd.principal,fd.annual,fd.term])).rows[0].id;
    const operation = (await tx.query<{id:number}>(`INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description,created_at)
      VALUES($1,1,$2::text,$2::text,'fd_open','Fixed deposit funding',CURRENT_TIMESTAMP-INTERVAL '60 days') RETURNING id`,[`BT-SEED-FD-${id}`,`seed-fd-${id}`])).rows[0];
    await tx.query(`INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at)
      SELECT $1,id,'fd_open',-$2::numeric,balance,balance-$2::numeric,CURRENT_TIMESTAMP-INTERVAL '60 days' FROM savings_accounts WHERE id=$3`,[operation.id,fd.principal,fd.account]);
    await tx.query('UPDATE savings_accounts SET balance=balance-$1::numeric WHERE id=$2',[fd.principal,fd.account]);
  }
  await tx.query(`INSERT INTO approvals(type,entity_id,branch_id,customer_name,summary,payload,requested_by)
    VALUES('customer.create',12,1,'Pavithra Ekanayake','Register Pavithra Ekanayake','{"id":12}',1)`);
  await tx.query(`INSERT INTO audit_logs(actor_id,action,entity_type,details)
    VALUES(3,'demo.seed','system','{"description":"Fictional teaching data initialized. Rates and minimum balances are demonstration settings."}')`);
}

/** Convenience facade. Transactions should always use the provided tx object. */
export const db = {
  query: async <T = Record<string,unknown>>(sql: string, params: unknown[] = []) => (await getDb()).query<T>(sql,params),
  transaction: async <T>(work: (tx: Queryable) => Promise<T>) => (await getDb()).transaction(work),
};
