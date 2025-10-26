require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');



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
/* ====== 検定API（発行〜開始〜提出） ====== */


// exam_issues にあるトークンが期限内か軽くチェック
async function ensureTokenValid(pool, token) {
  const { rows } = await pool.query(
    `SELECT status, expires_at, started_at
       FROM exam_issues WHERE token=$1`,
    [token]
  );
  if (!rows.length) return { ok:false, code:404, err:'invalid token' };
  const r = rows[0];
  if (new Date(r.expires_at) < new Date()) return { ok:false, code:410, err:'expired' };
  return { ok:true, meta:r };
}

/* ====== 問題ファイル読み込み（exam-questions.json｜sections/variants対応） ====== */
/* ====== 問題ファイル読み込み（exam-questions.json｜sections/variants対応） ====== */
const QUESTIONS_PATH = path.join(__dirname, 'exam-questions.json');
let QUESTIONS_PAPER = { title: '検定', shuffle: false, questions: [] };

// ★ 追加保持：サーバ側で variant を選ぶために原本を持っておく
let QUESTIONS_SECTIONS = null;  // data.sections をそのまま保持
let QUESTIONS_META = {};        // data.meta を保持（intro/description の取得に使う）

(function loadQuestions() {
  try {
    if (!fs.existsSync(QUESTIONS_PATH)) {
      console.warn(`⚠️  Not found: ${QUESTIONS_PATH}`);
      return;
    }
    const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
    const data = JSON.parse(raw);

    // ★ 原本を保持
    QUESTIONS_META = data?.meta || {};
    QUESTIONS_SECTIONS = Array.isArray(data?.sections) ? data.sections : null;

    let questions = [];
    let title = (QUESTIONS_META?.title) || data?.title || '検定';

    if (Array.isArray(QUESTIONS_SECTIONS)) {
      // 互換目的：従来どおり「variants の先頭だけ」を使ってフラット化（サーバ内保持用）
      QUESTIONS_SECTIONS.forEach((sec, si) => {
        const variants = Array.isArray(sec?.variants) ? sec.variants : [];
        const v = variants[0] || null;
        if (!v || !Array.isArray(v.problems)) return;

        const secTitle = sec?.title || `第${si + 1}大問`;
        const varTitle = v?.title || '';
        const varPoints = (typeof v?.points === 'number') ? `（配点 ${v.points}点）` : '';

        // セクション見出し（フロントでは特別扱い）
        questions.push({
          id: `H-${sec?.id || (si + 1)}`,
          type: 'heading',
          stem: `${secTitle} ${varTitle ? `：${varTitle}` : ''} ${varPoints}`.trim()
        });

        // 設問（サーバ内採点用に answerIndex は保持してOK。クライアントへ返すときに隠す）
        v.problems.forEach((p, pi) => {
          questions.push({
            id: p.qid || p.id || `q${si + 1}-${pi + 1}`,
            type: p.type === 'mcq' ? 'single' : (p.type || 'single'),
            stem: p.body || p.stem || p.question || '',
            choices: Array.isArray(p.choices) ? p.choices : (p.options || []),
            points: (typeof p.points === 'number' ? p.points : 1),
            answerIndex: (typeof p.answerIndex === 'number') ? p.answerIndex : undefined
          });
        });
      });
    } else if (Array.isArray(data?.questions)) {
      // 予備: もともとの questions 配列構造にも対応（見出しは無し）
      questions = data.questions.map((q, i) => ({
        id: q.id || `q${i + 1}`,
        type: q.type === 'mcq' ? 'single' : (q.type || 'single'),
        stem: q.stem || q.question || '',
        choices: Array.isArray(q.choices) ? q.choices : (q.options || []),
        points: (typeof q.points === 'number' ? q.points : 1),
        answerIndex: (typeof q.answerIndex === 'number') ? q.answerIndex : undefined
      }));
      title = data.title || title;
    } else if (Array.isArray(data)) {
      // 予備: ルートが配列（見出しは無し）
      questions = data.map((q, i) => ({
        id: q.id || `q${i + 1}`,
        type: q.type === 'mcq' ? 'single' : (q.type || 'single'),
        stem: q.stem || q.question || q.body || '',
        choices: Array.isArray(q.choices) ? q.choices : (q.options || []),
        points: (typeof q.points === 'number' ? q.points : 1),
        answerIndex: (typeof q.answerIndex === 'number') ? q.answerIndex : undefined
      }));
    }

    // サーバ内の“既定紙面”（フラット化）として保持
    QUESTIONS_PAPER.title = title;
    QUESTIONS_PAPER.shuffle = false; // 必要なら true
    QUESTIONS_PAPER.questions = questions;

    console.log(`✅ Loaded ${questions.length} questions from exam-questions.json`);
    console.log(`ℹ️ sections kept:`, QUESTIONS_SECTIONS ? QUESTIONS_SECTIONS.length : 0);
    console.log(`ℹ️ meta keys:`, Object.keys(QUESTIONS_META || {}));
  } catch (e) {
    console.error('❌ Failed to load exam-questions.json:', e.message);
  }
})();


