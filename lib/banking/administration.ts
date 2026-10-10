// Person 5: branches, operational staff administration and agent portfolio reassignment.
import type { Queryable } from '../db';
import { hashPassword } from '../auth/password';
import type { Staff, Role } from '../types';
import { BusinessError, requiredText, optionalText, positiveId, email, phone } from '../validation';
import { first, requireRole, requireBranch, audit, queue } from './shared';
import type { Input, ApprovalRow } from './shared';

export function branchDetails(input: Input): Input {
  const code = requiredText(input.code, 'Branch code', 12).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(code)) throw new BusinessError('Branch code may contain only letters, digits and hyphens.');
  const status = input.status === undefined ? 'active' : requiredText(input.status, 'Status');
  if (!['active', 'inactive'].includes(status)) throw new BusinessError('Branch status must be active or inactive.');
  return {code, name: requiredText(input.name, 'Branch name', 100), address: requiredText(input.address, 'Address', 500),
    phone: phone(input.phone, true), email: email(input.email), status};
}

export async function saveBranch(tx: Queryable, user: Staff, input: Input, action: string) {
  requireRole(user, ['admin']);
  const values = branchDetails(input);
  const id = action === 'branch.update' ? positiveId(input.id) : null;
  if (id !== null) await first(tx, 'SELECT id FROM branches WHERE id=$1 FOR UPDATE', [id]);
  await queue(tx, user, action, id, id, '', `${id ? 'Update' : 'Create'} branch ${values.name}`, values);
  return {message: 'Branch change submitted for higher management approval.'};
}

export async function applyBranchChange(tx: Queryable, approval: ApprovalRow): Promise<void> {
  const values = branchDetails(approval.payload);
  if (approval.type === 'branch.create') {
    const created = await first<{id: number}>(tx, `INSERT INTO branches(code,name,address,phone,email,status)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [values.code, values.name, values.address, values.phone, values.email, values.status]);
    await tx.query('UPDATE approvals SET entity_id=$1,branch_id=$1 WHERE id=$2', [created.id, approval.id]);
    return;
  }
  await first(tx, 'SELECT id FROM branches WHERE id=$1 FOR UPDATE', [approval.entity_id]);
  if (values.status === 'inactive') {
    const dependencies = await first<{in_use: boolean}>(tx, `SELECT
      EXISTS(SELECT 1 FROM staff WHERE branch_id=$1 AND status='active') OR
      EXISTS(SELECT 1 FROM customers WHERE branch_id=$1 AND status IN ('active','pending')) OR
      EXISTS(SELECT 1 FROM savings_accounts WHERE branch_id=$1 AND status IN ('active','inactive','pending')) AS in_use`, [approval.entity_id]);
    if (dependencies.in_use) throw new BusinessError('This branch still has active staff, customers or open accounts. Resolve them before deactivation.');
  }
  await tx.query('UPDATE branches SET code=$1,name=$2,address=$3,phone=$4,email=$5,status=$6 WHERE id=$7',
    [values.code, values.name, values.address, values.phone, values.email, values.status, approval.entity_id]);
}

export function staffDetails(input: Input): Input {
  const role = requiredText(input.role, 'Role') as Role;
  if (!['agent', 'manager', 'higher_manager', 'admin'].includes(role)) throw new BusinessError('Choose a valid staff role.');
  const branch = input.branch_id ? positiveId(input.branch_id, 'Branch') : null;
  if (['agent', 'manager'].includes(role) && branch === null) throw new BusinessError('Agents and managers require an assigned branch.');
  const status = input.status === undefined ? 'active' : requiredText(input.status, 'Status');
  if (!['active', 'inactive'].includes(status)) throw new BusinessError('Staff status must be active or inactive.');
  return {full_name: requiredText(input.full_name, 'Full name'), email: email(input.email, true), role, branch_id: branch, status};
}

export async function saveStaff(tx: Queryable, user: Staff, input: Input, action: string) {
  requireRole(user, ['admin']);
  const values = staffDetails(input);
  const id = action === 'staff.update' ? positiveId(input.id) : null;
  if (id !== null) await first(tx, 'SELECT id FROM staff WHERE id=$1', [id]);
  if (values.branch_id !== null) await first(tx, `SELECT id FROM branches WHERE id=$1 AND status='active'`, [values.branch_id]);
  const password = optionalText(input.password, 128);
  if (id === null || password) {
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BusinessError('Password must have at least 10 characters, including uppercase, lowercase and a number.');
    }
    values.password_hash = hashPassword(password);
  }
  await queue(tx, user, action, id, values.branch_id as number|null, '', `${id ? 'Update' : 'Create'} staff member ${values.full_name}`, values);
  return {message: 'Staff change submitted for higher management approval.'};
}

export async function applyStaffChange(tx: Queryable, reviewer: Staff, approval: ApprovalRow): Promise<void> {
  const values = staffDetails(approval.payload);
  if (values.branch_id !== null) await first(tx, `SELECT id FROM branches WHERE id=$1 AND status='active' FOR SHARE`, [values.branch_id]);
  const passwordHash = approval.payload.password_hash;
  if (approval.type === 'staff.create') {
    if (typeof passwordHash !== 'string') throw new BusinessError('The new staff request is missing its password.');
    const created = await first<{id:number}>(tx, `INSERT INTO staff(full_name,email,role,branch_id,status,password_hash)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [values.full_name, values.email, values.role, values.branch_id, values.status, passwordHash]);
    await tx.query('UPDATE approvals SET entity_id=$1 WHERE id=$2', [created.id, approval.id]);
    return;
  }
  const current = await first<Staff>(tx, 'SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=$1 FOR UPDATE', [approval.entity_id]);
  if (current.id === reviewer.id && (values.status !== 'active' || values.role !== current.role)) {
    throw new BusinessError('A reviewer cannot approve their own deactivation or role change.');
  }
  const changesAssignment = values.status !== 'active' || values.role !== current.role || values.branch_id !== current.branch_id;
  if (changesAssignment) {
    const assigned = await first<{in_use: boolean}>(tx, `SELECT
      EXISTS(SELECT 1 FROM customers WHERE agent_id=$1 AND status IN ('active','inactive','pending')) OR
      EXISTS(SELECT 1 FROM savings_accounts WHERE agent_id=$1 AND status IN ('active','inactive','pending')) AS in_use`, [current.id]);
    if (assigned.in_use) throw new BusinessError('This agent has customers or open accounts; reassign them before changing the agent’s role, branch or active status.');
  }
  if (['admin', 'higher_manager'].includes(current.role) && (values.role !== current.role || values.status !== 'active')) {
    const remaining = await first<{count: string}>(tx, 'SELECT count(*) AS count FROM staff WHERE role=$1 AND status=\'active\' AND id<>$2', [current.role, current.id]);
    if (Number(remaining.count) === 0) throw new BusinessError(`Keep at least one active ${current.role.replace('_', ' ')}.`);
  }
  await tx.query(`UPDATE staff SET full_name=$1,email=$2,role=$3,branch_id=$4,status=$5,
    password_hash=COALESCE($6,password_hash) WHERE id=$7`,
    [values.full_name, values.email, values.role, values.branch_id, values.status, passwordHash ?? null, current.id]);
}

