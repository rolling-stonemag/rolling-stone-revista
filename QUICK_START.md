# Quick Start Guide - CMS Local (Persistência + Upload)

## ✅ Pronto para usar

Seu Rolling Stone CMS agora roda com um **backend local** que:
- Persiste posts em `data/db.json`
- Faz upload de imagens para `assets/uploads/`

## 🚀 How to Test

### 1. Instale e rode o backend

```bash
cd "C:\Users\gphot\Documents\Rolling stone Revista"
npm install
npm start
```

### 2. Abra o site

Navegue para: `http://localhost:3000/`

### 3. Verify Loading

**Check Console (F12):**
You should see:
```
Loading local data from JSON files...
Loaded 11 items from local files
- Critics: 4
- News: 3
- Interviews: 3
- Charts: 1
✓ Local data loaded and rendered successfully
```

**Check the Pages:**
- **Home** → Should show mixed content from all sections
- **Critics** → 4 album reviews
- **News** → 3 news articles  
- **Interviews** → 3 interviews
- **Charts** → Top 5 songs

### 4. Test Page

Open `test-local-data.html` to see all loaded data in a clean test interface.

## 📁 Onde fica salvo

```
/data/db.json         ← Banco local (posts publicados)
/data/cover.json      ← Capa atual
/assets/uploads/      ← Imagens enviadas
```

## ✏️ How to Add More Content

### Add a Critic Review:

1. Open `data/critics.json`
2. Add new entry:
```json
{
  "type": "critic",
  "title": "Album Name",
  "artist": "Artist Name",
  "score": "8.5",
  "content": "Your review text here...",
  "author": "Your Name",
  "image_id": "none",
  "date": "2026-02-13T10:00:00.000Z",
  "__backendId": "critic_005"
}
```
3. Save and refresh browser

### Add News Article:

1. Open `data/news.json`
2. Add entry following existing format
3. Save and refresh

**Same process for interviews and charts!**

## 🔧 Como funciona

1. **Backend** serve o `index.html` e arquivos estáticos
2. **Admin** publica via endpoints (`/publish`, `/uploadImage`, etc.)
3. **Persistência** grava no disco e recarrega na UI

## ⚠️ Troubleshooting

### "No data appears"
- ✅ Make sure you're using `http://localhost`, NOT `file://`
- ✅ Check browser console for errors
- ✅ Verify JSON files are valid (use jsonlint.com)

### "CORS error" / nada publica
- ✅ Use `npm start` e abra `http://localhost:3000/`
- ✅ Não publique via `file://` (não tem backend)

### "JSON syntax error"
- ✅ Check for missing commas between objects
- ✅ Ensure all strings use double quotes
- ✅ Validate JSON syntax online

## 📊 Current Data Count

- **Critics**: 4 reviews
- **News**: 3 articles
- **Interviews**: 3 interviews
- **Charts**: 1 chart (5 songs)
- **Total**: 11 items

## 🎯 What Changed

### Files Modified:
- ✅ `app.js` - Added LocalDataLoader module
- ✅ `data/*.json` - Filled with sample content

### Files Created:
- ✅ `test-local-data.html` - Testing interface
- ✅ `QUICK_START.md` - This guide

### What Stayed the Same:
- ✅ HTML layout (unchanged)
- ✅ CSS classes (unchanged)  
- ✅ Visual design (identical)
- ✅ User interface (same)

## 🔄 Next Steps

1. **Test** → Open site and verify data loads
2. **Customize** → Edit JSON files with your content
3. **Expand** → Add more entries as needed
4. **Deploy** → Later integrate with real API

## 💡 Tips

- Keep JSON files well-formatted for easy editing
- Use ISO 8601 date format: `2026-02-13T10:00:00.000Z`
- Increment `__backendId` for new items: `critic_005`, `news_004`, etc.
- Check console logs to debug loading issues
- Use `test-local-data.html` to verify JSON before checking main site

---

**Status**: ✅ Ready to use  
**Data Source**: Local JSON files (`/data` folder)  
**Server Required**: Yes (for fetch API)  
**Layout Changed**: No (preserved exactly)
