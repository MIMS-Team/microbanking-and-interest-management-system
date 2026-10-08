import { NextResponse } from 'next/server';
import pool from '@/lib/db'; // Import the database connection

export async function POST(request: Request) {
  try {
    // 1. Extract all required data sent from the frontend
    const body = await request.json();
    const { accountNumber, branchId, agentId, rateId, customerId, balance } = body;

    // 2. Validate that all mandatory fields are provided
    if (!accountNumber || !branchId || !agentId || !rateId || !customerId) {
      return NextResponse.json(
        { error: "Account Number, Branch ID, Agent ID, Rate ID, and Customer ID are required!" },
        { status: 400 }
      );
    }

    // 3. Get a dedicated connection for our transaction
    const connection = await pool.getConnection();
    
    // Start the transaction (ensures both inserts succeed or both fail)
    await connection.beginTransaction();

    try {
      // Step A: Insert the new account into 'savings_accounts' table
      const insertAccountQuery = `
        INSERT INTO savings_accounts (account_number, branch_id, agent_id, rate_id, balance) 
        VALUES (?, ?, ?, ?, ?)
      `;
      const [accountResult]: any = await connection.execute(insertAccountQuery, [
        accountNumber, 
        branchId, 
        agentId, 
        rateId, 
        balance || 0 // Default to 0 if no balance is provided
      ]);

      // Get the ID of the newly created savings account
      const newAccountId = accountResult.insertId;

      // Step B: Link the customer to this new account in 'customer_accounts' table
      const insertLinkQuery = `
        INSERT INTO customer_accounts (customer_id, account_id) 
        VALUES (?, ?)
      `;
      await connection.execute(insertLinkQuery, [customerId, newAccountId]);

      // If both steps were successful, save (commit) the changes to the database
      await connection.commit();
      
      // Release the connection back to the pool
      connection.release();

      // 4. Send a success response back to the frontend
      return NextResponse.json(
        { message: "Savings Account created and linked successfully!", accountId: newAccountId },
        { status: 201 }
      );

    } catch (dbError) {
      // If anything fails, undo (rollback) all changes made in this transaction
      await connection.rollback();
      connection.release();
      throw dbError; // Pass the error to the outer catch block
    }

  } catch (error) {
    console.error("Database connection or query error:", error);
    return NextResponse.json(
      { error: "An internal server error occurred while creating the account." },
      { status: 500 }
    );
  }
}
// GET API - To fetch all savings accounts and their owners
export async function GET() {
  try {
    // Write the SQL query to join 3 tables and get meaningful data
    const query = `
      SELECT 
        sa.id AS account_id, 
        sa.account_number, 
        sa.balance, 
        sa.status, 
        c.full_name AS customer_name
      FROM savings_accounts sa
      JOIN customer_accounts ca ON sa.id = ca.account_id
      JOIN customers c ON ca.customer_id = c.id
      ORDER BY sa.opened_at DESC
    `;

    // Execute the query using our connection pool
    const [rows] = await pool.execute(query);

    // Send the fetched data back to the frontend
    return NextResponse.json(
      { message: "Accounts fetched successfully!", data: rows }, 
      { status: 200 } // 200 OK
    );

  } catch (error) {
    console.error("Error fetching savings accounts:", error);
    return NextResponse.json(
      { error: "An internal server error occurred while fetching accounts." },
      { status: 500 }
    );
  }
}