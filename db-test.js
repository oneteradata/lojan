import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function run() {
  const result = await pool.query('SELECT id, name, email, role, is_approved FROM users');
  console.table(result.rows);
  const clientRes = await pool.query('SELECT id, nome_completo, email, role FROM user_client');
  console.log('user_client table:');
  console.table(clientRes.rows);
  await pool.end();
}
run();
