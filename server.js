const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const COVER_FILE = path.join(DATA_DIR, 'cover.json');
const UPLOAD_DIR = path.join(ROOT_DIR, 'assets', 'uploads');

app.use(express.json({ limit: '25mb' }));

function sendError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = String(req.get('X-ADMIN-TOKEN') || '');
  if (token !== ADMIN_TOKEN) return sendError(res, 401, 'Unauthorized');
  return next();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeId(existingIds, preferred) {
  if (preferred && !existingIds.has(preferred)) return preferred;
  let id;
  do {
    id = crypto.randomBytes(8).toString('hex');
  } while (existingIds.has(id));
  return id;
}

function toIso(value) {
  const date = value ? new Date(value) : new Date();
  const iso = date.toISOString();
  return iso;
}

function mapSeedCritic(item) {
  return {
    id: item.__backendId || item.id,
    type: 'critic',
    album: item.album || item.title || '',
    artist: item.artist || '',
    score: item.score != null ? Number(item.score) : null,
    content: item.content || '',
    author: item.author || '',
    coverImageUrl: item.coverImageUrl || '',
    publishedAt: toIso(item.publishedAt || item.date),
    status: item.status || 'published',
    isDemo: Boolean(item.isDemo)
  };
}

function mapSeedNews(item) {
  return {
    id: item.__backendId || item.id,
    type: 'news',
    category: item.category || '',
    headline: item.headline || item.title || '',
    subtitle: item.subtitle || '',
    content: item.content || '',
    pullQuote: item.pullQuote || item.quote || '',
    author: item.author || '',
    heroImageUrl: item.heroImageUrl || '',
    publishedAt: toIso(item.publishedAt || item.date),
    status: item.status || 'published',
    isDemo: Boolean(item.isDemo)
  };
}

function mapSeedInterview(item) {
  return {
    id: item.__backendId || item.id,
    type: 'interview',
    guest: item.guest || item.artist || '',
    title: item.title || '',
    subtitle: item.subtitle || '',
    content: item.content || '',
    keyQuote: item.keyQuote || item.quote || '',
    author: item.author || '',
    heroImageUrl: item.heroImageUrl || '',
    publishedAt: toIso(item.publishedAt || item.date),
    status: item.status || 'published',
    isDemo: Boolean(item.isDemo)
  };
}

function parseChartContentToEntries(content) {
  if (!content) return [];
  const parts = String(content)
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  return parts.map((p, index) => {
    const sep = ' - ';
    const sepIndex = p.indexOf(sep);

    const trackTitle = sepIndex !== -1 ? p.slice(0, sepIndex).trim() : p;
    const artist = sepIndex !== -1 ? p.slice(sepIndex + sep.length).trim() : '';
    return {
      position: index + 1,
      trackTitle,
      artist,
      movement: 'same'
    };
  });
}

function mapSeedChart(item) {
  const chartTitle = item.chartTitle || item.title || 'The Hot 15';
  const entries = Array.isArray(item.entries) ? item.entries : parseChartContentToEntries(item.content);
  return {
    id: item.__backendId || item.id,
    type: 'chart',
    chartTitle,
    issueNumber: item.issueNumber || new Date().getFullYear(),
    entries,
    publishedAt: toIso(item.publishedAt || item.date),
    status: item.status || 'published',
    isDemo: Boolean(item.isDemo)
  };
}

async function initDbIfMissing() {
  if (await exists(DB_FILE)) return;

  const seedCritics = await readJson(path.join(DATA_DIR, 'critics.json'), []);
  const seedNews = await readJson(path.join(DATA_DIR, 'news.json'), []);
  const seedInterviews = await readJson(path.join(DATA_DIR, 'interviews.json'), []);
  const seedCharts = await readJson(path.join(DATA_DIR, 'charts.json'), []);

  const items = [];
  for (const c of Array.isArray(seedCritics) ? seedCritics : []) items.push(mapSeedCritic(c));
  for (const n of Array.isArray(seedNews) ? seedNews : []) items.push(mapSeedNews(n));
  for (const i of Array.isArray(seedInterviews) ? seedInterviews : []) items.push(mapSeedInterview(i));
  for (const ch of Array.isArray(seedCharts) ? seedCharts : []) items.push(mapSeedChart(ch));

  const db = {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items
  };

  await writeJsonAtomic(DB_FILE, db);
}

async function loadDb() {
  await initDbIfMissing();
  const db = await readJson(DB_FILE, { version: 1, items: [] });
  if (!db.items || !Array.isArray(db.items)) db.items = [];
  return db;
}

async function saveDb(db) {
  db.updatedAt = new Date().toISOString();
  await writeJsonAtomic(DB_FILE, db);
}

function sortByPublishedDesc(a, b) {
  const da = new Date(a.publishedAt || a.createdAt || 0).getTime();
  const db = new Date(b.publishedAt || b.createdAt || 0).getTime();
  return db - da;
}

function safeExtFromMime(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg';
  if (mt === 'image/png') return 'png';
  if (mt === 'image/webp') return 'webp';
  if (mt === 'image/gif') return 'gif';
  return 'bin';
}

function safeBaseName(filename) {
  const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
  return base.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 50) || 'image';
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

// Serve static files
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
app.use('/styles', express.static(path.join(ROOT_DIR, 'styles')));
app.use('/data', express.static(path.join(ROOT_DIR, 'data')));

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// --- API ---

app.get('/health', (req, res) => {
  res.json({ success: true, ok: true });
});