export async function reassignAgent(tx: Queryable, user: Staff, input: Input) {
  requireRole(user, ['manager', 'higher_manager', 'admin']);
  const fromId = positiveId(input.from_agent_id, 'Current agent');
  const toId = positiveId(input.to_agent_id, 'New agent');
  if (fromId === toId) throw new BusinessError('Choose a different receiving agent.');
  // Lock staff before their customer/account rows. Actions already in progress
  // finish first; later actions see the new assignment and recheck permissions.
  const staff = (await tx.query<Staff>(`SELECT id,full_name,email,role,branch_id,status FROM staff
    WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE`, [[fromId, toId]])).rows;
  const from = staff.find(person => person.id === fromId);
  const to = staff.find(person => person.id === toId);
  if (!from || !to || from.role !== 'agent' || to.role !== 'agent' || to.status !== 'active') {
    throw new BusinessError('Choose an existing agent and an active receiving agent.');
  }
  if (from.branch_id !== to.branch_id || from.branch_id === null) {
    throw new BusinessError('Both agents must belong to the same branch.');
  }
  requireBranch(user, from.branch_id);
  const customers = await tx.query<{id: number}>(
    'UPDATE customers SET agent_id=$1,updated_at=CURRENT_TIMESTAMP WHERE agent_id=$2 RETURNING id', [toId, fromId],
  );
  const accounts = await tx.query<{id: number}>(`UPDATE savings_accounts SET agent_id=$1
    WHERE agent_id=$2 AND status IN ('pending','active','inactive') RETURNING id`, [toId, fromId]);
  await audit(tx, user, 'agent.reassigned', 'staff', fromId, from.branch_id,
    {to_agent_id: toId, customers: customers.rows.length, accounts: accounts.rows.length});
  return {message: `${customers.rows.length} customers and ${accounts.rows.length} open accounts assigned to ${to.full_name}.`};
}