// ====== セクション + 選択variant からフラットな設問配列を生成 ======
// sections: exam-questions.json の sections 配列（QUESTIONS_SECTIONS）
// chosen:   { [sec.id]: 'A' | 'B' | ... } のマップ（exam_issues.chosen_variants）
// includeAnswers: true のときは answerIndex を含める（サーバ内採点用）
// 戻り値: [{ id, type, stem, choices, points, (answerIndex?) }, ...]
function buildQuestionsByChosenVariants(sections, chosen, includeAnswers = false) {
  const out = [];
  if (!Array.isArray(sections)) return out;

  sections.forEach((sec, si) => {
    const variants = Array.isArray(sec?.variants) ? sec.variants : [];
    if (variants.length === 0) return;

    // このセクションで使う variant を決定（chosen に無ければ先頭）
    const chosenKey = chosen && sec && sec.id ? chosen[sec.id] : null;
    let v = variants.find(x => x && x.key === chosenKey);
    if (!v) v = variants[0];
    if (!v || !Array.isArray(v.problems)) return;

    const secTitle = sec?.title || `第${si + 1}大問`;

    // variant.title に既に「（配点 xx点）」が入っていることがあるので除去する
    const rawVarTitle = v?.title || '';
    const titleWithoutPoints = rawVarTitle.replace(/（\s*配点[^）]*）/g, '').trim();

    // points から配点表示を1回だけ付ける
    const varPoints = (typeof v?.points === 'number') ? `（配点 ${v.points}点）` : '';

    // 見出し（type: 'heading'）
    // 例）「第6大問：実践応用問題（その1） ：相性鑑定（配点 20点）」
    const headingStem = `${secTitle}${titleWithoutPoints ? ` ：${titleWithoutPoints}` : ''} ${varPoints}`.trim();
    out.push({
      id: `H-${sec?.id || (si + 1)}`,
      type: 'heading',
      stem: headingStem.replace(/\s+/g, ' ') // 余分なスペースを1つに
    });

    // ← ここで variant.intro があれば、“そのセクションの冒頭”に情報カードとして挿入
    if (typeof v?.intro === 'string' && v.intro.trim()) {
      out.push({
        id: `I-${sec?.id || (si + 1)}-${v?.key || 'X'}`,
        type: 'intro',
        stem: v.intro
      });
    }

    // 設問を展開
    v.problems.forEach((p, pi) => {
      const item = {
        id: p.qid || p.id || `q${si + 1}-${pi + 1}`,
        type: p.type === 'mcq' ? 'single' : (p.type || 'single'),
        stem: p.body || p.stem || p.question || '',
        choices: Array.isArray(p.choices) ? p.choices : (p.options || []),
        points: (typeof p.points === 'number') ? p.points : 1
      };
      if (includeAnswers && typeof p.answerIndex === 'number') {
        item.answerIndex = Number(p.answerIndex);
      }
      out.push(item);
    });
  });

  return out;
}


// 環境変数
const ADMIN_KEY = process.env.ADMIN_KEY;
const EXAM_DURATION_MIN = Number(process.env.EXAM_DURATION_MIN || '60');
const EXAM_DURATION_SEC = EXAM_DURATION_MIN * 60;

// 安全なトークン生成
const makeToken = () => crypto.randomBytes(24).toString('base64url'); // URLに入れやすい

// 共通ヘルパ
const nowUtc = () => new Date().toISOString();

