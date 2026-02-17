// ==========================================
// ROLLING STONE EDITORIAL CMS
// Static Site with API Backend Integration
// ==========================================

console.log('[BOOT] app.js loaded - timestamp:', new Date().toISOString());

// ==========================================
// A) CONFIGURATION
// ==========================================

const CONFIG = {
  // API Base URL.
  // - Para usar o backend local (server.js), deixe vazio (mesma origem).
  // - Para usar Google Apps Script/externo, coloque a URL completa aqui.
  API_BASE: "",
  ADMIN_TOKEN_KEY: "admin_token",
  RATE_LIMIT_DELAY: 150, // ms between requests
  RETRY_DELAY: 2000, // ms for retry on 429
  MAX_RETRIES: 3
};

const API_BASE_STORAGE_KEY = 'rollingstone_api_base';

function normalizeApiBase(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function initApiBaseFromRuntime() {
  try {
    const qs = new URLSearchParams(window.location.search || '');
    const fromQs = qs.get('api') || qs.get('apiBase') || '';
    const fromLs = localStorage.getItem(API_BASE_STORAGE_KEY) || '';

    const next = normalizeApiBase(fromQs || fromLs || CONFIG.API_BASE);
    CONFIG.API_BASE = next;

    if (fromQs) {
      try { localStorage.setItem(API_BASE_STORAGE_KEY, next); } catch {}
    }

    if (isDebugMode()) {
      console.log('[CONFIG] API_BASE =', CONFIG.API_BASE || '(same origin)');
    }
  } catch {
    // ignore
  }
}

initApiBaseFromRuntime();

// ==========================================
// A2) ADMIN STATE (Edit / Manager)
// ==========================================

let ADMIN_EDIT_STATE = null;
let POSTS_MANAGER_FILTER = 'all';
let POSTS_MANAGER_READY = false;

// ==========================================
// A3) LOCAL BACKUP (Export/Import)
// ==========================================

function setLocalBackupStatus(message, type = 'info') {
  const el = document.getElementById('local-backup-status');
  if (!el) return;
  showStatus(el, message, type);
}

function downloadJson(filename, data) {
  const safeName = String(filename || 'backup.json').replace(/[^a-z0-9._-]+/gi, '_');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function buildLocalBackupPayload() {
  const items = loadLocalPublishedItems();
  const cover = loadLocalCover();
  const deleted = Array.from(loadLocalDeletedIds());
  return {
    kind: 'rollingstone_local_backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    localStorageKeys: { ...LOCAL_PUBLISH_STORAGE },
    data: { items, cover, deleted }
  };
}

function exportLocalBackup() {
  try {
    const payload = buildLocalBackupPayload();
    const date = new Date();
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    downloadJson(`rollingstone_backup_${y}${m}${d}.json`, payload);
    setLocalBackupStatus('✓ Export gerado (JSON baixado).', 'success');
  } catch (e) {
    setLocalBackupStatus(`✗ Falha no export: ${e?.message || e}`, 'error');
  }
}

function normalizeImportedBackup(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Backup inválido (JSON)');
  if (parsed.kind !== 'rollingstone_local_backup') {
    // suporte básico: permitir importar um array direto de items
    if (Array.isArray(parsed)) {
      return { items: parsed, cover: null, deleted: [] };
    }
    throw new Error('Backup inválido (kind)');
  }
  const data = parsed.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const cover = data.cover && typeof data.cover === 'object' ? data.cover : null;
  const deleted = Array.isArray(data.deleted) ? data.deleted.map(v => String(v)) : [];
  return { items, cover, deleted };
}

function importLocalBackupFromText(text) {
  const parsed = JSON.parse(String(text || ''));
  const { items, cover, deleted } = normalizeImportedBackup(parsed);

  const ok = window.confirm('Import vai SUBSTITUIR seus rascunhos locais (localStorage). Deseja continuar?');
  if (!ok) return;

  saveLocalPublishedItems(items);
  if (cover) saveLocalCover(cover);
  else localStorage.removeItem(LOCAL_PUBLISH_STORAGE.cover);

  saveLocalDeletedIds(new Set(deleted));

  // invalida cache
  __staticDbCache = null;
  __staticDbCacheAt = 0;

  setLocalBackupStatus('✓ Import concluído. Atualizando listas...', 'success');
}

function clearLocalDrafts() {
  const ok = window.confirm('Isso vai apagar seus posts/capa locais (rascunhos no navegador). Tem certeza?');
  if (!ok) return;
  localStorage.removeItem(LOCAL_PUBLISH_STORAGE.items);
  localStorage.removeItem(LOCAL_PUBLISH_STORAGE.cover);
  localStorage.removeItem(LOCAL_PUBLISH_STORAGE.deleted);
  __staticDbCache = null;
  __staticDbCacheAt = 0;
  setLocalBackupStatus('✓ Local limpo. (Somente o que estava no navegador)', 'success');
}

function setupLocalBackupUI() {
  const exportBtn = document.getElementById('local-export-btn');
  const clearBtn = document.getElementById('local-clear-btn');
  const fileInput = document.getElementById('local-import-file');
  if (exportBtn && !exportBtn.__bound) {
    exportBtn.__bound = true;
    exportBtn.addEventListener('click', exportLocalBackup);
  }
  if (clearBtn && !clearBtn.__bound) {
    clearBtn.__bound = true;
    clearBtn.addEventListener('click', () => {
      clearLocalDrafts();
      refreshPostsManager();
      loadLatest();
      loadCover();
      loadCritics();
      loadNews();
      loadInterviews();
      loadCharts();
    });
  }
  if (fileInput && !fileInput.__bound) {
    fileInput.__bound = true;
    fileInput.addEventListener('change', async () => {
      try {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const text = await file.text();
        importLocalBackupFromText(text);

        // refresh
        await refreshPostsManager();
        loadLatest();
        loadCover();
        loadCritics();
        loadNews();
        loadInterviews();
        loadCharts();
      } catch (e) {
        setLocalBackupStatus(`✗ Falha no import: ${e?.message || e}`, 'error');
      } finally {
        fileInput.value = '';
      }
    });
  }
}

function isFileProtocol() {
  return window.location && window.location.protocol === 'file:';
}

function isDebugMode() {
  try {
    const qs = new URLSearchParams(window.location.search || '');
    return qs.get('debug') === '1' || qs.has('debug');
  } catch {
    return false;
  }
}

function setupDebugOverlay() {
  if (!isDebugMode()) return;

  const el = document.createElement('div');
  el.id = 'debug-overlay';
  el.style.position = 'fixed';
  el.style.right = '10px';
  el.style.bottom = '10px';
  el.style.zIndex = '2147483647';
  el.style.background = 'rgba(0,0,0,0.78)';
  el.style.color = 'white';
  el.style.padding = '8px 10px';
  el.style.borderRadius = '10px';
  el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  el.style.fontSize = '12px';
  el.style.maxWidth = '70vw';
  el.style.boxShadow = '0 10px 24px rgba(0,0,0,0.35)';
  el.style.cursor = 'default';
  el.textContent = 'JS: OK | clicks: 0';
  document.body.appendChild(el);

  let clicks = 0;
  document.addEventListener('click', (ev) => {
    clicks++;
    const t = ev.target;
    const desc = t ? `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}${t.className ? `.${String(t.className).toString().split(' ').filter(Boolean).slice(0,2).join('.')}` : ''}` : 'unknown';
    el.textContent = `JS: OK | clicks: ${clicks} | last: ${desc}`;
  }, true);

  function showError(label, err) {
    const msg = err?.message || String(err || 'Unknown error');
    el.style.background = 'rgba(185,28,28,0.90)';
    el.textContent = `JS ERROR (${label}): ${msg}`;
    console.error('[DEBUG OVERLAY]', label, err);
  }

  window.addEventListener('error', (e) => {
    showError('error', e?.error || e?.message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    showError('promise', e?.reason || e);
  });
}

let HAS_BACKEND = null;

async function detectBackend() {
  if (HAS_BACKEND != null) return HAS_BACKEND;

  if (isFileProtocol()) {
    HAS_BACKEND = false;
    return HAS_BACKEND;
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${CONFIG.API_BASE}/health`, { signal: controller.signal });
    clearTimeout(t);
    HAS_BACKEND = Boolean(res && res.ok);
    return HAS_BACKEND;
  } catch {
    HAS_BACKEND = false;
    return HAS_BACKEND;
  }
}

// ==========================================
// B) ADMIN LOGGING
// ==========================================

function logLine(message, type = 'info') {
  const logContainer = document.getElementById('admin-log');
  if (!logContainer) return;

  const timestamp = new Date().toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });

  const colors = {
    info: '#9ca3af',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b'
  };

  const entry = document.createElement('div');
  entry.style.color = colors[type] || colors.info;
  entry.style.padding = '0.25rem 0';
  entry.style.borderBottom = '1px solid #2a2a2a';
  const timeEl = document.createElement('span');
  timeEl.style.color = '#6b7280';
  timeEl.textContent = `[${timestamp}]`;
  entry.appendChild(timeEl);
  entry.appendChild(document.createTextNode(' '));
  entry.appendChild(document.createTextNode(String(message ?? '')));
  
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function demoLogLine(message, type = 'info') {
  const logContainer = document.getElementById('demo-log');
  if (!logContainer) return;

  const timestamp = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const colors = {
    info: '#9ca3af',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b'
  };

  const entry = document.createElement('div');
  entry.className = 'demo-log-entry';

  const timeEl = document.createElement('span');
  timeEl.className = 'demo-log-time';
  timeEl.textContent = timestamp;
  entry.appendChild(timeEl);

  const msgEl = document.createElement('span');
  msgEl.textContent = String(message ?? '');
  msgEl.style.color = colors[type] || colors.info;
  entry.appendChild(msgEl);

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLog() {
  const logContainer = document.getElementById('admin-log');
  if (!logContainer) return;
  logContainer.textContent = '';
  const cleared = document.createElement('div');
  cleared.style.color = '#6b7280';
  cleared.textContent = 'Log cleared. Ready to publish content...';
  logContainer.appendChild(cleared);
}

// ==========================================
// B2) SECURITY HELPERS
// ==========================================

function sanitizeUrl(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';

  if (raw.startsWith('#')) return raw;

  // Allow data URLs only for images (used in GitHub Pages local publish mode)
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw, window.location.href);
    const protocol = (parsed.protocol || '').toLowerCase();

    // Block dangerous schemes
    if (protocol === 'javascript:' || protocol === 'data:' || protocol === 'vbscript:' || protocol === 'file:') {
      return '';
    }

    // Allow common safe schemes
    if (protocol === 'http:' || protocol === 'https:') {
      return parsed.href;
    }

    return '';
  } catch {
    return '';
  }
}

const PLACEHOLDER_COVER_IMAGE = 'assets/images/placeholder-cover.svg';
const PLACEHOLDER_HERO_IMAGE = 'assets/images/placeholder-hero.svg';

function getPlaceholderForType(type) {
  if (type === 'critic') return PLACEHOLDER_COVER_IMAGE;
  if (type === 'news' || type === 'interview') return PLACEHOLDER_HERO_IMAGE;
  if (type === 'cover') return PLACEHOLDER_COVER_IMAGE;
  return PLACEHOLDER_HERO_IMAGE;
}

function clearAdminLog() {
  clearLog();
  logLine('Admin log cleared', 'info');
}

// ==========================================
// C) TOKEN MANAGEMENT
// ==========================================

function getAdminToken() {
  return localStorage.getItem(CONFIG.ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token) {
  localStorage.setItem(CONFIG.ADMIN_TOKEN_KEY, token);
  logLine('Admin token updated', 'success');
}

// ==========================================
// D) API REQUEST QUEUE
// ==========================================

class APIQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      if (!this.processing) {
        this.process();
      }
    });
  }

  async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { requestFn, resolve, reject } = this.queue.shift();

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    // Rate limit delay
    await new Promise(r => setTimeout(r, CONFIG.RATE_LIMIT_DELAY));
    this.process();
  }
}

const apiQueue = new APIQueue();

// ==========================================
// E) API HELPERS
// ==========================================

async function apiRequest(endpoint, method = 'GET', data = null, retryCount = 0) {
  const url = `${CONFIG.API_BASE}${endpoint}`;
  const token = getAdminToken();

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-ADMIN-TOKEN': token
    }
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();

    // Handle rate limiting
    if (response.status === 429 || (result.error && result.error.includes('rate limit'))) {
      if (retryCount < CONFIG.MAX_RETRIES) {
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, retryCount);
        logLine(`Rate limited. Retrying in ${delay}ms... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`, 'warning');
        await new Promise(r => setTimeout(r, delay));
        return apiRequest(endpoint, method, data, retryCount + 1);
      } else {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }

    if (!response.ok) {
      throw new Error(result.error || `API error: ${response.status}`);
    }

    return result;
  } catch (error) {
    logLine(`API Error: ${error.message}`, 'error');
    throw error;
  }
}

// ==========================================
// E2) STATIC FALLBACK (GitHub Pages)
// ==========================================

let __staticDbCache = null;
let __staticDbCacheAt = 0;

// ==========================================
// E2b) LOCAL PUBLISH (no backend)
// ==========================================

const LOCAL_PUBLISH_STORAGE = {
  items: 'rollingstone_local_items_v1',
  cover: 'rollingstone_local_cover_v1',
  deleted: 'rollingstone_local_deleted_v1'
};

function loadLocalDeletedIds() {
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISH_STORAGE.deleted);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(v => String(v)));
  } catch {
    return new Set();
  }
}

function saveLocalDeletedIds(set) {
  try {
    const arr = Array.from(set || new Set()).map(v => String(v));
    localStorage.setItem(LOCAL_PUBLISH_STORAGE.deleted, JSON.stringify(arr));
    return true;
  } catch {
    return false;
  }
}

function markItemDeletedLocally(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return false;
  const set = loadLocalDeletedIds();
  set.add(safeId);
  return saveLocalDeletedIds(set);
}

function clearItemDeletedLocally(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return false;
  const set = loadLocalDeletedIds();
  if (!set.has(safeId)) return true;
  set.delete(safeId);
  return saveLocalDeletedIds(set);
}

function loadLocalPublishedItems() {
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISH_STORAGE.items);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPublishedItems(items) {
  try {
    localStorage.setItem(LOCAL_PUBLISH_STORAGE.items, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function loadLocalCover() {
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISH_STORAGE.cover);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveLocalCover(cover) {
  try {
    localStorage.setItem(LOCAL_PUBLISH_STORAGE.cover, JSON.stringify(cover));
    return true;
  } catch {
    return false;
  }
}

function mergeItemsPreferFirst(primaryItems, secondaryItems) {
  const out = [];
  const seen = new Set();
  for (const arr of [primaryItems, secondaryItems]) {
    for (const it of (Array.isArray(arr) ? arr : [])) {
      if (!it) continue;
      const id = String(it.id || '');
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(it);
    }
  }
  return out;
}

async function publishToLocalDb(payload) {
  const id = payload.id || `${payload.type || 'item'}_${Date.now()}_${randomId()}`;
  const nowIso = new Date().toISOString();
  const item = {
    ...payload,
    id,
    publishedAt: payload.publishedAt || nowIso,
    status: payload.status || 'published',
    createdAt: payload.createdAt || nowIso,
    updatedAt: nowIso
  };

  const localItems = loadLocalPublishedItems();
  const nextLocalItems = [item, ...localItems];
  const saved = saveLocalPublishedItems(nextLocalItems);

  // Atualiza cache (render imediato)
  const base = __staticDbCache || { version: 1, items: [] };
  __staticDbCache = {
    ...base,
    version: base.version || 1,
    updatedAt: nowIso,
    items: mergeItemsPreferFirst(nextLocalItems, base.items)
  };
  __staticDbCacheAt = Date.now();

  if (!saved) {
    // Pode falhar por quota (imagens em DataURL são grandes)
    logLine('Aviso: não foi possível salvar no localStorage (quota). Vai funcionar só nesta sessão.', 'warning');
  }

  return item;
}

async function updateCoverLocally(coverPayload) {
  const nowIso = new Date().toISOString();
  const cover = {
    type: 'cover',
    issueNumber: String(coverPayload.issueNumber || '').trim(),
    issueDate: String(coverPayload.issueDate || '').trim(),
    description: String(coverPayload.description || '').trim(),
    coverImageUrl: String(coverPayload.coverImageUrl || '').trim(),
    updatedAt: nowIso
  };

  const saved = saveLocalCover(cover);
  if (!saved) {
    logLine('Aviso: não foi possível salvar capa no localStorage (quota). Vai funcionar só nesta sessão.', 'warning');
  }
  return cover;
}

// ==========================================
// E3) GITHUB PUBLISHER (GitHub Pages)
// ==========================================

const GITHUB_STORAGE = {
  token: 'rollingstone_github_token',
  repo: 'rollingstone_github_repo', // owner/repo
  branch: 'rollingstone_github_branch'
};

function getGitHubToken() {
  return localStorage.getItem(GITHUB_STORAGE.token) || '';
}

function getGitHubRepo() {
  return localStorage.getItem(GITHUB_STORAGE.repo) || '';
}

function getGitHubBranch() {
  return localStorage.getItem(GITHUB_STORAGE.branch) || 'main';
}

function ensureGitHubConfig() {
  let repo = getGitHubRepo();
  if (!repo) {
    repo = prompt('GitHub repo (formato: owner/repo) para publicar no Pages:') || '';
    repo = repo.trim();
    if (repo) localStorage.setItem(GITHUB_STORAGE.repo, repo);
  }

  let branch = localStorage.getItem(GITHUB_STORAGE.branch) || '';
  if (!branch) {
    branch = prompt('GitHub branch para publicar (ex: main ou master):', 'main') || '';
    branch = branch.trim();
    if (branch) localStorage.setItem(GITHUB_STORAGE.branch, branch);
  }
  if (!branch) branch = 'main';

  let token = getGitHubToken();
  if (!token) {
    token = prompt('Cole um GitHub token (fine-grained) com permissão de Contents (write) nesse repo:') || '';
    token = token.trim();
    if (token) localStorage.setItem(GITHUB_STORAGE.token, token);
  }

  return { repo, branch, token };
}

function ghApiUrl(repo, contentPath) {
  const safePath = String(contentPath || '').replace(/^\/+/, '');
  return `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(safePath).replace(/%2F/g, '/')}`;
}

async function ghRequest(url, token, options) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    ...(options && options.headers ? options.headers : {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['X-GitHub-Api-Version'] = '2022-11-28';

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (!res.ok) {
    const message = (json && (json.message || json.error)) ? (json.message || json.error) : `GitHub API error: ${res.status}`;
    throw new Error(message);
  }

  return json;
}

function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64FromUtf8String(str) {
  const enc = new TextEncoder();
  return base64FromBytes(enc.encode(String(str)));
}

function parseDataUrlBase64(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function inferExtFromMime(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg';
  if (mt === 'image/png') return 'png';
  if (mt === 'image/webp') return 'webp';
  if (mt === 'image/gif') return 'gif';
  return 'bin';
}

function randomId() {
  if (window.crypto && window.crypto.getRandomValues) {
    const buf = new Uint8Array(8);
    window.crypto.getRandomValues(buf);
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2);
}

async function ghGetFile(repo, branch, token, path) {
  const url = `${ghApiUrl(repo, path)}?ref=${encodeURIComponent(branch)}`;
  return ghRequest(url, token, { method: 'GET' });
}

async function ghPutFile(repo, branch, token, path, contentBase64, message, sha) {
  const url = ghApiUrl(repo, path);
  const body = {
    message,
    content: contentBase64,
    branch
  };
  if (sha) body.sha = sha;

  return ghRequest(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function ghLoadJsonFile(repo, branch, token, path, fallbackValue) {
  try {
    const file = await ghGetFile(repo, branch, token, path);
    const content = String(file && file.content ? file.content : '').replace(/\n/g, '');
    const decoded = atob(content);
    const json = JSON.parse(decoded);
    return { value: json, sha: file.sha };
  } catch (err) {
    // If missing file, allow creating
    return { value: fallbackValue, sha: null };
  }
}

async function publishToGitHubDb(payload) {
  const { repo, branch, token } = ensureGitHubConfig();
  if (!repo || !token) throw new Error('Configuração GitHub incompleta (repo/token).');

  const dbPath = 'data/db.json';
  const { value: db, sha } = await ghLoadJsonFile(repo, branch, token, dbPath, { version: 1, items: [] });
  const items = Array.isArray(db.items) ? db.items : [];

  const id = payload.id || `${payload.type || 'item'}_${Date.now()}_${randomId()}`;
  const nowIso = new Date().toISOString();
  const item = {
    ...payload,
    id,
    publishedAt: payload.publishedAt || nowIso,
    status: payload.status || 'published',
    createdAt: payload.createdAt || nowIso,
    updatedAt: nowIso
  };

  const nextDb = {
    ...db,
    version: db.version || 1,
    updatedAt: nowIso,
    items: [item, ...items]
  };

  const contentBase64 = base64FromUtf8String(JSON.stringify(nextDb, null, 2));
  const msgTitle = payload.type ? String(payload.type).toUpperCase() : 'POST';
  const message = `Publish ${msgTitle}: ${String(payload.headline || payload.album || payload.title || id).slice(0, 60)}`;

  await ghPutFile(repo, branch, token, dbPath, contentBase64, message, sha);

  // Atualiza cache local (para render imediato, sem esperar rebuild do Pages)
  __staticDbCache = nextDb;
  __staticDbCacheAt = Date.now();

  return item;
}

async function updateCoverOnGitHub(coverPayload) {
  const { repo, branch, token } = ensureGitHubConfig();
  if (!repo || !token) throw new Error('Configuração GitHub incompleta (repo/token).');

  const coverPath = 'data/cover.json';
  const { sha } = await ghLoadJsonFile(repo, branch, token, coverPath, null);
  const nowIso = new Date().toISOString();

  const cover = {
    type: 'cover',
    issueNumber: String(coverPayload.issueNumber || '').trim(),
    issueDate: String(coverPayload.issueDate || '').trim(),
    description: String(coverPayload.description || '').trim(),
    coverImageUrl: String(coverPayload.coverImageUrl || '').trim(),
    updatedAt: nowIso
  };

  const contentBase64 = base64FromUtf8String(JSON.stringify(cover, null, 2));
  const message = `Update cover: Issue ${cover.issueNumber}`;
  await ghPutFile(repo, branch, token, coverPath, contentBase64, message, sha);
  return cover;
}

async function uploadImageToGitHubFromDataUrl(filename, dataUrl) {
  const { repo, branch, token } = ensureGitHubConfig();
  if (!repo || !token) throw new Error('Configuração GitHub incompleta (repo/token).');

  const parsed = parseDataUrlBase64(dataUrl);
  if (!parsed) throw new Error('Imagem inválida (DataURL base64).');

  const ext = inferExtFromMime(parsed.mimeType);
  const baseName = String(filename || 'image').replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 40) || 'image';
  const safe = baseName.replace(/\.[a-z0-9]+$/i, '');
  const unique = `${Date.now()}_${randomId()}_${safe}.${ext}`;

  const imgPath = `assets/uploads/${unique}`;
  const message = `Upload image: ${unique}`;
  await ghPutFile(repo, branch, token, imgPath, parsed.base64, message, null);

  // Importante: URL relativa (funciona em project pages: /<repo>/...)
  return `assets/uploads/${unique}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sortByPublishedDesc(a, b) {
  const da = new Date(a?.publishedAt || a?.createdAt || 0).getTime();
  const db = new Date(b?.publishedAt || b?.createdAt || 0).getTime();
  return db - da;
}

async function loadStaticDb() {
  const now = Date.now();
  if (__staticDbCache && (now - __staticDbCacheAt) < 1500) return __staticDbCache;

  let db = null;
  try {
    db = await fetchJson('data/db.json');
  } catch {
    db = { version: 1, items: [] };
  }

  const remoteItems = Array.isArray(db?.items) ? db.items : [];
  const localItems = loadLocalPublishedItems();
  const deleted = loadLocalDeletedIds();
  const merged = mergeItemsPreferFirst(localItems, remoteItems);
  const items = merged.filter(i => i && !deleted.has(String(i.id || '')));

  __staticDbCache = { ...db, items };
  __staticDbCacheAt = now;
  return __staticDbCache;
}

function upsertLocalPublishedItem(payload) {
  const id = String(payload?.id || '').trim();
  if (!id) throw new Error('Missing id for local update');

  const nowIso = new Date().toISOString();
  const nextItem = {
    ...payload,
    id,
    status: payload.status || 'published',
    publishedAt: payload.publishedAt || nowIso,
    createdAt: payload.createdAt || payload.publishedAt || nowIso,
    updatedAt: nowIso
  };

  const localItems = loadLocalPublishedItems();
  const nextLocalItems = [nextItem, ...localItems.filter(it => String(it?.id || '') !== id)];
  const saved = saveLocalPublishedItems(nextLocalItems);

  // Se foi editado, garante que não fica marcado como deletado
  clearItemDeletedLocally(id);

  // Atualiza cache
  const base = __staticDbCache || { version: 1, items: [] };
  __staticDbCache = {
    ...base,
    version: base.version || 1,
    updatedAt: nowIso,
    items: mergeItemsPreferFirst(nextLocalItems, base.items).filter(i => i && !loadLocalDeletedIds().has(String(i.id || '')))
  };
  __staticDbCacheAt = Date.now();

  if (!saved) {
    logLine('Aviso: não foi possível salvar no localStorage (quota). Vai funcionar só nesta sessão.', 'warning');
  }

  return nextItem;
}

function removeLocalPublishedItemById(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return false;
  const localItems = loadLocalPublishedItems();
  const nextLocalItems = localItems.filter(it => String(it?.id || '') !== safeId);
  const saved = saveLocalPublishedItems(nextLocalItems);

  const base = __staticDbCache || { version: 1, items: [] };
  __staticDbCache = {
    ...base,
    items: (Array.isArray(base.items) ? base.items : []).filter(it => String(it?.id || '') !== safeId)
  };
  __staticDbCacheAt = Date.now();
  return saved;
}

async function apiUpdateItem(payload) {
  const result = await apiQueue.add(() => apiRequest('/update', 'POST', payload));
  if (!result?.success) throw new Error(result?.error || 'Update failed');
  return result.item;
}

async function apiDeleteItem(type, id) {
  const result = await apiQueue.add(() => apiRequest('/delete', 'POST', { type, id }));
  if (!result?.success) throw new Error(result?.error || 'Delete failed');
  return result;
}

function getItemDisplayTitle(item) {
  const type = String(item?.type || '');
  if (type === 'critic') return String(item?.album || '');
  if (type === 'news') return String(item?.headline || '');
  if (type === 'interview') return String(item?.title || '');
  if (type === 'chart') return String(item?.chartTitle || '');
  return String(item?.title || item?.headline || item?.album || '');
}

function setAdminEditState(item) {
  if (!item) return;
  ADMIN_EDIT_STATE = {
    id: String(item.id || ''),
    type: String(item.type || ''),
    createdAt: item.createdAt || '',
    publishedAt: item.publishedAt || '',
    item
  };

  const btnId = ADMIN_EDIT_STATE.type === 'critic'
    ? 'critic-btn'
    : ADMIN_EDIT_STATE.type === 'news'
      ? 'news-btn'
      : ADMIN_EDIT_STATE.type === 'interview'
        ? 'interview-btn'
        : ADMIN_EDIT_STATE.type === 'chart'
          ? 'chart-btn'
          : '';

  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) btn.textContent = 'Update';

  logLine(`Edit mode: ${ADMIN_EDIT_STATE.type} (${ADMIN_EDIT_STATE.id})`, 'info');
}

function clearAdminEditState() {
  if (!ADMIN_EDIT_STATE) return;

  const prevType = ADMIN_EDIT_STATE.type;
  ADMIN_EDIT_STATE = null;

  const btnId = prevType === 'critic'
    ? 'critic-btn'
    : prevType === 'news'
      ? 'news-btn'
      : prevType === 'interview'
        ? 'interview-btn'
        : prevType === 'chart'
          ? 'chart-btn'
          : '';

  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) {
    if (prevType === 'critic') btn.textContent = 'Publish Review';
    else if (prevType === 'news') btn.textContent = 'Publish Article';
    else if (prevType === 'interview') btn.textContent = 'Publish Interview';
    else if (prevType === 'chart') btn.textContent = 'Publish';
  }

  logLine('Edit mode cleared', 'info');
}

async function apiOrStaticAllItems() {
  const hasBackend = await detectBackend();
  const types = ['critic', 'news', 'interview', 'chart'];

  if (hasBackend) {
    const chunks = [];
    for (const t of types) {
      try {
        const list = await apiOrStaticList(t);
        chunks.push(Array.isArray(list) ? list : []);
      } catch {
        chunks.push([]);
      }
    }
    return chunks.flat().filter(Boolean).sort(sortByPublishedDesc);
  }

  const db = await loadStaticDb();
  return (Array.isArray(db?.items) ? db.items : [])
    .filter(i => i && types.includes(String(i.type || '')))
    .sort(sortByPublishedDesc);
}

function beginEditFromManager(item) {
  if (!item) return;
  setAdminEditState(item);

  const type = String(item.type || '');
  if (type === 'critic') {
    showAdminPanel('review');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('critic-album', item.album || '');
    set('critic-artist', item.artist || '');
    set('critic-score', item.score != null ? String(item.score) : '');
    set('critic-subheadline', item.subtitle || '');
    set('critic-review', item.content || '');
    set('critic-quote', item.pullQuote || '');
    set('critic-author', item.author || '');
    set('critic-image-url', item.coverImageUrl || '');
    return;
  }

  if (type === 'news') {
    showAdminPanel('news');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('news-category', item.category || '');
    set('news-headline', item.headline || '');
    set('news-subtitle', item.subtitle || '');
    set('news-content', item.content || '');
    set('news-quote', item.pullQuote || '');
    set('news-author', item.author || '');
    set('news-image-url', item.heroImageUrl || '');
    return;
  }

  if (type === 'interview') {
    showAdminPanel('interview');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('interview-guest', item.guest || '');
    set('interview-title', item.title || '');
    set('interview-subtitle', item.subtitle || '');
    set('interview-content', item.content || '');
    set('interview-quote', item.keyQuote || '');
    set('interview-author', item.author || '');
    set('interview-image-url', item.heroImageUrl || '');
    return;
  }

  if (type === 'chart') {
    showAdminPanel('chart');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('chart-title', item.chartTitle || 'The Hot 15');
    set('chart-issue', item.issueNumber != null ? String(item.issueNumber) : '');

    try {
      const iso = item.publishedAt || '';
      if (iso) {
        const d = new Date(iso);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        set('chart-date', `${yyyy}-${mm}-${dd}`);
      }
    } catch {}

    const entries = Array.isArray(item.entries) ? item.entries : [];
    for (let i = 1; i <= 15; i++) {
      const e = entries[i - 1] || {};
      set(`chart-song-${i}`, e.trackTitle ? `${e.trackTitle}${e.artist ? ' - ' + e.artist : ''}` : '');

      const moveEl = document.getElementById(`chart-move-${i}`);
      if (moveEl) moveEl.value = String(e.movement || 'auto');

      const lastEl = document.getElementById(`chart-last-${i}`);
      if (lastEl) lastEl.value = e.lastPosition != null ? String(e.lastPosition) : '';
    }
    return;
  }
}

async function deleteFromManager(item, btnEl) {
  if (!item) return;
  const id = String(item.id || '').trim();
  const type = String(item.type || '').trim();
  if (!id || !type) return;

  const title = getItemDisplayTitle(item);
  const ok = window.confirm(`Apagar este post?\n\n${type.toUpperCase()}: ${title}`);
  if (!ok) return;

  try {
    if (btnEl) {
      btnEl.classList.add('loading');
      btnEl.disabled = true;
    }

    const hasBackend = await detectBackend();
    if (hasBackend) {
      await apiDeleteItem(type, id);
    } else {
      // Remove local copy (se existir) e marca como deletado para esconder o item estático
      removeLocalPublishedItemById(id);
      markItemDeletedLocally(id);
    }

    // Se o item deletado estava em edição, limpa
    if (ADMIN_EDIT_STATE && ADMIN_EDIT_STATE.id === id && ADMIN_EDIT_STATE.type === type) {
      clearAdminEditState();
    }

    await refreshPostsManager();
    loadLatest();
    if (type === 'critic') loadCritics();
    if (type === 'news') loadNews();
    if (type === 'interview') loadInterviews();
    if (type === 'chart') loadCharts();
  } catch (error) {
    logLine(`Delete error: ${error.message}`, 'error');
    alert(`Falha ao apagar: ${error.message}`);
  } finally {
    if (btnEl) {
      btnEl.classList.remove('loading');
      btnEl.disabled = false;
    }
  }
}

async function refreshPostsManager() {
  const listEl = document.getElementById('posts-management-list');
  if (!listEl) return;

  listEl.textContent = '';
  const loading = document.createElement('div');
  loading.className = 'post-item';
  loading.innerHTML = '<div class="post-item-info"><div class="post-item-title">Loading…</div><div class="post-item-meta">Fetching posts</div></div>';
  listEl.appendChild(loading);

  const all = await apiOrStaticAllItems();
  const filter = String(POSTS_MANAGER_FILTER || 'all');
  const items = filter === 'all' ? all : all.filter(it => String(it?.type || '') === filter);

  listEl.textContent = '';

  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'post-item';
    empty.innerHTML = '<div class="post-item-info"><div class="post-item-title">No posts found</div><div class="post-item-meta">Publish something or switch tabs</div></div>';
    listEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'post-item';

    const info = document.createElement('div');
    info.className = 'post-item-info';
    info.style.cursor = 'pointer';
    info.title = 'Clique para editar';

    const title = document.createElement('div');
    title.className = 'post-item-title';
    title.textContent = getItemDisplayTitle(item) || '(Sem título)';

    const meta = document.createElement('div');
    meta.className = 'post-item-meta';
    const type = String(item?.type || '').toUpperCase();
    meta.textContent = `${type} • ${formatDate(item?.publishedAt)}`;

    info.appendChild(title);
    info.appendChild(meta);

    info.addEventListener('click', () => beginEditFromManager(item));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'post-item-delete-btn';
    del.textContent = '×';
    del.title = 'Apagar';
    del.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteFromManager(item, del);
    });

    row.appendChild(info);
    row.appendChild(del);
    fragment.appendChild(row);
  });

  listEl.appendChild(fragment);
}