app.post('/uploadImage', requireAdmin, async (req, res) => {
  const { filename, data, mimeType } = req.body || {};

  const parsed = parseDataUrl(data);
  if (!parsed) return sendError(res, 400, 'Invalid image data (expected DataURL base64)');

  const finalMime = String(mimeType || parsed.mimeType || '').toLowerCase();
  const ext = safeExtFromMime(finalMime);
  const base = safeBaseName(filename);

  const unique = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${base}.${ext}`;

  const buffer = Buffer.from(parsed.base64, 'base64');
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, unique), buffer);

  return res.json({ success: true, url: `/assets/uploads/${unique}` });
});

app.post('/publish', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const type = String(payload.type || '').trim();

  if (!type) return sendError(res, 400, 'Missing type');
  if (!['critic', 'news', 'interview', 'chart'].includes(type)) {
    return sendError(res, 400, `Unsupported type: ${type}`);
  }

  const db = await loadDb();
  const existingIds = new Set(db.items.map(i => i.id).filter(Boolean));

  const preferredId = payload.id || payload.__backendId || null;
  const rawId = normalizeId(existingIds, preferredId);
  const id = preferredId && !existingIds.has(preferredId) ? preferredId : `${type}_${rawId}`;

  const now = new Date().toISOString();
  const item = {
    ...payload,
    id,
    type,
    status: payload.status || 'published',
    publishedAt: payload.publishedAt ? toIso(payload.publishedAt) : now,
    createdAt: now,
    updatedAt: now
  };

  db.items.push(item);
  await saveDb(db);

  return res.json({ success: true, item });
});

app.post('/update', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const type = String(payload.type || '').trim();
  const id = String(payload.id || payload.__backendId || '').trim();

  if (!type) return sendError(res, 400, 'Missing type');
  if (!id) return sendError(res, 400, 'Missing id');
  if (!['critic', 'news', 'interview', 'chart'].includes(type)) {
    return sendError(res, 400, `Unsupported type: ${type}`);
  }

  const db = await loadDb();
  const index = db.items.findIndex(i => i && i.type === type && String(i.id) === id);
  if (index === -1) return sendError(res, 404, 'Not found');

  const existing = db.items[index];
  const now = new Date().toISOString();

  const item = {
    ...existing,
    ...payload,
    id: existing.id,
    type: existing.type,
    status: payload.status || existing.status || 'published',
    publishedAt: payload.publishedAt ? toIso(payload.publishedAt) : (existing.publishedAt || now),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  db.items[index] = item;
  await saveDb(db);
  return res.json({ success: true, item });
});

app.post('/delete', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const type = String(payload.type || '').trim();
  const id = String(payload.id || '').trim();

  if (!type || !id) return sendError(res, 400, 'Missing type or id');
  if (!['critic', 'news', 'interview', 'chart'].includes(type)) {
    return sendError(res, 400, `Unsupported type: ${type}`);
  }

  const db = await loadDb();
  const before = db.items.length;
  db.items = db.items.filter(i => !(i && i.type === type && String(i.id) === id));
  const after = db.items.length;
  const deleted = before - after;
  if (deleted <= 0) return sendError(res, 404, 'Not found');

  await saveDb(db);
  return res.json({ success: true, deleted });
});

app.get('/list', async (req, res) => {
  const type = String(req.query.type || '').trim();
  if (!type) return sendError(res, 400, 'Missing type');

  const db = await loadDb();
  const items = db.items
    .filter(i => i && i.type === type)
    .sort(sortByPublishedDesc);

  return res.json({ success: true, items });
});

app.get('/item', async (req, res) => {
  const type = String(req.query.type || '').trim();
  const id = String(req.query.id || '').trim();
  if (!type || !id) return sendError(res, 400, 'Missing type or id');

  const db = await loadDb();
  const item = db.items.find(i => i && i.type === type && String(i.id) === id);
  if (!item) return sendError(res, 404, 'Not found');

  return res.json({ success: true, item });
});

app.get('/latest', async (req, res) => {
  const limit = Math.max(1, Math.min(12, Number(req.query.limit || 6)));
  const db = await loadDb();

  const items = db.items
    .filter(i => i && i.status === 'published')
    .sort(sortByPublishedDesc)
    .slice(0, limit);

  return res.json({ success: true, items });
});

app.post('/updateCover', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const cover = {
    type: 'cover',
    issueNumber: String(payload.issueNumber || '').trim(),
    issueDate: String(payload.issueDate || '').trim(),
    description: String(payload.description || '').trim(),
    coverImageUrl: String(payload.coverImageUrl || '').trim(),
    updatedAt: new Date().toISOString()
  };

  if (!cover.issueNumber || !cover.issueDate || !cover.description) {
    return sendError(res, 400, 'Missing cover fields');
  }

  await writeJsonAtomic(COVER_FILE, cover);
  return res.json({ success: true, cover });
});

app.get('/cover', async (req, res) => {
  const cover = await readJson(COVER_FILE, null);
  if (!cover) return res.json({ success: true, cover: null });
  return res.json({ success: true, cover });
});

app.post('/deleteDemo', requireAdmin, async (req, res) => {
  const db = await loadDb();
  const before = db.items.length;
  db.items = db.items.filter(i => !(i && i.isDemo === true));
  const after = db.items.length;
  await saveDb(db);
  return res.json({ success: true, deleted: before - after });
});

app.get('/stats', async (req, res) => {
  const demoOnly = String(req.query.demo || '').toLowerCase() === 'true';
  const db = await loadDb();
  const items = demoOnly ? db.items.filter(i => i && i.isDemo === true) : db.items;

  const stats = {
    critics: items.filter(i => i.type === 'critic').length,
    news: items.filter(i => i.type === 'news').length,
    interviews: items.filter(i => i.type === 'interview').length,
    charts: items.filter(i => i.type === 'chart').length
  };

  return res.json({ success: true, stats });
});

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  if (ADMIN_TOKEN) console.log('[server] ADMIN_TOKEN is enabled');
});
