import express from 'express';
import { createServer as createViteServer } from 'vite';
import pkg from 'pg';
import path from 'path';

const { Pool } = pkg;

// Configuração de conexão do PostgreSQL
// Credenciais definidas via instrução do Easypanel VPS
const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  host: process.env.DB_HOST || 'sites_vibe_banco_de_dados',
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

    // Criação da tabela de produtos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price VARCHAR(50) NOT NULL,
        image TEXT NOT NULL
      );
    `);

    // Inserção inicial de produtos, caso a tabela esteja vazia
    const result = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(result.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price, image) VALUES 
        ('Vestido Seda Siena', 'R$ 2.450', 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=800'),
        ('Blazer Estruturado Noir', 'R$ 3.890', 'https://images.unsplash.com/photo-1604467794349-0b74285de7e7?auto=format&fit=crop&q=80&w=800'),
        ('Calça Alfaiataria Creme', 'R$ 1.680', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=800'),
        ('Trench Coat Clássico', 'R$ 5.200', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800');
      `);
    }

    // Criação da tabela de usuários (Para testes e acesso)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255)
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
      const dbResult = await pool.query('SELECT * FROM products ORDER BY id ASC');
      res.json(dbResult.rows);
    } catch (err) {
      // Retorna fallback se não houver conexão no ambiente AI Studio
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
