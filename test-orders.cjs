const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
   try {
     const salesResult = await pool.query(`
            SELECT DISTINCT o.*, u.name as customer_name, u.email as customer_email 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE p.user_id = $1
            ORDER BY o.id DESC
          `, [2]);
     console.log("Sales count:", salesResult.rows.length);
   } catch(e) {
     console.error("error:", e.message);
   }
}
run().then(()=>process.exit(0)).catch(e=>{console.error("error:", e.message); process.exit(1)});
