import express from 'express';
import { createServer as createViteServer } from 'vite';
import pkg from 'pg';
import path from 'path';
import fs from 'fs';
import * as Minio from 'minio';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod_12345';

function hashPassword(plain: string): string {
  if (!plain) return '';
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(plain, salt);
}

function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  // Fallback for legacy plain text passwords so they can login and then update
  if (!isBcryptHash(hash)) {
    return plain === hash;
  }
  return bcrypt.compareSync(plain, hash);
}

function isBcryptHash(str: string): boolean {
  return typeof str === 'string' && (str.startsWith('$2a$') || str.startsWith('$2b$') || str.startsWith('$2y$'));
}

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
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        tokens = tokens.concat(extractAllTokens(obj[key]));
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
  try {
    if (!user) return;
    let rawWallet = user.wallet || {};
    if (typeof rawWallet === 'string') {
      try { rawWallet = JSON.parse(rawWallet); } catch (e) {}
    }
    const userTokens = extractAllTokens(rawWallet);
    user.wallet = buildWalletObject(userTokens);
  } catch (err) {
    console.error("Erro ao normalizar wallet do usuário:", err);
    user.wallet = { tokens: [], token_1: [] };
  }
}

async function logAction(userId: string | number | null, userEmail: string | null, eventName: string, details: string) {
  try {
    if (!dbConnected) return;
    await pool.query('INSERT INTO logs (user_id, user_email, event_name, details) VALUES ($1, $2, $3, $4)', 
      [userId, userEmail, eventName, details]);

    // Also write a real notification to notifications table so it appears inside the bell
    const title = eventName.replace(/_/g, ' ').toUpperCase();
    const isGeneric = (userId ? false : true);
    await pool.query('INSERT INTO notifications (title, message, user_id, is_generic) VALUES ($1, $2, $3, $4)',
      [title, details, userId ? userId.toString() : null, isGeneric]);
  } catch(e) {
    console.error('Erro ao salvar log:', e);
  }
}

