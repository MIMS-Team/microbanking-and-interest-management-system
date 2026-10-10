// Person 4: exact balance updates and immutable ledger entries. Always use the caller's SQL transaction.
import { randomUUID } from 'node:crypto';
import type { Staff } from '../types';
import { BusinessError } from '../validation';
import { first } from './financial-db';
import type { FinancialQueryable } from './financial-db';
import { reference } from './shared';

/**
 * Posts a single ledger entry and updates the account balance atomically.
 *
 * Rounding rule: amounts are stored as DECIMAL(14,2) in MySQL. All arithmetic
 * is performed inside SQL using CAST(? AS DECIMAL(14,2)) so that JavaScript
 * floating-point representation never touches a posted monetary value.
 */
export async function postEntry(
  tx: FinancialQueryable,
  operationId: number,
  accountId: number,
  amount: string,
  type: string,
): Promise<void> {
  // Update balance using exact DECIMAL arithmetic inside MySQL.
  // The WHERE guard ensures balance never drops below 0.
  const updated = await tx.query<{ balance: string }>(
    `UPDATE savings_accounts
       SET balance = balance + CAST(? AS DECIMAL(14,2))
     WHERE id = ?
       AND balance + CAST(? AS DECIMAL(14,2)) >= 0`,
    [amount, accountId, amount],
  );

  if (updated.affectedRows !== 1) throw new BusinessError('Insufficient funds.');

  // Fetch the new balance so we can record balance_before accurately.
  const { balance: balanceAfter } = await first<{ balance: string }>(
    tx,
    'SELECT balance FROM savings_accounts WHERE id = ?',
    [accountId],
  );

  // balance_before = balanceAfter - amount (exact SQL DECIMAL subtraction).
  await tx.query(
    `INSERT INTO ledger_entries
       (operation_id, account_id, type, amount, balance_before, balance_after)
     VALUES
       (?, ?, ?, CAST(? AS DECIMAL(14,2)),
        CAST(? AS DECIMAL(14,2)) - CAST(? AS DECIMAL(14,2)),
        CAST(? AS DECIMAL(14,2)))`,
    [operationId, accountId, type, amount, balanceAfter, amount, balanceAfter],
  );
}

/**
 * Creates a money_operation row and returns its id.
 * Idempotency: if the same (actor, key) pair is submitted again with the same
 * fingerprint it returns duplicate=true so callers skip the transfer. A
 * mismatched fingerprint (different amounts / accounts) is rejected with 409.
 */
export async function operation(
  tx: FinancialQueryable,
  user: Staff,
  type: string,
  description: string,
  key: string = randomUUID(),
  fingerprint: string = key,
): Promise<{ id: number; duplicate: boolean }> {
  // Check for an existing operation with this idempotency key first.
  const inserted = await tx.query(
    `INSERT IGNORE INTO money_operations
       (reference, actor_id, idempotency_key, request_fingerprint, type, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reference('BT'), user.id, key, fingerprint, type, description],
  );
  const row = await tx.query<{ id: number; request_fingerprint: string }>(
    `SELECT id, request_fingerprint FROM money_operations
     WHERE actor_id = ? AND idempotency_key = ? FOR UPDATE`,
    [user.id, key],
  );
  const operationRow = row.rows[0];
  if (!operationRow) throw new Error('Failed to create or find the money operation record.');
  if (operationRow.request_fingerprint !== fingerprint) {
    throw new BusinessError(
      'This request key was already used with different transaction details.',
      409,
    );
  }
  return { id: operationRow.id, duplicate: inserted.affectedRows !== 1 };
}
