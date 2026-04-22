/**
 * AirNotes Backend v3
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW IT WORKS (read this before editing):
 *
 * The Telegram Bot API has a critical limitation: you cannot read channel
 * message history via getUpdates or any polling method. getUpdates only
 * delivers NEW events from the moment the bot starts polling.
 *
 * Our solution: use a WEBHOOK so every message sent TO THE BOT is received
 * in real-time. Users add PDFs to the library by sending/forwarding them
 * directly to the bot in a private chat. The bot receives the file, stores
 * the file_id + metadata in SQLite, and they instantly appear in the library.
 *
 * No channel admin required. No polling. Works for files of any source.
 *
 * ─── How to add PDFs to your library ────────────────────────────────────────
 * 1. Open Telegram and find your bot (the one whose token you configured)
 * 2. Send any PDF file directly to the bot, OR forward a PDF from any chat
 * 3. The bot replies "✅ Added to your library!" and it appears instantly
 *
 * ─── Webhook setup ───────────────────────────────────────────────────────────
 * Webhook URL must be publicly reachable by Telegram servers.
 * On Render/Railway/Fly.io this happens automatically since the service
 * is public. The bot sets its own webhook on startup via setWebhook.
 *
 * For local dev: use ngrok → ngrok http 3001 → set WEBHOOK_URL in .env
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const axios      = require('axios');
const Database   = require('better-sqlite3');
const path       = require('path');
const fs         = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 3001;
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || ''; // e.g. https://your-app.onrender.com
const JWT_SECRET  = process.env.JWT_SECRET  || 'dev_secret_change_me';
const APP_PASS    = process.env.APP_PASSWORD || 'Airflix@2003';
const DEMO_MODE   = !BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here';

const TG_API  = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TG_FILE = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

// ─── SQLite DB ────────────────────────────────────────────────────────────────
// Use /tmp on Render (ephemeral but survives restarts within a session)
// For persistence across deploys, mount a disk on Render and set DB_PATH
const DB_PATH = process.env.DB_PATH || path.join('/tmp', 'airnotes.db');

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id         TEXT PRIMARY KEY,
      file_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      size       INTEGER DEFAULT 0,
      date       INTEGER NOT NULL,
      caption    TEXT DEFAULT '',
      chat_id    TEXT DEFAULT '',
      large      INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);
  console.log(`✅ SQLite ready: ${DB_PATH}`);
} catch (e) {
  console.error('SQLite init failed:', e.message);
  // Fall through — app runs in demo mode if DB fails
}

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmts = db ? {
  insert: db.prepare(`
    INSERT OR IGNORE INTO files (id, file_id, name, size, date, caption, chat_id, large)
    VALUES (@id, @file_id, @name, @size, @date, @caption, @chat_id, @large)
  `),
  all:    db.prepare(`SELECT * FROM files ORDER BY date DESC`),
  del:    db.prepare(`DELETE FROM files WHERE id = @id`),
  search: db.prepare(`SELECT * FROM files WHERE LOWER(name) LIKE @q OR LOWER(caption) LIKE @q ORDER BY date DESC`),
  count:  db.prepare(`SELECT COUNT(*) as n FROM files`),
} : null;

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const raw = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.query.t;           // ?t= for streaming (pdf.js range requests)
  if (!raw) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(raw, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_FILES = [
  { id: 'demo_1', file_id: 'demo_1', name: 'The Art of War.pdf',           size: 2457600,  date: ts(7),  caption: 'Sun Tzu — classic strategy', large: 0 },
  { id: 'demo_2', file_id: 'demo_2', name: 'Atomic Habits.pdf',            size: 8912896,  date: ts(3),  caption: 'James Clear',                large: 0 },
  { id: 'demo_3', file_id: 'demo_3', name: 'Deep Work.pdf',                size: 5242880,  date: ts(1),  caption: 'Cal Newport',                large: 0 },
  { id: 'demo_4', file_id: 'demo_4', name: 'Thinking Fast and Slow.pdf',   size: 12582912, date: ts(14), caption: 'Kahneman',                   large: 0 },
  { id: 'demo_5', file_id: 'demo_5', name: 'Zero to One.pdf',              size: 4194304,  date: ts(21), caption: 'Peter Thiel',                large: 0 },
  { id: 'demo_6', file_id: 'demo_6', name: 'The Pragmatic Programmer.pdf', size: 9437184,  date: ts(5),  caption: 'Hunt & Thomas',              large: 0 },
];
function ts(daysAgo) { return Math.floor(Date.now() / 1000) - 86400 * daysAgo; }

// ─── Telegram helpers ─────────────────────────────────────────────────────────
async function tg(method, body = {}) {
  const r = await axios.post(`${TG_API}/${method}`, body, {
    timeout: 15000, validateStatus: () => true,
  });
  return r.data;
}

async function sendMessage(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

// URL cache — Telegram file URLs expire ~1 hour
const urlCache = new Map();

async function resolveUrl(fileId) {
  if (DEMO_MODE || fileId.startsWith('demo_')) {
    return { url: 'https://www.africau.edu/images/default/sample.pdf', large: false };
  }
  const hit = urlCache.get(fileId);
  if (hit && Date.now() < hit.exp) return hit;

  const r = await tg('getFile', { file_id: fileId });
  if (r.ok && r.result?.file_path) {
    const obj = { url: `${TG_FILE}/${r.result.file_path}`, large: false, exp: Date.now() + 50 * 60_000 };
    urlCache.set(fileId, obj);
    return obj;
  }
  const desc = (r.description || '').toLowerCase();
  if (desc.includes('too big') || desc.includes('bad request')) {
    return { url: null, large: true };
  }
  throw new Error(r.description || 'getFile failed');
}

// ─── Process an incoming document from Telegram ───────────────────────────────
function ingestDocument(msg) {
  if (!stmts) return false;
  const doc = msg.document;
  if (!doc) return false;
  if (doc.mime_type !== 'application/pdf') return false;

  const sizeMB = (doc.file_size || 0) / (1024 * 1024);
  const rec = {
    id:      `msg_${msg.message_id}_${msg.chat.id}`,
    file_id: doc.file_id,
    name:    doc.file_name || `Document_${msg.message_id}.pdf`,
    size:    doc.file_size || 0,
    date:    msg.date,
    caption: msg.caption || '',
    chat_id: String(msg.chat.id),
    large:   sizeMB > 20 ? 1 : 0,
  };
  try {
    stmts.insert.run(rec);
    return true;
  } catch (e) {
    console.error('DB insert error:', e.message);
    return false;
  }
}

// ─── Stream proxy ─────────────────────────────────────────────────────────────
async function proxyStream(url, req, res) {
  const range   = req.headers.range;
  const headers = { 'User-Agent': 'AirNotes/3.0', Accept: 'application/pdf,*/*' };
  if (range) headers['Range'] = range;

  const up = await axios({ method: 'GET', url, responseType: 'stream', headers, timeout: 60_000, maxRedirects: 5, validateStatus: s => s < 500 });

  res.status(up.status);
  res.setHeader('Content-Type',   up.headers['content-type']  || 'application/pdf');
  res.setHeader('Accept-Ranges',  'bytes');
  res.setHeader('Cache-Control',  'private, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin',   '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  if (up.headers['content-length']) res.setHeader('Content-Length', up.headers['content-length']);
  if (up.headers['content-range'])  res.setHeader('Content-Range',  up.headers['content-range']);

  up.data.pipe(res);
  return new Promise((ok, fail) => {
    up.data.on('end', ok);
    up.data.on('error', fail);
    res.on('close', () => up.data.destroy());
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK ENDPOINT — Telegram posts every bot update here
// ═══════════════════════════════════════════════════════════════════════════════
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // always ack immediately

  const update = req.body;
  if (!update) return;

  // Handle messages sent directly to the bot (private chat or group)
  const msg = update.message || update.channel_post;
  if (!msg) return;

  const chatId = msg.chat.id;

  // ── PDF received ────────────────────────────────────────────────────────────
  if (msg.document) {
    const doc = msg.document;

    if (doc.mime_type !== 'application/pdf') {
      await sendMessage(chatId, '⚠️ Only PDF files are supported. Please send a .pdf file.');
      return;
    }

    const added = ingestDocument(msg);
    const name  = doc.file_name || 'document.pdf';
    const sizeMB = ((doc.file_size || 0) / (1024 * 1024)).toFixed(1);
    const large  = (doc.file_size || 0) > 20 * 1024 * 1024;

    if (added) {
      let reply = `✅ <b>${name}</b> added to your library!\n📦 Size: ${sizeMB} MB`;
      if (large) {
        reply += '\n\n⚠️ <b>Note:</b> This file is over 20 MB. Due to Telegram Bot API limits, files over 20 MB cannot be previewed in the reader. They will be shown in the library but will not open.';
      }
      await sendMessage(chatId, reply);
    } else {
      await sendMessage(chatId, `⚠️ Could not save <b>${name}</b>. Please try again.`);
    }
    return;
  }

  // ── Text commands ────────────────────────────────────────────────────────────
  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/help') {
    await sendMessage(chatId,
      '📚 <b>Welcome to AirNotes!</b>\n\n' +
      'Send me any PDF file to add it to your library.\n' +
      'You can also <b>forward</b> PDFs from other chats.\n\n' +
      '<b>Commands:</b>\n' +
      '/list — show all PDFs in your library\n' +
      '/count — count total PDFs\n' +
      '/delete [id] — remove a PDF\n' +
      '/help — show this message\n\n' +
      '📖 Open the AirNotes web app to read your PDFs.'
    );
    return;
  }

  if (text === '/count') {
    const n = stmts ? stmts.count.get().n : 0;
    await sendMessage(chatId, `📚 You have <b>${n}</b> PDF${n !== 1 ? 's' : ''} in your library.`);
    return;
  }

  if (text === '/list') {
    if (!stmts) { await sendMessage(chatId, '⚠️ Database not available.'); return; }
    const files = stmts.all.all().slice(0, 20);
    if (files.length === 0) {
      await sendMessage(chatId, '📭 Your library is empty. Send me a PDF to get started!');
      return;
    }
    const lines = files.map((f, i) => `${i + 1}. ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
    await sendMessage(chatId, `📚 <b>Your library (${files.length} PDFs):</b>\n\n${lines.join('\n')}`);
    return;
  }

  if (text.startsWith('/delete ')) {
    const id = text.slice(8).trim();
    if (stmts && id) {
      stmts.del.run({ id });
      await sendMessage(chatId, `🗑️ Removed from library.`);
    }
    return;
  }

  // Default — unknown message
  await sendMessage(chatId,
    '👋 Send me a PDF file to add it to your library.\n\nType /help for more info.'
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// REST API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (_req, res) => {
  const count = stmts ? stmts.count.get().n : 0;
  res.json({ status: 'ok', mode: DEMO_MODE ? 'demo' : 'live', files: count, version: '3.0.0' });
});

app.post('/api/auth/login', (req, res) => {
  if ((req.body?.password || '') !== APP_PASS) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ ok: true }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, demo_mode: DEMO_MODE });
});

app.get('/api/auth/verify', requireAuth, (_req, res) => {
  res.json({ valid: true, demo_mode: DEMO_MODE });
});

// List all PDFs
app.get('/api/files', requireAuth, (_req, res) => {
  if (DEMO_MODE) return res.json({ files: DEMO_FILES, total: DEMO_FILES.length, demo_mode: true });
  try {
    const files = stmts.all.all().map(f => ({ ...f, large: !!f.large }));
    res.json({ files, total: files.length, demo_mode: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a PDF from the library (DB only, not from Telegram)
app.delete('/api/files/:id', requireAuth, (req, res) => {
  if (!stmts) return res.status(500).json({ error: 'DB not available' });
  stmts.del.run({ id: req.params.id });
  res.json({ ok: true });
});

// Stream a PDF
app.get('/api/files/:fileId/stream', requireAuth, async (req, res) => {
  const { fileId } = req.params;
  try {
    const { url, large } = await resolveUrl(fileId);
    if (large || !url) {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: 'This file is larger than 20 MB. Telegram Bot API cannot serve files over 20 MB.',
      });
    }
    await proxyStream(url, req, res);
  } catch (e) {
    console.error('Stream error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed', message: e.message });
  }
});

// Search
app.get('/api/search', requireAuth, (req, res) => {
  const q = `%${(req.query.q || '').trim().toLowerCase()}%`;
  if (DEMO_MODE) {
    const ql = q.replace(/%/g, '');
    return res.json({ files: DEMO_FILES.filter(f => f.name.toLowerCase().includes(ql) || f.caption.toLowerCase().includes(ql)) });
  }
  try {
    const files = stmts.search.all({ q }).map(f => ({ ...f, large: !!f.large }));
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bot info
app.get('/api/telegram/info', requireAuth, async (_req, res) => {
  if (DEMO_MODE) return res.json({ connected: false, mode: 'demo', message: 'Set TELEGRAM_BOT_TOKEN to connect.' });
  try {
    const r = await tg('getMe');
    const wh = await tg('getWebhookInfo');
    res.json({ connected: r.ok, bot: r.result, webhook: wh.result });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

// ─── Register webhook with Telegram ──────────────────────────────────────────
async function registerWebhook() {
  if (DEMO_MODE) return;
  if (!WEBHOOK_URL) {
    console.warn('⚠️  WEBHOOK_URL not set. Webhook not registered.');
    console.warn('   Set WEBHOOK_URL=https://your-app.onrender.com in .env');
    console.warn('   For local dev: use ngrok → ngrok http 3001');
    return;
  }

  const webhookPath = `/webhook/${BOT_TOKEN}`;
  const fullUrl     = `${WEBHOOK_URL.replace(/\/$/, '')}${webhookPath}`;

  try {
    const r = await tg('setWebhook', {
      url:             fullUrl,
      allowed_updates: ['message', 'channel_post'],
      drop_pending_updates: false,
    });
    if (r.ok) {
      console.log(`✅ Webhook registered: ${fullUrl}`);
    } else {
      console.error('❌ Webhook registration failed:', r.description);
    }
  } catch (e) {
    console.error('❌ Webhook registration error:', e.message);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 AirNotes v3 running on http://localhost:${PORT}`);
  console.log(`📡 Mode:    ${DEMO_MODE ? 'DEMO' : 'Telegram Live'}`);
  if (!DEMO_MODE) {
    console.log(`🤖 Token:   ${BOT_TOKEN.slice(0, 10)}...`);
    await registerWebhook();
  }
  console.log(`\n📖 How to add PDFs:`);
  console.log(`   • Open Telegram, find your bot`);
  console.log(`   • Send or forward any PDF file to the bot`);
  console.log(`   • It will instantly appear in AirNotes\n`);
});