function setupPostsManager() {
  if (POSTS_MANAGER_READY) return;
  const listEl = document.getElementById('posts-management-list');
  const tabs = document.querySelectorAll('.posts-management-tab-btn');
  if (!listEl || !tabs || tabs.length === 0) return;

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      POSTS_MANAGER_FILTER = String(btn.getAttribute('data-filter') || 'all');
      refreshPostsManager();
    });
  });

  POSTS_MANAGER_READY = true;

  // Backup UI lives inside Posts panel
  setupLocalBackupUI();
}

async function staticList(type) {
  const db = await loadStaticDb();
  return db.items.filter(i => i && i.type === type).sort(sortByPublishedDesc);
}

async function staticItem(type, id) {
  const db = await loadStaticDb();
  return db.items.find(i => i && i.type === type && String(i.id) === String(id)) || null;
}

async function staticLatest(limit = 6) {
  const db = await loadStaticDb();
  return db.items
    .filter(i => i && (i.status || 'published') === 'published')
    .sort(sortByPublishedDesc)
    .slice(0, limit);
}

async function staticCover() {
  const localCover = loadLocalCover();
  if (localCover) return localCover;
  try {
    return await fetchJson('data/cover.json');
  } catch {
    return null;
  }
}

async function apiOrStaticList(type) {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const result = await apiQueue.add(() => apiRequest(`/list?type=${encodeURIComponent(String(type))}`, 'GET'));
    if (result.success && result.items) return result.items;
    return [];
  }
  return staticList(type);
}