// ====== 採点ヘルパ ======
function buildAnswerKey(paper) {
  const key = new Map(); // id -> {answerIndex, points}
  for (const q of paper.questions || []) {
    if (q.type === 'heading') continue;
    if (typeof q.answerIndex === 'number') {
      key.set(q.id, { answerIndex: q.answerIndex, points: Number(q.points) || 0 });
    }
  }
  return key;
}
const ANSWER_KEY = buildAnswerKey(QUESTIONS_PAPER);

// 合否判定（PASS_SCORE 優先、なければ PASS_RATE）
function decidePass(score, totalPoints) {
  const passScore = process.env.PASS_SCORE ? Number(process.env.PASS_SCORE) : null;
  const passRate  = process.env.PASS_RATE  ? Number(process.env.PASS_RATE)  : 0.7; // デフォ70%
  if (passScore != null && !Number.isNaN(passScore)) {
    return score >= passScore;
  }
  return score >= Math.ceil(totalPoints * passRate);
}




/**
 * 管理者：受験URLの発行
 * POST /admin/issue
 * headers: x-admin-key: <ADMIN_KEY>
 * body: { email: string, hours: number, level?: string }
 */
app.post('/admin/issue', async (req, res) => {
  try {
    if (!ADMIN_KEY || req.header('x-admin-key') !== ADMIN_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { email, hours, level } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!hours || typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: 'hours must be positive number' });
    }

    const token = makeToken();
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO exam_issues (email, token, level, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, expires_at`,
      [email.trim(), token, level || null, expiresAt]
    );

    //const issue = rows[0];
    // ここが受験URL（後でメールで送る）
    //const url = `${req.protocol}://${req.get('host')}/exam/${issue.token}`;

    const issue = rows[0];
    // 本番は環境変数のベースURLを優先、なければアクセス元で組み立て（ローカル動作も担保）
    const base =
    process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim().length > 0
      ? process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')   // 末尾スラッシュ除去
      : `${req.protocol}://${req.get('host')}`;
    const url = `${base}/exam/${issue.token}`;

    return res.json({
      ok: true,
      url,
      token: issue.token,
      expires_at: issue.expires_at
    });
  } catch (err) {
    console.error('issue error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

/**
 * 受験ページ用メタ情報
 * GET /exam/:token/meta
 * 返り値: { ok, status, remainingSec, durationSec, startedAt, expiresAt, serverNow, invalidated }
 */
app.get('/exam/:token/meta', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT id, status, expires_at, started_at, submitted_at, invalidated_at, invalid_reason
         FROM exam_issues WHERE token = $1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'invalid token' });

    const row = rows[0];

    // 有効期限切れなら expired にする（DBへ反映）
    if (new Date(row.expires_at).getTime() < Date.now() &&
        row.status !== 'submitted' && row.status !== 'expired') {
      await pool.query(`UPDATE exam_issues SET status='expired' WHERE id=$1`, [row.id]);
      row.status = 'expired';
    }

    let remainingSec = null;
    if (row.status === 'started' && row.started_at) {
      const elapsed = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000);
      remainingSec = Math.max(0, EXAM_DURATION_SEC - elapsed);
    }

    return res.json({
      ok: true,
      status: row.status,               // issued|started|submitted|expired
      durationSec: EXAM_DURATION_SEC,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      remainingSec,
      serverNow: new Date().toISOString(), // ← フロントの時計補正用
      invalidated: !!row.invalidated_at,   // ← 無効化されているか
      invalidReason: row.invalid_reason || null
    });
  } catch (err) {
    console.error('meta error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});


/**
 * 離脱ログ保存（フロントからの1セグメント）
 * POST /exam/:token/away
 * body: { startedAt: ISO, endedAt: ISO, durationMs?: number, reason?: string }
 * 返却: { ok:true, invalidated:boolean }
 */
app.post('/exam/:token/away', express.json({ limit: '50kb' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { token } = req.params;
    const { startedAt, endedAt, durationMs, reason } = req.body || {};

    // 受験IDを取得
    const { rows } = await client.query(
      `SELECT id, invalidated_at FROM exam_issues WHERE token=$1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'invalid token' });
    const issueId = rows[0].id;

    const s = new Date(startedAt);
    const e = new Date(endedAt);
    if (!startedAt || !endedAt || isNaN(s) || isNaN(e) || e <= s) {
      return res.status(400).json({ error: 'invalid times' });
    }
    const dur = Math.max(0, Number.isFinite(durationMs) ? Number(durationMs) : (e - s));

    await client.query('BEGIN');

    // 保存
    await client.query(
      `INSERT INTO exam_away_logs (issue_id, started_at, ended_at, duration_ms, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [issueId, s.toISOString(), e.toISOString(), dur, (reason || null)]
    );

    // 無効化ルール：
    // 「2回目以降の離脱」で「その直前の離脱時間が 120秒以上」だったら invalidated にする
    const { rows: awayRows } = await client.query(
      `SELECT id, duration_ms
         FROM exam_away_logs
         WHERE issue_id=$1
         ORDER BY id ASC`,
      [issueId]
    );
    const count = awayRows.length;
    let invalidated = false;

    if (count >= 2) {
      const last = awayRows[awayRows.length - 1];
      if (Number(last.duration_ms) >= 120000) {
        invalidated = true;
        await client.query(
          `UPDATE exam_issues
             SET invalidated_at = NOW(),
                 invalid_reason = 'away>=120s on second_or_later'
           WHERE id=$1 AND invalidated_at IS NULL`,
          [issueId]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ ok: true, invalidated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('away save error:', err);
    return res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});


/**
 * 開始ボタン押下：ここで「使い切り」にする
 * POST /exam/:token/start
 * 返り値例: { ok:true, startedAt, durationSec }
 */
app.post('/exam/:token/start', async (req, res) => {
  const client = await pool.connect();
  try {
    const { token } = req.params;

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status, expires_at FROM exam_issues WHERE token=$1 FOR UPDATE`,
      [token]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invalid token' });
    }
    const row = rows[0];

    // 期限チェック
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await client.query(`UPDATE exam_issues SET status='expired' WHERE id=$1`, [row.id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'expired' });
    }

    // 既に開始/提出済みは不可
    if (row.status === 'started' || row.status === 'submitted') {
      await client.query('COMMIT');
      return res.status(409).json({ error: 'already started or submitted' });
    }

    const startedAt = new Date();
    await client.query(
      `UPDATE exam_issues SET status='started', started_at=$2 WHERE id=$1`,
      [row.id, startedAt]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, startedAt, durationSec: EXAM_DURATION_SEC });
  } catch (err) {
    // ← ここを client に修正
    await client.query('ROLLBACK');
    console.error('start error:', err);
    return res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

/**
 * 問題配信（本番ファイル版）
 * GET /exam/:token/questions
 */
// 問題配信（本番ファイル版）
app.get('/exam/:token/questions', async (req, res) => {
  try {
    const v = await ensureTokenValid(pool, req.params.token);
    if (!v.ok) return res.status(v.code).json({ error: v.err });

    // セクション構造がある前提（なければ従来のフラットをそのまま返す）
    if (!Array.isArray(QUESTIONS_SECTIONS) || QUESTIONS_SECTIONS.length === 0) {
      // フォールバック（従来のフラット）
      return res.json({
        ok: true,
        data: {
          title: QUESTIONS_PAPER.title,
          durationSec: EXAM_DURATION_SEC,
          shuffle: false,
          questions: QUESTIONS_PAPER.questions.map(q => {
            const { answerIndex, ...safe } = q;
            return safe;
          })
        }
      });
    }

    // 既に選択済みか確認
    const { rows } = await pool.query(
      `SELECT id, chosen_variants FROM exam_issues WHERE token=$1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'invalid token' });
    const issue = rows[0];
    let chosen = rows[0].chosen_variants || null;

    // 未選択ならランダムに決めて保存（A/B/C... の key を選ぶ）
    if (!chosen) {
      const map = {};
      for (const sec of QUESTIONS_SECTIONS) {
        const keys = (sec?.variants || []).map(v => v.key).filter(Boolean);
        if (keys.length === 0) continue;
        const rnd = Math.floor(Math.random() * keys.length);
        map[sec.id] = keys[rnd];
      }
      chosen = map;
      await pool.query(
        `UPDATE exam_issues SET chosen_variants=$2 WHERE id=$1`,
        [issue.id, JSON.stringify(chosen)]
      );
    }

    // intro を1件差し込む（meta.description or meta.intro）
    const introText = QUESTIONS_META?.description || QUESTIONS_META?.intro || null;

    // chosen に基づいて問題配列を生成（サーバ内採点用には answerIndex 付きも作れる）
    const questionsFull = buildQuestionsByChosenVariants(QUESTIONS_SECTIONS, chosen, /*includeAnswers*/ true);

    // クライアントへは answerIndex を外す
    const safeQuestionsCore = questionsFull.map(q => {
      const { answerIndex, ...safe } = q;
      return safe;
    });

    const safeQuestions = introText
      ? [{ id: 'intro', type: 'intro', stem: introText }, ...safeQuestionsCore]
      : safeQuestionsCore;

    return res.json({
      ok: true,
      data: {
        title: QUESTIONS_PAPER.title || '検定',
        durationSec: EXAM_DURATION_SEC,
        shuffle: false,
        questions: safeQuestions
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



/**
 * 回答送信（本採点版）
 * POST /exam/:token/submit
 * body: { answers: [{id, value}, ...] }
 */
app.post('/exam/:token/submit', express.json({ limit: '200kb' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { token } = req.params;
    const { answers } = req.body || {};
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    await client.query('BEGIN');

    // 受験票のロック＆チェック
    const { rows } = await client.query(
      `SELECT id, status, started_at, invalidated_at
         FROM exam_issues WHERE token=$1 FOR UPDATE`,
      [token]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invalid token' });
    }
    const issue = rows[0];

    // 無効化/提出済み/未開始チェック
    if (issue.invalidated_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalidated' });
    }
    if (issue.status === 'submitted') {
      await client.query('COMMIT');
      return res.status(409).json({ error: 'already submitted' });
    }
    if (issue.status !== 'started' || !issue.started_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'not started' });
    }

    // 時間切れチェック
    const elapsedSec = Math.floor((Date.now() - new Date(issue.started_at).getTime()) / 1000);
    if (elapsedSec > EXAM_DURATION_SEC) {
      await client.query(`UPDATE exam_issues SET status='expired' WHERE id=$1`, [issue.id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'time over' });
    }

    // ====== 本採点：chosen_variants に合わせて都度キーを構築 ======
    // 受験票から chosen_variants を取得
    const { rows: chosenRows } = await client.query(
      `SELECT chosen_variants FROM exam_issues WHERE id=$1`,
      [issue.id]
    );
    const chosen = chosenRows[0]?.chosen_variants || null;

    // chosen があればそれに基づく紙面を、無ければ従来フラット紙面を使う
    let questionsForScoring = [];
    if (chosen && Array.isArray(QUESTIONS_SECTIONS) && QUESTIONS_SECTIONS.length > 0) {
      // includeAnswers=true で answerIndex を含めて生成
      questionsForScoring = buildQuestionsByChosenVariants(
        QUESTIONS_SECTIONS,
        chosen,
        /* includeAnswers */ true
      );
    } else {
      // フォールバック：既定紙面（最初の variant）
      questionsForScoring = (QUESTIONS_PAPER?.questions || []);
    }

    // heading など採点対象外を除き、id -> { answerIndex, points } を作成
    const answerKey = new Map();
    let totalPoints = 0;
    for (const q of questionsForScoring) {
      if (q?.type === 'heading' || typeof q?.answerIndex !== 'number') continue;
      const pts = Number(q.points) || 0;
      answerKey.set(q.id, { answerIndex: Number(q.answerIndex), points: pts });
      totalPoints += pts;
    }

    // 受信した解答を採点
    let score = 0;
    for (const a of (answers || [])) {
      const meta = answerKey.get(a.id);
      if (!meta) continue; // この受験で出題されていないIDは無視
      if (Number(a.value) === meta.answerIndex) {
        score += meta.points;
      }
    }

    const passed = decidePass(score, totalPoints);


    // 回答保存
    const { rows: aRows } = await client.query(
      `INSERT INTO exam_attempts (issue_id, answers_json, score, duration_sec)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [issue.id, JSON.stringify(answers), score, elapsedSec]
    );

    // 受験票を提出済みに
    const submittedAt = new Date();
    await client.query(
      `UPDATE exam_issues SET status='submitted', submitted_at=$2 WHERE id=$1`,
      [issue.id, submittedAt]
    );

    await client.query('COMMIT');
    return res.json({
      ok: true,
      attemptId: aRows[0].id,
      submittedAt,
      elapsedSec,
      score,
      passed
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('submit error:', err);
    return res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});




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

// 受験ページ（/exam/:token を exam.html にルーティング）
app.get(['/exam/:token', '/exam/:token/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

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
