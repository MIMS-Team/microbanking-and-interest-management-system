import pool from '../src/lib/db';

async function run() {
  try {
    const connection = await pool.getConnection();

    // 0. Insert dummy rate
    await connection.execute(
      `INSERT IGNORE INTO rates (id, product, name, term_months, annual_rate, minimum_balance) 
       VALUES (?, ?, ?, ?, ?, ?);`,
      [1, 'savings', 'Regular Savings', 0, 4.5, 500.00]
    );

    // 1. Insert dummy customer
    const [customerResult] = await connection.execute(
      `INSERT INTO customers (customer_number, full_name, nic, date_of_birth, address, mobile, email, branch_id, agent_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['CUST-999', 'Jane Doe 999', '123456799V', '1990-01-01', '123 Dummy St', '0771234567', 'jane.doe999@example.com', 1, 1]
    );
    const customerId = (customerResult as any).insertId;

    // 2. Insert dummy savings account
    const [accountResult] = await connection.execute(
      `INSERT INTO savings_accounts (account_number, branch_id, agent_id, rate_id, balance, status) 
       VALUES (?, ?, ?, ?, ?, ?);`,
      ['SAV-999', 1, 1, 1, 50000.00, 'pending']
    );
    const accountId = (accountResult as any).insertId;

    // 3. Link customer to savings account
    await connection.execute(
      `INSERT INTO customer_accounts (customer_id, account_id) VALUES (?, ?);`,
      [customerId, accountId]
    );

    console.log('Successfully inserted dummy savings account!');
    connection.release();
    process.exit(0);
  } catch (error) {
    console.error('Error inserting dummy data:', error);
    process.exit(1);
  }
}

run();