async function apiOrStaticItem(type, id) {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const result = await apiQueue.add(() => apiRequest(`/item?id=${encodeURIComponent(String(id))}&type=${encodeURIComponent(String(type))}`, 'GET'));
    if (result.success && result.item) return result.item;
    return null;
  }
  return staticItem(type, id);
}

async function apiOrStaticLatest(limit = 6) {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const result = await apiQueue.add(() => apiRequest(`/latest?limit=${encodeURIComponent(String(limit))}`, 'GET'));
    if (result.success && result.items) return result.items;
    return [];
  }
  return staticLatest(limit);
}

async function apiOrStaticCover() {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const result = await apiQueue.add(() => apiRequest('/cover', 'GET'));
    if (result.success) return result.cover || null;
    return null;
  }
  return staticCover();
}

// ==========================================
// F) IMAGE UPLOAD
// ==========================================

async function uploadImage(fileInput) {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return null;
  }

  const file = fileInput.files[0];
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result;
        logLine(`Uploading image: ${file.name}`, 'info');

        const hasBackend = await detectBackend();
        if (hasBackend) {
          const result = await apiQueue.add(() => 
            apiRequest('/uploadImage', 'POST', {
              filename: file.name,
              data: base64,
              mimeType: file.type
            })
          );

          if (result.success && result.url) {
            logLine(`Image uploaded: ${file.name}`, 'success');
            resolve(result.url);
            return;
          }

          throw new Error('Image upload failed');
        }

        // GitHub Pages (sem backend): usa DataURL (funciona instantâneo, sem commit)
        logLine('Imagem em modo local (DataURL) — pode não persistir se o navegador limpar.', 'warning');
        resolve(String(base64));
      } catch (error) {
        logLine(`Image upload error: ${error.message}`, 'error');
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getImageUrlOrUpload(urlInputId, fileInputId) {
  const urlInput = document.getElementById(urlInputId);
  const fileInput = document.getElementById(fileInputId);

  if (urlInput && urlInput.value.trim()) {
    return Promise.resolve(urlInput.value.trim());
  }

  if (fileInput) {
    return uploadImage(fileInput);
  }

  return Promise.resolve(null);
}

// ==========================================
// G) FIELD VALIDATION
// ==========================================

function validateRequiredFields(fieldMap) {
  const missing = [];
  
  for (const [fieldId, fieldName] of Object.entries(fieldMap)) {
    const element = document.getElementById(fieldId);
    if (!element) continue;
    
    const value = element.value?.trim() || '';
    if (!value) {
      missing.push(fieldName);
    }
  }

  return missing;
}

function showStatus(statusElement, message, type = 'info') {
  if (!statusElement) return;
  
  statusElement.className = `status-message ${type}`;
  statusElement.textContent = message;
  statusElement.style.display = 'block';
  
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 5000);
}

