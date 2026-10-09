import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { fdNumber?: string; userRole?: string };
    const { fdNumber, userRole } = body; 

    // Validate permissions with actual system roles
    const allowedRoles = ['Branch Manager', 'Higher Management'];
    if (!allowedRoles.includes(userRole ?? '')) {
      return NextResponse.json(
        { error: "Unauthorized: You do not have permission to approve FDs." },
        { status: 403 }
      );
    }

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
