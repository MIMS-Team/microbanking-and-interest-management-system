// Shared transaction helpers and row types. Coordinate changes with all domain owners.
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db';
import type { Staff, Role } from '../types';
import { BusinessError, positiveId } from '../validation';

export type Input = Record<string, unknown>;

export interface AccountRow {
  id: number;
  account_number: string;
  branch_id: number;
  agent_id: number;
  balance: string;
  minimum_balance: string;
  status: string;
  rate_id: number;
  opened_at: string;
}

export interface CustomerRow {
  id: number;
  full_name: string;
  branch_id: number;
  agent_id: number;
  status: string;
  date_of_birth: string;
}

export interface RateRow {
  id: number;
  product: string;
  annual_rate: string;
  minimum_balance: string;
  minimum_deposit: string;
  term_months: number;
  min_age: number;
  max_age: number;
}

export interface DepositRow {
  id: number;
  source_account_id: number;
  principal: string;
  annual_rate: string;
  term_months: number;
  rate_id: number;
  status: string;
  auto_renew: boolean;
  maturity_date: string;
}

export interface ApprovalRow {
  id: number;
  type: string;
  entity_id: number;
  branch_id: number | null;
  requested_by: number;
  status: string;
  payload: Input;
  target_version: number | null;
  intended_approver_id: number | null;
  expires_at: string | null;
}

export async function first<T>(tx: Queryable, sql: string, params: unknown[] = []): Promise<T> {
  const response = await tx.query<T>(sql,params);
  // MySQL exposes generated identifiers in the result header, not RETURNING.
  const result = response.rows[0] ?? (response.insertId ? {id:response.insertId} as T : response.affectedRows ? {} as T : undefined);
  if (!result) throw new BusinessError('The requested record does not exist.',404);
  return result;
}

export function requireRole(user: Staff, roles: Role[]): void {
  if (user.status !== 'active' || !roles.includes(user.role)) throw new BusinessError('Your role cannot perform this action.',403);
}

export function requireBranch(user: Staff, branchId: number): void {
  if (!['admin','higher_manager'].includes(user.role) && user.branch_id !== branchId) {
    throw new BusinessError('This record belongs to another branch.',403);
  }
}

export function requireAgent(user: Staff, record: {branch_id:number;agent_id:number}): void {
  requireRole(user,['agent']);
  requireBranch(user,record.branch_id);
  if (record.agent_id !== user.id) throw new BusinessError('Only the assigned agent can operate this account or customer.',403);
}

export async function audit(tx: Queryable, user: Staff, action: string, entity: string, id: number|null, branch: number|null, details: Input = {}): Promise<void> {
  await tx.query('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,branch_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [user.id,action,entity,id,branch,JSON.stringify(details)]);
}

export async function queue(tx: Queryable, user: Staff, type: string, id: number|null, branch: number|null, name: string, summary: string, payload: Input): Promise<void> {
  const targets: Record<string,[string,string]> = {customer:['customers','customer_id'],account:['savings_accounts','account_id'],fd:['fixed_deposits','fixed_deposit_id'],staff:['staff','employee_id'],branch:['branches','target_branch_id'],agent:['staff','employee_id']};
  const target=targets[type.split('.')[0]];
  if (!target) throw new BusinessError('Unsupported approval target.');
  let version: number|null=null;
  if (id !== null) {
    version=(await first<{version:number}>(tx,`SELECT version FROM ${target[0]} WHERE id=$1 FOR UPDATE`,[id])).version;
    if ((await tx.query(`SELECT id FROM approvals WHERE ${target[1]}=$1 AND status='pending'`,[id])).rows.length) throw new BusinessError('A change for this record is already pending.',409);
  }
  const authority=['staff','branch','agent'].includes(type.split('.')[0]) ? 'higher_manager' : 'manager';
  await tx.query(`INSERT INTO approvals(type,entity_id,${target[1]},target_version,authority,branch_id,customer_name,summary,payload,requested_by)
    VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9)`,[type,id,version,authority,branch,name,summary,JSON.stringify(payload),user.id]);
  await audit(tx,user,`${type}.requested`,type.split('.')[0],id,branch,{summary});
}

export async function account(tx: Queryable, id: unknown, lock = false): Promise<AccountRow> {
  return first<AccountRow>(tx,`SELECT * FROM savings_accounts WHERE id=$1${lock?' FOR UPDATE':''}`,[positiveId(id,'Account')]);
}

export async function requireActiveAssignment(tx: Queryable, branchId: number, agentId: number): Promise<void> {
  const result = await tx.query(`SELECT s.id FROM staff s JOIN branches b ON b.id=s.branch_id
    WHERE s.id=$1 AND s.branch_id=$2 AND s.role='agent' AND s.status='active' AND b.status='active' FOR SHARE`, [agentId, branchId]);
  if (!result.rows.length) throw new BusinessError('The assigned agent and branch must remain active and match this record.',409);
}

export function requireActive(accountRow: AccountRow): void {
  if (accountRow.status !== 'active') throw new BusinessError('The savings account must be active.');
}

export function reference(prefix: string): string { return `${prefix}-${randomUUID().slice(0,18).toUpperCase()}`; }

export async function requireActiveOwners(tx: Queryable, accountId: number): Promise<void> {
  const owners = await tx.query<CustomerRow>(`SELECT c.* FROM customers c
    JOIN customer_accounts ca ON ca.customer_id=c.id WHERE ca.account_id=$1 FOR SHARE`, [accountId]);
  if (!owners.rows.length || owners.rows.some(owner => owner.status !== 'active')) {
    throw new BusinessError('Every account owner must be an active approved customer.');
  }
}

export async function requireNoFixedDeposit(tx: Queryable, accountId: number): Promise<void> {
  const deposits = await tx.query(`SELECT id FROM fixed_deposits
    WHERE source_account_id=$1 AND status IN ('pending','active')`, [accountId]);
  if (deposits.rows.length) throw new BusinessError('Close or reject the linked fixed deposit before closing or deactivating this savings account.');
}

export async function businessDates(tx: Queryable): Promise<{today: string; yesterday: string}> {
  return first(tx, `SELECT
    DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%Y-%m-%d') AS today,
    DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE-INTERVAL 1 DAY,'%Y-%m-%d') AS yesterday`);
}

export function managementScope(user: Staff): number|null {
  requireRole(user, ['manager', 'higher_manager']);
  if (user.role==='manager' && user.branch_id===null) throw new BusinessError('A manager requires an assigned branch.',403);
  return user.role === 'manager' ? user.branch_id : null;
}
