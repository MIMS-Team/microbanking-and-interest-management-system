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

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE savings_accounts SET status = 'rejected' WHERE account_number = ? AND status = 'pending'`,
      [accountNumber]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: "Savings Account not found or it is not in pending state." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Savings Account rejected successfully!" },
      { status: 200 }
    );

  } catch (error) {
    console.error("Savings Rejection Error:", error);
    return NextResponse.json(
      { error: "Internal server error during rejection." },
      { status: 500 }
    );
  }
}
