import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST() {
  try {
    // This query updates the maturity_date of all active/pending FDs to "yesterday" 
    // This is strictly for testing the interest calculation cron job
    const query = `
      UPDATE fixed_deposits 
      SET maturity_date = DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY) 
      WHERE status = 'pending' OR status = 'active'
    `;
    
    const [result]: any = await pool.execute(query);
    
    return NextResponse.json({ 
      message: "Dates updated to past successfully!", 
      changedRows: result.affectedRows 
    }, { status: 200 });

  } catch (error) {
    console.error("Update Error:", error);
    return NextResponse.json({ error: "Failed to update dates." }, { status: 500 });
  }
}