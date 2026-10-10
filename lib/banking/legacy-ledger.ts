// PostgreSQL ledger adapter retained for the still-unmigrated account lifecycle services.
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError } from '../validation';
import { first, reference } from './shared';

export async function postEntry(
  tx: Queryable,
  operationId: number,
  accountId: number,
  amount: string,
  type: string,
): Promise<void> {
  const changed = await tx.query<{ balance: string }>(
    `UPDATE savings_accounts SET balance = balance + $1::numeric
     WHERE id = $2 AND balance + $1::numeric >= 0
     RETURNING balance`,
    [amount, accountId],
  );
  if (!changed.rows.length) throw new BusinessError('Insufficient funds.');
  await tx.query(
    `INSERT INTO ledger_entries(operation_id, account_id, type, amount, balance_before, balance_after)
     VALUES ($1, $2, $3, $4, $5::numeric - $4::numeric, $5)`,
    [operationId, accountId, type, amount, changed.rows[0].balance],
  );
}

export async function operation(
  tx: Queryable,
  user: Staff,
  type: string,
  description: string,
  key: string = randomUUID(),
  fingerprint: string = key,
): Promise<{ id: number; duplicate: boolean }> {
  const inserted = (await tx.query<{ id: number }>(
    `INSERT INTO money_operations
       (reference, actor_id, idempotency_key, request_fingerprint, type, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (actor_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [reference('BT'), user.id, key, fingerprint, type, description],
  )).rows[0];
  if (inserted) return { id: inserted.id, duplicate: false };

  const existing = await first<{ id: number; request_fingerprint: string }>(
    tx,
    `SELECT id, request_fingerprint FROM money_operations
     WHERE actor_id = $1 AND idempotency_key = $2`,
    [user.id, key],
  );
  if (existing.request_fingerprint !== fingerprint) {
    throw new BusinessError('This request key was already used with different transaction details.', 409);
  }
  return { id: existing.id, duplicate: true };
}
