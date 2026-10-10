import { NextResponse, NextRequest } from 'next/server';
import pool from '@/lib/mysql';
import type { ResultSetHeader } from 'mysql2';
import { requireSession } from '@/lib/server/auth';

export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, ['manager', 'higher_manager', 'admin']);

    const body = await request.json() as { fdNumber?: string };
    const { fdNumber } = body; 


    if (!fdNumber) {
      return NextResponse.json(
        { error: "FD Number is required." },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE fixed_deposits SET status = 'active' WHERE fd_number = ? AND status = 'pending'`,
      [fdNumber]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: "Fixed Deposit not found or it is already active." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Fixed Deposit approved successfully!" },
      { status: 200 }
    );

  } catch (error) {
    console.error("Approval Error:", error);
    return NextResponse.json(
      { error: "Internal server error during approval." },
      { status: 500 }
    );
  }
}
