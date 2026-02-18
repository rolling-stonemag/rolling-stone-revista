# Rolling Stone Editorial CMS

Site editorial estático (GitHub Pages) com painel Admin que publica conteúdo via **Firebase (Auth + Firestore)** e hospeda imagens no **Cloudinary**.

## Project Structure

```
/
├── index.html              # Main HTML entry point
├── js/app.js               # All JavaScript logic
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

## Como usar

### Produção (GitHub Pages)

- O site roda estático no GitHub Pages.
- Para publicar pelo Admin (e não “sumir”), o projeto usa **Firestore** para texto/dados e **Cloudinary** para imagens.
- O Admin exige login Google (Firebase Auth) e só libera publicação para e-mails permitidos (UI). A segurança real deve ser feita via **Rules** do Firestore.

Detalhes em [GITHUB_PAGES.md](GITHUB_PAGES.md).

### Rodando local (desenvolvimento)

- Use Live Server (VS Code) ou qualquer servidor estático.
- Evite abrir via `file://` para não ter limitações do browser com requests/login.

### Project Features

- **Static HTML**: No build process required
- **Tailwind CSS**: Styling via CDN
- **Organized Structure**: Clean separation of concerns
- **Data Management**: Uses data SDK for content persistence

### Development Notes

- All JavaScript is in `js/app.js` - no embedded scripts in HTML (fora configurações runtime)
- Event handlers are kept minimal in HTML (onclick attributes only)
- CSS fica em `css/styles.css` e `css/admin.css`
- Future images should be stored in the `assets/` subdirectories

## Backend local (legado/opcional)

Ainda existe um backend Node/Express em `server.js`, mas o fluxo principal atual é **Firebase + Cloudinary**.
Se você quiser manter o backend local para testes, ele pode coexistir — porém a documentação e o deploy recomendados estão focados no modo Firebase.

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
