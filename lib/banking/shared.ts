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
}

export async function first<T>(tx: Queryable, sql: string, params: unknown[] = []): Promise<T> {
  const result = (await tx.query<T>(sql,params)).rows[0];
  if (!result) throw new BusinessError('The requested record does not exist.',404);
  return result;
}

export function requireRole(user: Staff, roles: Role[]): void {
  if (!roles.includes(user.role)) throw new BusinessError('Your role cannot perform this action.',403);
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
  await tx.query('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,branch_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [user.id,action,entity,id,branch,JSON.stringify(details)]);
}

export async function queue(tx: Queryable, user: Staff, type: string, id: number|null, branch: number|null, name: string, summary: string, payload: Input): Promise<void> {
  await tx.query(`INSERT INTO approvals(type,entity_id,branch_id,customer_name,summary,payload,requested_by)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[type,id,branch,name,summary,JSON.stringify(payload),user.id]);
  await audit(tx,user,`${type}.requested`,type.split('.')[0],id,branch,{summary});
}

export async function account(tx: Queryable, id: unknown, lock = false): Promise<AccountRow> {
  return first<AccountRow>(tx,`SELECT * FROM savings_accounts WHERE id=$1${lock?' FOR UPDATE':''}`,[positiveId(id,'Account')]);
}

export function requireActive(accountRow: AccountRow): void {
  if (accountRow.status !== 'active') throw new BusinessError('The savings account must be active.');
}

export function reference(prefix: string): string { return `${prefix}-${randomUUID().slice(0,18).toUpperCase()}`; }

export async function requireActiveOwners(tx: Queryable, accountId: number): Promise<void> {
  const owners = await tx.query<CustomerRow>(`SELECT c.* FROM customers c
    JOIN customer_accounts ca ON ca.customer_id=c.id WHERE ca.account_id=$1 FOR SHARE OF c`, [accountId]);
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
    to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date,'YYYY-MM-DD') AS today,
    to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date-1,'YYYY-MM-DD') AS yesterday`);
}

export function managementScope(user: Staff): number|null {
  requireRole(user, ['manager', 'higher_manager', 'admin']);
  return user.role === 'manager' ? user.branch_id : null;
}
