# Deploy no GitHub Pages (modo atual)

O GitHub Pages é estático (serve HTML/CSS/JS), mas o **Admin publica normalmente** porque o projeto usa serviços externos:

- ✅ Textos/dados: **Firestore**
- ✅ Login Admin: **Firebase Auth (Google)**
- ✅ Imagens: **Cloudinary**

## Fluxo recomendado

1. Configure Firebase + Firestore e habilite Google Sign-in.
2. Configure Cloudinary com um `upload_preset` **Unsigned**.
3. No [index.html](index.html), preencha `window.ROLLINGSTONE_FIREBASE` e `window.ROLLINGSTONE_CLOUDINARY`.
4. No Admin, faça login e publique.

## Observação

Se Firebase/Cloudinary não estiverem configurados, o projeto pode entrar em modo “somente leitura” (carregando JSONs de `/data`).
Para persistência real no Pages, mantenha o modo Firebase habilitado.
