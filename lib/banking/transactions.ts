// Person 4: deposits, withdrawals and transfers.
import { createHash } from 'node:crypto';
import type { Staff } from '../types';
import { BusinessError, requiredText, optionalText, positiveId, money } from '../validation';
import { first, requireRole, requireAgent, audit, requireActive } from './financial-db';
import type { FinancialQueryable } from './financial-db';
import type { Input, AccountRow } from './shared';
import { postEntry, operation } from './ledger';

/**
 * Creates a deposit, withdrawal, or transfer.
 *
 * Atomicity: the caller must wrap this in db.transaction(). All balance
 * updates and ledger entries happen inside one MySQL transaction so that
 * a crash at any point leaves the database unchanged (rollback).
 *
 * Deadlock prevention: when a transfer touches two accounts both rows are
 * locked with SELECT ... FOR UPDATE in ascending id order, which is the
 * canonical ordering that prevents two concurrent transfers from deadlocking.
 *
 * Idempotency: the idempotency_key / request_fingerprint pair in
 * money_operations prevents a duplicate network retry from moving money twice.
 */
export async function createTransaction(tx: FinancialQueryable, user: Staff, input: Input) {
  requireRole(user, ['agent']);

  const type = requiredText(input.type, 'Transaction type');
  if (!['deposit', 'withdrawal', 'transfer'].includes(type)) {
    throw new BusinessError('Invalid transaction type.');
  }

  const sourceId      = positiveId(input.account_id, 'Source account');
  const destinationId = type === 'transfer'
    ? positiveId(input.destination_account_id, 'Destination account')
    : null;
  if (destinationId === sourceId) throw new BusinessError('Transfer accounts must be different.');

  const amount      = money(input.amount);
  const [whole, fraction = ''] = amount.split('.');
  const canonicalAmount = `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
  const description = optionalText(input.description, 300) || `${type[0].toUpperCase()}${type.slice(1)}`;
  const key         = requiredText(input.idempotency_key, 'Request key', 100);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ type, sourceId, destinationId, amount: canonicalAmount, description }))
    .digest('hex');

  const op = await operation(tx, user, type, description, key, fingerprint);
  if (op.duplicate) return { message: 'This transaction was already posted; no money was moved again.' };

  // Lock accounts in ascending id order to prevent deadlocks on concurrent transfers.
  // MySQL uses ? placeholders — build the IN list dynamically.
  const ids         = destinationId ? [sourceId, destinationId].sort((a, b) => a - b) : [sourceId];
  const placeholders = ids.map(() => '?').join(', ');
  const locked = (
    await tx.query<AccountRow>(
      `SELECT * FROM savings_accounts WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
      ids,
    )
  ).rows;

  const source = locked.find(a => a.id === sourceId);
  if (!source) throw new BusinessError('Source account does not exist.');
  requireAgent(user, source);
  requireActive(source);

  if (type !== 'deposit') {
    if (input.owner_verified !== true) {
      throw new BusinessError("Confirm the account owner's identity before withdrawing or transferring.");
    }
    // Exact DECIMAL comparison — no JS floating point involved.
    const canDebit = await first<{ allowed: number; available: string }>(
      tx,
      `SELECT
         balance - CAST(? AS DECIMAL(14,2)) >= minimum_balance AS allowed,
         GREATEST(balance - minimum_balance, 0)               AS available
       FROM savings_accounts WHERE id = ?`,
      [amount, source.id],
    );
    if (!canDebit.allowed) {
      throw new BusinessError(
        `Available withdrawal is LKR ${canDebit.available}; the minimum balance must remain.`,
      );
    }
  }

  if (type === 'transfer') {
    const destination = locked.find(a => a.id === destinationId);
    if (!destination) throw new BusinessError('Destination account does not exist.');
    requireActive(destination);
    await postEntry(tx, op.id, source.id,      `-${amount}`, 'transfer_out');
    await postEntry(tx, op.id, destination.id,  amount,      'transfer_in');
  } else {
    await postEntry(tx, op.id, source.id, type === 'withdrawal' ? `-${amount}` : amount, type);
  }

  await audit(tx, user, 'transaction.posted', 'money_operation', op.id, source.branch_id, {
    type,
    amount,
    source_account_id:      source.id,
    destination_account_id: destinationId,
    owner_verified:         input.owner_verified === true,
  });
  return { message: `${type[0].toUpperCase()}${type.slice(1)} posted successfully.` };
}
