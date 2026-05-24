import express from 'express';
import { createServer as createViteServer } from 'vite';
import pkg from 'pg';
import path from 'path';
import fs from 'fs';
import * as Minio from 'minio';
import multer from 'multer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod_12345';

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
  endPoint: process.env.MINIO_ENDPOINT || 'file.voryx.com.br',
  port: parseInt(process.env.MINIO_PORT || '443', 10),
  useSSL: process.env.MINIO_USE_SSL !== 'false',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || ''
});
const storage = multer.diskStorage({
  destination: '/tmp',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

async function initMinio() {
  try {
    const bucket = 'marketplace';
    const exists = await minioClient.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await minioClient.makeBucket(bucket, 'us-east-1');
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetBucketLocation', 's3:ListBucket'],
            Resource: [`arn:aws:s3:::${bucket}`],
          },
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
      console.log(`✅ Bucket '${bucket}' criado e configurado com política pública.`);
    } else {
      console.log(`✅ Bucket '${bucket}' já existe.`);
    }
  } catch (err: any) {
    console.error('⚠️ Erro ao inicializar MinIO:', err.message);
  }
}

// Configuração de conexão do PostgreSQL
// Credenciais definidas pelas variaveis de ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// Adiciona tratamento de erro na pool para evitar que a aplicação faça throw em falhas de EAI_AGAIN
pool.on('error', (err) => {
  console.error('Erro inesperado no banco de dados Postgres (provavelmente desenvolvimento local):', err.message);
});

let dbConnected = false;
const fallbackUsers: any[] = [];


const VALID_TOKEN_LENGTHS = new Set([16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);

function extractAllTokens(obj: any): string[] {
  let tokens: string[] = [];
  if (!obj) return tokens;

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (VALID_TOKEN_LENGTHS.has(trimmed.length)) {
      tokens.push(trimmed);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      tokens = tokens.concat(extractAllTokens(item));
    }
  } else if (typeof obj === 'object') {
    if (Array.isArray(obj.tokens)) {
      tokens = tokens.concat(extractAllTokens(obj.tokens));
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          tokens = tokens.concat(extractAllTokens(obj[key]));
        }
      }
    }
  }
  return Array.from(new Set(tokens));
}

function buildWalletObject(tokens: string[]): any {
  const cleanTokens = tokens.filter(t => typeof t === 'string' && VALID_TOKEN_LENGTHS.has(t.trim().length));
  const wallet: any = {
    tokens: cleanTokens,
    token_1: cleanTokens
  };

  for (const len of VALID_TOKEN_LENGTHS) {
    const listForLen = cleanTokens.filter(t => t.length === len);
    wallet[`token_${len}`] = listForLen;
  }

  return wallet;
}

function normalizeUserWallet(user: any) {
  if (!user) return;
  let rawWallet = user.wallet || {};
  if (typeof rawWallet === 'string') {
    try { rawWallet = JSON.parse(rawWallet); } catch (e) {}
  }
  const userTokens = extractAllTokens(rawWallet);
  user.wallet = buildWalletObject(userTokens);
}

async function logAction(userId: string | number | null, userEmail: string | null, eventName: string, details: string) {
  try {
    if (!dbConnected) return;
    await pool.query('INSERT INTO logs (user_id, user_email, event_name, details) VALUES ($1, $2, $3, $4)', 
      [userId, userEmail, eventName, details]);
  } catch(e) {
    console.error('Erro ao salvar log:', e);
  }
}

