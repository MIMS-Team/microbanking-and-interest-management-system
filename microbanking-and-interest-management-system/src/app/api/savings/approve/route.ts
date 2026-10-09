import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { accountNumber, userRole } = body; 

    // Validate permissions with actual system roles
    const allowedRoles = ['Branch Manager', 'Higher Management'];
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: "Unauthorized: You do not have permission to approve accounts." },
        { status: 403 }
      );
    }

    if (!accountNumber) {
      return NextResponse.json(
        { error: "Account Number is required." },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();

    const [result]: any = await connection.execute(
      `UPDATE savings_accounts SET status = 'active' WHERE account_number = ? AND status = 'pending'`,
      [accountNumber]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: "Savings Account not found or it is already active." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Savings Account approved successfully!" },
      { status: 200 }
    );

  } catch (error) {
    console.error("Savings Approval Error:", error);
    return NextResponse.json(
      { error: "Internal server error during approval." },
      { status: 500 }
    );
  }
}