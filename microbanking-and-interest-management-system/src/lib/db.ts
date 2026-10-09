import mysql from 'mysql2/promise';

// Create a connection pool to manage database connections efficiently
const pool = mysql.createPool({
  host: 'localhost',          // The database server address
  user: 'root',               // Default XAMPP username
  password: 'PSandDT@2004',               // Default password is empty
  database: 'mims_dev_test',  // Your actual database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;