// ==========================================
// ROLLING STONE EDITORIAL CMS
// Static Site with API Backend Integration
// ==========================================

console.log('[BOOT] app.js loaded - timestamp:', new Date().toISOString());

// ==========================================
// A) CONFIGURATION
// ==========================================

const CONFIG = {
  API_BASE: "PASTE_APPS_SCRIPT_URL_HERE", // Replace with your Google Apps Script URL
  ADMIN_TOKEN_KEY: "admin_token",
  RATE_LIMIT_DELAY: 150, // ms between requests
  RETRY_DELAY: 2000, // ms for retry on 429
  MAX_RETRIES: 3
};

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
        } else {
          throw new Error('Image upload failed');
        }
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

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('critic-image-url', 'critic-image');

    // Build payload
    const payload = {
      type: 'critic',
      album: document.getElementById('critic-album').value.trim(),
      artist: document.getElementById('critic-artist').value.trim(),
      score: parseFloat(document.getElementById('critic-score').value),
      content: document.getElementById('critic-review').value.trim(),
      author: document.getElementById('critic-author').value.trim(),
      coverImageUrl: imageUrl || '',
      publishedAt: new Date().toISOString(),
      status: 'published'
    };

    // Validate score range
    if (payload.score < 0 || payload.score > 10) {
      throw new Error('Score must be between 0 and 10');
    }

    logLine(`Publishing review: "${payload.album}" by ${payload.artist}`, 'info');

    // Submit to API
    const result = await apiQueue.add(() => 
      apiRequest('/publish', 'POST', payload)
    );

    if (result.success) {
      logLine(`Review published successfully: ${payload.album}`, 'success');
      showStatus(statusEl, '✓ Review published successfully!', 'success');
      
      // Reset form
      document.getElementById('critic-form').reset();
      const preview = document.getElementById('critic-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh critics page
      setTimeout(() => loadCritics(), 500);
    } else {
      throw new Error(result.error || 'Publication failed');
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

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('news-image-url', 'news-image');

    // Build payload
    const payload = {
      type: 'news',
      category: document.getElementById('news-category').value.trim(),
      headline: document.getElementById('news-headline').value.trim(),
      subtitle: document.getElementById('news-subtitle').value.trim(),
      content: document.getElementById('news-content').value.trim(),
      pullQuote: document.getElementById('news-quote')?.value.trim() || '',
      author: document.getElementById('news-author').value.trim(),
      heroImageUrl: imageUrl || '',
      publishedAt: new Date().toISOString(),
      status: 'published'
    };

    logLine(`Publishing news: "${payload.headline}"`, 'info');

    // Submit to API
    const result = await apiQueue.add(() => 
      apiRequest('/publish', 'POST', payload)
    );

    if (result.success) {
      logLine(`News published successfully: ${payload.headline}`, 'success');
      showStatus(statusEl, '✓ News published successfully!', 'success');
      
      // Reset form
      document.getElementById('news-form').reset();
      const preview = document.getElementById('news-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh news page
      setTimeout(() => loadNews(), 500);
    } else {
      throw new Error(result.error || 'Publication failed');
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

    // Upload image if present
    const imageUrl = await getImageUrlOrUpload('interview-image-url', 'interview-image');

    // Build payload
    const payload = {
      type: 'interview',
      guest: document.getElementById('interview-guest').value.trim(),
      title: document.getElementById('interview-title').value.trim(),
      subtitle: document.getElementById('interview-subtitle').value.trim(),
      content: document.getElementById('interview-content').value.trim(),
      keyQuote: document.getElementById('interview-quote')?.value.trim() || '',
      author: document.getElementById('interview-author').value.trim(),
      heroImageUrl: imageUrl || '',
      publishedAt: new Date().toISOString(),
      status: 'published'
    };

    logLine(`Publishing interview: "${payload.title}"`, 'info');

    // Submit to API
    const result = await apiQueue.add(() => 
      apiRequest('/publish', 'POST', payload)
    );

    if (result.success) {
      logLine(`Interview published successfully: ${payload.title}`, 'success');
      showStatus(statusEl, '✓ Interview published successfully!', 'success');
      
      // Reset form
      document.getElementById('interview-form').reset();
      const preview = document.getElementById('interview-preview');
      if (preview) preview.style.display = 'none';
      
      // Refresh interviews page
      setTimeout(() => loadInterviews(), 500);
    } else {
      throw new Error(result.error || 'Publication failed');
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

    // Collect song entries
    const entries = [];
    for (let i = 1; i <= 10; i++) {
      const songInput = document.getElementById(`chart-song-${i}`);
      if (!songInput || !songInput.value.trim()) {
        throw new Error(`Song #${i} is required`);
      }

      const value = songInput.value.trim();
      const parts = value.split('-').map(p => p.trim());
      
      if (parts.length < 2) {
        throw new Error(`Song #${i} must be in format: "Title - Artist"`);
      }

      entries.push({
        position: i,
        trackTitle: parts[0],
        artist: parts.slice(1).join(' - '),
        movement: i <= 3 ? 'up' : (i <= 6 ? 'down' : (i <= 8 ? 'new' : 'up'))
      });
    }

    if (entries.length < 10) {
      throw new Error('Chart must have at least 10 entries');
    }

    // Build payload
    const payload = {
      type: 'chart',
      chartTitle: 'The Hot 15',
      issueNumber: new Date().getFullYear(),
      entries: entries,
      publishedAt: new Date().toISOString(),
      status: 'published'
    };

    logLine(`Publishing chart with ${entries.length} entries`, 'info');

    // Submit to API
    const result = await apiQueue.add(() => 
      apiRequest('/publish', 'POST', payload)
    );

    if (result.success) {
      logLine(`Chart published successfully with ${entries.length} entries`, 'success');
      showStatus(statusEl, `✓ Chart published successfully! (${entries.length} songs)`, 'success');
      
      // Reset form
      document.getElementById('chart-form').reset();
      
      // Refresh charts page
      setTimeout(() => loadCharts(), 500);
    } else {
      throw new Error(result.error || 'Publication failed');
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

    // Submit to API
    const result = await apiQueue.add(() => 
      apiRequest('/updateCover', 'POST', payload)
    );

    if (result.success) {
      logLine(`Cover updated successfully: Issue ${payload.issueNumber}`, 'success');
      showStatus(statusEl, '✓ Cover updated successfully!', 'success');
      
      // Update home page cover display
      updateCoverDisplay(payload);
    } else {
      throw new Error(result.error || 'Update failed');
    }

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
      content: 'Swift\'s most introspective work yet explores heartbreak and healing with literary precision. Each track feels like a carefully crafted chapter in an emotional memoir.',
      author: 'Rob Sheffield'
    },
    {
      album: 'Cowboy Carter',
      artist: 'Beyoncé',
      score: 10.0,
      content: 'Beyoncé redefines country music with a bold genre-bending masterpiece that honors tradition while blazing new trails. A cultural landmark.',
      author: 'Angie Martoccio'
    },
    {
      album: 'Short n\' Sweet',
      artist: 'Sabrina Carpenter',
      score: 8.0,
      content: 'Carpenter proves she\'s a pop force to be reckoned with. Clever lyrics meet infectious melodies in this tightly-crafted collection.',
      author: 'Brittany Spanos'
    }
  ],
  news: [
    {
      category: 'BREAKING',
      headline: 'Kendrick Lamar Surprise Album Drops at Midnight',
      subtitle: 'The Compton rapper releases his most experimental work yet',
      content: 'In a move that shocked the music industry, Kendrick Lamar dropped a surprise album at midnight EST.',
      pullQuote: 'This is music for the soul, not the algorithm',
      author: 'Marcus Johnson'
    },
    {
      category: 'EXCLUSIVE',
      headline: 'Glastonbury 2026 Lineup Revealed',
      subtitle: 'Festival announces biggest headliners in a decade',
      content: 'Glastonbury has unveiled its star-studded 2026 lineup, with Arctic Monkeys, Dua Lipa, and Radiohead confirmed as headliners.',
      pullQuote: 'The most diverse and exciting lineup we\'ve ever assembled',
      author: 'Sarah Mitchell'
    },
    {
      category: 'FEATURE',
      headline: 'Streaming Royalties Under Federal Investigation',
      subtitle: 'Congress examines payment structures after artist complaints',
      content: 'The U.S. Senate has launched a formal investigation into streaming platform royalty structures.',
      pullQuote: 'The current model exploits creators while tech giants profit',
      author: 'David Chen'
    }
  ],
  interviews: [
    {
      guest: 'Olivia Rodrigo',
      title: 'Olivia Rodrigo on Growing Beyond \'Sour\'',
      subtitle: 'The pop star discusses evolution, heartbreak, and her sophomore album',
      content: 'Three years after "Sour" made her a global phenomenon, Olivia Rodrigo is reflecting on growth.',
      keyQuote: 'I just make music that feels true to me',
      author: 'Jennifer Lopez'
    },
    {
      guest: 'Jack Antonoff',
      title: 'Jack Antonoff: The Man Behind the Hits',
      subtitle: 'The super-producer opens up about collaboration and creativity',
      content: 'Jack Antonoff has produced albums for Taylor Swift, Lana Del Rey, and The 1975.',
      keyQuote: 'Every artist deserves a unique sonic fingerprint',
      author: 'Tom Harrison'
    },
    {
      guest: 'Dua Lipa',
      title: 'Dua Lipa\'s Disco Revolution Continues',
      subtitle: 'The pop icon discusses her upcoming world tour and new music',
      content: 'Dua Lipa brought disco back to the mainstream with "Future Nostalgia".',
      keyQuote: 'Music should make you move and feel alive',
      author: 'Rachel Green'
    }
  ]
};

async function runTestPublish(itemsPerSection = 1) {
  logLine(`Starting test publish: ${itemsPerSection} item(s) per section`, 'info');
  
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
    // Publish Critics
    logLine('Publishing demo critics...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.critics.length; i++) {
      const data = DEMO_DATA.critics[i];
      await apiQueue.add(() => 
        apiRequest('/publish', 'POST', {
          ...data,
          type: 'critic',
          isDemo: true,
          publishedAt: new Date().toISOString(),
          status: 'published'
        })
      );
      logLine(`✓ Published critic: ${data.album}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish News
    logLine('Publishing demo news...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.news.length; i++) {
      const data = DEMO_DATA.news[i];
      await apiQueue.add(() => 
        apiRequest('/publish', 'POST', {
          ...data,
          type: 'news',
          isDemo: true,
          publishedAt: new Date().toISOString(),
          status: 'published'
        })
      );
      logLine(`✓ Published news: ${data.headline}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish Interviews
    logLine('Publishing demo interviews...', 'info');
    for (let i = 0; i < itemsPerSection && i < DEMO_DATA.interviews.length; i++) {
      const data = DEMO_DATA.interviews[i];
      await apiQueue.add(() => 
        apiRequest('/publish', 'POST', {
          ...data,
          type: 'interview',
          isDemo: true,
          publishedAt: new Date().toISOString(),
          status: 'published'
        })
      );
      logLine(`✓ Published interview: ${data.title}`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    // Publish Charts
    logLine('Publishing demo charts...', 'info');
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
        { position: 10, trackTitle: 'Just Wanna Rock', artist: 'Lil Uzi Vert', movement: 'new' }
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

      await apiQueue.add(() => 
        apiRequest('/publish', 'POST', chartPayload)
      );
      logLine(`✓ Chart published: ${chartPayload.chartTitle} (${entries.length} entries)`, 'success');
      updateProgress();
      await new Promise(r => setTimeout(r, 200));
    }

    logLine('✅ Demo publish completed successfully!', 'success');
    
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

  try {
    const result = await apiQueue.add(() => 
      apiRequest('/deleteDemo', 'POST', {})
    );

    if (result.success) {
      logLine('✓ Demo content deleted', 'success');
      updateDemoStats();
      loadCritics();
      loadNews();
      loadInterviews();
      loadCharts();
    } else {
      throw new Error(result.error || 'Delete failed');
    }
  } catch (error) {
    logLine(`Delete error: ${error.message}`, 'error');
  }
}

function deleteDemoContent() {
  deleteDemo();
}

async function updateDemoStats() {
  try {
    const result = await apiQueue.add(() => 
      apiRequest('/stats?demo=true', 'GET')
    );

    if (result.success && result.stats) {
      const { critics = 0, news = 0, interviews = 0, charts = 0 } = result.stats;
      
      const criticsEl = document.getElementById('demo-count-critics');
      const newsEl = document.getElementById('demo-count-news');
      const interviewsEl = document.getElementById('demo-count-interviews');
      const chartsEl = document.getElementById('demo-count-charts');

      if (criticsEl) criticsEl.textContent = critics;
      if (newsEl) newsEl.textContent = news;
      if (interviewsEl) interviewsEl.textContent = interviews;
      if (chartsEl) chartsEl.textContent = charts;
    }
  } catch (error) {
    logLine(`Stats update error: ${error.message}`, 'error');
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
    const result = await apiQueue.add(() => 
      apiRequest('/list?type=critic', 'GET')
    );

    if (result.success && result.items) {
      renderCritics(result.items);
    }
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

  critics.forEach((critic) => {
    const card = document.createElement('div');
    card.className = 'critic-compact-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => viewCritic(critic.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        viewCritic(critic.id);
      }
    });

    const cover = document.createElement('div');
    cover.className = 'critic-compact-cover';

    const coverUrl = sanitizeUrl(critic.coverImageUrl);
    if (coverUrl) {
      const img = document.createElement('img');
      img.src = coverUrl;
      img.alt = critic.album ? String(critic.album) : 'Album cover';
      cover.appendChild(img);
    } else {
      cover.appendChild(document.createTextNode('[Album Cover]'));
    }

    const info = document.createElement('div');
    info.className = 'critic-compact-info';

    const albumEl = document.createElement('div');
    albumEl.className = 'critic-compact-album';
    albumEl.textContent = critic.album ? String(critic.album) : '';

    const artistEl = document.createElement('div');
    artistEl.className = 'critic-compact-artist';
    artistEl.textContent = critic.artist ? String(critic.artist) : '';

    const scoreEl = document.createElement('div');
    scoreEl.className = 'critic-score-badge';
    const score = Number(critic.score);
    scoreEl.dataset.score = String(Number.isFinite(score) ? Math.floor(score) : 0);
    scoreEl.textContent = Number.isFinite(score) ? score.toFixed(1) : '';

    info.appendChild(albumEl);
    info.appendChild(artistEl);
    info.appendChild(scoreEl);

    card.appendChild(cover);
    card.appendChild(info);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

async function loadNews() {
  try {
    const result = await apiQueue.add(() => 
      apiRequest('/list?type=news', 'GET')
    );

    if (result.success && result.items) {
      renderNews(result.items);
    }
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
    const result = await apiQueue.add(() => 
      apiRequest('/list?type=interview', 'GET')
    );

    if (result.success && result.items) {
      renderInterviews(result.items);
    }
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
    const result = await apiQueue.add(() => 
      apiRequest('/list?type=chart', 'GET')
    );

    if (result.success && result.items && result.items.length > 0) {
      renderChart(result.items[0]); // Show latest chart
    }
  } catch (error) {
    logLine(`Load charts error: ${error.message}`, 'error');
  }
}

function renderChart(chart) {
  const container = document.getElementById('charts-feed');
  if (!container) return;

  if (!chart || !chart.entries) {
    container.textContent = '';
    const empty = document.createElement('p');
    empty.style.color = '#666';
    empty.style.textAlign = 'center';
    empty.style.padding = '2rem';
    empty.textContent = 'No chart available yet.';
    container.appendChild(empty);
    return;
  }

  const movementIcons = {
    up: '↑',
    down: '↓',
    new: '★',
    same: '—'
  };

  container.textContent = '';
  const header = document.createElement('div');
  header.className = 'chart-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'chart-title';
  titleEl.textContent = chart.chartTitle ? String(chart.chartTitle) : 'The Hot 15';

  const dateEl = document.createElement('div');
  dateEl.className = 'chart-date';
  dateEl.textContent = formatDate(chart.publishedAt);

  header.appendChild(titleEl);
  header.appendChild(dateEl);

  const list = document.createElement('div');
  list.className = 'chart-list';

  (chart.entries || []).forEach((entry) => {
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
    movement.textContent = movementIcons[entry.movement] || '—';

    item.appendChild(number);
    item.appendChild(info);
    item.appendChild(movement);
    list.appendChild(item);
  });

  container.appendChild(header);
  container.appendChild(list);
}

function updateCoverDisplay(coverData) {
  const coverEl = document.getElementById('issue-cover');
  const numberEl = document.getElementById('issue-number');
  const dateEl = document.getElementById('issue-date');
  const descEl = document.getElementById('issue-description');

  if (coverEl) {
    coverEl.textContent = '';
    const coverUrl = sanitizeUrl(coverData?.coverImageUrl);
    if (coverUrl) {
      const img = document.createElement('img');
      img.src = coverUrl;
      img.alt = 'Current Issue';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      coverEl.appendChild(img);
    } else {
      coverEl.appendChild(document.createTextNode('[Capa da Revista]'));
    }
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
  // Implementation for viewing individual critic review
  showPage('critic-review');
  logLine(`Viewing critic: ${id}`, 'info');
}

// ==========================================
// K) ARTICLE RENDERING
// ==========================================

function renderNewsArticle(article) {
  const container = document.getElementById('news-article-wrapper');
  if (!container) return;

  // Split content into paragraphs
  const paragraphs = article.content
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Build paragraphs HTML with drop cap on first paragraph
  const paragraphsHtml = paragraphs.map((p, index) => {
    const className = index === 0 ? 'article-paragraph first-paragraph' : 'article-paragraph';
    return `<p class="${className}">${escapeHtml(p)}</p>`;
  }).join('');

  // Build pull quote if provided
  let pullQuoteHtml = '';
  if (article.pullQuote && article.pullQuote.trim()) {
    pullQuoteHtml = `
      <div class="article-quote-block">
        <p class="article-quote-text">${escapeHtml(article.pullQuote)}</p>
      </div>
    `;
  }

  // Build quick hits/facts if provided
  let factsHtml = '';
  if (article.quickHits && Array.isArray(article.quickHits) && article.quickHits.length > 0) {
    const factsItems = article.quickHits.map(fact => 
      `<li style="font-family: 'Lora', serif; font-size: 1.05rem; line-height: 1.8; color: #2a2a2a; margin-bottom: 0.5rem;">${escapeHtml(fact)}</li>`
    ).join('');
    factsHtml = `
      <div style="padding: 2rem; background: linear-gradient(to right, rgba(220, 38, 38, 0.04), rgba(220, 38, 38, 0.01)); border-left: 4px solid var(--red); margin: 2rem 0;">
        <h3 style="font-family: 'DM Sans', sans-serif; font-size: 0.85rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--red); font-weight: 800; margin-bottom: 1rem;">Quick Hits</h3>
        <ul style="list-style: disc; padding-left: 1.5rem; margin: 0;">
          ${factsItems}
        </ul>
      </div>
    `;
  }

  // Build related links if provided
  let relatedLinksHtml = '';
  if (article.relatedLinks && Array.isArray(article.relatedLinks) && article.relatedLinks.length > 0) {
    const safeLinks = article.relatedLinks
      .slice(0, 2)
      .map(link => ({
        title: link?.title,
        url: sanitizeUrl(link?.url)
      }))
      .filter(link => Boolean(link.url));

    const linksItems = safeLinks.map(link => 
      `<a href="${escapeHtml(link.url)}" style="display: block; font-family: 'Lora', serif; font-size: 1rem; color: var(--red); text-decoration: none; padding: 0.5rem 0; border-bottom: 1px solid rgba(220, 38, 38, 0.2); transition: all 0.2s;" onmouseover="this.style.paddingLeft='0.5rem'" onmouseout="this.style.paddingLeft='0'">→ ${escapeHtml(link.title)}</a>`
    ).join('');
    relatedLinksHtml = `
      <div style="margin-top: 3rem; padding-top: 2rem; border-top: 2px solid rgba(220, 38, 38, 0.15);">
        <h3 style="font-family: 'DM Sans', sans-serif; font-size: 0.85rem; letter-spacing: 0.15em; text-transform: uppercase; color: #666; font-weight: 800; margin-bottom: 1rem;">Related Stories</h3>
        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
          ${linksItems}
        </div>
      </div>
    `;
  }

  const safeHeroImageUrl = sanitizeUrl(article.heroImageUrl);

  // Assemble full article HTML
  container.innerHTML = `
    <button class="article-back-btn" onclick="goToNewsListing()">← Back to News</button>
    <div style="max-width: 900px; margin: 0 auto; padding: 0 1.5rem;">
      <div style="text-align: center; padding: 3rem 0; margin-bottom: 3rem; border-bottom: 1px solid var(--border);">
        <p class="article-category">${escapeHtml(article.category)}</p>
        <h1 class="article-headline">${escapeHtml(article.headline)}</h1>
        <p class="article-subheadline">${escapeHtml(article.subtitle)}</p>
        <div class="article-meta">
          <span class="article-meta-author">${escapeHtml(article.author)}</span>
          <div class="article-meta-divider"></div>
          <span>${formatDate(article.publishedAt)}</span>
        </div>
      </div>
      ${safeHeroImageUrl ? `
        <div class="article-hero-image">
          <img src="${escapeHtml(safeHeroImageUrl)}" alt="${escapeHtml(article.headline)}">
        </div>
      ` : ''}
      <div class="article-body">
        ${paragraphsHtml}
        ${pullQuoteHtml}
        ${factsHtml}
        ${relatedLinksHtml}
      </div>
    </div>
  `;
}

function renderInterviewArticle(article) {
  const container = document.getElementById('interviews-article-wrapper');
  if (!container) return;

  // Split content into paragraphs
  const paragraphs = article.content
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Build paragraphs HTML with drop cap on first paragraph
  const paragraphsHtml = paragraphs.map((p, index) => {
    const className = index === 0 ? 'article-paragraph first-paragraph' : 'article-paragraph';
    return `<p class="${className}">${escapeHtml(p)}</p>`;
  }).join('');

  // Build key quote if provided
  let keyQuoteHtml = '';
  if (article.keyQuote && article.keyQuote.trim()) {
    keyQuoteHtml = `
      <div class="article-quote-block">
        <p class="article-quote-text">${escapeHtml(article.keyQuote)}</p>
        ${article.guest ? `<p class="article-quote-attribution">${escapeHtml(article.guest)}</p>` : ''}
      </div>
    `;
  }

  // Build quick hits/facts if provided
  let factsHtml = '';
  if (article.quickHits && Array.isArray(article.quickHits) && article.quickHits.length > 0) {
    const factsItems = article.quickHits.map(fact => 
      `<li style="font-family: 'Lora', serif; font-size: 1.05rem; line-height: 1.8; color: #2a2a2a; margin-bottom: 0.5rem;">${escapeHtml(fact)}</li>`
    ).join('');
    factsHtml = `
      <div style="padding: 2rem; background: linear-gradient(to right, rgba(220, 38, 38, 0.04), rgba(220, 38, 38, 0.01)); border-left: 4px solid var(--red); margin: 2rem 0;">
        <h3 style="font-family: 'DM Sans', sans-serif; font-size: 0.85rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--red); font-weight: 800; margin-bottom: 1rem;">Quick Facts</h3>
        <ul style="list-style: disc; padding-left: 1.5rem; margin: 0;">
          ${factsItems}
        </ul>
      </div>
    `;
  }

  // Build related links if provided
  let relatedLinksHtml = '';
  if (article.relatedLinks && Array.isArray(article.relatedLinks) && article.relatedLinks.length > 0) {
    const safeLinks = article.relatedLinks
      .slice(0, 2)
      .map(link => ({
        title: link?.title,
        url: sanitizeUrl(link?.url)
      }))
      .filter(link => Boolean(link.url));

    const linksItems = safeLinks.map(link => 
      `<a href="${escapeHtml(link.url)}" style="display: block; font-family: 'Lora', serif; font-size: 1rem; color: var(--red); text-decoration: none; padding: 0.5rem 0; border-bottom: 1px solid rgba(220, 38, 38, 0.2); transition: all 0.2s;" onmouseover="this.style.paddingLeft='0.5rem'" onmouseout="this.style.paddingLeft='0'">→ ${escapeHtml(link.title)}</a>`
    ).join('');
    relatedLinksHtml = `
      <div style="margin-top: 3rem; padding-top: 2rem; border-top: 2px solid rgba(220, 38, 38, 0.15);">
        <h3 style="font-family: 'DM Sans', sans-serif; font-size: 0.85rem; letter-spacing: 0.15em; text-transform: uppercase; color: #666; font-weight: 800; margin-bottom: 1rem;">Related Interviews</h3>
        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
          ${linksItems}
        </div>
      </div>
    `;
  }

  const safeHeroImageUrl = sanitizeUrl(article.heroImageUrl);

  // Assemble full interview HTML
  container.innerHTML = `
    <button class="article-back-btn" onclick="goToInterviewsListing()">← Back to Interviews</button>
    <div style="max-width: 900px; margin: 0 auto; padding: 0 1.5rem;">
      <div style="text-align: center; padding: 3rem 0; margin-bottom: 3rem; border-bottom: 1px solid var(--border);">
        <p class="article-category">INTERVIEW</p>
        <h1 class="article-headline">${escapeHtml(article.title)}</h1>
        <p class="article-subheadline">${escapeHtml(article.subtitle)}</p>
        <div class="article-meta">
          <span class="article-meta-author">Interview by ${escapeHtml(article.author)}</span>
          <div class="article-meta-divider"></div>
          <span>${formatDate(article.publishedAt)}</span>
        </div>
      </div>
      ${safeHeroImageUrl ? `
        <div class="article-hero-image">
          <img src="${escapeHtml(safeHeroImageUrl)}" alt="${escapeHtml(article.guest)}">
        </div>
      ` : ''}
      <div class="article-body">
        ${paragraphsHtml}
        ${keyQuoteHtml}
        ${factsHtml}
        ${relatedLinksHtml}
      </div>
    </div>
  `;
}

async function viewNews(id) {
  showPage('news-article');
  logLine(`Loading news article: ${id}`, 'info');

  try {
    const result = await apiQueue.add(() => 
      apiRequest(`/item?id=${id}&type=news`, 'GET')
    );

    if (result.success && result.item) {
      renderNewsArticle(result.item);
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
    const result = await apiQueue.add(() => 
      apiRequest(`/item?id=${id}&type=interview`, 'GET')
    );

    if (result.success && result.item) {
      renderInterviewArticle(result.item);
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

  // Setup navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-page');
      if (page) showPage(page);
    });
  });

  // Setup image previews
  setupImagePreviews();

  // Load initial content for home page
  loadCritics();
  loadNews();
  loadInterviews();
  loadCharts();

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
