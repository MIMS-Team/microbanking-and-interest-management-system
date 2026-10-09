import { getDb } from '../lib/db';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// Uses DATABASE_URL when configured; otherwise creates the local PGlite data
// directory. SEED_DEMO=true explicitly loads fictional demo data in PostgreSQL.
const database = await getDb();
const result = await database.query<{staff: string; customers: string; accounts: string}>(`SELECT
  (SELECT count(*) FROM staff) AS staff,
  (SELECT count(*) FROM customers) AS customers,
  (SELECT count(*) FROM savings_accounts) AS accounts`);
console.log('Database schema is ready.', result.rows[0]);
await database.close();
