# Quick Start - Firebase + Cloudinary (Persistência real no GitHub Pages)

Este projeto foi ajustado para funcionar em produção (GitHub Pages) com:
- **Firebase Auth (Google)** para login do Admin
- **Firestore** para salvar textos/dados
- **Cloudinary** para hospedar imagens (free tier)

## 🚀 Rodar localmente

1. Abra o projeto com um servidor estático (recomendado):
  - VS Code: Live Server em `index.html`
  - ou `python -m http.server`

2. Evite abrir via `file://` (pode causar limitações em login/requests).

## ✅ Checklist de configuração

No final do [index.html](index.html) existem dois blocos de config:

- `window.ROLLINGSTONE_FIREBASE`
  - `allowedEmails`: lista de e-mails que podem publicar
- `window.ROLLINGSTONE_CLOUDINARY`
  - `cloudName`, `uploadPreset` (Unsigned) e `folder`

Se esses valores estiverem corretos e o Firestore estiver ativo, o Admin publica e o conteúdo não some após atualizar.

**Check the Pages:**
- **Home** → Should show mixed content from all sections
- **Critics** → 4 album reviews
- **News** → 3 news articles  
- **Interviews** → 3 interviews
- **Charts** → Top 5 songs

### 4. Test Page

Open `test-local-data.html` to see all loaded data in a clean test interface.

## 🔐 Importante (segurança)

O “bloqueio” por e-mail no Admin é UX. Para segurança real, aplique Rules no Firestore para permitir escrita apenas do seu e-mail.

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

## 🔧 Como funciona (resumo)

1. Admin faz login via Google (Firebase Auth)
2. Textos vão para o Firestore
3. Imagens sobem para o Cloudinary e viram URLs públicas
4. Páginas públicas leem do Firestore e renderizam

## ⚠️ Troubleshooting

### "No data appears"
- ✅ Make sure you're using `http://localhost`, NOT `file://`
- ✅ Check browser console for errors
- ✅ Verify JSON files are valid (use jsonlint.com)

### Publicar não funciona
- Confira se você está logado com um e-mail presente em `allowedEmails`
- Se aparecer `permission-denied`, ajuste as Rules do Firestore
- Se upload falhar, confira `cloudName` e se o `uploadPreset` está como **Unsigned**

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

**Status**: ✅ Pronto para usar
