import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      fdNumber?: string;
      sourceAccountId?: number;
      rateId?: number;
      principal?: number;
      annualRate?: number;
      termMonths?: number;
      autoRenew?: boolean;
    };
    const { fdNumber, sourceAccountId, rateId, principal, annualRate, termMonths, autoRenew } = body;

    // 1. Validate required fields from the request body
    if (!fdNumber || !sourceAccountId || !rateId || !principal || !annualRate || !termMonths) {
      return NextResponse.json(
        { error: "Missing required fields for Fixed Deposit." },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 2. Fetch the status of the source savings account from the database
      const [accountCheck] = await connection.execute<RowDataPacket[]>(
        `SELECT status FROM savings_accounts WHERE id = ?`,
        [sourceAccountId] 
      );

      // 3. Check if the savings account actually exists in the database
      if (accountCheck.length === 0) {
        throw new Error("Savings account not found.");
      }

      // 4. Validate if the savings account is ACTIVE before allowing FD creation
      // A pending account cannot be used to create a Fixed Deposit
      if (accountCheck[0].status !== 'active') {
        throw new Error("Validation Error: Source savings account must be ACTIVE to create a Fixed Deposit.");
      }

      // 5. Check if the savings account has enough balance to fund the FD
      // FOR UPDATE locks the row to prevent concurrent modifications during this transaction
      const [accounts] = await connection.execute<RowDataPacket[]>(
        'SELECT balance FROM savings_accounts WHERE id = ? FOR UPDATE',
        [sourceAccountId]
      );

      const currentBalance = parseFloat(accounts[0].balance);
      const fdAmount = parseFloat(String(principal));

      if (currentBalance < fdAmount) {
        throw new Error(`Insufficient balance. Account only has ${currentBalance}`);
      }

      // 6. Deduct the FD principal amount from the source savings account balance
      await connection.execute(
        'UPDATE savings_accounts SET balance = balance - ? WHERE id = ?',
        [fdAmount, sourceAccountId]
      );

      // 7. Create the Fixed Deposit record
      // MySQL's DATE_ADD is used to automatically calculate the maturity_date based on term_months
      const insertFdQuery = `
        INSERT INTO fixed_deposits 
        (fd_number, source_account_id, rate_id, principal, annual_rate, term_months, auto_renew, maturity_date) 
        VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? MONTH))
      `;
      
      const [fdResult] = await connection.execute<ResultSetHeader>(insertFdQuery, [
        fdNumber, 
        sourceAccountId, 
        rateId, 
        fdAmount, 
        annualRate, 
        termMonths, 
        autoRenew ? 1 : 0, 
        termMonths // Passed again for the INTERVAL ? MONTH calculation
      ]);

      // 8. Commit the transaction if everything is successful
      await connection.commit();
      connection.release();

      return NextResponse.json(
        { message: "Fixed Deposit created and funded successfully!", fdId: fdResult.insertId },
        { status: 201 }
      );

    } catch (dbError: unknown) {
      // Rollback the transaction if any database operation fails
      await connection.rollback();
      connection.release();
      const msg = dbError instanceof Error ? dbError.message : "Database transaction failed.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

  } catch (error) {
    console.error("FD Creation Error:", error);
    return NextResponse.json(
      { error: "An internal server error occurred while creating the FD." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const connection = await pool.getConnection();
    
    // Fetch all fixed deposits with joined customer details
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT 
        fd.fd_number, 
        c.full_name AS customer_name, 
        fd.principal AS principal_amount, 
        fd.annual_rate AS interest_rate,
        fd.term_months,
        fd.status 
      FROM fixed_deposits fd
      LEFT JOIN savings_accounts sa ON fd.source_account_id = sa.id
      LEFT JOIN customer_accounts ca ON sa.id = ca.account_id
      LEFT JOIN customers c ON ca.customer_id = c.id
      ORDER BY fd.opened_at DESC
    `);
    
    connection.release();

    return NextResponse.json(
      { data: rows },
      { status: 200 }
    );
    
  } catch (error) {
    console.error("GET FD Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fixed deposits data." },
      { status: 500 }
    );
  }
}