// ==========================================
// H) PUBLISH FUNCTIONS
// ==========================================

async function publishCritic(event) {
  if (event) event.preventDefault();

  const statusEl = document.getElementById('critic-status');
  const submitBtn = document.getElementById('critic-btn');

  try {
    logLine('Starting review publication...', 'info');

    // Validate required fields
    const required = {
      'critic-album': 'Album Title',
      'critic-artist': 'Artist Name',
      'critic-score': 'Score',
      'critic-review': 'Review Content',
      'critic-author': 'Author Name'
    };

    const missing = validateRequiredFields(required);
    if (missing.length > 0) {
      const msg = `Missing required fields: ${missing.join(', ')}`;
      logLine(msg, 'error');
      showStatus(statusEl, msg, 'error');
      return;
    }

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    const edit = (ADMIN_EDIT_STATE && ADMIN_EDIT_STATE.type === 'critic') ? ADMIN_EDIT_STATE : null;

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('critic-image-url', 'critic-image');

    // Build payload
    const payload = {
      type: 'critic',
      ...(edit ? { id: edit.id, createdAt: edit.createdAt || '', publishedAt: edit.publishedAt || '' } : {}),
      album: document.getElementById('critic-album').value.trim(),
      artist: document.getElementById('critic-artist').value.trim(),
      score: parseFloat(document.getElementById('critic-score').value),
      subtitle: document.getElementById('critic-subheadline')?.value.trim() || '',
      content: document.getElementById('critic-review').value.trim(),
      pullQuote: document.getElementById('critic-quote')?.value.trim() || '',
      author: document.getElementById('critic-author').value.trim(),
      coverImageUrl: imageUrl || (edit?.item?.coverImageUrl || ''),
      publishedAt: (edit?.publishedAt || new Date().toISOString()),
      status: 'published'
    };

    // Validate score range
    if (payload.score < 0 || payload.score > 10) {
      throw new Error('Score must be between 0 and 10');
    }

    logLine(`Publishing review: "${payload.album}" by ${payload.artist}`, 'info');

    const hasBackend = await detectBackend();
    if (hasBackend) {
      if (edit) {
        await apiUpdateItem(payload);
      } else {
        const result = await apiQueue.add(() => 
          apiRequest('/publish', 'POST', payload)
        );

        if (!result.success) throw new Error(result.error || 'Publication failed');
      }
    } else {
      if (edit) {
        upsertLocalPublishedItem(payload);
      } else {
        await publishToLocalDb(payload);
      }
    }

    {
      logLine(`Review published successfully: ${payload.album}`, 'success');
      showStatus(statusEl, '✓ Review published successfully!', 'success');
      
      clearAdminEditState();

      // Reset form
      document.getElementById('critic-form').reset();
      const preview = document.getElementById('critic-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh
      setTimeout(() => {
        loadLatest();
        loadCritics();
      }, 500);
    }

  } catch (error) {
    logLine(`Review publication error: ${error.message}`, 'error');
    showStatus(statusEl, `✗ ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }
}

async function publishNews(event) {
  if (event) event.preventDefault();

  const statusEl = document.getElementById('news-status');
  const submitBtn = document.getElementById('news-btn');

  try {
    logLine('Starting news publication...', 'info');

    // Validate required fields
    const required = {
      'news-category': 'Category',
      'news-headline': 'Headline',
      'news-subtitle': 'Subtitle',
      'news-content': 'Content',
      'news-author': 'Author'
    };

    const missing = validateRequiredFields(required);
    if (missing.length > 0) {
      const msg = `Missing required fields: ${missing.join(', ')}`;
      logLine(msg, 'error');
      showStatus(statusEl, msg, 'error');
      return;
    }

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    const edit = (ADMIN_EDIT_STATE && ADMIN_EDIT_STATE.type === 'news') ? ADMIN_EDIT_STATE : null;

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('news-image-url', 'news-image');

    // Build payload
    const payload = {
      type: 'news',
      ...(edit ? { id: edit.id, createdAt: edit.createdAt || '', publishedAt: edit.publishedAt || '' } : {}),
      category: document.getElementById('news-category').value.trim(),
      headline: document.getElementById('news-headline').value.trim(),
      subtitle: document.getElementById('news-subtitle').value.trim(),
      content: document.getElementById('news-content').value.trim(),
      pullQuote: document.getElementById('news-quote')?.value.trim() || '',
      author: document.getElementById('news-author').value.trim(),
      heroImageUrl: imageUrl || (edit?.item?.heroImageUrl || ''),
      publishedAt: (edit?.publishedAt || new Date().toISOString()),
      status: 'published'
    };

    logLine(`Publishing news: "${payload.headline}"`, 'info');

    const hasBackend = await detectBackend();
    if (hasBackend) {
      if (edit) {
        await apiUpdateItem(payload);
      } else {
        const result = await apiQueue.add(() => 
          apiRequest('/publish', 'POST', payload)
        );

        if (!result.success) throw new Error(result.error || 'Publication failed');
      }
    } else {
      if (edit) {
        upsertLocalPublishedItem(payload);
      } else {
        await publishToLocalDb(payload);
      }
    }

    {
      logLine(`News published successfully: ${payload.headline}`, 'success');
      showStatus(statusEl, '✓ News published successfully!', 'success');
      
      clearAdminEditState();

      // Reset form
      document.getElementById('news-form').reset();
      const preview = document.getElementById('news-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh
      setTimeout(() => {
        loadLatest();
        loadNews();
      }, 500);
    }

  } catch (error) {
    logLine(`News publication error: ${error.message}`, 'error');
    showStatus(statusEl, `✗ ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }
}

async function publishInterview(event) {
  if (event) event.preventDefault();

  const statusEl = document.getElementById('interview-status');
  const submitBtn = document.getElementById('interview-btn');

  try {
    logLine('Starting interview publication...', 'info');

    // Validate required fields
    const required = {
      'interview-guest': 'Guest Name',
      'interview-title': 'Title',
      'interview-subtitle': 'Subtitle',
      'interview-content': 'Content',
      'interview-author': 'Author'
    };

    const missing = validateRequiredFields(required);
    if (missing.length > 0) {
      const msg = `Missing required fields: ${missing.join(', ')}`;
      logLine(msg, 'error');
      showStatus(statusEl, msg, 'error');
      return;
    }

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    const edit = (ADMIN_EDIT_STATE && ADMIN_EDIT_STATE.type === 'interview') ? ADMIN_EDIT_STATE : null;

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('interview-image-url', 'interview-image');

    // Build payload
    const payload = {
      type: 'interview',
      ...(edit ? { id: edit.id, createdAt: edit.createdAt || '', publishedAt: edit.publishedAt || '' } : {}),
      guest: document.getElementById('interview-guest').value.trim(),
      title: document.getElementById('interview-title').value.trim(),
      subtitle: document.getElementById('interview-subtitle').value.trim(),
      content: document.getElementById('interview-content').value.trim(),
      keyQuote: document.getElementById('interview-quote')?.value.trim() || '',
      author: document.getElementById('interview-author').value.trim(),
      heroImageUrl: imageUrl || (edit?.item?.heroImageUrl || ''),
      publishedAt: (edit?.publishedAt || new Date().toISOString()),
      status: 'published'
    };

    logLine(`Publishing interview: "${payload.title}"`, 'info');

    const hasBackend = await detectBackend();
    if (hasBackend) {
      if (edit) {
        await apiUpdateItem(payload);
      } else {
        const result = await apiQueue.add(() => 
          apiRequest('/publish', 'POST', payload)
        );

        if (!result.success) throw new Error(result.error || 'Publication failed');
      }
    } else {
      if (edit) {
        upsertLocalPublishedItem(payload);
      } else {
        await publishToLocalDb(payload);
      }
    }

    {
      logLine(`Interview published successfully: ${payload.title}`, 'success');
      showStatus(statusEl, '✓ Interview published successfully!', 'success');
      
      clearAdminEditState();

      // Reset form
      document.getElementById('interview-form').reset();
      const preview = document.getElementById('interview-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh
      setTimeout(() => {
        loadLatest();
        loadInterviews();
      }, 500);
    }

  } catch (error) {
    logLine(`Interview publication error: ${error.message}`, 'error');
    showStatus(statusEl, `✗ ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }
}

async function publishChart(event) {
  if (event) event.preventDefault();

  const statusEl = document.getElementById('chart-status');
  const submitBtn = document.getElementById('chart-btn');

  try {
    logLine('Starting chart publication...', 'info');

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    const chartTitleRaw = document.getElementById('chart-title')?.value?.trim() || '';
    const chartTitle = chartTitleRaw || 'The Hot 15';

    const issueRaw = document.getElementById('chart-issue')?.value?.trim() || '';
    const issueNumber = issueRaw || String(new Date().getFullYear());

    const dateRaw = document.getElementById('chart-date')?.value?.trim() || '';

    const edit = (ADMIN_EDIT_STATE && ADMIN_EDIT_STATE.type === 'chart') ? ADMIN_EDIT_STATE : null;

    const effectivePublishedAt = dateRaw
      ? new Date(`${dateRaw}T00:00:00.000Z`).toISOString()
      : (edit?.publishedAt || new Date().toISOString());

    // Collect song entries
    const entries = [];
    for (let i = 1; i <= 15; i++) {
      const songInput = document.getElementById(`chart-song-${i}`);
      if (!songInput || !songInput.value.trim()) {
        throw new Error(`Song #${i} is required`);
      }

      const value = songInput.value.trim();

      // Prefer separator " - " to avoid breaking titles like "Anti-Hero"
      let trackTitle = '';
      let artist = '';
      const sep = ' - ';
      const idx = value.indexOf(sep);
      if (idx > 0) {
        trackTitle = value.slice(0, idx).trim();
        artist = value.slice(idx + sep.length).trim();
      } else {
        // fallback: split on first '-' if user didn't add spaces
        const idx2 = value.indexOf('-');
        if (idx2 > 0) {
          trackTitle = value.slice(0, idx2).trim();
          artist = value.slice(idx2 + 1).trim();
        }
      }

      if (!trackTitle || !artist) {
        throw new Error(`Song #${i} must be in format: "Title - Artist"`);
      }

      const movementSelect = document.getElementById(`chart-move-${i}`);
      const lastInput = document.getElementById(`chart-last-${i}`);
      const movementRaw = String(movementSelect?.value || 'auto').trim().toLowerCase();
      const lastRaw = String(lastInput?.value || '').trim();
      const lastPosition = lastRaw ? Number(lastRaw) : null;

      const isValidLast = Number.isFinite(lastPosition) && lastPosition > 0;
      let movement = 'new';

      if (movementRaw && movementRaw !== 'auto') {
        movement = movementRaw;
      } else if (isValidLast) {
        if (lastPosition === i) movement = 'same';
        else if (lastPosition > i) movement = 'up';
        else movement = 'down';
      } else {
        movement = 'new';
      }

      entries.push({
        position: i,
        trackTitle,
        artist,
        movement,
        ...(isValidLast ? { lastPosition } : {})
      });
    }

    if (entries.length < 15) {
      throw new Error('Chart must have 15 entries');
    }

    // Build payload
    const payload = {
      type: 'chart',
      ...(edit ? { id: edit.id, createdAt: edit.createdAt || '' } : {}),
      chartTitle,
      issueNumber,
      entries: entries,
      publishedAt: effectivePublishedAt,
      status: 'published'
    };

    logLine(`Publishing chart with ${entries.length} entries`, 'info');

    const hasBackend = await detectBackend();
    if (hasBackend) {
      if (edit) {
        await apiUpdateItem(payload);
      } else {
        const result = await apiQueue.add(() => 
          apiRequest('/publish', 'POST', payload)
        );

        if (!result.success) throw new Error(result.error || 'Publication failed');
      }
    } else {
      if (edit) {
        upsertLocalPublishedItem(payload);
      } else {
        await publishToLocalDb(payload);
      }
    }

    {
      logLine(`Chart published successfully with ${entries.length} entries`, 'success');
      showStatus(statusEl, `✓ Chart published successfully! (${entries.length} songs)`, 'success');
      
      clearAdminEditState();

      // Reset form
      document.getElementById('chart-form').reset();
      
      // Refresh
      setTimeout(() => {
        loadLatest();
        loadCharts();
      }, 500);
    }

  } catch (error) {
    logLine(`Chart publication error: ${error.message}`, 'error');
    showStatus(statusEl, `✗ ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }
}

async function publishCover(event) {
  if (event) event.preventDefault();

  const statusEl = document.getElementById('cover-status');
  const submitBtn = document.getElementById('cover-btn');

  try {
    logLine('Updating cover...', 'info');

    // Validate required fields
    const required = {
      'cover-issue': 'Issue Number',
      'cover-date': 'Issue Date',
      'cover-description': 'Description'
    };

    const missing = validateRequiredFields(required);
    if (missing.length > 0) {
      const msg = `Missing required fields: ${missing.join(', ')}`;
      logLine(msg, 'error');
      showStatus(statusEl, msg, 'error');
      return;
    }

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('cover-image-url', 'cover-image');

    // Build payload
    const payload = {
      type: 'cover',
      issueNumber: document.getElementById('cover-issue').value.trim(),
      issueDate: document.getElementById('cover-date').value.trim(),
      description: document.getElementById('cover-description').value.trim(),
      coverImageUrl: imageUrl || '',
      updatedAt: new Date().toISOString()
    };

    logLine(`Updating cover: Issue ${payload.issueNumber}`, 'info');

    const hasBackend = await detectBackend();
    if (hasBackend) {
      const result = await apiQueue.add(() => 
        apiRequest('/updateCover', 'POST', payload)
      );
      if (!result.success) throw new Error(result.error || 'Update failed');
    } else {
      const cover = await updateCoverLocally(payload);
      updateCoverDisplay(cover);
    }

    logLine(`Cover updated successfully: Issue ${payload.issueNumber}`, 'success');
    showStatus(statusEl, '✓ Cover updated successfully!', 'success');
    
    // Update home page cover display
    updateCoverDisplay(payload);

  } catch (error) {
    logLine(`Cover update error: ${error.message}`, 'error');
    showStatus(statusEl, `✗ ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }
}

// ==========================================
// I) DEMO CONTENT GENERATION
// ==========================================

const DEMO_DATA = {
  critics: [
    {
      album: 'The Tortured Poets Department',
      artist: 'Taylor Swift',
      score: 9.0,
      subtitle: 'A bruised diary in widescreen pop',
      content: 'Swift\'s most introspective work yet explores heartbreak and healing with literary precision. Each track feels like a carefully crafted chapter in an emotional memoir.',
      pullQuote: 'Every chorus reads like a confession.',
      author: 'Rob Sheffield'
    },
    {
      album: 'Cowboy Carter',
      artist: 'Beyoncé',
      score: 10.0,
      subtitle: 'Tradition, rewritten in real time',
      content: 'Beyoncé redefines country music with a bold genre-bending masterpiece that honors tradition while blazing new trails. A cultural landmark.',
      pullQuote: 'A once-in-a-generation pivot that still feels inevitable.',
      author: 'Angie Martoccio'
    },
    {
      album: 'Short n\' Sweet',
      artist: 'Sabrina Carpenter',
      score: 8.0,
      subtitle: 'Pop craft with a wicked grin',
      content: 'Carpenter proves she\'s a pop force to be reckoned with. Clever lyrics meet infectious melodies in this tightly-crafted collection.',
      pullQuote: 'A tight set of hooks that never overstays.',
      author: 'Brittany Spanos'
    }
  ],
  news: [
    {
      category: 'BREAKING',
      headline: 'Kendrick Lamar Surprise Album Drops at Midnight',
      subtitle: 'The Compton rapper releases his most experimental work yet',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `In a move that shocked the music industry, Kendrick Lamar dropped a surprise album at midnight EST — no rollout, no singles, no warning shots.

  Early listens suggest a restless, fractured record that swings between pressure-cooker confessionals and razor-wire social commentary, with production that feels intentionally unfinished in the best way.`,
      pullQuote: 'This is music for the soul, not the algorithm',
      author: 'Marcus Johnson'
    },
    {
      category: 'EXCLUSIVE',
      headline: 'Glastonbury 2026 Lineup Revealed',
      subtitle: 'Festival announces biggest headliners in a decade',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `Glastonbury has unveiled its star-studded 2026 lineup, with Arctic Monkeys, Dua Lipa, and Radiohead confirmed as headliners.

  Organizers say the bill aims to balance legacy names with new-blood breakthroughs, and to keep genre lines pleasantly blurred from the Pyramid to the smallest late-night tent.`,
      pullQuote: 'The most diverse and exciting lineup we\'ve ever assembled',
      author: 'Sarah Mitchell'
    },
    {
      category: 'FEATURE',
      headline: 'Streaming Royalties Under Federal Investigation',
      subtitle: 'Congress examines payment structures after artist complaints',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `The U.S. Senate has launched a formal investigation into streaming platform royalty structures.

  At the center: opaque payout calculations, bundled subscriptions, and the widening gap between record profits and what working artists say actually hits their accounts.`,
      pullQuote: 'The current model exploits creators while tech giants profit',
      author: 'David Chen'
    }
  ],
  interviews: [
    {
      guest: 'Olivia Rodrigo',
      title: 'Olivia Rodrigo on Growing Beyond \'Sour\'',
      subtitle: 'The pop star discusses evolution, heartbreak, and her sophomore album',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `Olivia Rodrigo arrives with the calm of someone who's survived the loudest year of her life — and decided what parts of it are actually worth keeping.

  Q: When you look back at the "Sour" era now, what feels most different about you?

  A: I'm less interested in being perceived as "good" all the time. Back then I wanted everyone to like me — fans, critics, random people online. Now I want to be honest, even if it's messy.

  Q: Does writing still start with a feeling, or a line, or a melody?

  A: Usually a feeling. It's like an itch I can't ignore. Then a line pops out — and I chase it until it's either a song or a diary entry I'll never show anyone.

  Q: You've said heartbreak can be productive. Is that still true?

  A: Unfortunately, yes. But I also don't want to romanticize suffering. I'd love to write the best song of my life because I'm happy and sleeping eight hours.

  Q: What did you learn about your own voice in the studio?

  A: That it's allowed to crack. I used to try to smooth everything out. Now, if there's a take where my voice breaks and it feels true, I'd rather keep that than a perfect one.

  Q: What's the biggest misconception people have about pop stars your age?

  A: That everything is curated. Sometimes I'm just a 21-year-old eating cereal and spiraling about a text message.

  Q: How do you protect your private life while still writing honestly?

  A: I write from my perspective, but I'm careful about details. The truth is in the emotion, not in naming every person and timestamp.

  Q: Do you ever miss anonymity?

  A: All the time. I miss being invisible in a coffee shop. But I'm grateful, too. It's complicated.

  Q: What does "growing up" sound like on record for you?

  A: More space. More restraint. Fewer exclamation points. And letting the ugly feelings sit next to the pretty ones.

  Q: Is there a lyric you've written that still scares you a little?

  A: Yes — the ones that are the most plain. When you don't hide behind metaphor, it's terrifying.

  Q: What do you want listeners to feel when the album ends?

  A: Like they've been inside someone's head for an hour — and that it made them feel less alone in theirs.`,
      keyQuote: 'I just make music that feels true to me',
      author: 'Jennifer Lopez'
    },
    {
      guest: 'Jack Antonoff',
      title: 'Jack Antonoff: The Man Behind the Hits',
      subtitle: 'The super-producer opens up about collaboration and creativity',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `Jack Antonoff has produced albums for Taylor Swift, Lana Del Rey, and The 1975.

  He talks about building trust in the room, chasing accidents, and why the best takes sometimes happen when everyone stops trying to be impressive.`,
      keyQuote: 'Every artist deserves a unique sonic fingerprint',
      author: 'Tom Harrison'
    },
    {
      guest: 'Dua Lipa',
      title: 'Dua Lipa\'s Disco Revolution Continues',
      subtitle: 'The pop icon discusses her upcoming world tour and new music',
      heroImageUrl: 'assets/images/placeholder-hero.svg',
    content: `Dua Lipa brought disco back to the mainstream with "Future Nostalgia".

  She breaks down the choreography-as-storytelling mindset, the joy of rehearsal, and the pressure (and thrill) of making music that's built for a big room.`,
      keyQuote: 'Music should make you move and feel alive',
      author: 'Rachel Green'
    }
  ]
};

async function runTestPublish(itemsPerSection = 1) {
  logLine(`Starting test publish: ${itemsPerSection} item(s) per section`, 'info');
  demoLogLine(`Starting test publish: ${itemsPerSection} item(s) per section`, 'info');
  
  const demoManager = document.getElementById('demo-manager');
  if (demoManager) demoManager.style.display = 'block';

  const progressBar = document.getElementById('demo-progress-bar');
  const progressContainer = document.getElementById('demo-progress');
  if (progressContainer) progressContainer.classList.add('active');

  let completed = 0;
  const total = itemsPerSection * 4; // 4 sections

  function updateProgress() {
    completed++;
    const percent = Math.round((completed / total) * 100);
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
      progressBar.textContent = `${percent}%`;
    }
  }

  try {
    const hasBackend = await detectBackend();

    async function publishSmart(payload) {
      if (hasBackend) {
        const result = await apiQueue.add(() => apiRequest('/publish', 'POST', payload));
        if (!result || result.success !== true) {
          throw new Error(result?.error || 'Publication failed');
        }
        return result.item || null;
      }

      await publishToLocalDb(payload);
      return null;
    }

    // Publish Critics
    logLine('Publishing demo critics...', 'info');
    demoLogLine('Publishing demo critics...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.critics.length; i++) {
      const data = DEMO_DATA.critics[i];
      const payload = {
        ...data,
        type: 'critic',
        isDemo: true,
        publishedAt: new Date().toISOString(),
        status: 'published'
      };
      await publishSmart(payload);
      logLine(`✓ Published critic: ${data.album}`, 'success');
      demoLogLine(`✓ Published critic: ${data.album}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish News
    logLine('Publishing demo news...', 'info');
    demoLogLine('Publishing demo news...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.news.length; i++) {
      const data = DEMO_DATA.news[i];
      const payload = {
        ...data,
        type: 'news',
        isDemo: true,
        publishedAt: new Date().toISOString(),
        status: 'published'
      };
      await publishSmart(payload);
      logLine(`✓ Published news: ${data.headline}`, 'success');
      demoLogLine(`✓ Published news: ${data.headline}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish Interviews
    logLine('Publishing demo interviews...', 'info');
    demoLogLine('Publishing demo interviews...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.interviews.length; i++) {
      const data = DEMO_DATA.interviews[i];
      const payload = {
        ...data,
        type: 'interview',
        isDemo: true,
        publishedAt: new Date().toISOString(),
        status: 'published'
      };
      await publishSmart(payload);
      logLine(`✓ Published interview: ${data.title}`, 'success');
      demoLogLine(`✓ Published interview: ${data.title}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish Charts
    logLine('Publishing demo charts...', 'info');
    demoLogLine('Publishing demo charts...', 'info');
    for (let i = 0; i < itemsPerSection; i++) {
      const entries = [
        { position: 1, trackTitle: 'Cruel Summer', artist: 'Taylor Swift', movement: 'up' },
        { position: 2, trackTitle: 'Paint The Town Red', artist: 'Doja Cat', movement: 'down' },
        { position: 3, trackTitle: 'Vampire', artist: 'Olivia Rodrigo', movement: 'up' },
        { position: 4, trackTitle: 'Snooze', artist: 'SZA', movement: 'new' },
        { position: 5, trackTitle: 'greedy', artist: 'Tate McRae', movement: 'down' },
        { position: 6, trackTitle: 'Flowers', artist: 'Miley Cyrus', movement: 'up' },
        { position: 7, trackTitle: 'Anti-Hero', artist: 'Taylor Swift', movement: 'new' },
        { position: 8, trackTitle: 'Calm Down', artist: 'Rema & Selena Gomez', movement: 'down' },
        { position: 9, trackTitle: 'Kill Bill', artist: 'SZA', movement: 'up' },
        { position: 10, trackTitle: 'Just Wanna Rock', artist: 'Lil Uzi Vert', movement: 'new' },
        { position: 11, trackTitle: 'Espresso', artist: 'Sabrina Carpenter', movement: 'up' },
        { position: 12, trackTitle: 'Too Sweet', artist: 'Hozier', movement: 'down' },
        { position: 13, trackTitle: 'Stick Season', artist: 'Noah Kahan', movement: 'same' },
        { position: 14, trackTitle: 'Houdini', artist: 'Dua Lipa', movement: 'new' },
        { position: 15, trackTitle: 'Red Wine Supernova', artist: 'Chappell Roan', movement: 'up' }
      ];

      const chartPayload = {
        type: 'chart',
        chartTitle: 'The Hot 15',
        issueNumber: new Date().getFullYear(),
        date: new Date().toISOString(),
        entries: entries,
        isDemo: true,
        publishedAt: new Date().toISOString(),
        status: 'published'
      };

      await publishSmart(chartPayload);
      logLine(`✓ Chart published: ${chartPayload.chartTitle} (${entries.length} entries)`, 'success');
      demoLogLine(`✓ Chart published: ${chartPayload.chartTitle} (${entries.length} entries)`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    logLine('✅ Demo publish completed successfully!', 'success');
    demoLogLine('✅ Demo publish completed successfully!', 'success');
    
    // Hide progress bar after delay
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.remove('active');
    }, 2000);

    // Refresh all pages
    setTimeout(() => {
      loadCritics();
      loadNews();
      loadInterviews();
      loadCharts();
      updateDemoStats();
    }, 500);

  } catch (error) {
    logLine(`Demo publish error: ${error.message}`, 'error');
    demoLogLine(`Demo publish error: ${error.message}`, 'error');
    if (progressContainer) progressContainer.classList.remove('active');
  }
}

async function seedDemoData() {
  logLine('Seeding demo data (3 items per section)...', 'info');
  await runTestPublish(3);
}

async function deleteDemo() {
  if (!confirm('⚠️ Delete all demo content?')) return;

  logLine('Deleting demo content...', 'info');
  demoLogLine('Deleting demo content...', 'info');

  try {
    const hasBackend = await detectBackend();

    if (hasBackend) {
      const result = await apiQueue.add(() => apiRequest('/deleteDemo', 'POST', {}));
      if (!result || result.success !== true) throw new Error(result?.error || 'Delete failed');
      logLine('✓ Demo content deleted', 'success');
      demoLogLine('✓ Demo content deleted', 'success');
    } else {
      const localItems = loadLocalPublishedItems();
      const before = localItems.length;
      const next = localItems.filter(i => !(i && i.isDemo === true));
      saveLocalPublishedItems(next);

      // Atualiza cache estático
      const base = __staticDbCache || { version: 1, items: [] };
      __staticDbCache = { ...base, items: mergeItemsPreferFirst(next, base.items.filter(i => !(i && i.isDemo === true))) };
      __staticDbCacheAt = Date.now();

      const deleted = before - next.length;
      logLine(`✓ Demo content deleted (local): ${deleted}`, 'success');
      demoLogLine(`✓ Demo content deleted (local): ${deleted}`, 'success');
    }

    updateDemoStats();
    loadCritics();
    loadNews();
    loadInterviews();
    loadCharts();
  } catch (error) {
    logLine(`Delete error: ${error.message}`, 'error');
    demoLogLine(`Delete error: ${error.message}`, 'error');
  }
}

function deleteDemoContent() {
  deleteDemo();
}

async function updateDemoStats() {
  try {
    const hasBackend = await detectBackend();
    let stats = null;

    if (hasBackend) {
      const result = await apiQueue.add(() => apiRequest('/stats?demo=true', 'GET'));
      if (result && result.success && result.stats) stats = result.stats;
    } else {
      const db = await loadStaticDb();
      const demoItems = (db?.items || []).filter(i => i && i.isDemo === true);
      stats = {
        critics: demoItems.filter(i => i.type === 'critic').length,
        news: demoItems.filter(i => i.type === 'news').length,
        interviews: demoItems.filter(i => i.type === 'interview').length,
        charts: demoItems.filter(i => i.type === 'chart').length
      };
    }

    if (!stats) return;

    const { critics = 0, news = 0, interviews = 0, charts = 0 } = stats;

    const criticsEl = document.getElementById('demo-count-critics');
    const newsEl = document.getElementById('demo-count-news');
    const interviewsEl = document.getElementById('demo-count-interviews');
    const chartsEl = document.getElementById('demo-count-charts');

    if (criticsEl) criticsEl.textContent = critics;
    if (newsEl) newsEl.textContent = news;
    if (interviewsEl) interviewsEl.textContent = interviews;
    if (chartsEl) chartsEl.textContent = charts;
  } catch (error) {
    logLine(`Stats update error: ${error.message}`, 'error');
    demoLogLine(`Stats update error: ${error.message}`, 'error');
  }
}

// ==========================================
// J) DEMO MODAL HANDLERS
// ==========================================

function openDemoModal() {
  const overlay = document.getElementById('demo-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    updateDemoStats();
  }
}

function closeDemoModal() {
  const overlay = document.getElementById('demo-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

function closeDemoModalOnOverlay(event) {
  if (event.target.id === 'demo-modal-overlay') {
    closeDemoModal();
  }
}

function selectDemoOption(option) {
  closeDemoModal();
  
  switch(option) {
    case 'single':
      runTestPublish(1);
      break;
    case 'multiple':
      runTestPublish(3);
      break;
    case 'dryrun':
      logLine('Dry run: simulating publish (no actual API calls)', 'info');
      logLine('✓ Would publish 1 critic, 1 news, 1 interview, 1 chart', 'info');
      break;
    case 'reset':
      deleteDemo();
      break;
  }
}

// ==========================================
// K) CONTENT RENDERING
// ==========================================

async function loadCritics() {
  try {
    const items = await apiOrStaticList('critic');
    renderCritics(items);
  } catch (error) {
    logLine(`Load critics error: ${error.message}`, 'error');
  }
}

function renderCritics(critics) {
  const container = document.getElementById('critics-feed');
  if (!container) return;

  if (!critics || critics.length === 0) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.style.color = '#666';
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.textContent = 'No reviews available yet.';
    container.appendChild(empty);
    return;
  }

  container.textContent = '';
  const fragment = document.createDocumentFragment();

  const getScoreTier = (scoreValue) => {
    if (!Number.isFinite(scoreValue)) return { tier: 'poor', label: 'NO SCORE' };
    if (scoreValue >= 8) return { tier: 'excellent', label: 'UNIVERSAL ACCLAIM' };
    if (scoreValue >= 6) return { tier: 'good', label: 'GENERALLY FAVORABLE' };
    if (scoreValue >= 4) return { tier: 'poor', label: 'MIXED' };
    return { tier: 'poor', label: 'NEGATIVE' };
  };

  critics.slice(0, 6).forEach((critic) => {
    const criticId = critic?.id || critic?.__backendId || critic?._id;
    const album = critic?.album || critic?.title || '';
    const artist = critic?.artist || '';
    const scoreValue = Number(critic?.score);
    const scoreDisplay = Number.isFinite(scoreValue) ? scoreValue.toFixed(1) : '';
    const { tier, label } = getScoreTier(scoreValue);
    const coverUrl = sanitizeUrl(critic?.coverImageUrl || critic?.imageUrl || critic?.heroImageUrl) || sanitizeUrl(PLACEHOLDER_COVER_IMAGE);
    const excerpt = critic?.content || critic?.excerpt || '';

    const card = document.createElement('div');
    card.className = 'critic-card-compact';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', album ? `Open review: ${album}` : 'Open review');

    if (criticId) {
      card.addEventListener('click', () => viewCritic(criticId));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          viewCritic(criticId);
        }
      });
    }

    const image = document.createElement('div');
    image.className = `critic-card-compact-image score-${tier}`;

    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = album ? String(album) : 'Album cover';
    image.appendChild(img);

    const overlay = document.createElement('div');
    overlay.className = 'score-badge-compact';
    overlay.innerHTML = `
      <div class="score-number-compact">${escapeHtml(Number.isFinite(scoreValue) ? String(Math.round(scoreValue * 10) / 10) : '')}</div>
      <div class="score-max-compact">OUT OF 10</div>
    `;
    image.appendChild(overlay);

    const info = document.createElement('div');
    info.className = 'critic-card-compact-info';

    const albumEl = document.createElement('div');
    albumEl.className = 'critic-card-compact-album';
    albumEl.textContent = String(album);

    const artistEl = document.createElement('div');
    artistEl.className = 'critic-card-compact-artist';
    artistEl.textContent = String(artist);

    const scoreRow = document.createElement('div');
    scoreRow.className = 'critic-card-compact-score-row';

    const scoreBox = document.createElement('div');
    scoreBox.className = `critic-score-box ${tier}`;
    scoreBox.innerHTML = `<div class="critic-score-box-value">${escapeHtml(scoreDisplay)}</div>`;

    const status = document.createElement('div');
    status.className = `critic-score-status ${tier}`;
    status.textContent = label;

    scoreRow.appendChild(scoreBox);
    scoreRow.appendChild(status);

    const text = document.createElement('div');
    text.className = 'critic-card-compact-text';
    text.textContent = String(excerpt);

    const distribution = document.createElement('div');
    distribution.className = `critic-score-distribution ${tier}`;
    const fill = document.createElement('div');
    fill.className = 'critic-score-distribution-fill';
    fill.style.width = `${Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, (scoreValue / 10) * 100)) : 0}%`;
    distribution.appendChild(fill);

    info.appendChild(albumEl);
    info.appendChild(artistEl);
    info.appendChild(scoreRow);
    info.appendChild(text);

    card.appendChild(image);
    card.appendChild(info);
    card.appendChild(distribution);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

async function loadNews() {
  try {
    const items = await apiOrStaticList('news');
    renderNews(items);
  } catch (error) {
    logLine(`Load news error: ${error.message}`, 'error');
  }
}

function renderNews(newsItems) {
  const container = document.getElementById('news-feed');
  if (!container) return;

  if (!newsItems || newsItems.length === 0) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.style.color = '#666';
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.textContent = 'No news available yet.';
    container.appendChild(empty);
    return;
  }

  container.textContent = '';
  const fragment = document.createDocumentFragment();

  newsItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'news-card-item';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => viewNews(item.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        viewNews(item.id);
      }
    });

    const categoryEl = document.createElement('div');
    categoryEl.className = 'news-card-category';
    categoryEl.textContent = item.category ? String(item.category) : '';

    const headlineEl = document.createElement('div');
    headlineEl.className = 'news-card-headline';
    headlineEl.textContent = item.headline ? String(item.headline) : '';

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'news-card-subtitle';
    subtitleEl.textContent = item.subtitle ? String(item.subtitle) : '';

    const meta = document.createElement('div');
    meta.className = 'news-card-meta';

    const authorEl = document.createElement('span');
    authorEl.textContent = item.author ? String(item.author) : '';

    const dot = document.createElement('span');
    dot.textContent = '•';

    const dateEl = document.createElement('span');
    dateEl.textContent = formatDate(item.publishedAt);

    meta.appendChild(authorEl);
    meta.appendChild(dot);
    meta.appendChild(dateEl);

    card.appendChild(categoryEl);
    card.appendChild(headlineEl);
    card.appendChild(subtitleEl);
    card.appendChild(meta);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

async function loadInterviews() {
  try {
    const items = await apiOrStaticList('interview');
    renderInterviews(items);
  } catch (error) {
    logLine(`Load interviews error: ${error.message}`, 'error');
  }
}

function renderInterviews(interviews) {
  const container = document.getElementById('interviews-feed');
  if (!container) return;

  if (!interviews || interviews.length === 0) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.style.color = '#666';
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.textContent = 'No interviews available yet.';
    container.appendChild(empty);
    return;
  }

  container.textContent = '';
  const fragment = document.createDocumentFragment();

  interviews.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'interview-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => viewInterview(item.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        viewInterview(item.id);
      }
    });

    const label = document.createElement('div');
    label.className = 'interview-label';
    label.textContent = 'INTERVIEW';

    const titleEl = document.createElement('div');
    titleEl.className = 'interview-title';
    titleEl.textContent = item.title ? String(item.title) : '';

    const guestEl = document.createElement('div');
    guestEl.className = 'interview-guest';
    guestEl.textContent = item.guest ? `With ${String(item.guest)}` : '';

    const excerpt = document.createElement('div');
    excerpt.className = 'interview-excerpt';
    excerpt.textContent = item.subtitle ? String(item.subtitle) : '';

    card.appendChild(label);
    card.appendChild(titleEl);
    card.appendChild(guestEl);
    card.appendChild(excerpt);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

async function loadCharts() {
  try {
    const items = await apiOrStaticList('chart');
    if (items && items.length > 0) renderChart(items[0]);
  } catch (error) {
    logLine(`Load charts error: ${error.message}`, 'error');
  }
}

async function loadCover() {
  try {
    const cover = await apiOrStaticCover();
    if (cover) updateCoverDisplay(cover);
  } catch (error) {
    logLine(`Load cover error: ${error.message}`, 'error');
  }
}

async function loadLatest(limit = 6) {
  try {
    const items = await apiOrStaticLatest(limit);
    renderLatest(items);
  } catch (error) {
    logLine(`Load latest error: ${error.message}`, 'error');
  }
}

function renderLatest(items) {
  const container = document.getElementById('latest-grid');
  if (!container) return;

  if (!items || items.length === 0) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.style.color = '#666';
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.textContent = 'No posts available yet.';
    container.appendChild(empty);
    return;
  }

  container.textContent = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const open = () => {
      if (item.type === 'critic') return viewCritic(item.id);
      if (item.type === 'news') return viewNews(item.id);
      if (item.type === 'interview') return viewInterview(item.id);
      if (item.type === 'chart') return showPage('charts');
    };

    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    const imageWrap = document.createElement('div');
    imageWrap.className = 'post-card-image';

    const imageUrl = sanitizeUrl(item.coverImageUrl || item.heroImageUrl) || sanitizeUrl(getPlaceholderForType(item.type));
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = String(item.headline || item.album || item.title || 'Post image');
    imageWrap.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'post-card-meta';
    meta.textContent = `${String(item.type || '').toUpperCase()} • ${formatDate(item.publishedAt)}`;

    const title = document.createElement('div');
    title.className = 'post-card-title';
    title.textContent = item.type === 'critic'
      ? String(item.album || '')
      : item.type === 'news'
        ? String(item.headline || '')
        : item.type === 'interview'
          ? String(item.title || '')
          : String(item.chartTitle || '');

    const excerpt = document.createElement('div');
    excerpt.className = 'post-card-excerpt';
    const baseText = String(item.subtitle || item.content || '');
    const short = baseText.length > 140 ? `${baseText.slice(0, 140).trim()}…` : baseText;
    excerpt.textContent = short;

    card.appendChild(imageWrap);
    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(excerpt);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

function renderChart(chart) {
  const container = document.getElementById('charts-feed');
  if (!container) return;

  const normalizeChart = (raw) => {
    if (!raw) return null;

    const chartTitle = raw.chartTitle || raw.title || 'The Hot 15';
    const publishedAt = raw.publishedAt || raw.date || raw.timestamp;

    let entries = Array.isArray(raw.entries) ? raw.entries : [];

    if ((!entries || entries.length === 0) && typeof raw.content === 'string' && raw.content.trim()) {
      const parts = raw.content.split('|').map(s => s.trim()).filter(Boolean);
      entries = parts.map((line, index) => {
        const separators = [' - ', ' — ', ' – ', ' -', '- '];
        let trackTitle = '';
        let artist = '';

        for (const sep of separators) {
          const idx = line.indexOf(sep);
          if (idx > 0) {
            trackTitle = line.slice(0, idx).trim();
            artist = line.slice(idx + sep.length).trim();
            break;
          }
        }

        if (!trackTitle || !artist) {
          trackTitle = line;
          artist = '';
        }

        return {
          position: index + 1,
          trackTitle,
          artist,
          movement: 'same'
        };
      });
    }

    return { chartTitle, publishedAt, entries };
  };

  const normalized = normalizeChart(chart);

  if (!normalized || !normalized.entries || normalized.entries.length === 0) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'No chart available yet.';
    container.appendChild(empty);
    return;
  }

  const movementIcons = {
    up: '↑',
    down: '↓',
    new: '★',
    same: '—',
    reentry: '↺'
  };

  const movementLabels = {
    up: 'UP',
    down: 'DOWN',
    new: 'NEW',
    same: '—',
    reentry: 'RE'
  };

  container.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'chart-panel';

  const header = document.createElement('div');
  header.className = 'chart-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'chart-header-left';

  const titleEl = document.createElement('div');
  titleEl.className = 'chart-title';
  titleEl.textContent = String(normalized.chartTitle || 'The Hot 15');

  const dateEl = document.createElement('div');
  dateEl.className = 'chart-date';
  dateEl.textContent = formatDate(normalized.publishedAt);

  headerLeft.appendChild(titleEl);
  headerLeft.appendChild(dateEl);

  const headerRight = document.createElement('div');
  headerRight.className = 'chart-header-right';
  headerRight.textContent = 'Top 15';

  header.appendChild(headerLeft);
  header.appendChild(headerRight);

  const list = document.createElement('div');
  list.className = 'chart-list';

  (normalized.entries || []).slice(0, 15).forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'chart-item';

    const number = document.createElement('div');
    number.className = 'chart-number';
    number.textContent = entry.position != null ? String(entry.position) : '';

    const info = document.createElement('div');
    info.className = 'chart-info';

    const song = document.createElement('div');
    song.className = 'chart-song-title';
    song.textContent = entry.trackTitle ? String(entry.trackTitle) : '';

    const artist = document.createElement('div');
    artist.className = 'chart-artist';
    artist.textContent = entry.artist ? String(entry.artist) : '';

    info.appendChild(song);
    info.appendChild(artist);

    const movement = document.createElement('div');
    movement.className = `chart-movement ${entry.movement || ''}`.trim();
    movement.innerHTML = `
      <span class="chart-movement-icon">${escapeHtml(movementIcons[entry.movement] || '—')}</span>
      <span class="chart-movement-label">${escapeHtml(movementLabels[entry.movement] || '—')}</span>
    `;

    item.appendChild(number);
    item.appendChild(info);
    item.appendChild(movement);
    list.appendChild(item);
  });

  wrap.appendChild(header);
  wrap.appendChild(list);
  container.appendChild(wrap);
}

function updateCoverDisplay(coverData) {
  const coverEl = document.getElementById('issue-cover');
  const numberEl = document.getElementById('issue-number');
  const dateEl = document.getElementById('issue-date');
  const descEl = document.getElementById('issue-description');

  if (coverEl) {
    coverEl.textContent = '';
    const coverUrl = sanitizeUrl(coverData?.coverImageUrl) || sanitizeUrl(PLACEHOLDER_COVER_IMAGE);
    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = 'Current Issue';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    coverEl.appendChild(img);
  }
  if (numberEl) numberEl.textContent = coverData.issueNumber;
  if (dateEl) dateEl.textContent = coverData.issueDate;
  if (descEl) descEl.textContent = coverData.description;
}

// ==========================================
// L) NAVIGATION
// ==========================================

function showPage(pageName) {
  console.log(`[NAV] Switching to page: ${pageName}`);
  
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  // Show selected page
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.classList.add('active');
    console.log(`[NAV] Page found and activated: page-${pageName}`);
  } else {
    console.error(`[NAV] Page not found: page-${pageName}`);
  }

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeBtn = document.querySelector(`[data-page="${pageName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Load content for specific pages
  if (pageName === 'critics') loadCritics();
  if (pageName === 'news') loadNews();
  if (pageName === 'interviews') loadInterviews();
  if (pageName === 'charts') loadCharts();
  
  // Run diagnostic and setup admin sidebar when admin page is opened
  if (pageName === 'admin') {
    console.log('%c[ADMIN] Admin page loaded - showing page-admin', 'background: #16a34a; color: white; padding: 2px 6px; font-weight: bold;');
    setTimeout(() => {
      window.diagnoseAdmin();
      setupAdminSidebar();
    }, 100);
  }
}

function showAdminPanel(section) {
  console.log(`[ADMIN] Switching to panel: ${section}`);
  
  // Hide all admin panels
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  // Show selected panel
  const targetPanel = document.getElementById(`admin-panel-${section}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
    console.log(`[ADMIN] Panel activated: admin-panel-${section}`);
  } else {
    console.error(`[ADMIN] Panel not found: admin-panel-${section}`);
  }

  // Update sidebar links
  document.querySelectorAll('.admin-sidebar-link').forEach(link => {
    link.classList.remove('active');
  });

  const activeLink = document.querySelector(`[data-admin-section="${section}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  if (section === 'posts') {
    setupPostsManager();
    setupLocalBackupUI();
    refreshPostsManager();
  }
}

function setupAdminSidebar() {
  const sidebarLinks = document.querySelectorAll('.admin-sidebar-link');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      const section = link.getAttribute('data-admin-section');
      showAdminPanel(section);
    });
  });
  console.log('[ADMIN] Sidebar navigation configured');
}

function viewCritic(id) {
  showPage('critic-review');
  logLine(`Loading critic review: ${id}`, 'info');

  apiOrStaticItem('critic', id).then((item) => {
    if (item) {
      renderCriticReview(item);
    } else {
      throw new Error('Critic review not found');
    }
  }).catch((error) => {
    logLine(`Failed to load critic review: ${error.message}`, 'error');
    const container = document.getElementById('critic-review-wrapper');
    if (container) {
      container.innerHTML = `
        <p style="color: #666; text-align: center; padding: 2rem;">Failed to load review.</p>
      `;
    }
  });
}

function renderCriticReview(review) {
  const container = document.getElementById('critic-review-wrapper');
  if (!container) return;

  const content = String(review.content || review.review || '')
    .trim();

  const paragraphs = content
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean);

  const getScoreTier = (scoreValue) => {
    if (!Number.isFinite(scoreValue)) return { tier: 'poor', label: 'NO SCORE' };
    if (scoreValue >= 8) return { tier: 'excellent', label: 'UNIVERSAL ACCLAIM' };
    if (scoreValue >= 6) return { tier: 'good', label: 'GENERALLY FAVORABLE' };
    if (scoreValue >= 4) return { tier: 'poor', label: 'MIXED' };
    return { tier: 'poor', label: 'NEGATIVE' };
  };

  const scoreValue = Number(review?.score);
  const scoreDisplay = Number.isFinite(scoreValue) ? scoreValue.toFixed(1) : '';
  const { tier, label } = getScoreTier(scoreValue);

  const paragraphsHtml = paragraphs.map((p) => {
    return `<p class="critic-review-paragraph">${escapeHtml(p)}</p>`;
  }).join('');

  const paragraphsHtmlWithDropcap = paragraphs.map((p, index) => {
    const className = index === 0 ? 'critic-review-paragraph first-paragraph' : 'critic-review-paragraph';
    return `<p class="${className}">${escapeHtml(p)}</p>`;
  }).join('');

  const safeCoverUrl = sanitizeUrl(review.coverImageUrl || review.imageUrl || review.heroImageUrl) || sanitizeUrl(PLACEHOLDER_COVER_IMAGE);

  const subtitle = String(review.subtitle || review.subheadline || review.deck || '').trim();
  const pullQuote = String(review.pullQuote || review.quote || '').trim();

  const pullQuoteHtml = pullQuote ? `
    <div class="article-quote-block">
      <p class="article-quote-text">${escapeHtml(pullQuote)}</p>
    </div>
  ` : '';

  const publishedAt = review.publishedAt || review.date || review.timestamp;

  const metascoreHtml = Number.isFinite(scoreValue) ? `
    <div class="critic-review-metascore">
      <div class="critic-review-metascore-label">METASCORE</div>
      <div class="critic-review-metascore-row">
        <div class="critic-score-box ${tier}"><div class="critic-score-box-value">${escapeHtml(scoreDisplay)}</div></div>
        <div class="critic-score-status ${tier}">${escapeHtml(label)}</div>
      </div>
      <div class="critic-review-progress ${tier}" aria-hidden="true">
        <div class="critic-review-progress-fill" style="width:${Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, (scoreValue / 10) * 100)) : 0}%"></div>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="critic-review-header">
      <p class="article-category">ALBUM REVIEW</p>
      <h1 class="critic-review-title">${escapeHtml(review.album || review.title || '')}</h1>
      <p class="critic-review-artist">${escapeHtml(review.artist || '')}</p>
      ${subtitle ? `<p class="critic-review-subheadline">${escapeHtml(subtitle)}</p>` : ''}
      <div class="critic-review-byline">
        <span class="critic-review-byline-author">${escapeHtml(review.author || '')}</span>
        <span class="critic-review-byline-date">• ${escapeHtml(formatDate(publishedAt))}</span>
      </div>
      ${metascoreHtml}
    </div>

    <div class="critic-review-full-image">
      <img src="${escapeHtml(safeCoverUrl)}" alt="${escapeHtml(review.album || review.title || 'Album cover')}">
    </div>

    <div class="critic-review-body">
      ${paragraphsHtmlWithDropcap}
      ${pullQuoteHtml}
    </div>

    <button class="critic-review-end-back-btn" type="button" onclick="backToCritics()">← Back to Critics</button>
  `;
}

// ==========================================
// K) ARTICLE RENDERING
// ==========================================

function renderNewsArticle(article) {
  const container = document.getElementById('news-article-wrapper');
  if (!container) return;

  const headline = String(article.headline || '').trim();
  const subtitle = String(article.subtitle || '').trim();
  const category = String(article.category || 'COVER STORY').trim();
  const author = String(article.author || '').trim();
  const publishedAt = article.publishedAt || article.date || article.timestamp;

  const raw = String(article.content || '').trim();
  const paragraphs = raw
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean);

  const pullQuote = String(article.pullQuote || '').trim();
  const quoteHtml = pullQuote ? `
    <div class="article-dark-quote">
      <p class="article-dark-quote-text">${escapeHtml(pullQuote)}</p>
      ${author ? `<p class="article-dark-quote-attrib">— ${escapeHtml(author)}</p>` : ''}
    </div>
  ` : '';

  const paragraphsHtml = paragraphs.map((p, index) => {
    const className = index === 0 ? 'article-paragraph first-paragraph article-paragraph--dark' : 'article-paragraph article-paragraph--dark';
    if (quoteHtml) {
      if (paragraphs.length === 1 && index === 0) {
        return `<p class="${className}">${escapeHtml(p)}</p>${quoteHtml}`;
      }
      if (paragraphs.length > 1 && index === 1) {
        return `${quoteHtml}<p class="${className}">${escapeHtml(p)}</p>`;
      }
    }
    return `<p class="${className}">${escapeHtml(p)}</p>`;
  }).join('');

  const safeHeroImageUrl = sanitizeUrl(article.heroImageUrl);
  const heroOrPlaceholder = safeHeroImageUrl || sanitizeUrl(PLACEHOLDER_HERO_IMAGE);
  const heroHtml = `
    <div class="article-hero-image article-hero-image--dark">
      <img src="${escapeHtml(heroOrPlaceholder)}" alt="${escapeHtml(headline || 'Article image')}">
    </div>
  `;

  container.innerHTML = `
    <div class="article-dark-surface">
      <button class="article-back-btn article-back-btn--dark" onclick="goToNewsListing()">← Back to News</button>

      <div class="article-dark">
        <div class="article-kicker">
          <span class="article-kicker-accent" aria-hidden="true"></span>
          <span class="article-kicker-text">${escapeHtml(category)}</span>
        </div>

        <h1 class="article-dark-headline">${escapeHtml(headline)}</h1>
        ${subtitle ? `<p class="article-dark-deck">${escapeHtml(subtitle)}</p>` : ''}

        <div class="article-meta article-meta--dark">
          ${author ? `<span class="article-meta-author article-meta-author--dark">${escapeHtml(author)}</span>` : ''}
          ${author ? '<div class="article-meta-divider article-meta-divider--dark"></div>' : ''}
          <span class="article-meta-date article-meta-date--dark">${escapeHtml(formatDate(publishedAt))}</span>
        </div>

        ${heroHtml}

        <div class="article-body article-body--dark">
          ${paragraphsHtml || ''}
          ${(!paragraphsHtml && quoteHtml) ? quoteHtml : ''}
        </div>
      </div>
    </div>
  `;
}

function renderInterviewArticle(article) {
  const container = document.getElementById('interviews-article-wrapper');
  if (!container) return;

  const title = String(article.title || '').trim();
  const subtitle = String(article.subtitle || '').trim();
  const guest = String(article.guest || '').trim();
  const author = String(article.author || '').trim();
  const publishedAt = article.publishedAt || article.date || article.timestamp;

  const raw = String(article.content || '').trim();
  const paragraphs = raw
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean);

  const keyQuote = String(article.keyQuote || '').trim();
  const quoteHtml = keyQuote ? `
    <div class="article-dark-quote">
      <p class="article-dark-quote-text">${escapeHtml(keyQuote)}</p>
      ${guest ? `<p class="article-dark-quote-attrib">— ${escapeHtml(guest)}</p>` : ''}
    </div>
  ` : '';

  const qaRows = [];
  const narrativeParas = [];
  const qRegex = /^Q:\s*/i;
  const aRegex = /^A:\s*/i;

  for (const p of paragraphs) {
    if (qRegex.test(p)) {
      qaRows.push({ kind: 'q', text: p.replace(qRegex, '').trim() });
      continue;
    }

    if (aRegex.test(p)) {
      qaRows.push({ kind: 'a', text: p.replace(aRegex, '').trim() });
      continue;
    }

    narrativeParas.push(p);
  }

  const hasQa = qaRows.length > 0;

  const narrativeHtml = narrativeParas.map((p, index) => {
    const className = index === 0 ? 'article-paragraph first-paragraph article-paragraph--dark' : 'article-paragraph article-paragraph--dark';
    if (quoteHtml) {
      if (narrativeParas.length === 1 && index === 0) {
        return `<p class="${className}">${escapeHtml(p)}</p>${quoteHtml}`;
      }
      if (narrativeParas.length > 1 && index === 1) {
        return `${quoteHtml}<p class="${className}">${escapeHtml(p)}</p>`;
      }
    }
    return `<p class="${className}">${escapeHtml(p)}</p>`;
  }).join('');

  const qaHtml = hasQa ? `
    <div class="article-qa">
      ${qaRows.map(row => `
        <div class="article-qa-row article-qa-row--${row.kind}">
          <div class="article-qa-label">${row.kind.toUpperCase()}</div>
          <div class="article-qa-text">${escapeHtml(row.text)}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const safeHeroImageUrl = sanitizeUrl(article.heroImageUrl);
  const heroOrPlaceholder = safeHeroImageUrl || sanitizeUrl(PLACEHOLDER_HERO_IMAGE);
  const heroHtml = `
    <div class="article-hero-image article-hero-image--dark">
      <img src="${escapeHtml(heroOrPlaceholder)}" alt="${escapeHtml(guest || title || 'Interview image')}">
    </div>
  `;

  container.innerHTML = `
    <div class="article-dark-surface">
      <button class="article-back-btn article-back-btn--dark" onclick="goToInterviewsListing()">← Back to Interviews</button>

      <div class="article-dark">
        <div class="article-kicker">
          <span class="article-kicker-accent" aria-hidden="true"></span>
          <span class="article-kicker-text">IN CONVERSATION</span>
        </div>

        <h1 class="article-dark-headline">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="article-dark-deck">${escapeHtml(subtitle)}</p>` : ''}

        <div class="article-meta article-meta--dark">
          ${(author || guest) ? `<span class="article-meta-author article-meta-author--dark">${escapeHtml(author ? `Interview by ${author}` : guest)}</span>` : ''}
          ${(author || guest) ? '<div class="article-meta-divider article-meta-divider--dark"></div>' : ''}
          <span class="article-meta-date article-meta-date--dark">${escapeHtml(formatDate(publishedAt))}</span>
        </div>

        ${heroHtml}

        <div class="article-body article-body--dark">
          ${narrativeHtml || ''}
          ${(!narrativeHtml && quoteHtml) ? quoteHtml : ''}
          ${qaHtml}
        </div>
      </div>
    </div>
  `;
}

async function viewNews(id) {
  showPage('news-article');
  logLine(`Loading news article: ${id}`, 'info');

  try {
    const item = await apiOrStaticItem('news', id);
    if (item) {
      renderNewsArticle(item);
    } else {
      throw new Error('News article not found');
    }
  } catch (error) {
    logLine(`Failed to load news article: ${error.message}`, 'error');
    const container = document.getElementById('news-article-wrapper');
    if (container) {
      container.innerHTML = `
        <button class="article-back-btn" onclick="goToNewsListing()">← Back to News</button>
        <p style="color: #666; text-align: center; padding: 2rem;">Failed to load article.</p>
      `;
    }
  }
}

async function viewInterview(id) {
  showPage('interviews-article');
  logLine(`Loading interview: ${id}`, 'info');

  try {
    const item = await apiOrStaticItem('interview', id);
    if (item) {
      renderInterviewArticle(item);
    } else {
      throw new Error('Interview not found');
    }
  } catch (error) {
    logLine(`Failed to load interview: ${error.message}`, 'error');
    const container = document.getElementById('interviews-article-wrapper');
    if (container) {
      container.innerHTML = `
        <button class="article-back-btn" onclick="goToInterviewsListing()">← Back to Interviews</button>
        <p style="color: #666; text-align: center; padding: 2rem;">Failed to load interview.</p>
      `;
    }
  }
}

function backToCritics() {
  showPage('critics');
}

function goToNewsListing() {
  showPage('news');
}

function goToInterviewsListing() {
  showPage('interviews');
}

// ==========================================
// M) DIAGNOSTIC FUNCTIONS
// ==========================================

window.diagnoseAdmin = function() {
  console.log('\n%c=== ADMIN DIAGNOSTIC ===', 'background: #dc2626; color: white; padding: 4px 8px; font-weight: bold;');
  
  const requiredElements = [
    'demo-publish-btn',
    'demo-modal-overlay',
    'demo-log',
    'admin-log',
    'demo-manager',
    'news-form',
    'interview-form',
    'chart-form',
    'critic-form',
    'admin-panel-review',
    'admin-panel-news',
    'admin-panel-interview',
    'admin-panel-chart',
    'admin-panel-cover',
    'admin-panel-posts',
    'admin-panel-demo'
  ];

  const results = requiredElements.map(id => {
    const element = document.getElementById(id);
    return {
      ID: id,
      Status: element ? '✓ OK' : '✗ MISSING',
      Element: element ? element.tagName.toLowerCase() : 'N/A'
    };
  });

  console.table(results);
  
  const missing = results.filter(r => r.Status.includes('MISSING'));
  if (missing.length > 0) {
    console.error(`%c${missing.length} element(s) missing!`, 'color: red; font-weight: bold;');
  } else {
    console.log('%cAll elements present ✓', 'color: green; font-weight: bold;');
  }
  
  const sidebarLinks = document.querySelectorAll('.admin-sidebar-link');
  console.log(`Sidebar links found: ${sidebarLinks.length}/7 expected`);
  
  console.log('\nAPI Config:', CONFIG.API_BASE);
  console.log('Admin Token:', CONFIG.ADMIN_TOKEN_KEY, '=', localStorage.getItem(CONFIG.ADMIN_TOKEN_KEY) ? 'SET' : 'NOT SET');
  console.log('\n');
};

// ==========================================
// N) UTILITY FUNCTIONS
// ==========================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

// ==========================================
// O) IMAGE PREVIEW HANDLERS
// ==========================================

function setupImagePreviews() {
  const fileInputs = [
    { input: 'critic-image', preview: 'critic-preview', img: 'critic-preview-img' },
    { input: 'news-image', preview: 'news-preview', img: 'news-preview-img' },
    { input: 'interview-image', preview: 'interview-preview', img: 'interview-preview-img' },
    { input: 'cover-image', preview: 'cover-preview', img: 'cover-preview-img' }
  ];

  fileInputs.forEach(({ input, preview, img }) => {
    const fileInput = document.getElementById(input);
    const previewContainer = document.getElementById(preview);
    const previewImg = document.getElementById(img);

    if (fileInput && previewContainer && previewImg) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            previewImg.src = event.target.result;
            previewContainer.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    }
  });
}

// ==========================================
// P) INITIALIZATION
// ==========================================

function initializeApp() {
  console.log('[BOOT] DOMContentLoaded fired - initializing app');
  logLine('Rolling Stone CMS initialized', 'success');
  logLine(`API Base: ${CONFIG.API_BASE}`, 'info');

  setupDebugOverlay();

  if (isFileProtocol()) {
    logLine('⚠️ Para publicar e manter posts/imagens, rode via backend local (npm start).', 'warning');
  }

  // Setup navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-page');
      if (page) showPage(page);
    });
  });

  // Setup image previews
  setupImagePreviews();

  // Setup admin-only features (safe to call; will no-op if missing)
  setupPostsManager();

  // Load initial content (API quando existe; fallback para JSON no GitHub Pages)
  detectBackend().then((hasBackend) => {
    if (!hasBackend && !isFileProtocol()) {
      logLine('Modo estático detectado (ex.: GitHub Pages). Publicação/upload ficam desabilitados, mas o site carrega de data/db.json.', 'warning');
    }
    loadCover();
    loadLatest();
    loadCritics();
    loadNews();
    loadInterviews();
    loadCharts();
  });

  logLine('Ready to publish content', 'success');
  console.log('[BOOT] App initialization complete');
  console.log('[BOOT] To run diagnostic, open Admin page or call: window.diagnoseAdmin()');
}

// Run initialization when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// ==========================================
// Q) TEST DATA LOADER (Legacy Support)
// ==========================================

function loadTestData(event) {
  if (event) event.preventDefault();
  logLine('Loading test data...', 'info');
  runTestPublish(1);
}
