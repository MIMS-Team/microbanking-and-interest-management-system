import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. Fetch all FDs that have matured today or earlier
    const [maturedFDs] = await connection.execute<RowDataPacket[]>(`
      SELECT * FROM fixed_deposits 
      WHERE maturity_date <= CURRENT_DATE 
      AND status IN ('active', 'pending')
    `);

    let processedCount = 0;

    for (const fd of maturedFDs) {
      const principal = parseFloat(fd.principal);
      const annualRate = parseFloat(fd.annual_rate);
      const termMonths = parseInt(fd.term_months);
      const isAutoRenew = fd.auto_renew === 1;

      // Calculate the interest amount for the term
      // Formula: (Principal * (Annual Rate / 100)) * (Term Months / 12)
      const interestAmount = (principal * (annualRate / 100)) * (termMonths / 12);

      if (isAutoRenew) {
        // --- AUTO RENEW SCENARIO ---
        
        // 1. Deposit ONLY the interest into the linked savings account
        await connection.execute(
          `UPDATE savings_accounts SET balance = balance + ? WHERE id = ?`,
          [interestAmount, fd.source_account_id]
        );

        // 2. Generate a new FD number (appending -R to the old number)
        const newFdNumber = `${fd.fd_number}-R${Math.floor(Math.random() * 1000)}`;

        // 3. Create the new Fixed Deposit record with the principal amount
        await connection.execute(`
          INSERT INTO fixed_deposits 
          (fd_number, source_account_id, rate_id, principal, annual_rate, term_months, auto_renew, maturity_date, renewed_from_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? MONTH), ?)
        `, [
          newFdNumber, fd.source_account_id, fd.rate_id, principal, annualRate, termMonths, 1, termMonths, fd.id
        ]);

      } else {
        // --- NORMAL CLOSURE SCENARIO (No Auto Renew) ---
        
        const totalAmount = principal + interestAmount;
        
        // Deposit the total amount (Principal + Interest) into the linked savings account
        await connection.execute(
          `UPDATE savings_accounts SET balance = balance + ? WHERE id = ?`,
          [totalAmount, fd.source_account_id]
        );
      }

      // Mark the old FD as 'closed' (Common for both scenarios)
      await connection.execute(
        `UPDATE fixed_deposits SET status = 'closed' WHERE id = ?`,
        [fd.id]
      );

      processedCount++;
    }

    await connection.commit();
    connection.release();

    return NextResponse.json({ 
      message: "Daily FD interest calculation completed successfully!", 
      processedFDs: processedCount 
    }, { status: 200 });

  } catch (error: unknown) {
    await connection.rollback();
    connection.release();
    console.error("Interest Calculation Error:", error);
    return NextResponse.json({ error: "Failed to calculate interest." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT id, amount, status FROM fixed_deposits ORDER BY id DESC LIMIT 100
    `);
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error: unknown) {
    console.error("GET Interest Error:", error);
    return NextResponse.json({ error: "Failed to fetch interest data." }, { status: 500 });
  }
}

// Needed so TypeScript treats this as ESM module
export type { ResultSetHeader };
