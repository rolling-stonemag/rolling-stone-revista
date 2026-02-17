# 🌱 Demo Seed Function

Função automática para popular o CMS com conteúdo de demonstração.

## Como Usar

### Opção 1: Botão no Admin Panel
1. Abra o site (`index.html`)
2. Navegue para a página **Admin** (ícone ⚙️)
3. Clique no botão **🌱 Seed Demo** (azul) na seção "Load Test Data"
4. Aguarde o processo completar (exibido no Admin Log)

### Opção 2: Console do Navegador
```javascript
seedDemoData()
```

## O Que Será Publicado

### 📀 Critics (3 itens)
- **The New Abnormal** - The Strokes (4.5★)
- **SOUR** - Olivia Rodrigo (4.0★)
- **Harry's House** - Harry Styles (4.5★)

### 📰 News (3 itens)
- Taylor Swift Announces Massive Stadium Tour
- Beyoncé Drops Surprise Visual Album
- Vinyl Sales Hit 30-Year High

### 🎤 Interviews (2 itens)
- Billie Eilish on Growing Up in Public
- The Weeknd Unveils His Masterplan

### 📊 Charts (1 item)
- **The Hot 15** - 15 músicas incluindo:
  - Anti-Hero - Taylor Swift
  - Flowers - Miley Cyrus
  - Kill Bill - SZA
  - Unholy - Sam Smith & Kim Petras
  - As It Was - Harry Styles
  - (+ 5 mais)

## Comportamento

✓ **Publicação Sequencial**: Delay de 120ms entre cada item  
✓ **Logging Detalhado**: Cada etapa registrada no Admin Log  
✓ **Flag Demo**: Todos os itens marcados com `isDemo: true`  
✓ **Datas Escalonadas**: Itens distribuídos ao longo de vários dias  
✓ **Validação SDK**: Verifica se `window.dataSdk` está disponível  

## Progresso no Admin Log

```
🌱 Starting demo seed process...
📊 Preparing to publish 9 demo items...
📀 Publishing critic 1/3: The New Abnormal
✓ Critic published: The New Abnormal
📀 Publishing critic 2/3: SOUR
✓ Critic published: SOUR
...
🎉 Seed complete! Published 9/9 items
```

## Notas Técnicas

- **Requer SDK**: A função verifica `window.dataSdk` antes de executar
- **Não Modifica UI**: Apenas usa o fluxo de publicação existente
- **Auto-Refresh**: Atualiza a interface automaticamente ao concluir
- **Acesso Global**: Função disponível via `window.seedDemoData()`
