import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool;

try {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aether_ai_db',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0
  });

  // Verify connection pool capacity
  pool.getConnection()
    .then((conn) => {
      console.log('Successfully connected to MySQL database pool.');
      conn.release();
    })
    .catch((err) => {
      console.error('WARNING: Database connection failed on initialization:', err.message);
      console.log('Ensure MySQL is running and the database specified in server/.env exists.');
    });
} catch (error) {
  console.error('Failed to create MySQL database pool:', error);
}

export default pool;
