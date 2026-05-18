const pg = require('pg');
const pool = new pg.Pool({});

async function run() {
  try {
    const email = "admin@valentina.com";
    const password = "admin";
    if (!isNaN(Number(email))) {
        await pool.query('SELECT id FROM users WHERE (email = $1 OR id = $2) AND password = $3', [email, Number(email), password]);
    } else {
        await pool.query('SELECT id FROM users WHERE email = $1 AND password = $2', [email, password]);
    }
    console.log("SUCCESS");
  } catch(e) {
    console.error(e);
  }
}
run();
