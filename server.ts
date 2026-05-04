import express from 'express';
import { createServer as createViteServer } from 'vite';
import pkg from 'pg';
import path from 'path';
import * as Minio from 'minio';
import multer from 'multer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'valentina_jwt_super_secret_key_2026';

const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
  }
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso negado. Requer privilégios de administrador.' });
  }
  next();
};


const { Pool } = pkg;

// Configuração do MinIO
const minioClient = new Minio.Client({
  endPoint: 'file.voryx.com.br',
  port: 443,
  useSSL: true,
  accessKey: 'admin',
  secretKey: '88490805'
});
const upload = multer({ storage: multer.memoryStorage() });

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
    try { await pool.query(`ALTER TABLE products ADD COLUMN user_id INTEGER;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN user_name VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN business_model VARCHAR(50) DEFAULT 'Venda';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN tables TEXT;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN seats_per_table VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN category VARCHAR(100);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN tokens INTEGER DEFAULT 0;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN details TEXT;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN media JSONB DEFAULT '[]';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN variations JSONB DEFAULT '[]';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ALTER COLUMN image DROP NOT NULL;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ALTER COLUMN price DROP NOT NULL;`); } catch (e) {}

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

    try { await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN company_name VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN company_logo TEXT;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN nome_completo VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN primeiro_nome VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN data_nascimento VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN telegram VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN melhor_horario VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN interesses TEXT;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN senha_mestre VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN convite VARCHAR(255);`); } catch (e) {}

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
    
    // Atualiza tabela para suportar opções selecionadas (fallback dev)
    try { await pool.query(`ALTER TABLE order_items ADD COLUMN chosen_options JSONB DEFAULT '[]';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE order_items ADD COLUMN final_price NUMERIC;`); } catch (e) {}

    // Inserção de um usuário admin teste se não existir
    const userResult = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userResult.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (email, password, name, role) VALUES 
        ('admin@valentina.com', 'admin', 'Admin Valentina', 'admin');
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
  app.use(express.json({ limit: '250mb' }));
  app.use(express.urlencoded({ extended: true, limit: '250mb' }));
  const PORT = 3000;

  // Inicia banco de dados
  initDB();

  // ----- ROTAS DA API -----

  // Leitura de produtos (Pública - Vitrine)
  app.get('/api/products', async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM products ORDER BY id DESC');
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Leitura de produtos (Admin Dashboard)
  app.get('/api/admin/products', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userRole = req.user.role;
      const userId = req.user.id;
      let dbResult;
      
      if (userRole === 'admin') {
        dbResult = await pool.query('SELECT * FROM products ORDER BY id DESC');
      } else {
        dbResult = await pool.query('SELECT * FROM products WHERE user_id = $1 ORDER BY id DESC', [userId]);
      }
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão.' });
    }
  });

  // Criação de produto
  app.post('/api/products', requireAuth, async (req: any, res) => {
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userId = req.user.id;
      const userName = req.user.name;
      const imagesString = (media || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        INSERT INTO products (name, category, price, tokens, stock, details, media, variations, image, user_id, user_name, business_model, tables, seats_per_table)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(media || []), JSON.stringify(variations || []), imagesString, userId, userName, business_model || 'Venda', tables || null, seats_per_table || null
      ]);
      res.json({ success: true, product: result.rows[0] });
    } catch (err: any) {
      console.error('Erro ao criar:', err);
      res.status(500).json({ success: false, error: 'Erro ao criar produto: ' + err.message });
    }
  });

  // Deletar produto
  app.delete('/api/products/:id', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (req.user.role !== 'admin') {
         const product = await pool.query('SELECT user_id FROM products WHERE id = $1', [req.params.id]);
         if (product.rows.length === 0 || product.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Sem permissão para deletar este produto.' });
         }
      }
      await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar produto.' });
    }
  });

  // Editar produto
  app.put('/api/products/:id', requireAuth, async (req: any, res) => {
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      
      if (req.user.role !== 'admin') {
         const product = await pool.query('SELECT user_id FROM products WHERE id = $1', [req.params.id]);
         if (product.rows.length === 0 || product.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Sem permissão para editar este produto' });
         }
      }

      const imagesString = (media || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        UPDATE products 
        SET name = $1, category = $2, price = $3, tokens = $4, stock = $5, details = $6, media = $7, variations = $8, image = $9, business_model = $10, tables = $11, seats_per_table = $12
        WHERE id = $13 RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(media || []), JSON.stringify(variations || []), imagesString, business_model || 'Venda', tables || null, seats_per_table || null,
        req.params.id
      ]);
      res.json({ success: true, product: result.rows[0] });
    } catch (err: any) {
      console.error('Erro ao editar:', err);
      res.status(500).json({ success: false, error: 'Erro ao editar produto: ' + err.message });
    }
  });

  // Obter link de upload direto pro MinIO
  app.post('/api/presigned-url', async (req, res) => {
    const { fileName, mimeType } = req.body;
    if (!fileName) return res.status(400).json({ error: 'Falta o nome do arquivo' });
    try {
      const bucketExists = await minioClient.bucketExists('marketplace');
      if (!bucketExists) await minioClient.makeBucket('marketplace', 'us-east-1');
      // expira em 1 dia (86400 segundos)
      const url = await minioClient.presignedPutObject('marketplace', fileName, 86400); 
      res.json({ success: true, url });
    } catch (err) {
      console.error('Erro Gerar Presigned URL MinIO:', err);
      res.status(500).json({ error: 'Erro ao gerar link de upload direto.' });
    }
  });

  // (Fallback caso o CORS não permita upload direto, mantido por compatibilidade)
  app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
    try {
      const bucketExists = await minioClient.bucketExists('marketplace');
      if (!bucketExists) await minioClient.makeBucket('marketplace', 'us-east-1');
      const metaData = { 'Content-Type': req.file.mimetype };
      await minioClient.putObject('marketplace', fileName, req.file.buffer, req.file.size, metaData);
      const url = `https://file.voryx.com.br/marketplace/${fileName}`;
      res.json({ success: true, url, fileName });
    } catch (err) {
      console.error('Erro MinIO Upload:', err);
      res.status(500).json({ error: 'Erro ao fazer upload no MinIO.' });
    }
  });

  // Delete File MinIO
  app.delete('/api/upload/:fileName', requireAuth, async (req, res) => {
    try {
      await minioClient.removeObject('marketplace', req.params.fileName);
      res.json({ success: true });
    } catch (err) {
      console.error('Erro MinIO Remove:', err);
      res.status(500).json({ error: 'Erro ao deletar arquivo no MinIO' });
    }
  });

  // Dashboard Stats
  app.get('/api/stats', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      let prodQuery = 'SELECT COUNT(*) FROM products';
      let prodVals = [];
      let stockQuery = 'SELECT SUM(stock) as total_stock FROM products';
      let stockVals = [];
      let ordersQuery = 'SELECT COUNT(*) FROM orders';
      let ordersVals = [];

      if (!isAdmin) {
          prodQuery += ' WHERE user_id = $1';
          prodVals.push(userId);
          stockQuery += ' WHERE user_id = $1';
          stockVals.push(userId);
          ordersQuery = 'SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.user_id = $1';
          ordersVals.push(userId);
      }

      const prodRes = await pool.query(prodQuery, prodVals);
      const ordersRes = await pool.query(ordersQuery, ordersVals);
      const stockRes = await pool.query(stockQuery, stockVals);
      
      res.json({
        success: true,
        stats: {
          products: parseInt(prodRes.rows[0].count) || 0,
          orders: parseInt(ordersRes.rows[0].count) || 0,
          stock: parseInt(stockRes.rows[0].total_stock) || 0,
          likes: 0
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' });
    }
  });

  // Leitura de pedidos
  app.get('/api/orders', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      let dbResult;
      if (isAdmin) {
          dbResult = await pool.query(`
            SELECT o.*, u.name as customer_name, u.email as customer_email 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.id DESC
          `);
      } else {
          dbResult = await pool.query(`
            SELECT DISTINCT o.*, u.name as customer_name, u.email as customer_email 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE p.user_id = $1
            ORDER BY o.id DESC
          `, [userId]);
      }
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Leitura de usuários
  app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT id, name, email, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite FROM users ORDER BY id DESC');
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Criação de usuário (painel admin)
  app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { name, email, password, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Dados incompletos.' });
    try {
      if (!dbConnected) throw new Error("DB offline");
      const pass = password;
      const insertResult = await pool.query(
        'INSERT INTO users (name, email, password, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, name, email, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite',
        [name, email, pass, role || 'user', company_name || null, company_logo || null, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, senha_mestre || null, convite || null]
      );
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Edição de usuário (painel admin)
  app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, email, role, password, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (password) {
        const u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, password = $4, company_name = $5, company_logo = $6, nome_completo = $8, primeiro_nome = $9, data_nascimento = $10, telegram = $11, melhor_horario = $12, interesses = $13, senha_mestre = $14, convite = $15 WHERE id = $7 RETURNING id, name, email, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite',
          [name, email, role, password, company_name || null, company_logo || null, req.params.id, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, senha_mestre || null, convite || null]
        );
        return res.json({ success: true, user: u.rows[0] });
      } else {
        const u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, company_name = $4, company_logo = $5, nome_completo = $7, primeiro_nome = $8, data_nascimento = $9, telegram = $10, melhor_horario = $11, interesses = $12, senha_mestre = $13, convite = $14 WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, senha_mestre, convite',
          [name, email, role, company_name || null, company_logo || null, req.params.id, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, senha_mestre || null, convite || null]
        );
        return res.json({ success: true, user: u.rows[0] });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Deletar usuário
  app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar usuário.' });
    }
  });

  // Login de usuários
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      if (!dbConnected) {
        // Fallback de demonstração caso o banco não conecte (Modo dev)
        if (email === 'admin@valentina.com' && password === 'admin') {
           const user = { id: 1, name: 'Admin Valentina', email, role: 'admin' };
           const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1d' });
           return res.json({ success: true, user, token });
        }
        return res.status(401).json({ success: false, error: 'Credenciais inválidas. Tente admin@valentina.com e admin' });
      }

      let dbResult;
      if (!isNaN(Number(email))) {
        dbResult = await pool.query('SELECT id, name, email, role FROM users WHERE (email = $1 OR id = $2) AND password = $3', [email, Number(email), password]);
      } else {
        dbResult = await pool.query('SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2', [email, password]);
      }

      if (dbResult.rows.length > 0) {
        const user = dbResult.rows[0];
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, user, token });
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
    const { name, email, password, company_name, company_logo } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
    }

    try {
      if (!dbConnected) {
        const user = { id: Date.now(), name, email, role: 'user', company_name, company_logo };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ success: true, user, token });
      }

      // Verifica se o email já existe
      const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
      }

      // Insere o novo usuário
      const insertResult = await pool.query(
        'INSERT INTO users (name, email, password, role, company_name, company_logo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, company_name, company_logo',
        [name, email, password, 'user', company_name || null, company_logo || null]
      );
      
      const user = insertResult.rows[0];
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1d' });
      res.json({ success: true, user, token });
    } catch (err) {
      console.error('Erro ao registrar usuário:', err);
      res.status(500).json({ success: false, error: 'Erro interno ao tentar registrar a conta.' });
    }
  });

  // Criar novo pedido (Cart Checkout)
  app.post('/api/orders', requireAuth, async (req, res) => {
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
             'INSERT INTO order_items (order_id, product_id, quantity, chosen_options, final_price) VALUES ($1, $2, $3, $4, $5)',
             [orderId, parseInt(item.id), parseInt(item.quantity), JSON.stringify(item.chosenOptions || []), item.finalPrice || 0]
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
