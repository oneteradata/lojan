import express from 'express';
import { createServer as createViteServer } from 'vite';
import pkg from 'pg';
import path from 'path';

const { Pool } = pkg;

// Configuração de conexão do PostgreSQL
// Credenciais definidas via instrução do Easypanel VPS
const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  host: process.env.DB_HOST || 'sites_postgree_db_vitrine',
  database: process.env.DB_NAME || 'site',
  password: process.env.DB_PASSWORD || '1234',
  port: 5432,
});

// Adiciona tratamento de erro na pool para evitar que a aplicação faça throw em falhas de EAI_AGAIN
pool.on('error', (err) => {
  console.error('Erro inesperado no banco de dados Postgres (provavelmente desenvolvimento local):', err.message);
});

let dbConnected = false;

async function initDB() {
  try {
    // Testa a conexão antes de tentar rodar os comandos
    await pool.query('SELECT 1');
    dbConnected = true;

    // Criação da tabela de produtos (nova estrutura Voryx Admin)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        tokens INTEGER DEFAULT 0,
        stock INTEGER DEFAULT 0,
        details TEXT,
        media JSONB DEFAULT '[]',
        variations JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Atualiza a tabela existente caso já exista, para evitar erros (Fallback agressivo para dev)
    try {
      await pool.query(`ALTER TABLE products ADD COLUMN category VARCHAR(100);`);
      await pool.query(`ALTER TABLE products ADD COLUMN tokens INTEGER DEFAULT 0;`);
      await pool.query(`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;`);
      await pool.query(`ALTER TABLE products ADD COLUMN details TEXT;`);
      await pool.query(`ALTER TABLE products ADD COLUMN media JSONB DEFAULT '[]';`);
      await pool.query(`ALTER TABLE products ADD COLUMN variations JSONB DEFAULT '[]';`);
    } catch (e) {}

    // Inserção inicial de produtos, caso a tabela esteja vazia
    const result = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(result.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price, category, stock, media) VALUES 
        ('Produto Exemplo', 50.00, 'Geral', 5, '[{"type": "image", "url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=800"}]');
      `);
    }

    // Criação da tabela de usuários (Para testes e acesso)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user'
      );
    `);

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';`);
    } catch (e) {}

    // Criação da tabela de pedidos (orders) e os itens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        total_price VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pendente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL
      );
    `);

    // Inserção de um usuário admin teste se não existir
    const userResult = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userResult.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (email, password, name) VALUES 
        ('admin@valentina.com', 'admin', 'Admin Valentina');
      `);
    }
    console.log('✅ Banco de dados PostgreSQL sincronizado com sucesso.');
  } catch (err: any) {
    console.warn('⚠️ Banco de dados Postgres inacessível (normal se executado fora do Easypanel VPS). Usando fallback visual. Erro:', err.message);
    dbConnected = false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Inicia banco de dados
  initDB();

  // ----- ROTAS DA API -----

  // Leitura de produtos
  app.get('/api/products', async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM products ORDER BY id DESC');
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Criação de produto
  app.post('/api/products', async (req, res) => {
    const { name, category, price, tokens, stock, details, media, variations } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const result = await pool.query(`
        INSERT INTO products (name, category, price, tokens, stock, details, media, variations)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      `, [
        name, category, price, tokens, stock, details, 
        JSON.stringify(media || []), JSON.stringify(variations || [])
      ]);
      res.json({ success: true, product: result.rows[0] });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro ao criar produto.' });
    }
  });

  // Deletar produto
  app.delete('/api/products/:id', async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar produto.' });
    }
  });

  // Dashboard Stats
  app.get('/api/stats', async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const prodRes = await pool.query('SELECT COUNT(*) FROM products');
      const ordersRes = await pool.query('SELECT COUNT(*) FROM orders');
      const stockRes = await pool.query('SELECT SUM(stock) as total_stock FROM products');
      
      res.json({
        success: true,
        stats: {
          products: parseInt(prodRes.rows[0].count) || 0,
          orders: parseInt(ordersRes.rows[0].count) || 0,
          stock: parseInt(stockRes.rows[0].total_stock) || 0,
          likes: 0 // Mock for now
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' });
    }
  });

  // Leitura de pedidos
  app.get('/api/orders', async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query(`
        SELECT o.*, u.name as customer_name, u.email as customer_email 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.id DESC
      `);
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Login de usuários
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      if (!dbConnected) {
        // Fallback de demonstração caso o banco não conecte (Modo dev)
        if (email === 'admin@valentina.com' && password === 'admin') {
           return res.json({ success: true, user: { id: 1, name: 'Admin Valentina', email } });
        }
        return res.status(401).json({ success: false, error: 'Credenciais inválidas. Tente admin@valentina.com e admin' });
      }

      const dbResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1 AND password = $2', [email, password]);
      if (dbResult.rows.length > 0) {
        res.json({ success: true, user: dbResult.rows[0] });
      } else {
        res.status(401).json({ success: false, error: 'Credenciais inválidas. Tente novamente.' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Registro de usuários
  app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
    }

    try {
      if (!dbConnected) {
        return res.json({ success: true, user: { id: Date.now(), name, email } });
      }

      // Verifica se o email já existe
      const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
      }

      // Insere o novo usuário
      const insertResult = await pool.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, password]
      );
      
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err) {
      console.error('Erro ao registrar usuário:', err);
      res.status(500).json({ success: false, error: 'Erro interno ao tentar registrar a conta.' });
    }
  });

  // Criar novo pedido (Cart Checkout)
  app.post('/api/orders', async (req, res) => {
    const { userId, total, items } = req.body;
    
    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Dados do pedido incompletos.' });
    }

    try {
      if (!dbConnected) {
        return res.json({ success: true, orderId: Date.now() }); // Fallback
      }

      // 1. Cria o pedido no Postgres
      const orderResult = await pool.query(
        'INSERT INTO orders (user_id, total_price) VALUES ($1, $2) RETURNING id',
        [userId, total]
      );
      const orderId = orderResult.rows[0].id;

      // 2. Insere os itens
      for (const item of items) {
         try {
           await pool.query(
             'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
             [orderId, parseInt(item.id), parseInt(item.quantity)]
           );
         } catch (itemErr: any) {
           console.warn(`Erro ao inserir item ${item.id} no pedido ${orderId}. Produto pode ter sido deletado do banco ou o tipo de dado está errado. Msg: ${itemErr.message}`);
         }
      }

      res.json({ success: true, orderId });
    } catch (err: any) {
      console.error('Erro geral ao registrar pedido:', err.message);
      res.status(500).json({ success: false, error: 'PostgreSQL - Falha ao gravar a ordem.' });
    }
  });

  // ----- INTEGRAÇÃO COM VITE (SERVER & FRONTEND SPA) -----

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Modo de Produção: Servir frontend compilado em `dist`
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
