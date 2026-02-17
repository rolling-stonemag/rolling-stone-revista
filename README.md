# Rolling Stone Editorial CMS

Static website for managing Rolling Stone editorial content.

## Project Structure

```
/
├── index.html              # Main HTML entry point
├── app.js                  # All JavaScript logic
├── assets/                 # Media assets
│   ├── images/            # General images
│   ├── covers/            # Magazine covers
│   └── icons/             # Icons and small graphics
├── data/                   # JSON data storage (for future use)
│   ├── critics.json       # Album reviews data
│   ├── news.json          # News articles data
│   ├── interviews.json    # Interview articles data
│   └── charts.json        # Chart data
└── styles/                 # Additional stylesheets
    └── optional.css       # Optional custom styles

```

## How to Use

### GitHub Pages (atenção)

GitHub Pages é **estático**. Em produção você consegue **ver** o conteúdo, mas **não consegue publicar** pelo Admin.

Fluxo recomendado:
- Publique localmente com `npm start`
- Faça commit/push de `data/db.json`, `data/cover.json` e `assets/uploads/`

Detalhes em [GITHUB_PAGES.md](GITHUB_PAGES.md).

### Opening the Website

**Option 1: View-only (no publishing)**
- You can open `index.html` directly, but **publishing will not work** (browser cannot write files).

**Option 2: Full CMS (publishing + images + persistence) — Recommended**
1. Install dependencies:
  - `npm install`
2. Start the local backend:
  - `npm start`
3. Open:
  - `http://localhost:3000/`

### Project Features

- **Static HTML**: No build process required
- **Tailwind CSS**: Styling via CDN
- **Organized Structure**: Clean separation of concerns
- **Data Management**: Uses data SDK for content persistence

### Development Notes

- All JavaScript is in `app.js` - no embedded scripts in HTML
- Event handlers are kept minimal in HTML (onclick attributes only)
- CSS is embedded in `index.html` to maintain single-file styling
- Future images should be stored in the `assets/` subdirectories

## Local Data Handling

This project includes a local backend (`server.js`) that persists all content to `data/db.json` and uploads images to `assets/uploads/`.

### How It Works

1. **Automatic Loading**: On page load, the system attempts to load data from `/data` folder
2. **Fallback System**: If SDK is unavailable or returns no data, local JSON files are used
3. **No Layout Changes**: Data is rendered into existing HTML containers
4. **Preserves Design**: Uses existing card layouts and styling

### Data Files

Located in `/data` folder:

- **critics.json** - Album reviews with scores
- **news.json** - News articles with categories
- **interviews.json** - Artist interviews
- **charts.json** - Music charts (Top 5)

### File Format Examples

**Critics:**
```json
{
  "type": "critic",
  "title": "Album Name",
  "artist": "Artist Name",
  "score": "8.5",
  "content": "Review text...",
  "author": "Author Name",
  "date": "2026-02-13T10:00:00.000Z"
}
```

**News:**
```json
{
  "type": "news",
  "category": "Breaking",
  "title": "Headline",
  "subtitle": "Subtitle",
  "content": "Article content...",
  "author": "Author Name",
  "date": "2026-02-13T10:00:00.000Z"
}
```

**Interviews:**
```json
{
  "type": "interview",
  "title": "Interview Title",
  "artist": "Guest Name",
  "content": "Interview content...",
  "author": "Author Name",
  "date": "2026-02-13T10:00:00.000Z"
}
```

**Charts:**
```json
{
  "type": "chart",
  "title": "The Hot 15",
  "content": "Song 1|Song 2|Song 3|Song 4|Song 5",
  "date": "2026-02-13T10:00:00.000Z"
}
```

### Testing Local Data

1. **Start a local server** (required for fetch to work):
   ```bash
   python -m http.server 8000
   # or use Live Server extension in VS Code
   ```

2. **Open test page**: Navigate to `test-local-data.html`
   - This page tests JSON loading independently
   - Shows all loaded data in organized sections
   - Displays any errors

3. **Check main site**: Open `index.html`
   - Data should load automatically
   - Check browser console for loading messages
   - Content appears in respective sections

### Console Messages

When data loads successfully, you'll see:
```
Loading local data from JSON files...
Loaded 11 items from local files
- Critics: 4
- News: 3
- Interviews: 3
- Charts: 1
✓ Local data loaded and rendered successfully
```

### Adding/Editing Data

1. Open the appropriate JSON file in `/data`
2. Add new items following the format
3. Ensure valid JSON syntax
4. Refresh the page to see changes

### Important Notes

- ⚠️ **Publishing requires the backend**: use `http://localhost:3000/`, not `file://`
- ✅ **Automatic**: content loads on page initialization
- ✅ **Persistence**: posts are stored in `data/db.json`
- ✅ **Images**: uploads are saved in `assets/uploads/`

## Important Rules

- **DO NOT** convert to a framework (React, Vue, etc.)
- **DO NOT** change HTML structure or Tailwind classes
- **DO NOT** modify layout, spacing, typography, or visual design
- **KEEP** it as a static website that works by opening index.html

## Tech Stack

- HTML5
- CSS3 (Tailwind CSS via CDN)
- Vanilla JavaScript (ES6+)
- Data SDK for backend integration

## API Controller

The `app.js` file includes a powerful **APIController** module for external API integration.

### Features

#### 1. Sequential Queue System
- Processes requests one at a time
- **120ms** delay between requests
- Prevents API overload

#### 2. Intelligent Retry Logic
- **3 automatic retry attempts**
- **2-second** delay between retries
- Auto-detects rate-limit errors

#### 3. Logging System
- Console logs (always active)
- Visual logs (if `#admin-log-container` exists)
- Timestamps in pt-BR format

#### 4. Structured Payloads

**Critic Review:**
```javascript
{
  type: 'critic',
  album: string,
  artist: string,
  score: number,
  review: string,
  author: string,
  imageData: { base64, size, type },
  timestamp: ISO8601
}
```

**News Article:**
```javascript
{
  type: 'news',
  category: string,
  headline: string,
  subtitle: string,
  content: string,
  quote: string,
  author: string,
  imageData: object,
  timestamp: ISO8601
}
```

**Interview:**
```javascript
{
  type: 'interview',
  title: string,
  subtitle: string,
  guest: string,
  content: string,
  quote: string,
  author: string,
  imageData: object,
  timestamp: ISO8601
}
```

**Chart (Top 5):**
```javascript
{
  type: 'chart',
  title: 'The Hot 15',
  entries: [
    { position: 1, title: string },
    { position: 2, title: string },
    ...
  ],
  timestamp: ISO8601
}
```

### Configuration

Change the API endpoint in `app.js`:

```javascript
const APIController = {
  endpoint: 'https://api.example.com/v1/content', // Update this
  retryAttempts: 3,
  retryDelay: 2000,      // 2 seconds
  queueDelay: 120,       // 120ms
  // ...
};
```

### Retryable Errors

The system automatically retries on:
- Rate limit errors (429)
- Timeouts
- Connection errors (ECONNREFUSED)
- Network failures

### Operation Flow

1. User fills form in admin panel
2. Data sent to local SDK (if available)
3. On success → API payload is built
4. Payload added to request queue
5. Queue processes sequentially with delay
6. On error → automatic retry
7. Logs generated at each step

### Log Types

- `INFO` - Normal operations
- `SUCCESS` - Successful operations
- `WARNING` - Warnings (retries)
- `ERROR` - Errors

### Testing

1. Open browser console
2. Publish content from admin panel
3. Monitor API calls in Network tab
4. Check logs in console

---

**Version:** 1.0.0  
**Last Updated:** February 13, 2026
