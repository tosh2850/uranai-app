require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();

/* ====== 基本設定 ====== */
// Render/プロキシ下でHTTPS検知・X-Forwarded-*を信頼
app.enable('trust proxy');

// JSONボディは小さめに（不要な重いPOST対策）
app.use(express.json({ limit: '20kb' }));

// 圧縮
app.use(compression());

// アクセスログ（本番は combined 推奨）
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ====== セキュリティヘッダー ====== */
// Bootstrap CDN / jsDelivr を使う前提のCSP
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "https://cdn.jsdelivr.net", // Bootstrap JS
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'", // Bootstrapはインラインstyleを使うケースあり
          "https://cdn.jsdelivr.net", // Bootstrap CSS
        ],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "https://cdn.jsdelivr.net"],
        "connect-src": ["'self'"], // APIは同一オリジンに限定
        "frame-ancestors": ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // 必要に応じて
  })
);

// HTTP → HTTPS リダイレクト（ローカルは除外）
app.use((req, res, next) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (!isLocal && req.protocol !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  }
  next();
});

/* ====== PostgreSQL接続 ====== */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,     // Supabase Pooler: app_user.<projectref> 形式 or postgres.<projectref>
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, // 通常 postgres
  ssl: { rejectUnauthorized: false },
});

// 起動時チェック
pool.query('SELECT 1')
  .then(() => console.log('✅ DB connected'))
  .catch(err => console.error('❌ DB connect failed:', err));

/* ====== 静的ファイル ====== */
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => {
    // 画像・CSS・JSに軽いキャッシュ
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico)$/.test(p)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

/* ====== レート制限（/subscribe向けに絞る） ====== */
const subscribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10分
  max: 30,                   // 10分で30回まで
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

/* ====== 便利エンドポイント ====== */
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.get('/version', (_req, res) => {
  res.json({
    name: 'uranai-app',
    node: process.versions.node,
    env: process.env.NODE_ENV || 'development'
  });
});

/* ====== メール検証ヘルパ ====== */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ====== API ====== */
// メール購読登録
app.post('/subscribe', subscribeLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }
  const trimmed = email.trim();
  if (!emailRegex.test(trimmed) || trimmed.length > 255) {
    return res.status(400).json({ error: 'invalid email' });
  }

  try {
    await pool.query('INSERT INTO subscribers (email) VALUES ($1)', [trimmed]);
    return res.json({ ok: true });
  } catch (err) {
    // 一意制約違反（重複）
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'duplicate email' });
    }
    console.error('subscribe error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// 登録一覧（必要ならベーシック認証等で保護を）
app.get('/subscribers', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, created_at FROM subscribers ORDER BY id DESC LIMIT 500'
    );
    res.json(rows);
  } catch (err) {
    console.error('list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ====== 404 / エラーハンドリング ====== */
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 未処理エラーも捕捉して落ちないように
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

/* ====== 起動 ====== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log('DB to:', process.env.DB_HOST, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER);
});