async function waitForWebhook(url: string, data: any): Promise<number> {
  const startTime = Date.now();
  let lastStatus = 0;
  
  while (Date.now() - startTime < 30000) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timestamp: Date.now() })
      });
      lastStatus = response.status;
      
      const text = await response.text();
      console.log(`[waitForWebhook] URL: ${url}, HTTP: ${response.status}, Resposta: ${text}`);
      
      let statusVal: any = null;
      try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
          statusVal = json.status !== undefined ? json.status : (json.code !== undefined ? json.code : (json.statusCode !== undefined ? json.statusCode : null));
        } else if (typeof json === 'number' || typeof json === 'string') {
          statusVal = json;
        }
      } catch (jsonErr) {
        if (text.includes('100')) {
          statusVal = 100;
        } else if (text.includes('200')) {
          statusVal = 200;
        }
      }

      // Se retornou status 100 (erro), sai imediatamente acusando erro
      if (statusVal === 100 || statusVal === '100') {
        console.log(`[waitForWebhook] Webhook retornou status 100 (Erro). Interrompendo espera.`);
        return 100;
      }

      // Se retornou 200 (sucesso) e o status HTTP é 200, tudo ocorreu bem!
      if (response.status === 200 && (statusVal === 200 || statusVal === '200' || statusVal === null)) {
        return 200;
      }
    } catch (e) {
      console.error(`Erro ao chamar webhook (${url}):`, e);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  return lastStatus;
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
    try { await pool.query(`ALTER TABLE products ADD COLUMN image TEXT;`); } catch (e) {}
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

    try { await pool.query(`ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN wallet JSONB DEFAULT '{"tokens": []}';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT false;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN can_transfer BOOLEAN DEFAULT true;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN can_request BOOLEAN DEFAULT true;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN can_request_delivery BOOLEAN DEFAULT true;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN telefone VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN endereco VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN bairro VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN cidade VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN numero VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN cep VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN dashboard_theme VARCHAR(50) DEFAULT 'light';`); } catch (e) {}

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

    try { await pool.query(`ALTER TABLE user_client ADD COLUMN telefone VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN endereco VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN bairro VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN cidade VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN numero VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN cep VARCHAR(50);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE user_client ADD COLUMN wallet JSONB DEFAULT '{"tokens": []}';`); } catch (e) {}

    // Novas tabelas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_interactions (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        user_id INTEGER,
        user_name VARCHAR(255),
        user_email VARCHAR(255),
        interaction_type VARCHAR(50),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_views (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_clicks (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    
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
        product_token_cost_type INTEGER DEFAULT 128,
        token_costs JSONB DEFAULT '{"16": 0, "32": 0, "64": 0, "128": 0, "256": 0, "512": 0, "1024": 0, "2048": 0, "4096": 0}',
        withdrawal_cost_4096 INTEGER DEFAULT 0,
        withdrawal_cost_2048 INTEGER DEFAULT 0,
        conversion_cost INTEGER DEFAULT 0
      );
    `);

    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN token_costs JSONB DEFAULT '{"16": 0, "32": 0, "64": 0, "128": 0, "256": 0, "512": 0, "1024": 0, "2048": 0, "4096": 0}';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN withdrawal_cost_4096 INTEGER DEFAULT 0;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN withdrawal_cost_2048 INTEGER DEFAULT 0;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE system_settings ADD COLUMN conversion_cost INTEGER DEFAULT 0;`); } catch (e) {}

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
    try { await pool.query(`ALTER TABLE logs ALTER COLUMN user_id TYPE VARCHAR(255);`); } catch (e) {}
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

    // --- RE-CREATE CONSTRAINTS WITH CASCADE DELETIONS FOR BULK CLEANUP ---
    try {
      await pool.query('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;').catch(()=>null);
      await pool.query('ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;').catch(()=>null);
      
      await pool.query('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;').catch(()=>null);
      await pool.query('ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;').catch(()=>null);
      
      await pool.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;').catch(()=>null);
      await pool.query('ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;').catch(()=>null);

      await pool.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_user_id_fkey;').catch(()=>null);
      await pool.query('ALTER TABLE orders ADD CONSTRAINT orders_delivery_user_id_fkey FOREIGN KEY (delivery_user_id) REFERENCES users(id) ON DELETE CASCADE;').catch(()=>null);
    } catch (conErr) {
      console.warn('Nota de relacionamentos CASCADE:', conErr);
    }

    // --- CREATION OF NOTIFICATIONS TABLE ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        user_id INTEGER,
        is_generic BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => null);
    
    // Atualiza tabela para suportar opções selecionadas (fallback dev)
    try { await pool.query(`ALTER TABLE order_items ADD COLUMN chosen_options JSONB DEFAULT '[]';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE order_items ADD COLUMN final_price NUMERIC;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE orders ADD COLUMN requires_delivery BOOLEAN DEFAULT false;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE orders ADD COLUMN delivery_user_id INTEGER REFERENCES users(id);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE orders ADD COLUMN seller_id INTEGER;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE orders ADD COLUMN default_shipping JSONB;`); } catch (e) {}

    // Inserção de um usuário admin teste se não existir
    const userResult = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(userResult.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO users (email, password, name, role) VALUES 
        ('admin@valentina.com', 'admin', 'Admin Valentina', 'admin');
      `);
    }

    // Configuração de Row Level Security (RLS) no PostgreSQL de forma abrangente
    try {
      console.log('Políticas RLS: Ativando Row Level Security nas tabelas principais...');
      // Ativa RLS para Products, Orders e Logs
      await pool.query('ALTER TABLE products ENABLE ROW LEVEL SECURITY;').catch(()=>null);
      await pool.query('ALTER TABLE orders ENABLE ROW LEVEL SECURITY;').catch(()=>null);
      await pool.query('ALTER TABLE logs ENABLE ROW LEVEL SECURITY;').catch(()=>null);
      
      // DROP policies se já existirem para evitar conflitos
      await pool.query('DROP POLICY IF EXISTS products_tenant_isolation ON products;').catch(()=>null);
      await pool.query('DROP POLICY IF EXISTS orders_tenant_isolation ON orders;').catch(()=>null);
      await pool.query('DROP POLICY IF EXISTS logs_tenant_isolation ON logs;').catch(()=>null);

      // Criar políticas padrão que usam variáveis de sessão 'app.user_id' e 'app.user_role'
      // única role que acessa tudo é 'admin'. Demais têm acesso isolado
      await pool.query(`
        CREATE POLICY products_tenant_isolation ON products FOR ALL 
        USING (
          current_setting('app.user_role', true) = 'admin' OR 
          user_id::text = current_setting('app.user_id', true) OR
          is_available = true
        );
      `).catch(()=>null);

      await pool.query(`
        CREATE POLICY orders_tenant_isolation ON orders FOR ALL 
        USING (
          current_setting('app.user_role', true) = 'admin' OR 
          user_id::text = current_setting('app.user_id', true) OR
          seller_id::text = current_setting('app.user_id', true)
        );
      `).catch(()=>null);

      await pool.query(`
        CREATE POLICY logs_tenant_isolation ON logs FOR ALL 
        USING (
          current_setting('app.user_role', true) = 'admin' OR 
          user_id::text = current_setting('app.user_id', true)
        );
      `).catch(()=>null);

      console.log('✅ RLS configurado com sucesso. Permissões de isolamento com exceção administrativa de role admin ativadas.');
    } catch(rlsError: any) {
      console.warn('⚠️ Nota RLS: Erro ao configurar políticas finas RLS na base Postgres:', rlsError.message);
    }

    console.log('✅ Banco de dados PostgreSQL sincronizado com sucesso.');
  } catch (err: any) {
    console.warn('⚠️ Banco de dados Postgres inacessível (normal se executado fora do Easypanel VPS). Usando fallback visual. Erro:', err.message);
    dbConnected = false;
  }
}

// Setup cron job for expired products
setInterval(async () => {
  if (!dbConnected) return;
  try {
    const expiredRes = await pool.query("SELECT id, name, media FROM products WHERE created_at + (duration_days || ' days')::interval < NOW()");
    for (const p of expiredRes.rows) {
      if (p.media) {
         try {
           const mediaArr = JSON.parse(p.media);
           if (Array.isArray(mediaArr)) {
             for (const m of mediaArr) {
                if (m.fileName) {
                  minioClient.removeObject('marketplace', m.fileName).catch(()=>null);
                }
             }
           }
         } catch(e) {}
      }
    }
    if (expiredRes.rows.length > 0) {
       const ids = expiredRes.rows.map((r: any) => r.id);
       await pool.query("DELETE FROM product_interactions WHERE product_id = ANY($1)", [ids]);
       await pool.query("DELETE FROM product_views WHERE product_id = ANY($1)", [ids]);
       await pool.query("DELETE FROM product_clicks WHERE product_id = ANY($1)", [ids]);
       await pool.query("DELETE FROM products WHERE id = ANY($1)", [ids]);
       console.log(`Cron: Deleted ${ids.length} expired products.`);
    }
  } catch(e) { console.error("Cron Error:", e); }
}, 1000 * 60 * 30); // 30 minutes

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '250mb' }));
  app.use(express.urlencoded({ extended: true, limit: '250mb' }));
  const PORT = 3000;

  // --- SERVIR UPLOADS LOCAL (FALLBACK SE O MINIO FALHAR) ---
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // --- SEGURANÇA E POLÍTICAS DE ORIGEM (CORS E FRAMING) ---
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    // Proteção contra Clickjacking: Bloquear o site de ser carregado dentro de outro site como sub site (iframe)
    // Se o host for o de produção, limita estritamente. No dev preview de AI Studio, libera para visualização normal do programador.
    if (host.includes('voryx.com.br') || host.includes('vitrine.voryx.com.br')) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://adm.vitrine.voryx.com.br https://vitrine.voryx.com.br;");
    } else {
      // Deixa o preview de desenvolvedor do Google AI Studio funcionar perfeitamente
      res.setHeader('X-Frame-Options', 'ALLOWALL');
    }

    // Configuração estrita de CORS protegendo a API
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://adm.vitrine.voryx.com.br',
      'https://vitrine.voryx.com.br',
      'http://localhost:3000'
    ];
    if (process.env.APP_URL) {
      allowedOrigins.push(process.env.APP_URL.replace(/\/$/, ''));
    }
    
    // Se a requisição vem de um domínio voryx.com.br ou da nossa área de desenvolvimento segura, permite CORS dinâmico
    if (origin && (allowedOrigins.includes(origin) || origin.endsWith('voryx.com.br') || origin.includes('google.com') || origin.includes('run.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'https://adm.vitrine.voryx.com.br');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Inicia banco de dados
  initDB();
  // Inicia MinIO
  initMinio();

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
        dbResult = await pool.query(`
          SELECT p.*,
                 (SELECT COUNT(*) FROM product_views WHERE product_id = p.id) as views_count,
                 (SELECT COUNT(*) FROM product_clicks WHERE product_id = p.id) as clicks_count,
                 (SELECT COUNT(*) FROM product_interactions WHERE product_id = p.id) as interactions_count
          FROM products p
          ORDER BY p.id DESC
        `);
      } else {
        dbResult = await pool.query(`
          SELECT p.*,
                 (SELECT COUNT(*) FROM product_views WHERE product_id = p.id) as views_count,
                 (SELECT COUNT(*) FROM product_clicks WHERE product_id = p.id) as clicks_count,
                 (SELECT COUNT(*) FROM product_interactions WHERE product_id = p.id) as interactions_count
          FROM products p
          WHERE p.user_id = $1
          ORDER BY p.id DESC
        `, [userId]);
      }
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão.' });
    }
  });

  // Criação de produto de exemplo automática (Bypass de token e webhook para testes rápidos)
  app.post('/api/products/example', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("Banco de dados fora do ar");
      const userId = req.user.id;
      const userName = req.user.name;
      const userEmail = req.user.email;

      // Lista de templates pré-configurados elegantes
      const templates = [
        {
          name: "iPhone 15 Pro Max (Exemplo)",
          category: "Eletrônico",
          price: "7899.90",
          details: "Smartphone Apple iPhone de exemplo. Possui tela de 6.7 polegadas, câmera tripla de ponta e acabamento premium em Titanium. Excelente para testar o catálogo.",
          image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=800",
          media: [{ type: "image", url: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=800" }],
          variations: [{ type: "Cor", options: ["Titanium Natural", "Titanium Preto", "Titanium Azul"], multiple: false, multipleCount: false }]
        },
        {
          name: "Bolsa de Couro Premium (Exemplo)",
          category: "Beleza feminina",
          price: "450.00",
          details: "Bolsa de couro legitimo ultra resistente com acabamento clássico e costurada à mão. Design moderno e sofisticado para o uso diário ou eventos.",
          image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
          media: [{ type: "image", url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800" }],
          variations: [{ type: "Cor", options: ["Caramelo", "Preto Clássico", "Nude"], multiple: false, multipleCount: false }]
        },
        {
          name: "Pizza Margherita Gourmet (Exemplo)",
          category: "Restaurante",
          price: "59.90",
          details: "Deliciosa pizza artesanal de fermentação natural (48 horas). Molho italiano caseiro, queijo mussarela fresca fatiada, manjericão fresco e azeite extravirgem.",
          image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=800",
          media: [{ type: "image", url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=800" }],
          variations: [{ type: "Borda Recheada", options: ["Sem borda", "Catupiry Original", "Cheddar Cremoso"], multiple: false, multipleCount: false }]
        }
      ];

      // Escolher um template aleatoriamente para diversificar os produtos criados nas tentativas do usuário
      const randomIndex = Math.floor(Math.random() * templates.length);
      const chosen = templates[randomIndex];

      const result = await pool.query(`
        INSERT INTO products (
          name, category, price, tokens, stock, details, media, variations, image, 
          user_id, user_name, business_model, tables, seats_per_table, is_available, 
          req_token_amount, req_token_type, duration_days
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, 0, 128, 30) RETURNING *
      `, [
        chosen.name, chosen.category, chosen.price, 0, 50, chosen.details, 
        JSON.stringify(chosen.media), JSON.stringify(chosen.variations), chosen.image, 
        userId, userName, "Venda", null, null
      ]);

      await logAction(userId, userEmail, 'produto_exemplo_criado', `Produto de exemplo automático '${chosen.name}' cadastrado e disponível imediatamente para testes.`);
      res.json({ success: true, product: result.rows[0] });
    } catch (err: any) {
      console.error('Erro ao cadastrar produto exemplo automático:', err);
      res.status(500).json({ success: false, error: 'Erro interno: ' + err.message });
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
      const userRes = await pool.query('SELECT wallet, role FROM users WHERE id = $1', [userId]);
      const userObj = userRes.rows[0];
      const userRoleCalculated = userObj?.role || req.user.role;
      const isUserAdmin = userRoleCalculated === 'admin';

      let rawWallet = userObj?.wallet || {};
      if (typeof rawWallet === 'string') {
        try { rawWallet = JSON.parse(rawWallet); } catch (e) {}
      }
      
      let userTokens = extractAllTokens(rawWallet);
      
      const matchingTokensIndices: number[] = [];
      for (let i = 0; i < userTokens.length; i++) {
        if (userTokens[i] && userTokens[i].length === requiredTypeLength) {
          matchingTokensIndices.push(i);
        }
      }
      
      if (!isUserAdmin && matchingTokensIndices.length < requiredAmount) {
        await logAction(userId, userEmail, 'criar_produto_falhou', `Tentou cadastrar produto (${duration} dias) mas não tem tokens suficientes (tem ${matchingTokensIndices.length}, precisa ${requiredAmount} do tipo ${requiredTypeLength})`);
        return res.status(400).json({ success: false, error: `Saldo insuficiente para modalidade de ${duration} dias. Necessário ${requiredAmount} token(s) do tipo ${requiredTypeLength}.` });
      }

      let mediaParsed: any[] = [];
      if (typeof media === 'string') {
        try { mediaParsed = JSON.parse(media); } catch (e) { mediaParsed = []; }
      } else if (Array.isArray(media)) {
        mediaParsed = media;
      }

      let variationsParsed: any[] = [];
      if (typeof variations === 'string') {
        try { variationsParsed = JSON.parse(variations); } catch (e) { variationsParsed = []; }
      } else if (Array.isArray(variations)) {
        variationsParsed = variations;
      }

      const imagesString = (mediaParsed || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        INSERT INTO products (name, category, price, tokens, stock, details, media, variations, image, user_id, user_name, business_model, tables, seats_per_table, is_available, req_token_amount, req_token_type, duration_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(mediaParsed), JSON.stringify(variationsParsed), imagesString, userId, userName, business_model || 'Venda', tables || null, seats_per_table || null, 
        isUserAdmin ? true : false, 
        requiredAmount, requiredTypeLength, duration
      ]);

      // Se for administrador, disponibiliza o produto imediatamente sem necessidade de webhook de token
      if (isUserAdmin) {
         await logAction(userId, userEmail, 'produto_adicionado', `Produto ${result.rows[0].name} cadastrado com sucesso direto pelo Administrador.`);
         return res.json({ success: true, product: result.rows[0] });
      }

      await logAction(userId, userEmail, 'produto_adicionado', `Produto ${result.rows[0].name} criado (pendente webhook) para ${duration} dias (necessita ${requiredAmount} tokens do tipo ${requiredTypeLength})`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds to trigger webhook GET query
        const webhookUrl = `https://system.voryx.com.br/webhook/pagamentodetokenemcadastro?userId=${userId}&email=${encodeURIComponent(userEmail)}&productId=${result.rows[0].id}&amount=${requiredAmount}&typeLength=${requiredTypeLength}`;
        console.log(`Iniciando webhook: ${webhookUrl}`);
        
        try {
          const webhookRes = await fetch(webhookUrl, { 
            method: 'GET',
            signal: controller.signal 
          });
          const status = webhookRes.status;
          const text = await webhookRes.text();
          console.log(`Webhook retorno imediato: STATUS ${status}, BODY ${text}`);
        } catch (fetchErr: any) {
          console.error("Erro ou timeout na chamada inicial ao webhook, continuaremos o polling por 30 segundos:", fetchErr.message);
        }
        clearTimeout(timeoutId);
        
        // Aguardar resposta do subsistema webhook (atualização de is_available para true no banco) por até 30 segundos
        const startTime = Date.now();
        let isAvailable = false;
        while (Date.now() - startTime < 30000) {
          const checkProd = await pool.query('SELECT is_available FROM products WHERE id = $1', [result.rows[0].id]);
          if (checkProd.rows.length > 0 && checkProd.rows[0].is_available) {
            isAvailable = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
        }

        if (isAvailable) {
           const updatedProdRes = await pool.query('SELECT * FROM products WHERE id = $1', [result.rows[0].id]);
           await pool.query(`UPDATE logs SET status = true WHERE event_name = 'produto_adicionado' AND details LIKE $1`, [`%${result.rows[0].name}%`]).catch(()=>null);
           await logAction(userId, userEmail, 'pagamento_aprovado', `Pagamento do produto ${result.rows[0].name} aprovado e disponibilizado pelo webhook.`);
           res.json({ success: true, product: updatedProdRes.rows[0] });
        } else {
           // Se passar de 30 segundos, não finaliza a operação, remove o produto rascunho e retorna erro
           await pool.query('DELETE FROM products WHERE id = $1', [result.rows[0].id]).catch(() => null);
           await logAction(userId, userEmail, 'pagamento_recusado', `Pagamento do produto ${result.rows[0].name} não foi liberado em 30 segundos.`);
           res.json({ success: false, error: 'O tempo de resposta do webhook excedeu 30 segundos. Produto não cadastrado.' });
        }
      } catch (e: any) {
         console.error("Erro webhook:", e);
         await pool.query('DELETE FROM products WHERE id = $1', [result.rows[0].id]).catch(() => null);
         await logAction(userId, userEmail, 'pagamento_timeout', `Erro geral ou timeout ao processar o webhook para o produto.`);
         res.json({ success: false, error: 'Erro de comunicação com o subsistema webhook. Tente novamente.' });
      }
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
      await pool.query('DELETE FROM product_interactions WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_views WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_clicks WHERE product_id = $1', [req.params.id]);
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
      const isDelivery = req.user.role === 'delivery';
      
      const productObj = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
      if (productObj.rows.length === 0) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
      
      if (!isAdmin && productObj.rows[0].user_id !== req.user.id) {
          return res.status(403).json({ success: false, error: 'Sem permissão para editar este produto' });
      }

      // Se for admin, permite alterar is_available, se não, mantém o anterior
      const statusToSet = isAdmin && is_available !== undefined ? is_available : productObj.rows[0].is_available;

      let mediaParsed: any[] = [];
      if (typeof media === 'string') {
        try { mediaParsed = JSON.parse(media); } catch (e) { mediaParsed = []; }
      } else if (Array.isArray(media)) {
        mediaParsed = media;
      }

      let variationsParsed: any[] = [];
      if (typeof variations === 'string') {
        try { variationsParsed = JSON.parse(variations); } catch (e) { variationsParsed = []; }
      } else if (Array.isArray(variations)) {
        variationsParsed = variations;
      }

      const imagesString = (mediaParsed || []).map((m: any) => m.url).join(',');
      const result = await pool.query(`
        UPDATE products 
        SET name = $1, category = $2, price = $3, tokens = $4, stock = $5, details = $6, media = $7, variations = $8, image = $9, business_model = $10, tables = $11, seats_per_table = $12, is_available = $13
        WHERE id = $14 RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(mediaParsed), JSON.stringify(variationsParsed), imagesString, business_model || 'Venda', tables || null, seats_per_table || null, statusToSet,
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
  app.post('/api/presigned-url', requireAuth, async (req: any, res) => {
    const { fileName, mimeType } = req.body;
    try {
      const bucket = 'marketplace';
      const bucketExists = await minioClient.bucketExists(bucket).catch(() => false);
      if (!bucketExists) await minioClient.makeBucket(bucket, 'us-east-1').catch(() => null);

      // Gerar nome unico se não vier ou sanitizar
      const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9.-]/g, '_') : 'file';
      const uniqueName = `${Date.now()}-${safeName}`;
      
      // expira em 1 hora (3600 segundos) para segurança
      const url = await minioClient.presignedPutObject(bucket, uniqueName, 3600); 
      
      const endpoint = process.env.MINIO_ENDPOINT || 'file.voryx.com.br';
      const useSSL = process.env.MINIO_USE_SSL !== 'false';
      const port = process.env.MINIO_PORT || '443';
      const protocol = useSSL ? 'https' : 'http';
      const publicUrl = `${protocol}://${endpoint}${port === '443' || port === '80' ? '' : `:${port}`}/${bucket}/${uniqueName}`;

      res.json({ success: true, url, publicUrl, fileName: uniqueName });
    } catch (err) {
      console.error('Erro Gerar Presigned URL MinIO:', err);
      res.status(500).json({ error: 'Erro ao gerar link de upload direto.' });
    }
  });

  // (Fallback caso o CORS não permita upload direto, mantido por compatibilidade)
  app.post('/api/upload', requireAuth, upload.array('files', 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

      const results = [];
      const bucket = 'marketplace';
      let useMinIO = true;
      try {
        const bucketExists = await minioClient.bucketExists(bucket).catch(() => false);
        if (!bucketExists) await minioClient.makeBucket(bucket, 'us-east-1').catch(() => null);
      } catch (err) {
        console.warn('⚠️ MinIO indisponível para upload múltiplo, usando fallback local direto.');
        useMinIO = false;
      }

      for (const file of files) {
        const fileName = file.filename;
        const filePath = file.path;
        
        if (useMinIO) {
          try {
            const metaData = { 'Content-Type': file.mimetype };
            await minioClient.fPutObject(bucket, fileName, filePath, metaData);
            
            // Cleanup temp file
            fs.unlink(filePath, () => {});
            
            const endpoint = process.env.MINIO_ENDPOINT || 'file.voryx.com.br';
            const useSSL = process.env.MINIO_USE_SSL !== 'false';
            const port = process.env.MINIO_PORT || '443';
            const protocol = useSSL ? 'https' : 'http';
            const url = `${protocol}://${endpoint}${port === '443' || port === '80' ? '' : `:${port}`}/${bucket}/${fileName}`;
            
            results.push({ url, fileName, type: file.mimetype });
            continue;
          } catch (err) {
            console.warn('Erro ao enviar item para MinIO, tentando local:', err);
          }
        }

        // Fallback local caso MinIO falhe ou esteja indisponível
        try {
          const destDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          const destPath = path.join(destDir, fileName);
          fs.renameSync(filePath, destPath);
          
          const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
          const url = appUrl ? `${appUrl}/uploads/${fileName}` : `/uploads/${fileName}`;
          results.push({ url, fileName, type: file.mimetype });
        } catch (fallbackErr: any) {
          console.error('Falha no fallback de upload local duplo:', fallbackErr);
          if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
          }
        }
      }
      
      res.json({ success: true, files: results });
    } catch (err: any) {
      console.error('Erro geral no upload múltiplo:', err);
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlink(file.path, () => {});
          }
        }
      }
      res.status(500).json({ error: 'Erro ao fazer upload: ' + err.message });
    }
  });

  // Single file fallback
  app.post('/api/upload-single', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    const fileName = req.file.filename;
    const filePath = req.file.path;
    try {
      const bucket = 'marketplace';
      const bucketExists = await minioClient.bucketExists(bucket).catch(() => false);
      if (!bucketExists) await minioClient.makeBucket(bucket, 'us-east-1').catch(() => null);
      
      const metaData = { 'Content-Type': req.file.mimetype };
      await minioClient.fPutObject(bucket, fileName, filePath, metaData);
      
      // Cleanup temp file
      fs.unlink(filePath, () => {});
      
      const endpoint = process.env.MINIO_ENDPOINT || 'file.voryx.com.br';
      const useSSL = process.env.MINIO_USE_SSL !== 'false';
      const port = process.env.MINIO_PORT || '443';
      const protocol = useSSL ? 'https' : 'http';
      const url = `${protocol}://${endpoint}${port === '443' || port === '80' ? '' : `:${port}`}/${bucket}/${fileName}`;
      
      res.json({ success: true, url, fileName });
    } catch (err: any) {
      console.warn('⚠️ MinIO indisponível para upload único, usando fallback local:', err.message);
      try {
        const destDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const destPath = path.join(destDir, fileName);
        fs.renameSync(filePath, destPath);
        
        const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
        const url = appUrl ? `${appUrl}/uploads/${fileName}` : `/uploads/${fileName}`;
        
        res.json({ success: true, url, fileName });
      } catch (fallbackErr: any) {
        console.error('Erro no fallback de upload único:', fallbackErr);
        if (filePath && fs.existsSync(filePath)) {
          fs.unlink(filePath, () => {});
        }
        res.status(500).json({ error: 'Erro ao fazer upload: ' + fallbackErr.message });
      }
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

  app.put('/api/orders/:id/request-delivery', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const orderId = req.params.id;
      // seller verification
      const checkResult = await pool.query(`
        SELECT 1 FROM orders o
        WHERE o.id::text = $1::text AND (
          o.seller_id::text = $2::text OR
          EXISTS (
            SELECT 1 FROM order_items oi
            JOIN products p ON oi.product_id::text = p.id::text
            WHERE oi.order_id::text = o.id::text AND p.user_id::text = $2::text
          )
        )
        LIMIT 1
      `, [orderId, req.user.id]);
      
      const buyerCheck = await pool.query(`SELECT 1 FROM orders WHERE id::text = $1::text AND user_id::text = $2::text`, [orderId, req.user.id]);

      const isSeller = checkResult.rows.length > 0;
      const isBuyer = buyerCheck.rows.length > 0;
      const isAdmin = req.user.role === 'admin';
      
      // Check if user has explicit permission or if they are a 'user' and not explicitly denied
      const hasPermission = req.user.can_request_delivery === true || 
                            req.user.can_request_delivery === 'true' || 
                            req.user.can_request_delivery === 1 ||
                            (req.user.role === 'user' && req.user.can_request_delivery !== false);
      
      if (!isAdmin && !isSeller && !isBuyer && !hasPermission) {
         return res.status(403).json({ success: false, error: 'Acesso negado' });
      }

      if (!isAdmin && req.user.can_request_delivery === false) {
         return res.status(403).json({ success: false, error: 'Função de solicitar entrega desativada para sua conta.' });
      }

      await pool.query("UPDATE orders SET requires_delivery = true, status = 'Em andamento' WHERE id::text = $1::text", [orderId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro ao solicitar entrega' });
    }
  });

  app.put('/api/orders/:id/accept-delivery', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const orderId = req.params.id;
      if (req.user.role !== 'delivery') {
         return res.status(403).json({ success: false, error: 'Apenas entregadores.' });
      }

      // Check if already claimed
      const orderRes = await pool.query('SELECT delivery_user_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
      
      if (orderRes.rows[0].delivery_user_id) {
         return res.status(400).json({ success: false, error: 'Pedido já foi aceito por outro entregador.' });
      }

      await pool.query('UPDATE orders SET delivery_user_id = $1, status = $2 WHERE id = $3', [req.user.id, 'Em Trânsito', orderId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro ao aceitar entrega' });
    }
  });

  // Update order status
  app.put('/api/orders/:id/status', requireAuth, async (req: any, res) => {
    try {
      const { status } = req.body;
      const result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
      res.json({ success: true, order: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update order status' });
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

      let monthlySalesQuery = `SELECT TO_CHAR(created_at, 'MM/YYYY') as month, COUNT(*) as count FROM orders GROUP BY month ORDER BY month DESC LIMIT 6`;
      let monthlySalesVals = [];

      if (!isAdmin) {
          prodQuery += ' WHERE user_id = $1';
          prodVals.push(userId);
          stockQuery += ' WHERE user_id = $1';
          stockVals.push(userId);
          ordersQuery = 'SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.user_id = $1';
          ordersVals.push(userId);
          monthlySalesQuery = `SELECT TO_CHAR(o.created_at, 'MM/YYYY') as month, COUNT(DISTINCT o.id) as count FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.user_id = $1 GROUP BY month ORDER BY month DESC LIMIT 6`;
          monthlySalesVals.push(userId);
      }

      const prodRes = await pool.query(prodQuery, prodVals);
      const ordersRes = await pool.query(ordersQuery, ordersVals);
      const stockRes = await pool.query(stockQuery, stockVals);
      const monthlySalesRes = await pool.query(monthlySalesQuery, monthlySalesVals);
      
      res.json({
        success: true,
        stats: {
          products: parseInt(prodRes.rows[0].count) || 0,
          orders: parseInt(ordersRes.rows[0].count) || 0,
          stock: parseInt(stockRes.rows[0].total_stock) || 0,
          likes: parseInt((await pool.query("SELECT COUNT(*) FROM product_interactions WHERE interaction_type = 'like'")).rows[0]?.count) || 0,
          monthlySales: monthlySalesRes.rows.reverse()
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
      const isDelivery = req.user.role === 'delivery';

      let sales: any[] = [];
      let purchases: any[] = [];

      if (isAdmin) {
          const dbResult = await pool.query(`
            SELECT DISTINCT o.*, 
            COALESCE(u.name, uc.nome_completo) as customer_name, 
            COALESCE(u.email, uc.email) as customer_email,
            uc.telefone, uc.endereco, uc.bairro, uc.cidade, uc.numero, uc.cep, uc.telegram,
            (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1) as seller_id,
            (SELECT seller_u.bairro FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_bairro,
            (SELECT seller_u.endereco FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_endereco,
            (SELECT seller_u.numero FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_numero,
            (SELECT seller_u.cidade FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_cidade,
            (SELECT seller_u.cep FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_cep
            FROM orders o 
            LEFT JOIN users u ON u.id::text = o.user_id::text 
            LEFT JOIN user_client uc ON uc.id::text = o.user_id::text
            ORDER BY o.id DESC
          `);
          sales = dbResult.rows;
          purchases = dbResult.rows; // Admin sees everything everywhere
      } else if (isDelivery) {
          const dbResult = await pool.query(`
            SELECT DISTINCT o.*, 
            COALESCE(u.name, uc.nome_completo) as customer_name, 
            COALESCE(u.email, uc.email) as customer_email,
            uc.telefone, uc.endereco, uc.bairro, uc.cidade, uc.numero, uc.cep, uc.telegram,
            (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1) as seller_id,
            (SELECT seller_u.bairro FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_bairro,
            (SELECT seller_u.endereco FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_endereco,
            (SELECT seller_u.numero FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_numero,
            (SELECT seller_u.cidade FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_cidade,
            (SELECT seller_u.cep FROM users seller_u WHERE seller_u.id::text = (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1)::text LIMIT 1) as seller_cep
            FROM orders o 
            LEFT JOIN users u ON u.id::text = o.user_id::text 
            LEFT JOIN user_client uc ON uc.id::text = o.user_id::text
            WHERE o.requires_delivery = true AND (o.delivery_user_id IS NULL OR o.delivery_user_id = $1)
            ORDER BY o.id DESC
          `, [req.user.id]);
          sales = dbResult.rows;
      } else {
          // Sales: where the product seller is the user
          const salesResult = await pool.query(`
            SELECT DISTINCT o.*, 
            COALESCE(u.name, uc.nome_completo) as customer_name, 
            COALESCE(u.email, uc.email) as customer_email,
            uc.telefone, uc.endereco, uc.bairro, uc.cidade, uc.numero, uc.cep, uc.telegram,
            $1 as seller_id
            FROM orders o 
            LEFT JOIN users u ON u.id::text = o.user_id::text 
            LEFT JOIN user_client uc ON uc.id::text = o.user_id::text
            WHERE EXISTS (
               SELECT 1 FROM order_items oi
               JOIN products p ON oi.product_id::text = p.id::text
               WHERE oi.order_id::text = o.id::text AND p.user_id::text = $1::text
            ) OR o.seller_id::text = $1::text
            ORDER BY o.id DESC
          `, [userId]);
          sales = salesResult.rows;

          // Purchases: where the order buyer is the user
          const purchasesResult = await pool.query(`
            SELECT DISTINCT o.*, 
            COALESCE(u.name, uc.nome_completo) as customer_name, 
            COALESCE(u.email, uc.email) as customer_email,
            uc.telefone, uc.endereco, uc.bairro, uc.cidade, uc.numero, uc.cep, uc.telegram,
            (SELECT p.user_id FROM order_items oi JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id::text = o.id::text LIMIT 1) as seller_id
            FROM orders o 
            LEFT JOIN users u ON u.id::text = o.user_id::text 
            LEFT JOIN user_client uc ON uc.id::text = o.user_id::text
            WHERE o.user_id::text = $1::text
            ORDER BY o.id DESC
          `, [userId]);
          purchases = purchasesResult.rows;
      }
      
      // Fetch items for all unique orders
      const allOrders = [...sales, ...purchases];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values());

      if (uniqueOrders.length > 0) {
        const orderIds = uniqueOrders.map((o: any) => o.id);
        const itemsRes = await pool.query(`SELECT oi.*, p.name as product_name FROM order_items oi LEFT JOIN products p ON oi.product_id::text = p.id::text WHERE oi.order_id = ANY($1)`, [orderIds]);
        
        for (const order of sales) {
           let fallbackItems = [];
           try { fallbackItems = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []); } catch(e){}
           
           const dbItems = itemsRes.rows.filter((item: any) => Number(item.order_id) === Number(order.id)).map((item: any) => ({
              id: item.product_id,
              name: item.product_name || 'Produto Excluído',
              price: parseFloat(item.final_price) || 0,
              quantity: item.quantity,
              variations: typeof item.chosen_options === 'string' ? JSON.parse(item.chosen_options) : (item.chosen_options || {})
           }));
           
           order.items = dbItems.length > 0 ? dbItems : fallbackItems;
           order.payment_method = order.payment_method || 'entrega';
           order.order_code = order.order_code || `858-${order.id}`;
        }
        for (const order of purchases) {
           let fallbackItems = [];
           try { fallbackItems = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []); } catch(e){}

           const dbItems = itemsRes.rows.filter((item: any) => Number(item.order_id) === Number(order.id)).map((item: any) => ({
              id: item.product_id,
              name: item.product_name || 'Produto Excluído',
              price: parseFloat(item.final_price) || 0,
              quantity: item.quantity,
              variations: typeof item.chosen_options === 'string' ? JSON.parse(item.chosen_options) : (item.chosen_options || {})
           }));
           
           order.items = dbItems.length > 0 ? dbItems : fallbackItems;
           order.payment_method = order.payment_method || 'entrega';
           order.order_code = order.order_code || `858-${order.id}`;
        }
      }
      res.json({ success: true, purchases, sales });
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Leitura de usuários
  app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT id, name, email, role, company_name, company_logo, wallet, is_approved, can_transfer, can_request, can_request_delivery FROM users ORDER BY id DESC');
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
    const { name, email, role, password, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      let u;
      if (password) {
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, password = $4, company_name = $5, company_logo = $6, is_approved = COALESCE($8, is_approved), can_transfer = COALESCE($9, can_transfer), can_request = COALESCE($10, can_request), can_request_delivery = COALESCE($11, can_request_delivery) WHERE id = $7 RETURNING id, name, email, role, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery',
          [name, email, role, password, company_name || null, company_logo || null, req.params.id, is_approved, can_transfer, can_request, can_request_delivery]
        );
      } else {
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, company_name = $4, company_logo = $5, is_approved = COALESCE($7, is_approved), can_transfer = COALESCE($8, can_transfer), can_request = COALESCE($9, can_request), can_request_delivery = COALESCE($10, can_request_delivery) WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery',
          [name, email, role, company_name || null, company_logo || null, req.params.id, is_approved, can_transfer, can_request, can_request_delivery]
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
      if (!dbConnected) {
         let fallbackUser;
         if (req.user.email === 'admin@valentina.com') {
             fallbackUser = { id: 1, name: 'Admin Valentina', email: 'admin@valentina.com', role: 'admin' };
         } else {
             fallbackUser = fallbackUsers.find(u => u.id === req.user.id);
         }
         
         if (fallbackUser) {
             return res.json({ success: true, user: fallbackUser });
         }
         return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      }
      const dbResult = await pool.query('SELECT id, name, email, role, company_name, company_logo, dashboard_theme, wallet, is_approved FROM users WHERE id = $1', [req.user.id]);
      if (dbResult.rows.length > 0) {
        const user = dbResult.rows[0];
        normalizeUserWallet(user);
        let activeProducts = 0;
        try {
           const prodRes = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_available = true', [user.id]);
           activeProducts = parseInt(prodRes.rows[0].count) || 0;
        } catch(e) {}
        user.active_products_count = activeProducts;
        res.json({ success: true, user: user });
      } else {
        res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro ao buscar dados.' });
    }
  });

  // PUT /api/me
  app.put('/api/me', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { name, company_name, company_logo, dashboard_theme, password } = req.body;
      
      let updateResult;
      if (password) {
        updateResult = await pool.query(
          'UPDATE users SET name = COALESCE($1, name), company_name = COALESCE($2, company_name), company_logo = COALESCE($3, company_logo), dashboard_theme = COALESCE($4, dashboard_theme), password = $5 WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo, dashboard_theme',
          [name, company_name, company_logo, dashboard_theme, password, req.user.id]
        );
      } else {
        updateResult = await pool.query(
          'UPDATE users SET name = COALESCE($1, name), company_name = COALESCE($2, company_name), company_logo = COALESCE($3, company_logo), dashboard_theme = COALESCE($4, dashboard_theme) WHERE id = $5 RETURNING id, name, email, role, company_name, company_logo, dashboard_theme',
          [name, company_name, company_logo, dashboard_theme, req.user.id]
        );
      }
      
      res.json({ success: true, user: updateResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/my-logs
  app.get('/api/my-logs', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query('SELECT * FROM logs WHERE user_id = $1 ORDER BY id DESC LIMIT 200', [req.user.id]);
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão.' });
    }
  });

  // POST /api/transfer_tokens
  app.post('/api/transfer_tokens', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { receiver_id, amount, token_length, password } = req.body;
      const amountInt = parseInt(amount);
      const tokenLenInt = parseInt(token_length);
      const senderId = req.user.id;

      if (!req.user.can_transfer && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'A transferência de tokens está bloqueada para sua conta.' });
      }

      if (!password) {
        return res.status(400).json({ success: false, error: 'A senha é obrigatória para realizar transferências.' });
      }

      const senderValidationRes = await pool.query('SELECT password FROM users WHERE id::text = $1', [senderId]);
      if (senderValidationRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Remetente não encontrado.' });
      
      const senderPasswordHash = senderValidationRes.rows[0].password;
      if (!senderPasswordHash) {
         return res.status(401).json({ success: false, error: 'Conta sem senha configurada.' });
      }

      if (password !== senderPasswordHash) {
         return res.status(401).json({ success: false, error: 'Senha incorreta.' });
      }

      if (!receiver_id || !amountInt || !tokenLenInt || amountInt <= 0) {
        return res.status(400).json({ success: false, error: 'Parâmetros inválidos.' });
      }
      if (senderId.toString() === receiver_id.toString()) {
        return res.status(400).json({ success: false, error: 'Não é possível transferir para si mesmo.' });
      }

      // Webhook validation with 30s wait
      const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/transferencia', {
         remetente_id: senderId,
         quantidade: amountInt,
         tipo_moeda: "E" + tokenLenInt,
         moeda: token_length,
         destinatario_id: receiver_id,
         tipo_operacao: 'transferencia'
      });

      if (webhookStatus !== 200) {
        return res.status(400).json({ success: false, error: `Erro no processamento da transferência (Webhook Status: ${webhookStatus}). Tente novamente.` });
      }

      // Ensure user_client table has wallet column
      try { await pool.query(`ALTER TABLE user_client ADD COLUMN wallet JSONB DEFAULT '{"tokens": []}';`); } catch (e) {}

      // Check sender limits
      const senderRes = await pool.query('SELECT wallet, name, email FROM users WHERE id::text = $1', [senderId]);
      if (senderRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Remetente não encontrado.' });
      const sender = senderRes.rows[0];
      
      let rawWallet = sender.wallet || {};
      if (typeof rawWallet === 'string') {
        try { rawWallet = JSON.parse(rawWallet); } catch (e) {}
      }
      
      let userTokens = extractAllTokens(rawWallet);

      const matchingIndices = [];
      for (let i = 0; i < userTokens.length; i++) {
        if (typeof userTokens[i] === 'string' && userTokens[i].length === tokenLenInt) {
          matchingIndices.push(i);
        }
      }

      if (matchingIndices.length < amountInt) {
        return res.status(400).json({ success: false, error: `Saldo insuficiente de eTokens do tipo E${tokenLenInt}. Você tem ${matchingIndices.length}.` });
      }

      // Transfer Process
      const tokensToTransfer: string[] = [];
      for (let i = 0; i < amountInt; i++) {
         const idxToRemove = matchingIndices.pop();
         if (idxToRemove !== undefined) {
           tokensToTransfer.push(userTokens[idxToRemove]);
           userTokens[idxToRemove] = null as any; // mark for deletion
         }
      }
      
      const newSenderTokens = userTokens.filter(t => t !== null);
      const updatedSenderWallet = buildWalletObject(newSenderTokens);

      // Receiver
      let receiverType = 'users';
      let receiverRes = await pool.query('SELECT wallet, email FROM users WHERE id::text = $1', [receiver_id]);
      if (receiverRes.rows.length === 0) {
         receiverRes = await pool.query('SELECT wallet, email FROM user_client WHERE id::text = $1', [receiver_id]);
         if (receiverRes.rows.length > 0) {
            receiverType = 'user_client';
         }
      }

      if (receiverRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Destinatário não encontrado.' });
      const receiver = receiverRes.rows[0];
      
      let recWallet = receiver.wallet || {};
      if (typeof recWallet === 'string') {
        try { recWallet = JSON.parse(recWallet); } catch (e) {}
      }
      let receiverTokens = extractAllTokens(recWallet);
      receiverTokens = receiverTokens.concat(tokensToTransfer);
      const updatedReceiverWallet = buildWalletObject(receiverTokens);

      // Save
      await pool.query('UPDATE users SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedSenderWallet), senderId]);
      
      if (receiverType === 'user_client') {
         await pool.query('UPDATE user_client SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedReceiverWallet), receiver_id]);
      } else {
         await pool.query('UPDATE users SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedReceiverWallet), receiver_id]);
      }

      await logAction(senderId, sender.email, 'transferencia', `Enviou ${amountInt} eToken(s) E${tokenLenInt} para ID ${receiver_id}`);
      await logAction(receiver_id, receiver.email, 'recebimento_transferencia', `Recebeu ${amountInt} eToken(s) E${tokenLenInt} do ID ${senderId}`);

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro interno ao transferir. ' + (err.message || String(err)) });
    }
  });

  app.post('/api/withdraw', requireAuth, async (req: any, res) => {
    const { amount, pix_key, password } = req.body;
    const userId = req.user.id;

    try {
      if (!dbConnected) throw new Error("DB offline");
      if (!amount || amount <= 0 || !pix_key || !password) {
        return res.status(400).json({ success: false, error: 'Parâmetros inválidos.' });
      }

      // Validate password
      const userRes = await pool.query('SELECT password, wallet FROM users WHERE id::text = $1', [userId]);
      if (userRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
      
      const user = userRes.rows[0];
      if (password !== user.password) {
        return res.status(401).json({ success: false, error: 'Senha mestre incorreta.' });
      }

      // Get settings for costs
      const setRes = await pool.query('SELECT * FROM system_settings LIMIT 1');
      const settings = setRes.rows[0];
      const cost4096 = settings?.withdrawal_cost_4096 || 0;
      const cost2048 = settings?.withdrawal_cost_2048 || 0;

      // Check wallet
      let wallet = user.wallet || {};
      if (typeof wallet === 'string') {
        try { wallet = JSON.parse(wallet); } catch (e) {}
      }
      const tokens = extractAllTokens(wallet);
      
      const count4096 = tokens.filter((t: string) => t.length === 4096).length;
      const count2048 = tokens.filter((t: string) => t.length === 2048).length;

      if (count4096 < cost4096 || count2048 < cost2048) {
        return res.status(400).json({ success: false, error: `Saldo insuficiente para as taxas de saque. Requer: ${cost4096}x E4096 e ${cost2048}x E2048.` });
      }

      // Webhook wait (30s)
      const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/saque', {
        user_id: userId,
        pix_key,
        valor_real: amount,
        taxas: { E4096: cost4096, E2048: cost2048 },
        tipo_operacao: 'saque'
      });

      if (webhookStatus !== 200) {
        return res.status(400).json({ success: false, error: `Erro na validação do saque (Status: ${webhookStatus}).` });
      }

      // Consume tokens
      let removed4096 = 0;
      let removed2048 = 0;
      const newTokens = tokens.filter((t: string) => {
        if (t.length === 4096 && removed4096 < cost4096) {
          removed4096++;
          return false;
        }
        if (t.length === 2048 && removed2048 < cost2048) {
          removed2048++;
          return false;
        }
        return true;
      });

      const updatedWallet = buildWalletObject(newTokens);
      await pool.query('UPDATE users SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedWallet), userId]);
      await logAction(userId, req.user.email, 'saque_solicitado', `Solicitou saque de R$ ${amount} (PIX: ${pix_key}). Taxas consumidas: ${cost4096}x E4096, ${cost2048}x E2048.`);

      res.json({ success: true, message: 'Solicitação de saque enviada com sucesso e taxas consumidas.' });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro ao processar saque: ' + err.message });
    }
  });

  // GET /api/interactions
  app.get('/api/interactions', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const isAdmin = req.user.role === 'admin';
      let dbResult;
      if (isAdmin) {
         dbResult = await pool.query('SELECT i.*, p.name as product_name FROM product_interactions i LEFT JOIN products p ON i.product_id::text = p.id::text ORDER BY i.id DESC LIMIT 500');
      } else {
         dbResult = await pool.query(`
            SELECT i.*, p.name as product_name 
            FROM product_interactions i 
            JOIN products p ON i.product_id::text = p.id::text 
            WHERE p.user_id::text = $1::text 
            ORDER BY i.id DESC LIMIT 500
         `, [req.user.id]);
      }
      res.json(dbResult.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro de conexão com o DB.' });
    }
  });

  // POST /api/interactions
  app.post('/api/interactions', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { product_id, interaction_type, content } = req.body;
      const user_id = req.user.id;
      const user_email = req.user.email;
      const user_name = req.user.name;

      if (!product_id || !interaction_type) {
         return res.status(400).json({ success: false, error: 'product_id e interaction_type são obrigatórios' });
      }

      await pool.query(
        'INSERT INTO product_interactions (product_id, user_id, user_name, user_email, interaction_type, content) VALUES ($1, $2, $3, $4, $5, $6)',
        [product_id, user_id, user_name, user_email, interaction_type, content || '']
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/products/:id/view', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const user_id = req.user ? req.user.id : null;
      await pool.query('INSERT INTO product_views (product_id, user_id) VALUES ($1, $2)', [req.params.id, user_id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/products/:id/click', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const user_id = req.user ? req.user.id : null;
      await pool.query('INSERT INTO product_clicks (product_id, user_id) VALUES ($1, $2)', [req.params.id, user_id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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

  app.post('/api/credit-requests', requireAuth, async (req: any, res) => {
    try {
      let { user_id_recebedor, quantidade, tipo_token } = req.body;
      if (!dbConnected) throw new Error("DB offline");
      
      const isAdmin = req.user.role === 'admin';
      
      if (!isAdmin) {
         return res.status(403).json({ success: false, error: 'Apenas administradores podem solicitar créditos.' });
      }
      
      const insertResult = await pool.query(
        'INSERT INTO credit_requests (user_id_recebedor, user_id_solicitante, quantidade, tipo_token, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [user_id_recebedor, req.user.id, quantidade, tipo_token, 'pendente']
      );
      
      const reqId = insertResult.rows[0].id;
      let finalStatus = 'pendente';

      try {
        const webhookResp = await fetch('https://system.voryx.com.br/webhook/atualizasaldo');
        if (webhookResp.status === 200) {
           finalStatus = 'gerado';
        }
      } catch (e) {
        console.error("Erro webhook atualizasaldo:", e);
      }

      if (finalStatus === 'gerado') {
        const userRes = await pool.query('SELECT wallet FROM users WHERE id = $1', [user_id_recebedor]);
        if (userRes.rows.length > 0) {
           let wallet = userRes.rows[0].wallet || {};
           if (typeof wallet === 'string') {
             try { wallet = JSON.parse(wallet); } catch (e) {}
           }
           let userTokens = extractAllTokens(wallet);
           
           for(let i=0; i<quantidade; i++) {
             let tokenStr = '';
             const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
             for(let j=0; j<tipo_token; j++) {
               tokenStr += chars.charAt(Math.floor(Math.random() * chars.length));
             }
             userTokens.push(tokenStr);
           }
           const updatedWallet = buildWalletObject(userTokens);
           await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [JSON.stringify(updatedWallet), user_id_recebedor]);
        }
        await pool.query('UPDATE credit_requests SET status = $1 WHERE id = $2', [finalStatus, reqId]);
      }

      await logAction(req.user.id, req.user.email, 'credito_solicitado', `Admin solicitou ${quantidade} tokens E${tipo_token} para o usuario ${user_id_recebedor} (Status: ${finalStatus})`);
      
      const updatedReq = await pool.query('SELECT * FROM credit_requests WHERE id = $1', [reqId]);
      res.json({ success: true, request: updatedReq.rows[0] });
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
      
      // Webhook wait logic
      if (status === 'gerado' && pedido.status !== 'gerado') {
        const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/geracao_credito', {
           id_solicitacao: reqId,
           user_id: pedido.user_id_recebedor,
           quantidade: pedido.quantidade,
           tipo_token: pedido.tipo_token,
           tipo_operacao: 'geracao_credito'
        });

        if (webhookStatus !== 200) {
          return res.status(400).json({ success: false, error: `Erro na aprovação do crédito (Webhook Status: ${webhookStatus}). Tente novamente.` });
        }

        const userRes = await pool.query('SELECT wallet FROM users WHERE id = $1', [pedido.user_id_recebedor]);
        if (userRes.rows.length > 0) {
           let wallet = userRes.rows[0].wallet || {};
           if (typeof wallet === 'string') {
             try { wallet = JSON.parse(wallet); } catch (e) {}
           }
           let userTokens = extractAllTokens(wallet);
           
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
           const updatedWallet = buildWalletObject(userTokens);
           await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [JSON.stringify(updatedWallet), pedido.user_id_recebedor]);
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
    const { 
      cost_7d_amount, cost_7d_type, cost_30d_amount, cost_30d_type,
      product_token_cost_amount, product_token_cost_type,
      token_costs, withdrawal_cost_4096, withdrawal_cost_2048, conversion_cost
    } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const dbResult = await pool.query(`
        UPDATE system_settings 
        SET 
          cost_7d_amount=$1, cost_7d_type=$2, cost_30d_amount=$3, cost_30d_type=$4,
          product_token_cost_amount=$5, product_token_cost_type=$6,
          token_costs=$7, withdrawal_cost_4096=$8, withdrawal_cost_2048=$9, conversion_cost=$10
        RETURNING *
      `, [
        cost_7d_amount, cost_7d_type, cost_30d_amount, cost_30d_type,
        product_token_cost_amount, product_token_cost_type,
        JSON.stringify(token_costs), withdrawal_cost_4096, withdrawal_cost_2048, conversion_cost
      ]);
      await logAction(req.user.id, req.user.email, 'config_atualizada', 'Admin atualizou as configurações globais de tokens');
      res.json({ success: true, settings: dbResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========== CLEANUP AND NOTIFICATION ENDPOINTS ==========
  
  // POST /api/admin/cleanup - Mass/Selective Cleanup
  app.post('/api/admin/cleanup', requireAuth, requireAdmin, async (req: any, res) => {
    const { type, ids, password } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (!password) {
        return res.status(400).json({ success: false, error: 'A senha de confirmação é obrigatória.' });
      }

      // Verify admin password
      const adminRes = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      if (adminRes.rows.length === 0 || password !== adminRes.rows[0].password) {
        return res.status(403).json({ success: false, error: 'Senha incorreta para confirmação da limpeza.' });
      }

      const idList = Array.isArray(ids) ? ids.map(id => parseInt(id)).filter(id => !isNaN(id)) : [];

      await pool.query('BEGIN');

      if (type === 'users') {
        if (idList.length > 0) {
          // Never delete the current admin
          await pool.query('DELETE FROM users WHERE id = ANY($1) AND role <> \'admin\'', [idList]);
        } else {
          await pool.query('DELETE FROM users WHERE role <> \'admin\'');
        }
      } else if (type === 'products') {
        if (idList.length > 0) {
          await pool.query('DELETE FROM products WHERE id = ANY($1)', [idList]);
        } else {
          await pool.query('DELETE FROM products');
        }
      } else if (type === 'orders') {
        if (idList.length > 0) {
          await pool.query('DELETE FROM orders WHERE id = ANY($1)', [idList]);
        } else {
          await pool.query('DELETE FROM orders');
        }
      } else if (type === 'logs') {
        if (idList.length > 0) {
          await pool.query('DELETE FROM logs WHERE id = ANY($1)', [idList]);
        } else {
          await pool.query('DELETE FROM logs');
        }
      } else if (type === 'wallets') {
        if (idList.length > 0) {
          await pool.query('UPDATE users SET wallet = \'{"tokens": []}\' WHERE id = ANY($1)', [idList]);
        } else {
          await pool.query('UPDATE users SET wallet = \'{"tokens": []}\'');
        }
      } else if (type === 'all') {
        await pool.query('DELETE FROM products');
        await pool.query('DELETE FROM orders');
        await pool.query('DELETE FROM logs');
        await pool.query('UPDATE users SET wallet = \'{"tokens": []}\'');
        await pool.query('DELETE FROM users WHERE role <> \'admin\'');
      } else {
        await pool.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Tipo de limpeza inválido.' });
      }

      await pool.query('COMMIT');
      await logAction(req.user.id, req.user.email, 'limpeza_executada', `Limpeza do tipo ${type} executada.`);
      res.json({ success: true, message: 'Operação de limpeza executada com sucesso.' });
    } catch (err: any) {
      await pool.query('ROLLBACK').catch(() => null);
      res.status(500).json({ success: false, error: 'Erro de banco de dados na limpeza: ' + err.message });
    }
  });

  // POST /api/admin/notifications - Admin envia notificação (genérica, último login ou usuário específico)
  app.post('/api/admin/notifications', requireAuth, requireAdmin, async (req: any, res) => {
    const { title, message, targetType, targetUserId } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (!title || !message || !targetType) {
        return res.status(400).json({ success: false, error: 'Preencha todos os campos da notificação.' });
      }

      let userIdToTarget: number | null = null;
      let isGeneric = false;

      if (targetType === 'all') {
        isGeneric = true;
      } else if (targetType === 'last_login') {
        // Find the user with the most recent last_login_at excluding admin
        const lastLoginRes = await pool.query('SELECT id FROM users WHERE role <> \'admin\' AND last_login_at IS NOT NULL ORDER BY last_login_at DESC LIMIT 1');
        if (lastLoginRes.rows.length > 0) {
          userIdToTarget = lastLoginRes.rows[0].id;
        } else {
          // Fallback to any user if no login records
          const fallbackUserRes = await pool.query('SELECT id FROM users WHERE role <> \'admin\' ORDER BY id DESC LIMIT 1');
          if (fallbackUserRes.rows.length > 0) {
            userIdToTarget = fallbackUserRes.rows[0].id;
          } else {
            return res.status(400).json({ success: false, error: 'Nenhum usuário comum elegível para receber esta notificação.' });
          }
        }
      } else if (targetType === 'user') {
        if (!targetUserId) return res.status(400).json({ success: false, error: 'Usuário destinatário é obrigatório.' });
        userIdToTarget = parseInt(targetUserId);
      }

      // Insert notification
      await pool.query(`
        INSERT INTO notifications (title, message, user_id, is_generic)
        VALUES ($1, $2, $3, $4)
      `, [title, message, userIdToTarget, isGeneric]);

      await logAction(req.user.id, req.user.email, 'notificacao_enviada', `Notificação "${title}" enviada.`);
      res.json({ success: true, message: 'Notificação enviada com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/notifications - Obter notificações (esconde o corpo 'message' por segurança até login novamente)
  app.get('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) {
        return res.json({ success: true, notifications: [] });
      }
      const result = await pool.query(`
        SELECT id, title, is_generic, created_at, user_id
        FROM notifications
        WHERE is_generic = true OR user_id = $1
        ORDER BY created_at DESC
      `, [req.user.id]);
      res.json({ success: true, notifications: result.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/notifications/:id/read - Solicitar leitura mediante confirmação de senha ("logar novamente")
  app.post('/api/notifications/:id/read', requireAuth, async (req: any, res) => {
    const { password } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (!password) {
        return res.status(400).json({ success: false, error: 'A senha de login é necessária para ler a notificação.' });
      }

      // Verify user password
      const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      if (userRes.rows.length === 0 || password !== userRes.rows[0].password) {
        return res.status(403).json({ success: false, error: 'Senha incorreta. Não pôde liberar leitura.' });
      }

      // Pull notification
      const notificationRes = await pool.query(
        'SELECT id, title, message, is_generic, created_at FROM notifications WHERE id = $1 AND (is_generic = true OR user_id = $2)',
        [parseInt(req.params.id), req.user.id]
      );

      if (notificationRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Notificação não localizada ou inacessível.' });
      }

      res.json({ success: true, notification: notificationRes.rows[0] });
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
    const { email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite, telefone, endereco, bairro, cidade, numero, cep } = req.body;
    if (!email || !senha_mestre) return res.status(400).json({ success: false, error: 'Email e senha mestre são obrigatórios.' });
    try {
      if (!dbConnected) throw new Error("DB offline");
      const insertResult = await pool.query(
        'INSERT INTO user_client (email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite, telefone, endereco, bairro, cidade, numero, cep) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *',
        [email, senha_mestre, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, convite || null, telefone || null, endereco || null, bairro || null, cidade || null, numero || null, cep || null]
      );
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/user_client/:id', requireAuth, requireAdmin, async (req, res) => {
    const { email, senha_mestre, nome_completo, primeiro_nome, data_nascimento, telegram, melhor_horario, interesses, convite, role, telefone, endereco, bairro, cidade, numero, cep } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      const u = await pool.query(
        'UPDATE user_client SET email = $1, senha_mestre = $2, nome_completo = $3, primeiro_nome = $4, data_nascimento = $5, telegram = $6, melhor_horario = $7, interesses = $8, convite = $9, role = $10, telefone = $11, endereco = $12, bairro = $13, cidade = $14, numero = $15, cep = $16 WHERE id = $17 RETURNING *',
        [email, senha_mestre, nome_completo || null, primeiro_nome || null, data_nascimento || null, telegram || null, melhor_horario || null, interesses || null, convite || null, role || 'client', telefone || null, endereco || null, bairro || null, cidade || null, numero || null, cep || null, req.params.id]
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
        
        const fallbackUser = fallbackUsers.find(u => u.email === email && u.password === password);
        if (fallbackUser) {
           const token = jwt.sign(fallbackUser, JWT_SECRET, { expiresIn: '1d' });
           return res.json({ success: true, user: fallbackUser, token });
        }

        return res.status(401).json({ success: false, error: 'Credenciais inválidas. Tente admin@valentina.com e admin ou crie uma conta' });
      }

      let dbResult;
      if (!isNaN(Number(email))) {
        dbResult = await pool.query('SELECT id, name, email, role, is_approved, company_name, company_logo, wallet, can_transfer, can_request, can_request_delivery FROM users WHERE (email = $1 OR id = $2) AND password = $3', [email, Number(email), password]);
      } else {
        dbResult = await pool.query('SELECT id, name, email, role, is_approved, company_name, company_logo, wallet, can_transfer, can_request, can_request_delivery FROM users WHERE email = $1 AND password = $2', [email, password]);
      }

      if (dbResult.rows.length > 0) {
        const user = dbResult.rows[0];
        if (user.role === 'blocked') {
          await logAction(user.id, user.email, 'login_falhou', 'Usuário bloqueado tentou acessar');
          return res.status(403).json({ success: false, error: 'Usuário bloqueado pelo administrador.' });
        }
        if (user.role !== 'admin' && user.is_approved === false) {
           await logAction(user.id, user.email, 'login_falhou', 'Usuário não aprovado tentou acessar');
           return res.status(403).json({ success: false, error: 'Seu cadastro está aguardando aprovação do administrador.' });
        }
        normalizeUserWallet(user);
        
        // Obter qtde de produtos ativos
        let activeProducts = 0;
        try {
           const prodRes = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_available = true', [user.id]);
           activeProducts = parseInt(prodRes.rows[0].count) || 0;
        } catch(e) {}
        user.active_products_count = activeProducts;

        try { await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]); } catch(e) {}
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
    const { name, email, password, company_name, company_logo, requested_role, telefone, endereco, bairro, cidade, numero, cep } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
    }

    try {
      if (!dbConnected) {
        const existing = fallbackUsers.find(u => u.email === email);
        if (existing) {
           return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
        }
        const user = { id: Date.now(), name, email, password, role: requested_role === 'delivery' ? 'delivery' : 'user', company_name, company_logo };
        fallbackUsers.push(user);
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
        'INSERT INTO users (name, email, password, role, company_name, company_logo, is_approved, telefone, endereco, bairro, cidade, numero, cep) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, name, email, role, company_name, company_logo, is_approved',
        [name, email, password, requested_role === 'delivery' ? 'delivery' : 'user', company_name || null, company_logo || null, false, telefone || null, endereco || null, bairro || null, cidade || null, numero || null, cep || null]
      );
      
      const user = insertResult.rows[0];
      await logAction(user.id, user.email, 'registro', 'Conta criada aguardando aprovação');
      res.json({ success: true, message: 'Cadastro realizado com sucesso. Aguarde a aprovação de um administrador para fazer login.' });
    } catch (err) {
      console.error('Erro ao registrar usuário:', err);
      res.status(500).json({ success: false, error: 'Erro interno ao tentar registrar a conta.' });
    }
  });

  // Criar novo pedido (Cart Checkout)
  app.post('/api/orders', requireAuth, async (req, res) => {
    const { userId, total, items, seller_id, order_code, payment_method } = req.body;
    
    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Dados do pedido incompletos.' });
    }

    try {
      if (!dbConnected) {
        return res.json({ success: true, orderId: Date.now() }); // Fallback
      }

      // 1. Webhook validation with 30s wait
      const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/compra', {
         user_id: userId,
         total: total,
         items: items,
         tipo_operacao: 'compra'
      });

      if (webhookStatus !== 200) {
        return res.status(400).json({ success: false, error: `Erro no processamento do pedido (Webhook Status: ${webhookStatus}). Tente novamente.` });
      }

      // 2. Cria o pedido no Postgres
      const orderResult = await pool.query(
        'INSERT INTO orders (user_id, total_price, seller_id) VALUES ($1, $2, $3) RETURNING id',
        [userId, total, seller_id || null]
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

  // Atualizar status do pedido
  app.patch('/api/orders/:id', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const orderId = req.params.id;
      const { status } = req.body;
      const isAdmin = req.user.role === 'admin';
      const userId = req.user.id;

      if (!status) {
         return res.status(400).json({ success: false, error: 'Status não fornecido' });
      }

      // Se não for admin, verifica se a ordem pertence aos produtos deste vendedor
      let authorized = false;
      if (isAdmin) {
         authorized = true;
      } else {
         const checkRes = await pool.query(`
            SELECT 1 FROM orders o
            LEFT JOIN order_items oi ON o.id::text = oi.order_id::text
            LEFT JOIN products p ON oi.product_id::text = p.id::text
            WHERE o.id::text = $1::text AND (p.user_id::text = $2::text OR o.seller_id::text = $2::text OR o.user_id::text = $2::text) LIMIT 1
         `, [orderId, userId]);
         if (checkRes.rows.length > 0) {
            authorized = true;
         }
      }

      if (!authorized) {
         return res.status(403).json({ success: false, error: 'Acesso negado para modificar este pedido.' });
      }

      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Erro ao atualizar pedido:', err.message);
      res.status(500).json({ success: false, error: 'Falha ao atualizar ordem.' });
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
  server.timeout = 600000;
}

startServer();
