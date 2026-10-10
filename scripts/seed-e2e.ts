import { validateE2eEnvironment } from './e2e-environment.mjs';
import { createEmployee, getSqliteDb } from '../lib/server/db';
import { passwordHash } from '../lib/server/auth';

// Fail before opening any database unless an explicit, owned temporary target exists.
const { dbPath } = validateE2eEnvironment();
const db = getSqliteDb();
if (db.prepare('SELECT COUNT(*) AS count FROM staff').get()?.count !== 0) {
  throw new Error('Refusing to seed a nonempty E2E database.');
}
db.prepare('INSERT INTO branches (id, code, name) VALUES (?, ?, ?)')
  .run(2, 'E2E-BR2', 'Fictional E2E Second Branch');
for (const employee of [
  { full_name: 'Fictional E2E Admin', email: 'admin@example.test', password: 'AdminDev@2026!', role: 'admin', branch_id: null },
  { full_name: 'Fictional E2E Approver', email: 'hr@example.test', password: 'HrManager@2026!', role: 'higher_manager', branch_id: null },
  { full_name: 'Fictional E2E Other Approver', email: 'other-hr@example.test', password: 'OtherHr@2026!', role: 'higher_manager', branch_id: null },
  { full_name: 'Fictional E2E Manager', email: 'manager@example.test', password: 'Manager@2026!', role: 'manager', branch_id: 1 },
  { full_name: 'Fictional E2E Agent', email: 'agent@example.test', password: 'Agent@2026!', role: 'agent', branch_id: 1 },
  { full_name: 'Fictional E2E Inactive Agent', email: 'inactive@example.test', password: 'Deactivated@2026!', role: 'agent', branch_id: 1, status: 'inactive' },
] as const) {
  await createEmployee({ ...employee, password_hash: passwordHash(employee.password) });
}
db.close();
console.log(`Seeded fictional employees in ${dbPath}`);
