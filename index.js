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
app.disable('x-powered-by');     // 余計なヘッダを隠す
app.enable('trust proxy');       // Render/プロキシ下でHTTPS検知・クライアントIP取得
app.use(express.json({ limit: '20kb' })); // 不要な大きいPOSTを避ける
app.use(compression());

// アクセスログ
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ====== セキュリティヘッダー ====== */
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
          "'unsafe-inline'",          // 一部のUIで必要になることがある
          "https://cdn.jsdelivr.net", // Bootstrap CSS
        ],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "https://cdn.jsdelivr.net"],
        "connect-src": ["'self'"],    // 同一オリジンのAPIのみ
        "frame-ancestors": ["'none'"]
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
// 参考: 参照ポリシー（任意だが付けると安心）
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));

/* ====== HTTP→HTTPS リダイレクト（ローカル除外） ====== */
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
  user: process.env.DB_USER,      // Supabase pooler: app_user.<projectref> 形式
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,  // 通常 postgres
  ssl: { rejectUnauthorized: false },
});

// 起動時に接続確認
pool.query('SELECT 1')
  .then(() => console.log('✅ DB connected'))
  .catch(err => console.error('❌ DB connect failed:', err));

/* ====== 静的ファイル ====== */
// HTMLは no-store、JS/CSS/画像は長期キャッシュ
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

/* ====== レート制限（/subscribe向け） ====== */
const subscribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10分
  max: 30,                   // 10分に30回まで
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
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'duplicate email' });
    }
    console.error('subscribe error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ★必要なら管理用の一覧エンドポイント（本番はコメントアウトや保護推奨）
// app.get('/subscribers', async (_req, res) => {
//   try {
//     const { rows } = await pool.query(
//       'SELECT id, email, created_at FROM subscribers ORDER BY id DESC LIMIT 500'
//     );
//     res.json(rows);
//   } catch (err) {
//     console.error('list error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

/* ====== 404 / エラーハンドリング ====== */
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 未処理エラーも捕捉
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Closing server...`);
  pool.end().catch(() => {}).finally(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* ====== 起動 ====== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log('DB to:', process.env.DB_HOST, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER);
});
