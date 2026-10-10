import type { ExecuteValues, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { Role, Staff } from '../types';
import { BusinessError } from '../validation';
import type { AccountRow } from './shared';

export interface FinancialQueryResult<T> {
  rows: T[];
  affectedRows?: number;
  insertId?: number;
}

export interface FinancialQueryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ExecuteValues[],
  ): Promise<FinancialQueryResult<T>>;
}

export function financialQueryable(connection: Pick<PoolConnection, 'execute'>): FinancialQueryable {
  return {
    query: async <T>(sql: string, params: ExecuteValues[] = []) => {
      const [result] = await connection.execute(sql, params);
      if (Array.isArray(result)) {
        return { rows: result as T[] };
      }
      const header = result as ResultSetHeader;
      return { rows: [], affectedRows: header.affectedRows, insertId: header.insertId };
    },
  };
}

export async function first<T>(
  tx: FinancialQueryable,
  sql: string,
  params: ExecuteValues[] = [],
): Promise<T> {
  const result = (await tx.query<T>(sql, params)).rows[0];
  if (!result) throw new BusinessError('The requested record does not exist.', 404);
  return result;
}

export function requireRole(user: Staff, roles: Role[]): void {
  if (!roles.includes(user.role)) {
    throw new BusinessError('Your role cannot perform this action.', 403);
  }
}

export function requireBranch(user: Staff, branchId: number): void {
  if (!['admin', 'higher_manager'].includes(user.role) && user.branch_id !== branchId) {
    throw new BusinessError('This record belongs to another branch.', 403);
  }
}

export function requireAgent(user: Staff, record: { branch_id: number; agent_id: number }): void {
  requireRole(user, ['agent']);
  requireBranch(user, record.branch_id);
  if (record.agent_id !== user.id) {
    throw new BusinessError('Only the assigned agent can operate this account or customer.', 403);
  }
}

export async function audit(
  tx: FinancialQueryable,
  user: Staff,
  action: string,
  entity: string,
  id: number | null,
  branch: number | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, branch_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, action, entity, id, branch, JSON.stringify(details)],
  );
}

export function requireActive(account: AccountRow): void {
  if (account.status !== 'active') {
    throw new BusinessError('The savings account must be active.');
  }
}

export async function businessDates(
  tx: FinancialQueryable,
): Promise<{ today: string; yesterday: string }> {
  return first(
    tx,
    `SELECT
       DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'), '%Y-%m-%d') AS today,
       DATE_FORMAT(
         DATE_SUB(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'), INTERVAL 1 DAY),
         '%Y-%m-%d'
       ) AS yesterday`,
  );
}

export function managementScope(user: Staff): number | null {
  requireRole(user, ['manager', 'higher_manager', 'admin']);
  return user.role === 'manager' ? user.branch_id : null;
}
