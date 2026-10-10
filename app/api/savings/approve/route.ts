import { NextResponse, NextRequest } from 'next/server';
import pool from '@/lib/mysql';
import type { ResultSetHeader } from 'mysql2';
import { requireSession } from '@/lib/server/auth';

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireSession(request, ['manager', 'higher_manager', 'admin']);

    const body = await request.json() as { accountNumber?: string };
    const { accountNumber } = body; 


    if (!accountNumber) {
      return NextResponse.json(
        { error: "Account Number is required." },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Get account details before approving
      const [accounts] = await connection.execute<import('mysql2').RowDataPacket[]>(
        `SELECT id, balance FROM savings_accounts WHERE account_number = ? AND status = 'pending' FOR UPDATE`,
        [accountNumber]
      );

      if (accounts.length === 0) {
        await connection.rollback();
        connection.release();
        return NextResponse.json(
          { error: "Savings Account not found or it is already active." },
          { status: 404 }
        );
      }

      const account = accounts[0];
      const accountId = account.id;
      const initialBalance = parseFloat(account.balance);

      // 2. Approve the account
      await connection.execute(
        `UPDATE savings_accounts SET status = 'active' WHERE id = ?`,
        [accountId]
      );

      // 3. Create ledger entry if there is an initial balance
      if (initialBalance > 0) {
        // Create money operation
        const idempotencyKey = `savings-approve-${accountId}`;
        const [opResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO money_operations (reference, actor_id, idempotency_key, request_fingerprint, type, description) 
           VALUES (UUID(), ?, ?, ?, 'deposit', 'Initial account funding on approval')`,
          [user.id, idempotencyKey, '{}']
        );
        const opId = opResult.insertId;

        // Create ledger entry
        await connection.execute(
          `INSERT INTO ledger_entries (operation_id, account_id, type, amount, balance_before, balance_after)
           VALUES (?, ?, 'credit', ?, 0, ?)`,
          [opId, accountId, initialBalance, initialBalance]
        );
      }

      await connection.commit();
      connection.release();

      return NextResponse.json(
        { message: "Savings Account approved and funded successfully!" },
        { status: 200 }
      );
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }

  } catch (error) {
    console.error("Savings Approval Error:", error);
    return NextResponse.json(
      { error: "Internal server error during approval." },
      { status: 500 }
    );
  }
}
