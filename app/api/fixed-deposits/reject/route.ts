import { NextResponse, NextRequest } from 'next/server';
import pool from '@/lib/mysql';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { requireSession } from '@/lib/server/auth';

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireSession(request, ['manager', 'higher_manager', 'admin']);

    const body = await request.json() as { fdNumber?: string };
    const { fdNumber } = body; 

    if (!fdNumber) {
      return NextResponse.json(
        { error: "FD Number is required." },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Fetch the pending FD to refund the principal
      const [fdRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, source_account_id, principal FROM fixed_deposits WHERE fd_number = ? AND status = 'pending' FOR UPDATE`,
        [fdNumber]
      );

      if (fdRows.length === 0) {
        await connection.rollback();
        connection.release();
        return NextResponse.json(
          { error: "Fixed Deposit not found or it is not in pending state." },
          { status: 404 }
        );
      }

      const fd = fdRows[0];
      const principal = parseFloat(fd.principal);

      // 2. Reject the FD
      await connection.execute(
        `UPDATE fixed_deposits SET status = 'rejected' WHERE id = ?`,
        [fd.id]
      );

      // 3. Lock the savings account to refund the money
      const [accountRows] = await connection.execute<RowDataPacket[]>(
        `SELECT balance FROM savings_accounts WHERE id = ? FOR UPDATE`,
        [fd.source_account_id]
      );

      const currentBalance = parseFloat(accountRows[0].balance);
      const balanceAfter = currentBalance + principal;

      // 4. Refund money to savings account
      await connection.execute(
        `UPDATE savings_accounts SET balance = ? WHERE id = ?`,
        [balanceAfter, fd.source_account_id]
      );

      // 5. Create money operation and ledger entry for the refund
      const idempotencyKey = `fd-reject-${fd.id}`;
      const [opResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO money_operations (reference, actor_id, idempotency_key, request_fingerprint, type, description) 
         VALUES (UUID(), ?, ?, ?, 'transfer', 'Refund fixed deposit principal on rejection')`,
        [user.id, idempotencyKey, '{}']
      );

      await connection.execute(
        `INSERT INTO ledger_entries (operation_id, account_id, type, amount, balance_before, balance_after)
         VALUES (?, ?, 'credit', ?, ?, ?)`,
        [opResult.insertId, fd.source_account_id, principal, currentBalance, balanceAfter]
      );

      await connection.commit();
      connection.release();

      return NextResponse.json(
        { message: "Fixed Deposit rejected and principal refunded successfully!" },
        { status: 200 }
      );
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }

  } catch (error) {
    console.error("FD Rejection Error:", error);
    return NextResponse.json(
      { error: "Internal server error during rejection." },
      { status: 500 }
    );
  }
}
