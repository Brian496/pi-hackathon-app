import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import pg from 'pg';
import sqlite3 from 'sqlite3';
import { open as openSqlite } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;
const STRICT_VERIFY = String(process.env.PI_STRICT_VERIFY || '').toLowerCase() === 'true';
const ALLOW_INLINE_SCRIPTS = String(process.env.ALLOW_INLINE_SCRIPTS || '').toLowerCase() === 'true';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const { Pool } = pg;
let pool = null; // Postgres pool
let dbEnabled = false; // true if Postgres configured
let sqliteDb = null; // SQLite database handle
try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  dbEnabled = Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE);
} catch {
  dbEnabled = false;
}

// Allow inline scripts for local demo (frontend uses inline <script>). Keep strict by default.
if (ALLOW_INLINE_SCRIPTS) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );
} else {
  app.use(helmet());
}
// Tightened CORS: allow comma-separated list in CORS_ORIGIN, or '*' to allow all
const rawCors = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowAllCors = rawCors.includes('*');
const allowedOrigins = new Set(rawCors);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser or same-origin
      if (allowAllCors || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('CORS blocked'), false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.static(frontendDir));
function adminAuth(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASS) return res.status(503).json({ error: 'Admin auth not configured' });
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) return res.status(401).set('WWW-Authenticate', 'Basic realm="admin"').end();
  const raw = Buffer.from(hdr.slice(6), 'base64').toString('utf8');
  const idx = raw.indexOf(':');
  const user = idx >= 0 ? raw.slice(0, idx) : '';
  const pass = idx >= 0 ? raw.slice(idx + 1) : '';
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) return res.status(401).set('WWW-Authenticate', 'Basic realm="admin"').end();
  return next();
}

// Persistent stores (Postgres) with in-memory fallback
const memSessions = new Map();
const memReceipts = new Map();

async function migrate() {
  if (dbEnabled && pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        idempotency_key TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    return;
  }
  // SQLite fallback
  sqliteDb = await openSqlite({ filename: process.env.SQLITE_PATH || ':memory:', driver: sqlite3.Database });
  await sqliteDb.exec(`CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  await sqliteDb.exec(`CREATE TABLE IF NOT EXISTS receipts (idempotency_key TEXT PRIMARY KEY, payment_id TEXT NOT NULL, amount INTEGER NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// Verify Pi auth token server-side (stub: replace with real Pi API call)
async function verifyPiAuthToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const base = process.env.PI_API_BASE || '';
  const secret = process.env.PI_API_SECRET || '';
  if (base && secret) {
    try {
      const resp = await axios.post(`${base}/auth/verify`, { idToken }, { headers: { 'Authorization': `Bearer ${secret}` }, timeout: 10000 });
      if (resp.status === 200 && resp.data && resp.data.userId) return { userId: resp.data.userId };
    } catch {}
  }
  // Fallback demo behavior
  if (STRICT_VERIFY) {
    return null;
  }
  const userId = crypto.createHash('sha256').update(idToken).digest('hex').slice(0, 16);
  return { userId };
}

// Verify payment with Pi server (stub: replace with real Pi Payments API call)
async function verifyPiPaymentOnServer(paymentId) {
  if (!paymentId) return null;
  const base = process.env.PI_API_BASE || '';
  const secret = process.env.PI_API_SECRET || '';
  if (base && secret) {
    try {
      const resp = await axios.get(`${base}/payments/${encodeURIComponent(paymentId)}`, { headers: { 'Authorization': `Bearer ${secret}` }, timeout: 10000 });
      if (resp.status === 200 && resp.data) return resp.data;
    } catch {}
  }
  // Fallback demo behavior
  if (STRICT_VERIFY) {
    return null;
  }
  return { paymentId, amount: 1, status: 'APPROVED' }; 
}

// HMAC verification for webhooks (example)
function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-signature'] || '';
  const body = JSON.stringify(req.body || {});
  const hmac = crypto.createHmac('sha256', secret || 'dev_secret').update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ''));
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    const verified = await verifyPiAuthToken(idToken);
    if (!verified) return res.status(401).json({ error: 'Invalid token' });
    const sessionId = generateId('sess');
    if (dbEnabled && pool) {
      await pool.query('INSERT INTO sessions(session_id, user_id) VALUES($1, $2) ON CONFLICT (session_id) DO NOTHING', [sessionId, verified.userId]);
    } else if (sqliteDb) {
      await sqliteDb.run('INSERT OR IGNORE INTO sessions(session_id, user_id, created_at) VALUES(?,?,?)', [sessionId, verified.userId, new Date().toISOString()]);
    } else {
      memSessions.set(sessionId, { userId: verified.userId, createdAt: Date.now() });
    }
    return res.json({ sessionId });
  } catch (e) {
    return res.status(500).json({ error: 'Auth error' });
  }
});

