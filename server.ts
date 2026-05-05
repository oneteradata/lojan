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

function normalizeUserWallet(user: any) {
  if (!user) return;
  const rawWallet = user.wallet || {};
  let userTokens: string[] = [];
  const uidStr = String(user.id);
  if (Array.isArray(rawWallet.tokens)) {
    userTokens = rawWallet.tokens.filter((t: any) => typeof t === 'string');
  } else if (rawWallet[uidStr] && typeof rawWallet[uidStr] === 'object') {
    userTokens = Object.values(rawWallet[uidStr]).filter((t: any) => typeof t === 'string') as string[];
  } else {
    for (const k in rawWallet) {
      if (typeof rawWallet[k] === 'object' && !Array.isArray(rawWallet[k])) {
        userTokens = Object.values(rawWallet[k]).filter((t: any) => typeof t === 'string') as string[];
        break;
      }
    }
  }
  user.wallet = { tokens: userTokens };
}

async function logAction(userId: number | null, userEmail: string | null, eventName: string, details: string) {
  try {
    if (!dbConnected) return;
    await pool.query('INSERT INTO logs (user_id, user_email, event_name, details) VALUES ($1, $2, $3, $4)', 
      [userId, userEmail, eventName, details]);
  } catch(e) {
    console.error('Erro ao salvar log:', e);
  }
}

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

    try { await pool.query(`ALTER TABLE users ADD COLUMN wallet JSONB DEFAULT '{"tokens": []}';`); } catch (e) {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_client (
        id SERIAL PRIMARY KEY,
        nome_completo VARCHAR(255),
        primeiro_nome VARCHAR(255),
        data_nascimento VARCHAR(50),
        telegram VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        melhor_horario VARCHAR(255),
        interesses TEXT,
        senha_mestre VARCHAR(255),
        convite VARCHAR(255),
        role VARCHAR(50) DEFAULT 'client',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Novas tabelas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        event_name VARCHAR(255),
        user_id INTEGER,
        user_email VARCHAR(255),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_requests (
        id SERIAL PRIMARY KEY,
        user_id_recebedor INTEGER,
        user_id_solicitante INTEGER,
        quantidade INTEGER NOT NULL,
        tipo_token INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        product_token_cost_amount INTEGER DEFAULT 1,
        product_token_cost_type INTEGER DEFAULT 128
      );
    `);

    // Insert default system settings if missing
    try {
      const sysRes = await pool.query('SELECT COUNT(*) FROM system_settings');
      if (parseInt(sysRes.rows[0].count) === 0) {
        await pool.query('INSERT INTO system_settings (product_token_cost_amount, product_token_cost_type) VALUES (1, 128)');
      }
    } catch(e) {}

    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN cost_7d_amount INTEGER DEFAULT 1;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN cost_7d_type INTEGER DEFAULT 128;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN cost_30d_amount INTEGER DEFAULT 2;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN cost_30d_type INTEGER DEFAULT 256;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN duration_days INTEGER DEFAULT 7;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE logs ADD COLUMN status BOOLEAN DEFAULT false;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN is_available BOOLEAN DEFAULT false;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN req_token_amount INTEGER DEFAULT 1;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE products ADD COLUMN req_token_type INTEGER DEFAULT 128;`); } catch (e) {}


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
      const dbResult = await pool.query('SELECT * FROM products WHERE is_available = true ORDER BY id DESC');
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
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table, duration_days } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userId = req.user.id;
      const userName = req.user.name;
      const userEmail = req.user.email;

      const settingsResult = await pool.query('SELECT product_token_cost_amount, product_token_cost_type, cost_7d_amount, cost_7d_type, cost_30d_amount, cost_30d_type FROM system_settings LIMIT 1');
      const settings = settingsResult.rows[0];
      
      const duration = parseInt(duration_days) === 30 ? 30 : 7;
      let requiredAmount = 1;
      let requiredTypeLength = 128;
      
      if (duration === 30) {
        requiredAmount = settings && settings.cost_30d_amount !== null ? settings.cost_30d_amount : 2;
        requiredTypeLength = settings && settings.cost_30d_type !== null ? settings.cost_30d_type : 256;
      } else {
        requiredAmount = settings && settings.cost_7d_amount !== null ? settings.cost_7d_amount : (settings?.product_token_cost_amount || 1);
        requiredTypeLength = settings && settings.cost_7d_type !== null ? settings.cost_7d_type : (settings?.product_token_cost_type || 128);
      }

      // Check user wallet
      const userRes = await pool.query('SELECT wallet FROM users WHERE id = $1', [userId]);
      const rawWallet = userRes.rows[0].wallet || {};
      
      let userTokens: string[] = [];
      const uidStr = String(userId);
      let isObjectFormat = false;
      let targetObjKey = uidStr;
      
      if (Array.isArray(rawWallet.tokens)) {
        userTokens = rawWallet.tokens.filter((t: any) => typeof t === 'string');
      } else if (rawWallet[uidStr] && typeof rawWallet[uidStr] === 'object') {
        isObjectFormat = true;
        userTokens = Object.values(rawWallet[uidStr]).filter((t: any) => typeof t === 'string') as string[];
      } else {
        for (const k in rawWallet) {
          if (typeof rawWallet[k] === 'object' && !Array.isArray(rawWallet[k])) {
            isObjectFormat = true;
            targetObjKey = k;
            userTokens = Object.values(rawWallet[k]).filter((t: any) => typeof t === 'string') as string[];
            break;
          }
        }
      }
      
      const matchingTokens = userTokens.filter((t: string) => t.length === requiredTypeLength);
      
      if (matchingTokens.length < requiredAmount) {
        await logAction(userId, userEmail, 'criar_produto_falhou', `Tentou cadastrar produto (${duration} dias) mas não tem tokens suficientes (tem ${matchingTokens.length}, precisa ${requiredAmount} do tipo ${requiredTypeLength})`);
        return res.status(400).json({ success: false, error: `Saldo insuficiente para modalidade de ${duration} dias. Necessário ${requiredAmount} token(s) do tipo ${requiredTypeLength}.` });
      }

      // Deduct tokens
      let newWallet = rawWallet;
      let deducted = 0;
      
      if (isObjectFormat) {
        const tokensObj = { ...rawWallet[targetObjKey] };
        for (const k in tokensObj) {
           if (typeof tokensObj[k] === 'string' && tokensObj[k].length === requiredTypeLength && deducted < requiredAmount) {
              delete tokensObj[k];
              deducted++;
           }
        }
        newWallet = { ...rawWallet, [targetObjKey]: tokensObj };
      } else {
        const newTokensList = [];
        for (const t of userTokens) {
          if (t.length === requiredTypeLength && deducted < requiredAmount) {
            deducted++;
          } else {
            newTokensList.push(t);
          }
        }
        newWallet = { tokens: newTokensList };
      }
      
      await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [JSON.stringify(newWallet), userId]);

      const imagesString = (media || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        INSERT INTO products (name, category, price, tokens, stock, details, media, variations, image, user_id, user_name, business_model, tables, seats_per_table, is_available, req_token_amount, req_token_type, duration_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15, $16, $17) RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(media || []), JSON.stringify(variations || []), imagesString, userId, userName, business_model || 'Venda', tables || null, seats_per_table || null, requiredAmount, requiredTypeLength, duration
      ]);
      await logAction(userId, userEmail, 'produto_adicionado', `Produto ${result.rows[0].name} criado (pendente) para ${duration} dias e debitou ${requiredAmount} tokens do tipo ${requiredTypeLength}`);
      
      try {
        fetch('https://system.voryx.com.br/webhook/pagamentodetokenemcadastro').catch(e => console.error("Erro webhook:", e));
      } catch (e) {}

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
      const userEmail = req.user.email;
      if (req.user.role !== 'admin') {
         const product = await pool.query('SELECT user_id FROM products WHERE id = $1', [req.params.id]);
         if (product.rows.length === 0 || product.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Sem permissão para deletar este produto.' });
         }
      }
      const dbResult = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
      if (dbResult.rows.length > 0) {
          await logAction(req.user.id, userEmail, 'produto_removido', `Produto ${req.params.id} removido`);
          res.json({ success: true });
      } else {
          res.status(404).json({ success: false, error: 'Produto não encontrado.' });
      }
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar produto.' });
    }
  });

  // Editar produto
  app.put('/api/products/:id', requireAuth, async (req: any, res) => {
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table, is_available } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userEmail = req.user.email;
      const isAdmin = req.user.role === 'admin';
      
      const productObj = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
      if (productObj.rows.length === 0) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
      
      if (!isAdmin && productObj.rows[0].user_id !== req.user.id) {
          return res.status(403).json({ success: false, error: 'Sem permissão para editar este produto' });
      }

      // Se for admin, permite alterar is_available, se não, mantém o anterior
      const statusToSet = isAdmin && is_available !== undefined ? is_available : productObj.rows[0].is_available;

      const imagesString = (media || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        UPDATE products 
        SET name = $1, category = $2, price = $3, tokens = $4, stock = $5, details = $6, media = $7, variations = $8, image = $9, business_model = $10, tables = $11, seats_per_table = $12, is_available = $13
        WHERE id = $14 RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(media || []), JSON.stringify(variations || []), imagesString, business_model || 'Venda', tables || null, seats_per_table || null, statusToSet,
        req.params.id
      ]);
      await logAction(req.user.id, userEmail, 'produto_editado', `Produto ${req.params.id} (${name}) editado`);
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
      const dbResult = await pool.query('SELECT id, name, email, role, company_name, company_logo, wallet FROM users ORDER BY id DESC');
      dbResult.rows.forEach(normalizeUserWallet);
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Log user addition and deletion
  app.post('/api/users', requireAuth, requireAdmin, async (req: any, res) => {
    const { name, email, password, role, company_name, company_logo } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Dados incompletos.' });
    try {
      if (!dbConnected) throw new Error("DB offline");
      const pass = password;
      const insertResult = await pool.query(
        'INSERT INTO users (name, email, password, role, company_name, company_logo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, company_name, company_logo',
        [name, email, pass, role || 'user', company_name || null, company_logo || null]
      );
      await logAction(req.user.id, req.user.email, 'usuario_adicionado', `O admin adicionou ${email}`);
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', requireAuth, requireAdmin, async (req: any, res) => {
    const { name, email, role, password, company_name, company_logo } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      let u;
      if (password) {
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, password = $4, company_name = $5, company_logo = $6 WHERE id = $7 RETURNING id, name, email, role, company_name, company_logo',
          [name, email, role, password, company_name || null, company_logo || null, req.params.id]
        );
      } else {
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, company_name = $4, company_logo = $5 WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo',
          [name, email, role, company_name || null, company_logo || null, req.params.id]
        );
      }
      await logAction(req.user.id, req.user.email, 'usuario_editado', `O admin editou ${email}`);
      return res.json({ success: true, user: u.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      await logAction(req.user.id, req.user.email, 'usuario_removido', `O admin deletou usuário ${req.params.id}`);
      res.json({ success: true });
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar usuário.' });
    }
  });

  app.get('/api/me', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT id, name, email, role, company_name, company_logo, wallet FROM users WHERE id = $1', [req.user.id]);
      if (dbResult.rows.length > 0) {
        normalizeUserWallet(dbResult.rows[0]);
        res.json({ success: true, user: dbResult.rows[0] });
      } else {
        res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro ao buscar dados.' });
    }
  });

  // GET /api/logs
  app.get('/api/logs', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM logs ORDER BY id DESC LIMIT 500');
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // ========== CREDITS (PEDIDOS DE CRÉDITO) ==========
  app.get('/api/credit-requests', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const isAdmin = req.user.role === 'admin';
      let q = `
        SELECT cr.*, u_rec.name as recebedor_nome, u_rec.email as recebedor_email, u_sol.name as solicitante_nome 
        FROM credit_requests cr 
        LEFT JOIN users u_rec ON cr.user_id_recebedor = u_rec.id 
        LEFT JOIN users u_sol ON cr.user_id_solicitante = u_sol.id 
      `;
      let vars = [];
      if (!isAdmin) {
        q += ' WHERE cr.user_id_recebedor = $1';
        vars.push(req.user.id);
      }
      q += ' ORDER BY cr.id DESC';
      
      const dbResult = await pool.query(q, vars);
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão.' });
    }
  });

  app.post('/api/credit-requests', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { user_id_recebedor, quantidade, tipo_token } = req.body;
      if (!dbConnected) throw new Error("DB offline");
      const insertResult = await pool.query(
        'INSERT INTO credit_requests (user_id_recebedor, user_id_solicitante, quantidade, tipo_token, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [user_id_recebedor, req.user.id, quantidade, tipo_token, 'pendente']
      );
      await logAction(req.user.id, req.user.email, 'credito_solicitado', `Admin solicitou ${quantidade} tokens do tipo ${tipo_token} para o usuario ${user_id_recebedor}`);
      
      try {
        fetch('https://system.voryx.com.br/webhook/atualizasaldo').catch(e => console.error("Erro webhook:", e));
      } catch (e) {}

      res.json({ success: true, request: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/credit-requests/:id/status', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!dbConnected) throw new Error("DB offline");
      
      const reqId = req.params.id;
      const qRes = await pool.query('SELECT * FROM credit_requests WHERE id = $1', [reqId]);
      if (qRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
      
      const pedido = qRes.rows[0];
      
      // If changing to 'gerado', logic to add tokens to user wallet
      if (status === 'gerado' && pedido.status !== 'gerado') {
        const userRes = await pool.query('SELECT wallet FROM users WHERE id = $1', [pedido.user_id_recebedor]);
        if (userRes.rows.length > 0) {
           const wallet = userRes.rows[0].wallet || { tokens: [] };
           const userTokens = wallet.tokens || [];
           
           // Generate tokens string of required length
           const length = pedido.tipo_token;
           for(let i=0; i<pedido.quantidade; i++) {
             // Generate random string of length
             let tokenStr = '';
             const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
             for(let j=0; j<length; j++) {
               tokenStr += chars.charAt(Math.floor(Math.random() * chars.length));
             }
             userTokens.push(tokenStr);
           }
           wallet.tokens = userTokens;
           await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [JSON.stringify(wallet), pedido.user_id_recebedor]);
        }
      }

      const updateResult = await pool.query('UPDATE credit_requests SET status = $1 WHERE id = $2 RETURNING *', [status, reqId]);
      await logAction(req.user.id, req.user.email, 'credito_atualizado', `Admin mudou o status do pedido ${reqId} para ${status}`);
      res.json({ success: true, request: updateResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== SETTINGS ==========
  app.get('/api/settings', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM system_settings LIMIT 1');
      res.json({ success: true, settings: dbResult.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro de conexão com o banco de dados.' });
    }
  });

  app.put('/api/settings', requireAuth, requireAdmin, async (req: any, res) => {
    const { cost_7d_amount, cost_7d_type, cost_30d_amount, cost_30d_type } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query(`
        UPDATE system_settings 
        SET cost_7d_amount=$1, cost_7d_type=$2, cost_30d_amount=$3, cost_30d_type=$4
        RETURNING *
      `, [cost_7d_amount, cost_7d_type, cost_30d_amount, cost_30d_type]);
      await logAction(req.user.id, req.user.email, 'config_atualizada', 'Admin atualizou as configurações de tipo de tokens e valores');
      res.json({ success: true, settings: dbResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== USER_CLIENT ENDPOINTS ==========

  app.get('/api/user_client', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM user_client ORDER BY id DESC');
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  app.post('/api/user_client', requireAuth, requireAdmin, async (req, res) => {
    const { email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite } = req.body;
    if (!email || !senha_mestre) return res.status(400).json({ success: false, error: 'Email e senha mestre são obrigatórios.' });
    try {
      if (!dbConnected) throw new Error("DB offline");
      const insertResult = await pool.query(
        'INSERT INTO user_client (email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [email, senha_mestre, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, convite || null]
      );
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/user_client/:id', requireAuth, requireAdmin, async (req, res) => {
    const { email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite, role } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const u = await pool.query(
        'UPDATE user_client SET email = $1, senha_mestre = $2, nome_completo = $3, primeiro_nome = $4, data_nascimento = $5, telegram = $6, melhor_horario = $7, interesses = $8, convite = $9, role = $10 WHERE id = $11 RETURNING *',
        [email, senha_mestre, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, convite || null, role || 'client', req.params.id]
      );
      return res.json({ success: true, user: u.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/user_client/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      await pool.query('DELETE FROM user_client WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch(err) {
      res.status(500).json({ success: false, error: 'Erro ao deletar cliente.' });
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
        if (user.role === 'blocked') {
          await logAction(user.id, user.email, 'login_falhou', 'Usuário bloqueado tentou acessar');
          return res.status(403).json({ success: false, error: 'Usuário bloqueado pelo administrador.' });
        }
        await logAction(user.id, user.email, 'login', 'Login efetuado com sucesso');
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, user, token });
      } else {
        await logAction(null, email, 'login_falhou', 'Credenciais inválidas');
        res.status(401).json({ success: false, error: 'Credenciais inválidas. Tente novamente.' });
      }
    } catch (err) {
      console.error(err);
      await logAction(null, email, 'erro', 'Erro no login');
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
        await logAction(null, email, 'registro_falhou', 'E-mail já em uso');
        return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
      }

      // Insere o novo usuário
      const insertResult = await pool.query(
        'INSERT INTO users (name, email, password, role, company_name, company_logo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, company_name, company_logo',
        [name, email, password, 'user', company_name || null, company_logo || null]
      );
      
      const user = insertResult.rows[0];
      await logAction(user.id, user.email, 'registro', 'Conta criada com sucesso');
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
