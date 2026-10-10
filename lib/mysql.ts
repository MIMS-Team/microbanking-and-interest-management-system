import mysql from 'mysql2/promise';

// MySQL pool used by the savings and fixed-deposit routes.
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'mims_dev_test',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