app.post('/api/payments/create', async (req, res) => {
  try {
    const { sessionId, amount, idempotencyKey } = req.body || {};
    let userId = null;
    if (dbEnabled && pool) {
      const sess = await pool.query('SELECT user_id FROM sessions WHERE session_id=$1', [sessionId]);
      if (!sess.rowCount) return res.status(401).json({ error: 'Invalid session' });
      userId = sess.rows[0].user_id;
    } else if (sqliteDb) {
      const row = await sqliteDb.get('SELECT user_id FROM sessions WHERE session_id=?', [sessionId]);
      if (!row) return res.status(401).json({ error: 'Invalid session' });
      userId = row.user_id;
    } else {
      const s = memSessions.get(sessionId);
      if (!s) return res.status(401).json({ error: 'Invalid session' });
      userId = s.userId;
    }
    if (!idempotencyKey) return res.status(400).json({ error: 'Missing idempotencyKey' });
    if (dbEnabled && pool) {
      const existing = await pool.query('SELECT * FROM receipts WHERE idempotency_key=$1', [idempotencyKey]);
      if (existing.rowCount) return res.json(existing.rows[0]);
    } else if (sqliteDb) {
      const row = await sqliteDb.get('SELECT * FROM receipts WHERE idempotency_key=?', [idempotencyKey]);
      if (row) return res.json(row);
    } else if (memReceipts.has(idempotencyKey)) {
      return res.json(memReceipts.get(idempotencyKey));
    }

    // Create a payment intent with Pi (stub)
    const paymentId = generateId('pay');
    if (dbEnabled && pool) {
      await pool.query(
        'INSERT INTO receipts(idempotency_key, payment_id, amount, user_id, status) VALUES($1,$2,$3,$4,$5)',
        [idempotencyKey, paymentId, amount, userId, 'CREATED']
      );
      return res.json({ idempotency_key: idempotencyKey, payment_id: paymentId, amount, user_id: userId, status: 'CREATED' });
    } else if (sqliteDb) {
      const now = new Date().toISOString();
      await sqliteDb.run('INSERT OR IGNORE INTO receipts(idempotency_key, payment_id, amount, user_id, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?)', [idempotencyKey, paymentId, amount, userId, 'CREATED', now, now]);
      const row = await sqliteDb.get('SELECT * FROM receipts WHERE idempotency_key=?', [idempotencyKey]);
      return res.json(row);
    } else {
      const rec = { idempotency_key: idempotencyKey, payment_id: paymentId, amount, user_id: userId, status: 'CREATED' };
      memReceipts.set(idempotencyKey, rec);
      return res.json(rec);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Create payment error' });
  }
});

app.post('/api/payments/confirm', async (req, res) => {
  try {
    const { sessionId, paymentId, idempotencyKey } = req.body || {};
    if (dbEnabled && pool) {
      const sess = await pool.query('SELECT user_id FROM sessions WHERE session_id=$1', [sessionId]);
      if (!sess.rowCount) return res.status(401).json({ error: 'Invalid session' });
    } else if (sqliteDb) {
      const row = await sqliteDb.get('SELECT session_id FROM sessions WHERE session_id=?', [sessionId]);
      if (!row) return res.status(401).json({ error: 'Invalid session' });
    } else {
      if (!memSessions.get(sessionId)) return res.status(401).json({ error: 'Invalid session' });
    }
    if (!idempotencyKey) return res.status(400).json({ error: 'Missing idempotencyKey' });
    let current = null;
    if (dbEnabled && pool) {
      const recRes = await pool.query('SELECT * FROM receipts WHERE idempotency_key=$1', [idempotencyKey]);
      if (!recRes.rowCount || recRes.rows[0].payment_id !== paymentId) return res.status(404).json({ error: 'Receipt not found' });
      current = recRes.rows[0];
    } else if (sqliteDb) {
      current = await sqliteDb.get('SELECT * FROM receipts WHERE idempotency_key=?', [idempotencyKey]);
      if (!current || current.payment_id !== paymentId) return res.status(404).json({ error: 'Receipt not found' });
    } else {
      current = memReceipts.get(idempotencyKey);
      if (!current || current.payment_id !== paymentId) return res.status(404).json({ error: 'Receipt not found' });
    }

    // Verify with Pi server (stub)
    const verification = await verifyPiPaymentOnServer(paymentId);
    if (!verification || verification.status !== 'APPROVED') {
      if (dbEnabled && pool) {
        await pool.query('UPDATE receipts SET status=$1, updated_at=NOW() WHERE idempotency_key=$2', ['REJECTED', idempotencyKey]);
      } else if (sqliteDb) {
        await sqliteDb.run('UPDATE receipts SET status=?, updated_at=? WHERE idempotency_key=?', ['REJECTED', new Date().toISOString(), idempotencyKey]);
      } else {
        current.status = 'REJECTED';
        memReceipts.set(idempotencyKey, current);
      }
      return res.status(402).json({ error: 'Payment not approved' });
    }

    if (dbEnabled && pool) {
      await pool.query('UPDATE receipts SET status=$1, updated_at=NOW() WHERE idempotency_key=$2', ['APPROVED', idempotencyKey]);
      const out = await pool.query('SELECT * FROM receipts WHERE idempotency_key=$1', [idempotencyKey]);
      return res.json(out.rows[0]);
    } else if (sqliteDb) {
      await sqliteDb.run('UPDATE receipts SET status=?, updated_at=? WHERE idempotency_key=?', ['APPROVED', new Date().toISOString(), idempotencyKey]);
      const row = await sqliteDb.get('SELECT * FROM receipts WHERE idempotency_key=?', [idempotencyKey]);
      return res.json(row);
    } else {
      current.status = 'APPROVED';
      memReceipts.set(idempotencyKey, current);
      return res.json(current);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Confirm payment error' });
  }
});

app.post('/api/webhooks/pi', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || 'dev_secret';
  if (!verifyWebhookSignature(req, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // Process event (stub)
  return res.json({ ok: true });
});

// Return current user's receipts
app.post('/api/me/receipts', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    let userId = null;
    if (dbEnabled && pool) {
      const sess = await pool.query('SELECT user_id FROM sessions WHERE session_id=$1', [sessionId]);
      if (!sess.rowCount) return res.status(401).json({ error: 'Invalid session' });
      userId = sess.rows[0].user_id;
      const rows = await pool.query('SELECT idempotency_key, payment_id, amount, user_id, status, created_at, updated_at FROM receipts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [userId]);
      return res.json(rows.rows);
    }
    if (sqliteDb) {
      const row = await sqliteDb.get('SELECT user_id FROM sessions WHERE session_id=?', [sessionId]);
      if (!row) return res.status(401).json({ error: 'Invalid session' });
      userId = row.user_id;
      const rows = await sqliteDb.all('SELECT idempotency_key, payment_id, amount, user_id, status, created_at, updated_at FROM receipts WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [userId]);
      return res.json(rows);
    }
    const s = memSessions.get(sessionId);
    if (!s) return res.status(401).json({ error: 'Invalid session' });
    userId = s.userId;
    const out = [];
    for (const [key, r] of memReceipts.entries()) {
      if (r.user_id === userId) out.push({ idempotency_key: key, payment_id: r.payment_id, amount: r.amount, user_id: r.user_id, status: r.status });
    }
    out.sort((a, b) => (a.payment_id < b.payment_id ? 1 : -1));
    return res.json(out.slice(0, 100));
  } catch (e) {
    return res.status(500).json({ error: 'me receipts error' });
  }
});

// Protected content: requires at least one APPROVED receipt for the user
app.post('/api/protected', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (dbEnabled && pool) {
      const sess = await pool.query('SELECT user_id FROM sessions WHERE session_id=$1', [sessionId]);
      if (!sess.rowCount) return res.status(401).json({ error: 'Invalid session' });
      const userId = sess.rows[0].user_id;
      const ok = await pool.query("SELECT 1 FROM receipts WHERE user_id=$1 AND status='APPROVED' LIMIT 1", [userId]);
      if (!ok.rowCount) return res.status(402).json({ error: 'Payment required' });
      return res.json({ content: 'This is protected content. Thanks for your payment!', userId });
    }
    if (sqliteDb) {
      const sess = await sqliteDb.get('SELECT user_id FROM sessions WHERE session_id=?', [sessionId]);
      if (!sess) return res.status(401).json({ error: 'Invalid session' });
      const row = await sqliteDb.get("SELECT 1 FROM receipts WHERE user_id=? AND status='APPROVED' LIMIT 1", [sess.user_id]);
      if (!row) return res.status(402).json({ error: 'Payment required' });
      return res.json({ content: 'This is protected content. Thanks for your payment!', userId: sess.user_id });
    }
    const s = memSessions.get(sessionId);
    if (!s) return res.status(401).json({ error: 'Invalid session' });
    let has = false;
    for (const [, r] of memReceipts.entries()) {
      if (r.user_id === s.userId && r.status === 'APPROVED') { has = true; break; }
    }
    if (!has) return res.status(402).json({ error: 'Payment required' });
    return res.json({ content: 'This is protected content. Thanks for your payment!', userId: s.userId });
  } catch (e) {
    return res.status(500).json({ error: 'protected content error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Debug endpoint (local dev): inspect runtime flags/env (no secrets)
app.get('/_debug/env', (_req, res) => {
  res.json({
    strictVerify: STRICT_VERIFY,
    piApiBaseSet: Boolean(process.env.PI_API_BASE),
    piApiSecretSet: Boolean(process.env.PI_API_SECRET),
    corsOrigin: process.env.CORS_ORIGIN || '',
    dbEnabled,
    sqlitePath: process.env.SQLITE_PATH || '',
  });
});

// Admin endpoints (read-only, demo)
function parseListParams(req) {
  const q = (req.query.q || '').toString().trim();
  const status = (req.query.status || '').toString().trim();
  const start = (req.query.start || '').toString().trim();
  const end = (req.query.end || '').toString().trim();
  let limit = parseInt((req.query.limit || '50').toString(), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  if (limit > 500) limit = 500;
  return { q, status, start, end, limit };
}

app.get('/admin/sessions', adminAuth, async (req, res) => {
  try {
    const { q, limit } = parseListParams(req);
    if (dbEnabled && pool) {
      if (q) {
        const r = await pool.query(
          'SELECT session_id, user_id, created_at FROM sessions WHERE session_id ILIKE $1 OR user_id ILIKE $1 ORDER BY created_at DESC LIMIT $2',
          [`%${q}%`, limit]
        );
        return res.json(r.rows);
      }
      const r = await pool.query('SELECT session_id, user_id, created_at FROM sessions ORDER BY created_at DESC LIMIT $1', [limit]);
      return res.json(r.rows);
    }
    if (sqliteDb) {
      if (q) {
        const rows = await sqliteDb.all(
          'SELECT session_id, user_id, created_at FROM sessions WHERE session_id LIKE ? OR user_id LIKE ? ORDER BY created_at DESC LIMIT ?',$
          [`%${q}%`, `%${q}%`, limit]
        );
        return res.json(rows);
      }
      const rows = await sqliteDb.all('SELECT session_id, user_id, created_at FROM sessions ORDER BY created_at DESC LIMIT ?', [limit]);
      return res.json(rows);
    }
    const out = [];
    for (const [session_id, v] of memSessions.entries()) {
      out.push({ session_id, user_id: v.userId, created_at: new Date(v.createdAt).toISOString() });
    }
    const filtered = q ? out.filter(r => r.session_id.includes(q) || r.user_id.includes(q)) : out;
    filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return res.json(filtered.slice(0, limit));
  } catch (e) {
    return res.status(500).json({ error: 'admin sessions error' });
  }
});

app.get('/admin/receipts', adminAuth, async (req, res) => {
  try {
    const { q, status, limit } = parseListParams(req);
    if (dbEnabled && pool) {
      const filters = [];
      const params = [];
      if (q) { filters.push('(idempotency_key ILIKE $' + (params.length+1) + ' OR payment_id ILIKE $' + (params.length+1) + ' OR user_id ILIKE $' + (params.length+1) + ')'); params.push(`%${q}%`); }
      if (status) { filters.push('status = $' + (params.length+1)); params.push(status); }
      const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
      params.push(limit);
      const r = await pool.query(
        `SELECT idempotency_key, payment_id, amount, user_id, status, created_at, updated_at FROM receipts ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      return res.json(r.rows);
    }
    if (sqliteDb) {
      const filters = [];
      const params = [];
      if (q) { filters.push('(idempotency_key LIKE ? OR payment_id LIKE ? OR user_id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      if (status) { filters.push('status = ?'); params.push(status); }
      const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
      params.push(limit);
      const rows = await sqliteDb.all(
        `SELECT idempotency_key, payment_id, amount, user_id, status, created_at, updated_at FROM receipts ${where} ORDER BY created_at DESC LIMIT ?`,
        params
      );
      return res.json(rows);
    }
    const out = [];
    for (const [idempotency_key, v] of memReceipts.entries()) {
      out.push({ idempotency_key, payment_id: v.payment_id, amount: v.amount, user_id: v.user_id, status: v.status });
    }
    const filtered = out.filter(r => {
      if (q && !(r.idempotency_key.includes(q) || r.payment_id.includes(q) || r.user_id.includes(q))) return false;
      if (status && r.status !== status) return false;
      return true;
    });
    return res.json(filtered.slice(0, limit));
  } catch (e) {
    return res.status(500).json({ error: 'admin receipts error' });
  }
});

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
  return lines.join('\n');
}

app.get('/admin/sessions.csv', adminAuth, async (req, res) => {
  const { q, start, end, limit } = parseListParams(req);
  const qs = new URLSearchParams({ q, start, end, limit: String(limit) }).toString();
  const resp = await fetch(`http://localhost:${PORT}/admin/sessions?${qs}`);
  const rows = await resp.json();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sessions.csv"');
  res.send(toCSV(rows));
});

app.get('/admin/receipts.csv', adminAuth, async (req, res) => {
  const { q, status, start, end, limit } = parseListParams(req);
  const qs = new URLSearchParams({ q, status, start, end, limit: String(limit) }).toString();
  const resp = await fetch(`http://localhost:${PORT}/admin/receipts?${qs}`);
  const rows = await resp.json();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="receipts.csv"');
  res.send(toCSV(rows));
});

async function start() {
  try {
    await migrate();
  } catch (e) {
    console.warn('DB migrate failed; falling back to in-memory stores. Error:', e.message || e);
    dbEnabled = false;
  }
  app.listen(PORT, () => {
    console.log(`pi-app-backend listening on :${PORT}`);
  });
}

start().catch((e) => {
  console.error('Failed to start server', e);
  process.exit(1);
});


