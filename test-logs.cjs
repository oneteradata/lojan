const { Pool } = require('pg');

const pool = new Pool({});

async function run() {
  const res = await pool.query('SELECT * FROM logs ORDER BY id DESC LIMIT 5');
  console.log(res.rows);
}
run();
