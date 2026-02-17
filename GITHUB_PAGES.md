# Deploy no GitHub Pages (importante)

GitHub Pages é **somente site estático**. Isso significa:

- ✅ O site pode **exibir** posts e imagens
- ✅ Ele pode **ler** `data/db.json` e `data/cover.json`
- ✅ Você pode **publicar pelo Admin sem commit** usando modo local (no navegador)

## Fluxo recomendado (publicar e subir para o Pages)

1. Rode localmente o CMS completo:
   - `npm install`
   - `npm start`
   - Abra `http://localhost:3000/`

2. Publique pelo Admin (Critics/News/Interviews/Charts/Cover)

3. Atualize o repositório (commit/push) com:
   - `data/db.json`
   - `data/cover.json`
   - `assets/uploads/` (todas as imagens novas)

4. O GitHub Pages vai servir esses arquivos e o site vai carregar de forma automática.

## Publicar no Pages sem commit (modo local)

Quando não existe backend (GitHub Pages), o Admin publica **localmente no navegador**:

- Os posts vão aparecer imediatamente nas páginas (Critics/News/Interviews/Charts)
- As imagens enviadas viram **DataURL** (funciona na hora)
- Tenta salvar no `localStorage`, mas:
   - pode não persistir se o browser limpar dados
   - imagens grandes podem estourar a quota e aí fica “só na sessão”

## Se você quiser persistência de verdade (sem commit)

Aí você precisa de um backend externo (ex.: Supabase/Firebase/Cloudflare Workers/Google Apps Script) e configurar `CONFIG.API_BASE` em [js/app.js](js/app.js).
