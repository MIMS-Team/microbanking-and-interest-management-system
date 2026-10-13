import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = process.env.DATABASE_URL || 'mysql://root:GkWJwGXAszlWbVUaurqPvOqdWSZKePNh@shortline.proxy.rlwy.net:42189/railway';

console.log('Connecting to Railway MySQL database...');
const connection = await mysql.createConnection({
  uri: connectionString,
  multipleStatements: true,
});

try {
  console.log('Connected!');
  const sqlPath = join(__dirname, '../database/test-data.sql');
  const sql = await readFile(sqlPath, 'utf8');

  console.log('Applying test data (database/test-data.sql)...');
  await connection.query(sql);

  console.log('Test data loaded successfully into live database!\n');

  // Verify staff accounts
  const [staff] = await connection.query('SELECT id, full_name, email, role, status FROM staff');
  console.log('Staff accounts available for login:');
  console.table(staff);

  // Verify counts
  const [counts] = await connection.query(`
    SELECT 
      (SELECT COUNT(*) FROM branches) AS branches,
      (SELECT COUNT(*) FROM staff) AS staff,
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM savings_accounts) AS savings_accounts,
      (SELECT COUNT(*) FROM fixed_deposits) AS fixed_deposits,
      (SELECT COUNT(*) FROM approvals) AS pending_approvals
  `);
  console.log('Summary of seeded records:');
  console.table(counts);

} catch (error) {
  console.error('Failed to seed database:', error.sqlMessage || error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