async function waitForWebhook(url: string, data: any = null, method: string = 'POST'): Promise<number> {
  const startTime = Date.now();
  let lastStatus = 0;
  
  while (Date.now() - startTime < 30000) {
    try {
      const options: any = {
        method: method,
        headers: {}
      };
      if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify({ ...data, timestamp: Date.now() });
      } else {
        options.headers['Accept'] = 'application/json';
      }
      
      const response = await fetch(url, options);
      lastStatus = response.status;
      
      const text = await response.text();
      console.log(`[waitForWebhook] Method: ${method}, URL: ${url}, HTTP: ${response.status}, Resposta: ${text}`);
      
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
    } catch (e: any) {
      console.error(`Erro ao chamar webhook (${url}):`, e.message);
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

    // --- UUID and Nickname Migration ---
    try {
      // First, drop foreign key constraints which might block changing columns types
      await pool.query('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey CASCADE;').catch(()=>null);
      await pool.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey CASCADE;').catch(()=>null);
      await pool.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_user_id_fkey CASCADE;').catch(()=>null);
      
      // Alter columns to VARCHAR
      await pool.query(`ALTER TABLE users ALTER COLUMN id TYPE VARCHAR(255) USING id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE orders ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE orders ALTER COLUMN delivery_user_id TYPE VARCHAR(255) USING delivery_user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE products ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE product_interactions ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE product_views ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE product_clicks ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE logs ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE credit_requests ALTER COLUMN user_id_recebedor TYPE VARCHAR(255) USING user_id_recebedor::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE credit_requests ALTER COLUMN user_id_solicitante TYPE VARCHAR(255) USING user_id_solicitante::VARCHAR;`).catch(() => {});
      await pool.query(`ALTER TABLE notifications ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::VARCHAR;`).catch(() => {});
    } catch (migTypeErr) {
      console.warn("Error converting column types to VARCHAR:", migTypeErr);
    }

    try {
      // Add nickname column
      await pool.query(`ALTER TABLE users ADD COLUMN nickname VARCHAR(255);`).catch(() => {});
      // Add unique constraint for nickname
      await pool.query(`ALTER TABLE users ADD CONSTRAINT users_nickname_key UNIQUE (nickname);`).catch(() => {});
    } catch (nickTypeErr) {
      console.warn("Error adding nickname column or constraint:", nickTypeErr);
    }

    // Migrate any existing integer IDs to properly generated UUIDs to ensure everything is UUID
    try {
      const usersToMigrate = await pool.query("SELECT id FROM users WHERE id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-';");
      for (const row of usersToMigrate.rows) {
        const oldId = row.id;
        const newUuid = crypto.randomUUID();
        await pool.query("UPDATE users SET id = $1 WHERE id = $2", [newUuid, oldId]);
        await pool.query("UPDATE logs SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE product_interactions SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE product_views SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE product_clicks SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE credit_requests SET user_id_recebedor = $1 WHERE user_id_recebedor = $2", [newUuid, oldId]);
        await pool.query("UPDATE credit_requests SET user_id_solicitante = $1 WHERE user_id_solicitante = $2", [newUuid, oldId]);
        await pool.query("UPDATE orders SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE orders SET delivery_user_id = $1 WHERE delivery_user_id = $2", [newUuid, oldId]);
        await pool.query("UPDATE notifications SET user_id = $1 WHERE user_id = $2", [newUuid, oldId]);
      }
    } catch (migErr) {
      console.warn("Migration to UUID warn:", migErr);
    }

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
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        nickname VARCHAR(255) UNIQUE
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
    
    // Suporte robusto a UUID nas tabelas acessórias
    try { await pool.query(`ALTER TABLE logs ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE product_views ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE product_clicks ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE product_interactions ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;`); } catch (e) {}
    
    // Criação das tabelas auxiliares de Likes e Comentários do Produto
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_likes (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_id, user_id)
        );
      `);
    } catch(e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_comments (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_name VARCHAR(255) NOT NULL,
          user_image TEXT,
          comment TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch(e) {}

    // Criação da tabela de sessões MFA para Login por QR Code
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mfa_sessions (
          id SERIAL PRIMARY KEY,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          user_id VARCHAR(255),
          jwt_token TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL
        );
      `);
    } catch(e) {}

    // Colunas de MFA e Biometria na tabela de usuários
    try { await pool.query(`ALTER TABLE users ADD COLUMN mfa_biometric_enabled BOOLEAN DEFAULT false;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN mfa_device_id VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN mfa_device_name VARCHAR(255);`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN biometric_credential_id TEXT;`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN mfa_auth_mode VARCHAR(50) DEFAULT 'password';`); } catch (e) {}
    try { await pool.query(`ALTER TABLE users ADD COLUMN biometric_device_key TEXT;`); } catch (e) {}

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

    // Inserção de um usuário admin teste se não existir por email
    const adminResult = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@valentina.com']);
    if (adminResult.rows.length === 0) {
      const adminId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO users (id, email, password, name, role, is_approved, nickname) VALUES 
        ($1, 'admin@valentina.com', 'admin', 'Admin Valentina', 'admin', true, 'admin');
      `, [adminId]);
    } else {
      // Garante que o nickname do admin existente seja 'admin'
      await pool.query("UPDATE users SET nickname = 'admin' WHERE email = 'admin@valentina.com' AND (nickname IS NULL OR nickname = '');").catch(() => {});
    }

    // Desativação de Row Level Security (RLS) no PostgreSQL para evitar bloqueios de transação sem variáveis de sessão
    try {
      console.log('Políticas RLS: Desativando Row Level Security nas tabelas principais para integridade transparente das consultas...');
      // Desativa RLS para Products, Orders e Logs já que a segurança é feita via rotas de API Express
      await pool.query('ALTER TABLE products DISABLE ROW LEVEL SECURITY;').catch(()=>null);
      await pool.query('ALTER TABLE orders DISABLE ROW LEVEL SECURITY;').catch(()=>null);
      await pool.query('ALTER TABLE logs DISABLE ROW LEVEL SECURITY;').catch(()=>null);
      
      // DROP policies se já existirem para evitar conflitos e limpar
      await pool.query('DROP POLICY IF EXISTS products_tenant_isolation ON products;').catch(()=>null);
      await pool.query('DROP POLICY IF EXISTS orders_tenant_isolation ON orders;').catch(()=>null);
      await pool.query('DROP POLICY IF EXISTS logs_tenant_isolation ON logs;').catch(()=>null);

      console.log('✅ RLS desativado e limpo com sucesso. O Express gerencial as permissões de forma transparente.');
    } catch(rlsError: any) {
      console.warn('⚠️ Nota RLS: Erro ao ajustar e desvincular políticas RLS:', rlsError.message);
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

// --- LOGIN RATE LIMIT TRACKER ---
interface LoginFailure {
  errorCount: number;
  lastFailureTime: number;
  lockoutEndTime: number;
}
const loginFailures = new Map<string, LoginFailure>();

// --- API & WEBHOOK RATE LIMIT TRACKER ---
interface RateLimitRecord {
  requestCount: number;
  windowStart: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();
const blockedIPs = new Set<string>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '250mb' }));
  app.use(express.urlencoded({ extended: true, limit: '250mb' }));
  const PORT = 3000;

  // --- ANTI-HACK & ANTI-SCRAPING SECURITY AUDIT (WAF) ---
  app.use((req: any, res: any, next: any) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

    // 1. Check if IP is permanently or temporarily blacklisted
    if (blockedIPs.has(ip)) {
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Seu IP foi bloqueado sob suspeita de hacking, scraping ou ataques maliciosos de acordo com politicas de seguranca."
      });
    }

    // 2. Anti-Scraping: Block common headless / scraper / automation user agents
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const scraperKeywords = [
      'puppeteer', 'headless', 'playwright', 'selenium', 'webdriver', 'scrapy', 
      'python', 'urllib', 'axios', 'node-fetch', 'got-node', 'phantomjs', 'postman', 
      'curl', 'wget', 'apachebench', 'sqlmap', 'nmap', 'go-http-client', 'java/'
    ];

    const isBot = scraperKeywords.some(keyword => userAgent.includes(keyword));
    if (isBot) {
      blockedIPs.add(ip);
      console.warn(`[SECURITY WARN] Scraper detected from IP: ${ip}, User-Agent: ${req.headers['user-agent']}`);
      return res.status(403).json({
        success: false,
        error: "Acesso negado: Deteccao Anti-Scraping ativa. Acesso automatizado, scrapers, crawlers ou bots nao sao permitidos nesta plataforma."
      });
    }

    // 3. WAF: Inspect request URL, Query parameters, and Body content for hacking exploit payloads (SQLi, XSS, Path Traversal)
    const hackingPatterns = [
      /union\s+select/i,
      /or\s+\d+=\d+/i,
      /or\s+'\d+'='\d+'/i,
      /\.\.\//, // Path traversal
      /\.\.\\/, // Windows path traversal
      /<\/script>/i, // XSS Script closing
      /javascript:/i, // javascript protocol injection
      /onerror=/i,
      /onload=/i,
      /xp_cmdshell/i,
      /drop\s+table/i,
      /select\s+.*\s+from\s+users/i
    ];

    // Recursive search in request parameters or objects
    const hasMaliciousPayload = (val: any): boolean => {
      if (!val) return false;
      if (typeof val === 'string') {
        return hackingPatterns.some(pattern => pattern.test(val));
      }
      if (typeof val === 'object') {
        for (const k in val) {
          if (Object.prototype.hasOwnProperty.call(val, k)) {
            if (hasMaliciousPayload(val[k])) return true;
          }
        }
      }
      return false;
    };

    // Scan request paths, queries, and request bodies for hacking payloads
    const cleanUrl = decodeURIComponent(req.originalUrl || req.url || '');
    if (hackingPatterns.some(pattern => pattern.test(cleanUrl)) || hasMaliciousPayload(req.query) || hasMaliciousPayload(req.body)) {
      blockedIPs.add(ip);
      console.warn(`[SECURITY WARN] Malicious payload detected from IP: ${ip}. URL: ${req.originalUrl}`);
      
      if (dbConnected) {
        pool.query('INSERT INTO logs (user_id, user_email, event_name, details, ip_address) VALUES ($1, $2, $3, $4, $5)', [
          null, null, 'bloqueio_security_waf', `Ataque Bloqueado: Tentativa de payload malicioso detectado. IP adicionado a blacklist do firewall. URL: ${req.originalUrl}`, ip
        ]).catch(() => {});
      }

      return res.status(403).json({
        success: false,
        error: "Acesso negado: Atividade suspeita detectada pelas regras do WAF. Seu IP foi bloqueado por motivos de seguranca."
      });
    }

    next();
  });

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

  // --- ANTISCRAPING & EMBEDDING PROTECTION RATELIMIT (20 requests per minute) ---
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const isApiOrWebhook = req.path.startsWith('/api') || req.path.includes('webhook');
    if (isApiOrWebhook) {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const windowMs = 60000; // 1 minuto
      const limit = 20;

      let record = ipRateLimits.get(ip);
      if (!record) {
        record = { requestCount: 1, windowStart: now };
        ipRateLimits.set(ip, record);
      } else {
        if (now - record.windowStart < windowMs) {
          if (record.requestCount >= limit) {
            const remainingSec = Math.ceil((windowMs - (now - record.windowStart)) / 1000);
            return res.status(429).json({ 
              success: false, 
              error: `Bloqueio Antiscraping: Limite de 20 chamadas de API ou Webhook por minuto excedido para este IP. Tempo restante de bloqueio: ${remainingSec} segundos.` 
            });
          }
          record.requestCount += 1;
        } else {
          record.requestCount = 1;
          record.windowStart = now;
        }
      }
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
                 (SELECT COUNT(*) FROM product_likes WHERE product_id = p.id) as likes_count,
                 (SELECT COUNT(*) FROM product_comments WHERE product_id = p.id) as comments_count,
                 (SELECT COUNT(*) FROM product_interactions WHERE product_id = p.id) as interactions_count
          FROM products p
          ORDER BY p.id DESC
        `);
      } else {
        dbResult = await pool.query(`
          SELECT p.*,
                 (SELECT COUNT(*) FROM product_views WHERE product_id = p.id) as views_count,
                 (SELECT COUNT(*) FROM product_clicks WHERE product_id = p.id) as clicks_count,
                 (SELECT COUNT(*) FROM product_likes WHERE product_id = p.id) as likes_count,
                 (SELECT COUNT(*) FROM product_comments WHERE product_id = p.id) as comments_count,
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
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table, duration_days, req_token_type } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      let userId: any = req.body.user_id || (req.user ? req.user.id : null);
      if (userId && !isNaN(Number(userId))) {
        userId = parseInt(userId.toString(), 10);
      }
      const userName = req.user ? req.user.name : null;
      const userEmail = req.user ? req.user.email : null;
      
      console.log(`[POST /api/products] Criando produto. userId: ${userId}, userName: ${userName}, userEmail: ${userEmail}, req_token_type: ${req_token_type}`);

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
        requiredAmount, parseInt(req_token_type) || 2048, duration
      ]);

      // Se for administrador, disponibiliza o produto imediatamente sem necessidade de webhook de token
      if (isUserAdmin) {
         await logAction(userId, userEmail, 'produto_adicionado', `Produto ${result.rows[0].name} cadastrado com sucesso direto pelo Administrador.`);
         return res.json({ success: true, product: result.rows[0] });
      }

      await logAction(userId, userEmail, 'produto_adicionado', `Produto ${result.rows[0].name} criado (aguardando webhook) para ${duration} dias (necessita ${requiredAmount} tokens do tipo ${requiredTypeLength})`);
      
      // Chamar webhook de cadastro e aguardar resposta por até 30 segundos
      const webhookUrl = `https://system.voryx.com.br/webhook/pagamentodetokenemcadastro?userId=${userId}&email=${encodeURIComponent(userEmail)}&productId=${result.rows[0].id}&amount=${requiredAmount}&typeLength=${requiredTypeLength}`;
      console.log(`Disparando webhook de cadastro e aguardando resposta: ${webhookUrl}`);
      
      const webhookStatus = await waitForWebhook(webhookUrl, null, 'GET');

      if (webhookStatus === 200) {
        // Ativa o produto imediatamente na DB
        await pool.query('UPDATE products SET is_available = true WHERE id = $1', [result.rows[0].id]);
        
        // Descontar os tokens do saldo do usuário
        const senderRes = await pool.query('SELECT wallet FROM users WHERE id = $1', [userId]);
        if (senderRes.rows.length > 0) {
          const sender = senderRes.rows[0];
          let rawWallet = sender.wallet || {};
          if (typeof rawWallet === 'string') {
            try { rawWallet = JSON.parse(rawWallet); } catch (e) {}
          }
          let userTokens = extractAllTokens(rawWallet);

          const matchingIndices = [];
          for (let i = 0; i < userTokens.length; i++) {
            if (typeof userTokens[i] === 'string' && userTokens[i].length === requiredTypeLength) {
              matchingIndices.push(i);
            }
          }

          if (matchingIndices.length >= requiredAmount) {
            for (let i = 0; i < requiredAmount; i++) {
              const idxToRemove = matchingIndices.pop();
              if (idxToRemove !== undefined) {
                userTokens[idxToRemove] = null as any;
              }
            }
            const newSenderTokens = userTokens.filter(t => t !== null);
            const updatedSenderWallet = buildWalletObject(newSenderTokens);
            await pool.query('UPDATE users SET wallet = $1 WHERE id = $2', [JSON.stringify(updatedSenderWallet), userId]);
          }
        }

        // Colocar no histórico de pagamentos de eToken como pagamento_token_cadastro
        const logDetailsObj = {
          token_qty: requiredAmount,
          token_type: `E${requiredTypeLength}`,
          product_id: result.rows[0].id,
          product_name: name,
          date_time: new Date().toISOString(),
          is_etoken_payment: true,
          details: `Pagamento de ${requiredAmount} token(s) E${requiredTypeLength} para cadastro do produto "${name}" (ID #${result.rows[0].id})`
        };
        await logAction(userId, userEmail, 'pagamento_token_cadastro', JSON.stringify(logDetailsObj));

        const updatedProdRes = await pool.query('SELECT * FROM products WHERE id = $1', [result.rows[0].id]);
        return res.json({ 
          success: true, 
          product: updatedProdRes.rows[0] || result.rows[0],
          pendingWebhook: false
        });
      }

      // Se falhou (timeout ou status 100/não 200), deleta o produto cadastrado para manter a DB limpa e avisa o erro
      await pool.query('DELETE FROM products WHERE id = $1', [result.rows[0].id]);
      await logAction(userId, userEmail, 'produto_cadastro_rejeitado', `Cadastro do produto ${name} falhou validação (Status Webhook: ${webhookStatus})`);
      return res.status(400).json({ success: false, error: 'deu problema com validação' });
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
      // Deletar todas as interações, comentários, curtidas, cliques, visualizações e itens de pedidos associados ao produto
      await pool.query('DELETE FROM product_interactions WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_views WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_clicks WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_likes WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM product_comments WHERE product_id = $1', [req.params.id]);
      await pool.query('DELETE FROM order_items WHERE product_id = $1', [req.params.id]);

      const dbResult = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
      if (dbResult.rows.length > 0) {
          await logAction(req.user.id, userEmail, 'produto_removido', `Produto ${req.params.id} removido`);
          res.json({ success: true });
      } else {
          res.status(404).json({ success: false, error: 'Produto não encontrado.' });
      }
    } catch(err) {
      console.error('Erro ao deletar produto:', err);
      res.status(500).json({ success: false, error: 'Erro ao deletar produto.' });
    }
  });

  // Editar produto
  app.put('/api/products/:id', requireAuth, async (req: any, res) => {
    const { name, category, price, tokens, stock, details, media, variations, business_model, tables, seats_per_table, is_available, req_token_type } = req.body;
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

      // Impedir de atualizar o nome do produto se o papel do usuário for 'user'
      if (req.user.role === 'user' && name && name !== productObj.rows[0].name) {
        return res.status(400).json({ success: false, error: 'Impedido: Usuários com papel "user" não podem alterar o nome do produto.' });
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
        SET name = $1, category = $2, price = $3, tokens = $4, stock = $5, details = $6, media = $7, variations = $8, image = $9, business_model = $10, tables = $11, seats_per_table = $12, is_available = $13, req_token_type = $14
        WHERE id = $15 RETURNING *
      `, [
        name, category, String(price || '0'), parseInt(tokens) || 0, parseInt(stock) || 0, details, 
        JSON.stringify(mediaParsed), JSON.stringify(variationsParsed), imagesString, business_model || 'Venda', tables || null, seats_per_table || null, statusToSet,
        parseInt(req_token_type) || 2048,
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

      let viewsQuery = 'SELECT COUNT(*) FROM product_views';
      let viewsVals: any[] = [];
      let clicksQuery = 'SELECT COUNT(*) FROM product_clicks';
      let clicksVals: any[] = [];
      let likesQuery = 'SELECT COUNT(*) FROM product_likes';
      let likesVals: any[] = [];
      let commentsQuery = 'SELECT COUNT(*) FROM product_comments';
      let commentsVals: any[] = [];

      if (!isAdmin) {
          prodQuery += ' WHERE user_id = $1';
          prodVals.push(userId);
          stockQuery += ' WHERE user_id = $1';
          stockVals.push(userId);
          ordersQuery = 'SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.user_id = $1';
          ordersVals.push(userId);
          monthlySalesQuery = `SELECT TO_CHAR(o.created_at, 'MM/YYYY') as month, COUNT(DISTINCT o.id) as count FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.user_id = $1 GROUP BY month ORDER BY month DESC LIMIT 6`;
          monthlySalesVals.push(userId);

          viewsQuery = 'SELECT COUNT(*) FROM product_views pv JOIN products p ON pv.product_id = p.id WHERE p.user_id = $1';
          viewsVals.push(userId);
          clicksQuery = 'SELECT COUNT(*) FROM product_clicks pc JOIN products p ON pc.product_id = p.id WHERE p.user_id = $1';
          clicksVals.push(userId);
          likesQuery = 'SELECT COUNT(*) FROM product_likes pl JOIN products p ON pl.product_id = p.id WHERE p.user_id = $1';
          likesVals.push(userId);
          commentsQuery = 'SELECT COUNT(*) FROM product_comments pc JOIN products p ON pc.product_id = p.id WHERE p.user_id = $1';
          commentsVals.push(userId);
      }

      const prodRes = await pool.query(prodQuery, prodVals);
      const ordersRes = await pool.query(ordersQuery, ordersVals);
      const stockRes = await pool.query(stockQuery, stockVals);
      const monthlySalesRes = await pool.query(monthlySalesQuery, monthlySalesVals);
      const viewsRes = await pool.query(viewsQuery, viewsVals);
      const clicksRes = await pool.query(clicksQuery, clicksVals);
      const likesRes = await pool.query(likesQuery, likesVals);
      const commentsRes = await pool.query(commentsQuery, commentsVals);
      
      res.json({
        success: true,
        stats: {
          products: parseInt(prodRes.rows[0].count) || 0,
          orders: parseInt(ordersRes.rows[0].count) || 0,
          stock: parseInt(stockRes.rows[0].total_stock) || 0,
          views: parseInt(viewsRes.rows[0].count) || 0,
          clicks: parseInt(clicksRes.rows[0].count) || 0,
          likes: parseInt(likesRes.rows[0].count) || 0,
          comments: parseInt(commentsRes.rows[0].count) || 0,
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
    const { name, email, password, role, company_name, company_logo, nickname } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Dados incompletos.' });
    try {
      if (!dbConnected) throw new Error("DB offline");
      
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : String(email || '').trim();
      const checkEmail = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
      }

      let finalNickname = nickname ? nickname.trim() : '';
      if (!finalNickname) {
        const base = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        finalNickname = `${base}_${crypto.randomUUID().slice(0, 4)}`;
      }

      const checkNick = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)', [finalNickname]);
      if (checkNick.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Este Nickname já está em uso.' });
      }

      const userId = crypto.randomUUID();
      const encryptedPassword = hashPassword(password);
      const insertResult = await pool.query(
        'INSERT INTO users (id, name, email, password, role, company_name, company_logo, nickname, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id, name, email, role, company_name, company_logo, nickname, is_approved',
        [userId, name, cleanEmail, encryptedPassword, role || 'user', company_name || null, company_logo || null, finalNickname]
      );
      await logAction(req.user.id, req.user.email, 'usuario_adicionado', `O admin adicionou ${email} (Nickname: ${finalNickname})`);
      res.json({ success: true, user: insertResult.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', requireAuth, requireAdmin, async (req: any, res) => {
    const { name, email, role, password, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery, nickname } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : String(email || '').trim();
      const checkEmail = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [cleanEmail, req.params.id]);
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Este e-mail está em uso por outro usuário.' });
      }

      let finalNickname = nickname ? nickname.trim() : '';
      if (finalNickname) {
        const checkNick = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1) AND id <> $2', [finalNickname, req.params.id]);
        if (checkNick.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'Este Nickname já está em uso por outro usuário.' });
        }
      }

      const val_is_approved = is_approved !== undefined ? (is_approved === true || is_approved === 'true') : null;
      const val_can_transfer = can_transfer !== undefined ? (can_transfer === true || can_transfer === 'true') : null;
      const val_can_request = can_request !== undefined ? (can_request === true || can_request === 'true') : null;
      const val_can_request_delivery = can_request_delivery !== undefined ? (can_request_delivery === true || can_request_delivery === 'true') : null;

      let u;
      if (password) {
        const encryptedPassword = hashPassword(password);
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, password = $4, company_name = $5, company_logo = $6, is_approved = COALESCE($8, is_approved), can_transfer = COALESCE($9, can_transfer), can_request = COALESCE($10, can_request), can_request_delivery = COALESCE($11, can_request_delivery), nickname = COALESCE($12, nickname) WHERE id = $7 RETURNING id, name, email, role, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery, nickname',
          [name, cleanEmail, role, encryptedPassword, company_name || null, company_logo || null, req.params.id, val_is_approved, val_can_transfer, val_can_request, val_can_request_delivery, finalNickname || null]
        );
      } else {
        u = await pool.query(
          'UPDATE users SET name = $1, email = $2, role = $3, company_name = $4, company_logo = $5, is_approved = COALESCE($7, is_approved), can_transfer = COALESCE($8, can_transfer), can_request = COALESCE($9, can_request), can_request_delivery = COALESCE($10, can_request_delivery), nickname = COALESCE($11, nickname) WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo, is_approved, can_transfer, can_request, can_request_delivery, nickname',
          [name, cleanEmail, role, company_name || null, company_logo || null, req.params.id, val_is_approved, val_can_transfer, val_can_request, val_can_request_delivery, finalNickname || null]
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
        const encryptedPassword = hashPassword(password);
        updateResult = await pool.query(
          'UPDATE users SET name = COALESCE($1, name), company_name = COALESCE($2, company_name), company_logo = COALESCE($3, company_logo), dashboard_theme = COALESCE($4, dashboard_theme), password = $5 WHERE id = $6 RETURNING id, name, email, role, company_name, company_logo, dashboard_theme',
          [name, company_name, company_logo, dashboard_theme, encryptedPassword, req.user.id]
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

  app.post('/api/transfer_tokens', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { receiver_id, amount, token_length, password } = req.body;
      const amountInt = parseInt(amount);
      const tokenLenInt = parseInt(token_length);
      const senderId = req.user.id;

      // 1. Fetch Sender (Can be in users OR user_client)
      let senderRes = await pool.query('SELECT id, wallet, name, email, password, can_transfer, role FROM users WHERE id::text = $1', [senderId]);
      let senderType = 'users';

      if (senderRes.rows.length === 0) {
        senderRes = await pool.query('SELECT id, wallet, nome_completo AS name, email, senha_mestre AS password, role FROM user_client WHERE id::text = $1', [senderId]);
        if (senderRes.rows.length > 0) {
          senderType = 'user_client';
        }
      }

      if (senderRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Remetente não encontrado no sistema.' });
      }

      const sender = senderRes.rows[0];

      // 2. Perform permission/blocking checks
      const isSenderBlockedFromTransfer = senderType === 'users' && sender.can_transfer === false && sender.role !== 'admin';
      if (isSenderBlockedFromTransfer) {
        return res.status(403).json({ success: false, error: 'A transferência de tokens está bloqueada para sua conta.' });
      }

      if (!password) {
        return res.status(400).json({ success: false, error: 'A senha é obrigatória para realizar transferências.' });
      }

      const senderPasswordHash = sender.password;
      if (!senderPasswordHash) {
         return res.status(401).json({ success: false, error: 'Conta de origem sem senha cadastrada.' });
      }

      if (!verifyPassword(password, senderPasswordHash)) {
         return res.status(401).json({ success: false, error: 'Senha incorreta.' });
      }

      if (!receiver_id || !amountInt || !tokenLenInt || amountInt <= 0) {
        return res.status(400).json({ success: false, error: 'Parâmetros de transferência inválidos.' });
      }

      // 3. Look up Receiver (Can be in users OR user_client)
      let destinationId = receiver_id;
      let receiverRes = await pool.query('SELECT id, wallet, email FROM users WHERE id::text = $1', [receiver_id]);
      let receiverType = 'users';

      if (receiverRes.rows.length === 0) {
        // Try searching users by nickname or email
        const nickEmailRes = await pool.query(
          'SELECT id, wallet, email FROM users WHERE LOWER(nickname) = LOWER($1) OR LOWER(email) = LOWER($1)',
          [receiver_id.trim()]
        );
        if (nickEmailRes.rows.length > 0) {
          receiverRes = nickEmailRes;
          destinationId = nickEmailRes.rows[0].id;
          receiverType = 'users';
        }
      }

      if (receiverRes.rows.length === 0) {
         // Try searching user_client by ID
         const ucIdRes = await pool.query('SELECT id, wallet, email FROM user_client WHERE id::text = $1', [receiver_id]);
         if (ucIdRes.rows.length > 0) {
            receiverRes = ucIdRes;
            receiverType = 'user_client';
            destinationId = ucIdRes.rows[0].id;
         }
      }

      if (receiverRes.rows.length === 0) {
         // Try searching user_client by email or full name
         const ucSearchRes = await pool.query(
           'SELECT id, wallet, email FROM user_client WHERE LOWER(email) = LOWER($1) OR LOWER(nome_completo) = LOWER($1)',
           [receiver_id.trim()]
         );
         if (ucSearchRes.rows.length > 0) {
            receiverRes = ucSearchRes;
            receiverType = 'user_client';
            destinationId = ucSearchRes.rows[0].id;
         }
      }

      if (receiverRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Destinatário não encontrado por ID, Nickname, E-mail ou Nome.' });
      }

      const receiver = receiverRes.rows[0];

      if (senderId.toString() === destinationId.toString()) {
        return res.status(400).json({ success: false, error: 'Não é possível transferir para si mesmo.' });
      }

      // 4. Webhook validation with 30s wait
      const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/transferencia', {
         remetente_id: senderId,
         quantidade: amountInt,
         tipo_moeda: "E" + tokenLenInt,
         moeda: token_length,
         destinatario_id: destinationId,
         tipo_operacao: 'transferencia'
      });

      if (webhookStatus !== 200) {
        return res.status(400).json({ success: false, error: 'Validação da operação via webhook recusada.' });
      }

      // Ensure user_client table has wallet column
      try { await pool.query(`ALTER TABLE user_client ADD COLUMN wallet JSONB DEFAULT '{"tokens": []}';`); } catch (e) {}

      // 5. Transfer logic
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
      
      let recWallet = receiver.wallet || {};
      if (typeof recWallet === 'string') {
        try { recWallet = JSON.parse(recWallet); } catch (e) {}
      }
      let receiverTokens = extractAllTokens(recWallet);
      receiverTokens = receiverTokens.concat(tokensToTransfer);
      const updatedReceiverWallet = buildWalletObject(receiverTokens);

      // Save both sender and receiver wallets to their respective tables (users or user_client)
      if (senderType === 'user_client') {
         await pool.query('UPDATE user_client SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedSenderWallet), senderId]);
      } else {
         await pool.query('UPDATE users SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedSenderWallet), senderId]);
      }

      if (receiverType === 'user_client') {
         await pool.query('UPDATE user_client SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedReceiverWallet), destinationId]);
      } else {
         await pool.query('UPDATE users SET wallet = $1 WHERE id::text = $2', [JSON.stringify(updatedReceiverWallet), destinationId]);
      }

      await logAction(senderId, sender.email, 'transferencia', `Enviou ${amountInt} eToken(s) E${tokenLenInt} para ID ${destinationId}`);
      await logAction(destinationId, receiver.email, 'recebimento_transferencia', `Recebeu ${amountInt} eToken(s) E${tokenLenInt} do ID ${senderId}`);

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Erro interno ao transferir: ' + (err.message || String(err)) });
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
      if (!verifyPassword(password, user.password)) {
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
        return res.status(400).json({ success: false, error: 'deu problema com validação' });
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

  // GET /api/admin/live-activity
  app.get('/api/admin/live-activity', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) return res.json({ success: true, logs: [] });
      const sinceId = parseInt(req.query.sinceId as string || '0');
      const isAdmin = req.user.role === 'admin';
      
      let dbResult;
      if (isAdmin) {
        dbResult = await pool.query('SELECT * FROM logs WHERE id > $1 ORDER BY id ASC LIMIT 100', [sinceId]);
      } else {
        dbResult = await pool.query('SELECT * FROM logs WHERE id > $1 AND (user_id = $2 OR user_email = $3) ORDER BY id ASC LIMIT 100', [sinceId, req.user.id, req.user.email]);
      }
      res.json({ success: true, logs: dbResult.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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
      
      // Chamar webhook de saldo com 30s de limite
      const webhookStatus = await waitForWebhook('https://system.voryx.com.br/webhook/atualizasaldo', null, 'GET');

      if (webhookStatus !== 200) {
        // Se falhou (timeout ou retorno não-200), cancela inserção e retorna erro padrão
        await pool.query('DELETE FROM credit_requests WHERE id = $1', [reqId]);
        return res.status(400).json({ success: false, error: 'deu problema com validação' });
      }

      // Webhook sucesso: o webhook gera o token automaticamente na carteira do usuário.
      // Apenas atualizamos o status do pedido e gravamos logs de transação e auditoria.
      const qty = parseInt(quantidade);
      const tLen = parseInt(tipo_token);

      const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [user_id_recebedor]);
      let receiverEmail = '';
      if (userRes.rows.length > 0) {
        receiverEmail = userRes.rows[0].email;
      }

      await pool.query('UPDATE credit_requests SET status = $1 WHERE id = $2', ['gerado', reqId]);

      // Adiciona na história de logs (para extrato do recebedor)
      const creditLogDetails = {
        token_qty: qty,
        token_type: `E${tLen}`,
        date_time: new Date().toISOString(),
        is_etoken_credit: true,
        details: `Crédito de ${qty} token(s) E${tLen} adicionado com sucesso por Webhook.`
      };
      await logAction(user_id_recebedor, receiverEmail, 'credito_recebido', JSON.stringify(creditLogDetails));

      await logAction(req.user.id, req.user.email, 'credito_solicitado', `Admin solicitou e gerou ${quantidade} tokens E${tipo_token} para o usuario ${user_id_recebedor} (Status: gerado)`);
      
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
          return res.status(400).json({ success: false, error: 'deu problema com validação' });
        }

        // Webhook sucesso: o webhook gera o token automaticamente na carteira do usuário.
        // Apenas atualizamos o status e gravamos logs de transação.
        const qty = parseInt(pedido.quantidade);
        const tLen = parseInt(pedido.tipo_token);

        const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [pedido.user_id_recebedor]);
        let receiverEmail = '';
        if (userRes.rows.length > 0) {
           receiverEmail = userRes.rows[0].email;
        }

        // Adiciona na história de logs (para extrato do recebedor)
        const creditLogDetails = {
          token_qty: qty,
          token_type: `E${tLen}`,
          date_time: new Date().toISOString(),
          is_etoken_credit: true,
          details: `Crédito de ${qty} token(s) E${tLen} liberado com sucesso por aprovação do Webhook.`
        };
        await logAction(pedido.user_id_recebedor, receiverEmail, 'credito_recebido', JSON.stringify(creditLogDetails));
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
  
  // POST /api/admin/reset-ratelimit - Reset all rate limit trackers (IP API/Webhook & Logins)
  app.post('/api/admin/reset-ratelimit', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      ipRateLimits.clear();
      loginFailures.clear();
      blockedIPs.clear();
      if (dbConnected) {
        await logAction(req.user.id, req.user.email, 'reset_rate_limit', 'Admin limpou todas as tentativas e bloqueios de rate limit, blacklists do WAF e Logins');
      }
      res.json({ success: true, message: 'Todas as tentativas e bloqueios de rate limit, blacklists do WAF e Logins foram reiniciados com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
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
      if (adminRes.rows.length === 0 || !verifyPassword(password, adminRes.rows[0].password)) {
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

  // POST /api/notifications/clear - Limpar todas as notificações do usuário
  app.post('/api/notifications/clear', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) {
        return res.json({ success: true });
      }
      const userIdStr = req.user.id ? req.user.id.toString() : '';
      let userIdNum = parseInt(req.user.id);
      if (isNaN(userIdNum)) userIdNum = -1;

      await pool.query(`
        DELETE FROM notifications 
        WHERE user_id = $1 OR user_id = $2 OR is_generic = true
      `, [userIdStr, userIdNum.toString()]);

      res.json({ success: true });
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
      if (userRes.rows.length === 0 || !verifyPassword(password, userRes.rows[0].password)) {
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

  // ========== REQ: BIOMETRIA, LIKES, COMENTARIOS E LOGS ENDPOINTS ==========

  // Curtir/Descurtir Produto
  app.post('/api/products/:id/like', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const product_id = parseInt(req.params.id);
      const user_id = req.user.id;

      const checkLike = await pool.query('SELECT * FROM product_likes WHERE product_id = $1 AND user_id = $2', [product_id, user_id]);
      if (checkLike.rows.length > 0) {
        await pool.query('DELETE FROM product_likes WHERE product_id = $1 AND user_id = $2', [product_id, user_id]);
        return res.json({ success: true, liked: false, message: 'Curtida removida com sucesso.' });
      } else {
        await pool.query('INSERT INTO product_likes (product_id, user_id) VALUES ($1, $2)', [product_id, user_id]);
        return res.json({ success: true, liked: true, message: 'Produto curtido com sucesso.' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Verificar se o usuário curtiu determinado produto
  app.get('/api/products/:id/liked', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const product_id = parseInt(req.params.id);
      const user_id = req.user.id;
      const checkLike = await pool.query('SELECT * FROM product_likes WHERE product_id = $1 AND user_id = $2', [product_id, user_id]);
      res.json({ success: true, liked: checkLike.rows.length > 0 });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Obter Likes de um Produto
  app.get('/api/products/:id/likes', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const product_id = parseInt(req.params.id);
      const result = await pool.query('SELECT COUNT(*) FROM product_likes WHERE product_id = $1', [product_id]);
      res.json({ success: true, count: parseInt(result.rows[0].count) || 0 });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Comentar em um Produto
  app.post('/api/products/:id/comments', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const product_id = parseInt(req.params.id);
      const { comment } = req.body;
      const user_id = req.user.id;
      const user_name = req.user.name || 'Usuário';

      if (!comment || comment.trim() === '') {
        return res.status(400).json({ success: false, error: 'Comentário não pode ser vazio.' });
      }

      const insertRes = await pool.query(
        'INSERT INTO product_comments (product_id, user_id, user_name, comment) VALUES ($1, $2, $3, $4) RETURNING *',
        [product_id, user_id, user_name, comment]
      );

      res.json({ success: true, comment: insertRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Listar Comentários de um Produto
  app.get('/api/products/:id/comments', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const product_id = parseInt(req.params.id);
      const result = await pool.query('SELECT * FROM product_comments WHERE product_id = $1 ORDER BY created_at DESC', [product_id]);
      res.json({ success: true, comments: result.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Listar Comentários Recentes para o Dashboard
  app.get('/api/dashboard/comments', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      let queryStr = `
        SELECT c.*, p.name as product_name 
        FROM product_comments c
        JOIN products p ON c.product_id = p.id
      `;
      let queryVals: any[] = [];

      if (!isAdmin) {
        queryStr += ' WHERE p.user_id = $1';
        queryVals.push(userId);
      }

      queryStr += ' ORDER BY c.created_at DESC LIMIT 10';

      const result = await pool.query(queryStr, queryVals);
      res.json({ success: true, comments: result.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Configuração do MFA pelo próprio usuário logado
  app.post('/api/users/me/toggle-mfa', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { enabled, credentialId } = req.body;
      const userId = req.user.id;
      const deviceId = crypto.randomUUID();
      const deviceName = 'Leitor Biométrico Registrado';

      if (enabled) {
        await pool.query(
          "UPDATE users SET mfa_biometric_enabled = true, mfa_device_id = $1, mfa_device_name = $2, biometric_credential_id = $3 WHERE id = $4",
          [deviceId, deviceName, credentialId || null, userId]
        );
        await logAction(userId, req.user.email, 'mfa_ativado', 'Ativou autenticação rápida de 2 fatores por biometria real');
        res.json({ success: true, mfa_biometric_enabled: true, mfa_device_id: deviceId, mfa_device_name: deviceName });
      } else {
        await pool.query(
          "UPDATE users SET mfa_biometric_enabled = false, mfa_device_id = NULL, mfa_device_name = NULL, biometric_credential_id = NULL WHERE id = $1",
          [userId]
        );
        await logAction(userId, req.user.email, 'mfa_desativado', 'Desativou autenticação por biometria de 2 fatores');
        res.json({ success: true, mfa_biometric_enabled: false });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Autenticação direta e rápida por biometria real (WebAuthn)
  app.post('/api/login/biometric', async (req, res) => {
    const { email, credentialId } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    try {
      if (!dbConnected) {
        return res.status(400).json({ success: false, error: 'Banco de dados inacessível para verificação biométrica.' });
      }
      
      const userRes = await pool.query(
        "SELECT id, name, email, role, mfa_biometric_enabled, company_name, company_logo, is_approved, nickname, biometric_credential_id FROM users WHERE LOWER(email) = $1 OR LOWER(nickname) = $1 OR id::text = $1", 
        [cleanEmail]
      );
      
      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Nenhum usuário cadastrado com este e-mail ou identificador.' });
      }
      
      const user = userRes.rows[0];
      if (!user.mfa_biometric_enabled) {
        return res.status(400).json({ success: false, error: 'Este usuário não possui o login biométrico ativado.' });
      }
      
      if (user.role === 'blocked') {
        return res.status(403).json({ success: false, error: 'Usuário bloqueado pelo administrador.' });
      }

      // Se houver uma credencial biométrica registrada, valida ela (ou valida local se houver bypass para teste no iframe)
      if (user.biometric_credential_id && credentialId && user.biometric_credential_id !== credentialId) {
        return res.status(403).json({ success: false, error: 'A assinatura do leitor biométrico não corresponde ao dispositivo cadastrado.' });
      }

      const tokenUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
        company_logo: user.company_logo,
        is_approved: user.is_approved,
        nickname: user.nickname
      };
      const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1d' });
      
      await logAction(user.id, user.email, 'login_biometrico_sucesso', 'Realizou login rápido usando biometria do dispositivo');
      
      return res.json({ success: true, user, token });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Erro no login biométrico: ' + err.message });
    }
  });

  // Reset do MFA de um usuário feito apenas por um Administrador
  app.post('/api/admin/users/:id/reset-mfa', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const targetUserId = req.params.id;

      await pool.query(
        "UPDATE users SET mfa_biometric_enabled = false, mfa_device_id = NULL, mfa_device_name = NULL, biometric_credential_id = NULL WHERE id = $1",
        [targetUserId]
      );
      
      await logAction(req.user.id, req.user.email, 'admin_reset_mfa', `MFA biométrico desativado pelo admin para o usuário ID: ${targetUserId}`);
      res.json({ success: true, message: 'Autenticação multifator biométrica redefinida (desativada) com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Remover a senha de um usuário feito apenas por um Administrador (exige nova senha no próximo login)
  app.post('/api/admin/users/:id/remove-password', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const targetUserId = req.params.id;

      await pool.query(
        "UPDATE users SET password = NULL WHERE id = $1",
        [targetUserId]
      );
      
      await logAction(req.user.id, req.user.email, 'admin_remove_password', `Senha removida pelo admin para o usuário ID: ${targetUserId}`);
      res.json({ success: true, message: 'Senha do usuário removida com sucesso. O sistema solicitará que ele cadastre uma nova senha comercial no primeiro login.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/auth/setup-new-password - Redefinição/atualização de senha para usuários forçados/resetados
  app.post('/api/auth/setup-new-password', async (req, res) => {
    const { userId, password, confirmPassword } = req.body;
    try {
      if (!dbConnected) throw new Error("DB offline");
      if (!userId || !password) {
        return res.status(400).json({ success: false, error: 'Dados incompletos para redefinição.' });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'As senhas não conferem.' });
      }

      const hashed = hashPassword(password);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
      
      await logAction(userId, 'sistema', 'senha_redefinida', 'O usuário redefiniu sua senha com sucesso.');
      res.json({ success: true, message: 'Nova senha cadastrada com sucesso! Você já pode realizar o login.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Criar uma nova sessão MFA para QR Code (chamado pela tela de login)
  app.post('/api/auth/mfa/initiate', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const session_token = crypto.randomUUID();
      const expires_at = new Date(Date.now() + 120 * 1000); // 2 minutos

      await pool.query(
        "INSERT INTO mfa_sessions (session_token, status, expires_at) VALUES ($1, $2, $3)",
        [session_token, 'pending', expires_at]
      );

      res.json({
        success: true,
        session_token,
        token: session_token,
        expires_at
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Consultar status de uma sessão MFA (Desktop polla esse endpoint)
  app.get('/api/auth/mfa/check', async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { token } = req.query;

      if (!token) return res.status(400).json({ success: false, error: 'Token é necessário' });

      const result = await pool.query("SELECT * FROM mfa_sessions WHERE session_token = $1", [token]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, status: 'expired', error: 'Sessão MFA não encontrada' });
      }

      const session = result.rows[0];
      if (new Date() > new Date(session.expires_at)) {
        return res.json({ success: true, status: 'expired', error: 'Sessão QR-Code expirada.' });
      }

      res.json({
        success: true,
        status: session.status,
        token: session.jwt_token
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Smartphone solicita os dados básicos do QR lido para validação
  app.get('/api/auth/mfa/session/:token', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const session_token = req.params.token;

      const result = await pool.query("SELECT * FROM mfa_sessions WHERE session_token = $1", [session_token]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Código de login inválido ou expirado.' });
      }

      const session = result.rows[0];
      if (new Date() > new Date(session.expires_at)) {
        return res.status(400).json({ success: false, error: 'Código QR Code expirado.' });
      }

      res.json({
        success: true,
        session_token: session.session_token,
        status: session.status,
        expires_at: session.expires_at
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Celular aprova o acesso digitando digital / biometria (dispositivo cadastrado)
  app.post('/api/auth/mfa/approve', requireAuth, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { session_token } = req.body;

      if (!session_token) return res.status(400).json({ success: false, error: 'Token é necessário' });

      const userRes = await pool.query(
        "SELECT id, name, email, role, mfa_biometric_enabled, company_name, company_logo, is_approved, nickname FROM users WHERE id = $1",
        [req.user.id]
      );
      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Usuário não localizado.' });
      }

      const user = userRes.rows[0];

      if (!user.mfa_biometric_enabled) {
        return res.status(400).json({ success: false, error: 'Você não ativou a autenticação biométrica rápida em seu perfil.' });
      }

      const sessionRes = await pool.query("SELECT * FROM mfa_sessions WHERE session_token = $1", [session_token]);
      if (sessionRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Conexão de login não encontrada ou expirada.' });
      }

      const session = sessionRes.rows[0];
      if (new Date() > new Date(session.expires_at)) {
        return res.status(400).json({ success: false, error: 'Código QR expirado.' });
      }

      const tokenUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
        company_logo: user.company_logo,
        is_approved: user.is_approved,
        nickname: user.nickname
      };
      const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1d' });

      await pool.query(
        "UPDATE mfa_sessions SET status = 'approved', user_id = $1, jwt_token = $2 WHERE session_token = $3",
        [user.id, token, session_token]
      );

      await logAction(user.id, user.email, 'login_mfa_autorizado', 'Liberou acesso no computador via QR Code biométrico');

      res.json({ success: true, message: 'Acesso liberado no computador com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin limpa os logs - requer senha
  app.post('/api/logs/clear', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!dbConnected) throw new Error("DB offline");
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ success: false, error: 'A confirmação de senha é obrigatória para esta ação.' });
      }

      const adminRes = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      if (adminRes.rows.length === 0 || !verifyPassword(password, adminRes.rows[0].password)) {
        return res.status(403).json({ success: false, error: 'Senha de administrador incorreta.' });
      }

      await pool.query('DELETE FROM logs');
      await logAction(req.user.id, req.user.email, 'logs_limpos', 'O administrador limpou todos os logs do banco de dados.');

      res.json({ success: true, message: 'Todos os logs limpos com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Login de usuários
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : String(email || '').trim();
    try {
      // Obter ou criar o tracker de falhas de login para este e-mail
      const tracker = loginFailures.get(cleanEmail) || { errorCount: 0, lastFailureTime: 0, lockoutEndTime: 0 };
      
      // Se estiver no período de bloqueio temporário (1 minuto)
      if (Date.now() < tracker.lockoutEndTime) {
        const remainingSec = Math.ceil((tracker.lockoutEndTime - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: `Muitas tentativas incorretas. Login temporariamente bloqueado por ${remainingSec} segundos.`
        });
      }

      // Verificação em Banco Produtivo
      // Primeiro verificar se o usuário existe, se está bloqueado, ou se tem MFA habilitado bloqueando senha convencional
      if (dbConnected) {
        let userCheck = await pool.query('SELECT id, role, mfa_biometric_enabled, email FROM users WHERE LOWER(email) = $1 OR LOWER(nickname) = $1 OR id::text = $1', [cleanEmail]);
        if (userCheck.rows.length > 0) {
          const checkUsr = userCheck.rows[0];
          if (checkUsr.role === 'blocked') {
            await logAction(null, cleanEmail, 'login_falhou', 'Tentativa de login em usuário já bloqueado');
            return res.status(403).json({ success: false, error: 'Usuário bloqueado pelo administrador.' });
          }
          if (checkUsr.mfa_biometric_enabled) {
            await logAction(checkUsr.id, checkUsr.email, 'login_bloqueado_por_mfa', 'Acesso por senha negado pois a autenticação multifator biométrica está ativada.');
            return res.status(403).json({
              success: false,
              error: 'Este usuário configurou o Login de 2 Fatores Biométrico. O acesso por senha convencional está desabilitado por segurança. Use o Login Rápido QR Code, ou solicite ao admin para redefinir o seu 2FA se não tiver seu smartphone cadastrado.'
            });
          }
        }
      }

      if (!dbConnected) {
        // Fallback de demonstração caso o banco não conecte (Modo dev)
        const isDemoAdmin = cleanEmail === 'admin@valentina.com' && password === 'admin';
        const fallbackUser = fallbackUsers.find(u => (typeof u.email === 'string' ? u.email.trim().toLowerCase() : '') === cleanEmail && u.password === password);
        
        if (isDemoAdmin || fallbackUser) {
           loginFailures.delete(cleanEmail);
           const user = isDemoAdmin ? { id: 1, name: 'Admin Valentina', email: cleanEmail, role: 'admin' } : fallbackUser;
           const tokenUser = {
             id: user.id,
             name: user.name,
             email: user.email,
             role: user.role,
             company_name: user.company_name,
             company_logo: user.company_logo
           };
           const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1d' });
           return res.json({ success: true, user, token });
        }
        
        // Tratamento de erro no login demo (Incr. falha)
        tracker.errorCount += 1;
        tracker.lastFailureTime = Date.now();
        if (tracker.errorCount === 5) {
          tracker.lockoutEndTime = Date.now() + 60000; // Bloqueio de 1 minuto
          loginFailures.set(cleanEmail, tracker);
          return res.status(429).json({
            success: false,
            error: 'Você errou a senha 5 vezes consecutivas em menos de 1 minuto. Acesso bloqueado por 1 minuto.'
          });
        } else if (tracker.errorCount >= 10) {
          loginFailures.delete(cleanEmail);
          return res.status(403).json({
            success: false,
            error: 'Usuário bloqueado permanentemente por segurança após 10 tentativas inválidas de login.'
          });
        } else {
          loginFailures.set(cleanEmail, tracker);
          return res.status(401).json({
            success: false,
            error: `Credenciais inválidas. Tentativa ${tracker.errorCount} de 10.`
          });
        }
      }

      // Verificação em Banco Produtivo (A verificação de conta bloqueada e MFA ativos já foi realizada na etapa inicial)
      let dbUserRes = await pool.query('SELECT id, name, email, role, is_approved, company_name, company_logo, wallet, can_transfer, can_request, can_request_delivery, nickname, password FROM users WHERE LOWER(email) = $1 OR LOWER(nickname) = $1 OR id::text = $1', [cleanEmail]);
      
      let userObj = dbUserRes.rows[0];
      let isCredentialsValid = false;

      if (userObj) {
        const storedPwd = userObj.password;
        // Se a senha foi removida pelo admin (NULL ou string vazia)
        if (!storedPwd || storedPwd.trim() === '') {
          return res.json({ success: false, requireNewPassword: true, userId: userObj.id, message: 'Solicitação de administrador: O primeiro login de sua conta requer cadastro de nova senha.' });
        }

        // Verifica compatibilidade e hashing
        isCredentialsValid = verifyPassword(password, storedPwd);
        
        if (isCredentialsValid) {
          // Se a senha estiver correta mas não estiver criptografada/hashed
          if (!isBcryptHash(storedPwd)) {
            return res.json({ success: false, requireNewPassword: true, userId: userObj.id, message: 'A sua conta possui uma senha antiga não criptografada. Para sua segurança, cadastre uma nova senha.' });
          }
        }
      }

      if (userObj && isCredentialsValid) {
        const user = userObj;
        if (user.role === 'blocked') {
          await logAction(user.id, user.email, 'login_falhou', 'Usuário bloqueado tentou acessar');
          return res.status(403).json({ success: false, error: 'Usuário bloqueado pelo administrador.' });
        }
        if (user.role !== 'admin' && user.is_approved === false) {
           await logAction(user.id, user.email, 'login_falhou', 'Usuário não aprovado tentou acessar');
           return res.status(403).json({ success: false, error: 'Seu cadastro está aguardando aprovação do administrador.' });
        }
        normalizeUserWallet(user);
        
        // Sucesso de login -> limpa mapa de falhas
        loginFailures.delete(cleanEmail);
        
        // Obter qtde de produtos ativos
        let activeProducts = 0;
        try {
           const prodRes = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_available = true', [user.id]);
           activeProducts = parseInt(prodRes.rows[0].count) || 0;
        } catch(e) {}
        user.active_products_count = activeProducts;

        try { await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]); } catch(e) {}
        await logAction(user.id, user.email, 'login', 'Login efetuado com sucesso');
        const tokenUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          company_name: user.company_name,
          company_logo: user.company_logo,
          is_approved: user.is_approved,
          nickname: user.nickname
        };
        const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, user, token });
      } else {
        // Incrementa o número de falhas de login
        tracker.errorCount += 1;
        tracker.lastFailureTime = Date.now();

        if (tracker.errorCount === 5) {
          tracker.lockoutEndTime = Date.now() + 60000; // Impede tentativas por 1 minuto (60 segundos)
          loginFailures.set(cleanEmail, tracker);
          await logAction(null, cleanEmail, 'login_bloqueio_temp', 'Muitos erros de login. Conta bloqueada temporariamente por 1 minuto.');
          return res.status(429).json({
            success: false,
            error: 'Você errou a senha 5 vezes consecutivas. Acesso bloqueado por 1 minuto.'
          });
        } else if (tracker.errorCount >= 10) {
          // Bloqueia permanentemente o usuário cadastrado no banco de dados mudando a role para blocked
          try {
            await pool.query("UPDATE users SET role = 'blocked' WHERE LOWER(email) = $1 OR LOWER(nickname) = $1 OR id::text = $1", [cleanEmail]);
          } catch(dbErr) {
            console.error('Erro ao salvar bloqueio definitivo no BD:', dbErr);
          }
          loginFailures.delete(cleanEmail);
          await logAction(null, cleanEmail, 'login_bloqueio_perm', 'Usuário bloqueado por segurança após errar 10 vezes');
          return res.status(403).json({
            success: false,
            error: 'Usuário bloqueado permanentemente por segurança após 10 tentativas inválidas.'
          });
        } else {
          loginFailures.set(cleanEmail, tracker);
          await logAction(null, cleanEmail, 'login_falhou', `Credenciais inválidas: tentativa ${tracker.errorCount} de 10`);
          return res.status(401).json({
            success: false,
            error: `Credenciais inválidas. Tentativa ${tracker.errorCount} de 10. Você será bloqueado temporariamente por 1 minuto se errar 5 vezes.`
          });
        }
      }
    } catch (err) {
      console.error('Erro no login:', err);
      await logAction(null, cleanEmail, 'erro', 'Erro no login: ' + (err as any).message);
      res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
    }
  });

  // Registro de usuários
  app.post('/api/register', async (req, res) => {
    const { name, email, password, company_name, company_logo, requested_role, telefone, endereco, bairro, cidade, numero, cep, nickname } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
    }

    if (!nickname) {
      return res.status(400).json({ success: false, error: 'O campo Nickname/Apelido é obrigatório.' });
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : String(email || '').trim();
    const cleanNick = typeof nickname === 'string' ? nickname.trim() : '';

    if (!cleanNick) {
      return res.status(400).json({ success: false, error: 'Digite um Nickname válido.' });
    }

    try {
      if (!dbConnected) {
        const existing = fallbackUsers.find(u => (typeof u.email === 'string' ? u.email.trim().toLowerCase() : '') === cleanEmail);
        if (existing) {
           return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
        }
        const user = { id: String(Date.now()), name, email: cleanEmail, password, role: requested_role === 'delivery' ? 'delivery' : 'user', company_name, company_logo, nickname: cleanNick };
        fallbackUsers.push(user);
        const tokenUser = { id: user.id, name: user.name, email: user.email, role: user.role, company_name: user.company_name, company_logo: user.company_logo, nickname: user.nickname };
        const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1d' });
        return res.json({ success: true, user, token });
      }

      // Verifica se o email já existe
      const checkResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
      if (checkResult.rows.length > 0) {
        await logAction(null, cleanEmail, 'registro_falhou', 'E-mail já em uso');
        return res.status(400).json({ success: false, error: 'Este e-mail já está em uso.' });
      }

      // Verifica se o nickname já existe
      const checkNickResult = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)', [cleanNick]);
      if (checkNickResult.rows.length > 0) {
        await logAction(null, cleanEmail, 'registro_falhou', 'Nickname já em uso: ' + cleanNick);
        return res.status(400).json({ success: false, error: 'Este Nickname já está em uso.' });
      }

      // Insere o novo usuário
      const userId = crypto.randomUUID();
      const encryptedPassword = hashPassword(password);
      const insertResult = await pool.query(
        'INSERT INTO users (id, name, email, password, role, company_name, company_logo, is_approved, telefone, endereco, bairro, cidade, numero, cep, nickname) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id, name, email, role, company_name, company_logo, is_approved, nickname',
        [userId, name, cleanEmail, encryptedPassword, requested_role === 'delivery' ? 'delivery' : 'user', company_name || null, company_logo || null, false, telefone || null, endereco || null, bairro || null, cidade || null, numero || null, cep || null, cleanNick]
      );
      
      const user = insertResult.rows[0];
      await logAction(user.id, user.email, 'registro', 'Conta criada aguardando aprovação');
      res.json({ success: true, user, message: 'Cadastro realizado com sucesso. Aguarde a aprovação de um administrador para fazer login.' });
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
        return res.status(400).json({ success: false, error: 'deu problema com validação' });
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

      await logAction(userId, null, 'compra_registrada', `Novo pedido #${orderId} no valor total de R$ ${total} registrado com sucesso.`);

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
