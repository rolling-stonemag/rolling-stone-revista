# Deploy do Backend (legado/opcional)

⚠️ Este guia descreve o fluxo antigo com `server.js` (Node/Express). O fluxo principal atual do projeto é:
- Firebase Auth + Firestore (textos/dados)
- Cloudinary (imagens)

Se você ainda quiser rodar um backend Node próprio por algum motivo, este documento continua válido.

O GitHub Pages é **estático** — por isso, quando você publica no Admin em produção, ele cai no modo local (`localStorage`) e pode falhar por **quota** (principalmente por imagens em DataURL). Resultado: o post “some” ao recarregar/navegar.

A solução é publicar o **backend** (o arquivo `server.js`) em um serviço que rode Node.js e apontar o site (GitHub Pages) para esse backend.

## 1) O que este backend faz

- Persiste conteúdo em JSON (`db.json`, `cover.json`)
- Faz upload de imagens e serve em `/assets/uploads/...`
- Exponibiliza endpoints usados pelo Admin:
  - `GET /health`
  - `POST /uploadImage`
  - `POST /publish`
  - `POST /update`
  - `POST /delete`
  - `GET /list?type=news|critic|interview|chart`
  - `GET /item?type=...&id=...`
  - `GET /latest?limit=...`
  - `GET /cover` / `POST /updateCover`

## 2) Variáveis de ambiente (importante)

No serviço onde você subir o backend, configure:

- `ADMIN_TOKEN` (recomendado)
  - Um segredo qualquer (ex.: `minha_senha_forte_123`)
  - O Admin envia isso no header `X-ADMIN-TOKEN`

- `CORS_ORIGIN` (recomendado)
  - Origem permitida a acessar o backend via browser
  - Para o seu Pages, use:
    - `https://matteusgsilva15-hue.github.io`
  - Você pode adicionar múltiplas origens separadas por vírgula.

- `PUBLIC_BASE_URL` (opcional)
  - Base pública do backend (ajuda a formar URLs absolutas de imagem)
  - Ex.: `https://seu-backend.onrender.com`

- `PERSIST_DIR` (recomendado em produção)
  - Diretório persistente do serviço para gravar `db.json` e uploads
  - Ex.: `/var/data` (depende do provedor)

## 3) Exemplo de deploy no Render (recomendado)

1. Crie um **New Web Service** a partir do seu GitHub repo.
2. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Adicione um **Persistent Disk** (para não perder posts/imagens em redeploy):
   - Mount Path: `/var/data`
4. Environment Variables:
   - `ADMIN_TOKEN` = (seu token)
   - `CORS_ORIGIN` = `https://matteusgsilva15-hue.github.io`
   - `PERSIST_DIR` = `/var/data`
   - `PUBLIC_BASE_URL` = (URL do serviço no Render)

Quando estiver no ar, teste:
- `https://SEU_BACKEND/health` deve retornar `{ success: true, ok: true }`

## 4) Como apontar o site (GitHub Pages) para o backend

O front-end lê `API_BASE` de duas formas sem precisar rebuild:

### Opção A) Por querystring (mais fácil)
Abra seu site com:

- `https://matteusgsilva15-hue.github.io/rolling-stone-revista/?api=https://SEU_BACKEND`

Isso salva em `localStorage` e passa a usar o backend.

### Opção B) Pelo console do navegador
No DevTools (F12), rode:

```js
localStorage.setItem('rollingstone_api_base', 'https://SEU_BACKEND');
location.reload();
```

## 5) Observações

- Se você ficar no modo estático (sem backend), imagens em DataURL quase sempre estouram a quota do `localStorage` em algum momento.
- Em produção, **use backend + uploads** para manter múltiplas notícias e imagens persistentes.
