# Assistente de Live Shopee — Pedidos por ID (Recurso A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar IDs `AAA-BBB-CCC` pedidos no chat da live em produtos marcados na sacola, em lote, com o apresentador clicando na busca da Shopee a cada ID.

**Architecture:** Três peças MV3: painel na página da live (seleção do chat, lista do lote, marcar produtos), "mão" em `shopee.com.br` (cola o ID, favorita) e um coordenador em service worker que guarda o lote em `chrome.storage.session`, abre/fecha a Shopee e traz a live de volta. Lógica pura (IDs, lote, casamento de nomes, coordenador) em módulos testados com `node --test`; DOM verificado por e2e e por uma live real de teste.

**Tech Stack:** JavaScript sem empacotador (scripts no formato `SLA.*`, como hoje), Chrome MV3, `node --test`, Playwright (e2e, opcional via `PLAYWRIGHT_PATH`).

**Spec:** `docs/superpowers/specs/2026-11-03-shopee-live-pedidos-por-id-e-painel-design.md` (Recurso B — painel da sacola — terá plano próprio).

## Global Constraints

- Formato do ID: 3 letras, hífen, 3 letras, hífen, 3 letras; maiúsculas e minúsculas aceitas; forma canônica em MAIÚSCULAS.
- Seletores da Shopee por **prefixo de classe** (`[class*="comment-container"]`), todos em `src/lib/selectors.js`.
- A extensão **nunca** clica em Confirmar, Remover nem Mostrar sozinha. O clique do apresentador na busca, a cada ID, é obrigatório.
- Favoritar é toggle: só clicar se o coração estiver vazio.
- Produtos do lote são marcados no modal **pelo nome**, nunca pela posição.
- Status por ID: `na_fila`, `favoritado`, `ja_favoritado`, `nao_achei`, `ja_na_sacola`, `conferir`, `adicionado`.
- Abrir a Shopee em: `tab` (padrão) ou `window`, configurável.
- Texto da interface em português do Brasil. Commits no ramo `feature/shopee-live-extension`; sem push.
- Estilo do código: módulos `(function (root) { const SLA = (root.SLA = root.SLA || {}); … })(typeof window !== 'undefined' ? window : globalThis)`, como `src/lib/codes.js`.

## Review Focus

- Mensagem com nome do autor, emoji e pontuação colada ao ID ("adiciona:clh-nzk-qpt!"): o ID é extraído em maiúsculas (Task 1).
- O mesmo ID pedido por 3 pessoas, ou já adicionado em lote anterior: aparece uma vez e não reprocessa (Tasks 1 e 2).
- Seleção que atravessa linhas do chat que a lista virtualizada remove do DOM: os IDs são capturados no `mouseup`, não na hora de clicar no botão (Task 7).
- Produto já favoritado ou já na sacola: nenhum clique que desfavorite ou duplique (Tasks 6 e 8).
- Lote vazio, ID inexistente e fechamento da aba da Shopee no meio: botão desligado, `nao_achei` sem travar o lote, "Retomar" disponível (Tasks 2, 5 e 7).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/ids.js` (novo) | `extractIds` |
| `src/lib/batch.js` (novo) | estado puro do lote |
| `src/lib/match.js` (novo) | casar nome de produto da página com o nome do modal |
| `src/lib/selectors.js` (novo) | todos os seletores e textos-âncora da Shopee |
| `src/lib/dom.js` (alterar) | + `qPrefix`, `waitGone`, `scrollUntil` |
| `src/background/coordinator.js` (novo) | `createCoordinator(deps)` — lógica do lote sobre APIs `chrome.*` injetadas |
| `src/background.js` (novo) | service worker: liga `chrome.*` ao coordenador |
| `src/shopee/hand.js` (novo) | mão da Shopee (content script) |
| `src/live/panel.js` (novo) | painel, seleção do chat, lista do lote, config |
| `src/live/addProducts.js` (novo) | abrir modais e marcar produtos de Meus Favoritos |
| `manifest.json` (alterar) | service worker, permissão `tabs`, dois grupos de content scripts |
| `test/*.test.cjs`, `test/e2e.cjs`, `test/mock-*.html` | testes; mocks no formato real |
| removidos no fim | `src/content.js`, `src/lib/codes.js`, `catalog.js`, `selector.js`, `test/codes.test.cjs`, `test/mock-live.html` antigo |

---

### Task 1: Extração de IDs

**Files:** Create `src/lib/ids.js`, `test/ids.test.cjs` · Modify `package.json` (script `test` → `node --test test/*.test.cjs`)

**Interfaces:**
- Produces: `SLA.ids.extractIds(text: string): string[]` — IDs canônicos (`AAA-BBB-CCC`), sem repetidos, na ordem em que aparecem.

- [ ] **Step 1: Escrever o teste que falha** (`test/ids.test.cjs`, mesmo estilo de `codes.test.cjs`):
  - `'Adiciona esse CLH-NZK-QPT'` → `['CLH-NZK-QPT']`
  - `'adiciona:clh-nzk-qpt!'` → `['CLH-NZK-QPT']`
  - três usuários, quatro IDs (texto multilinha com nomes e emoji) → os 4 em ordem, sem repetir o mesmo ID pedido duas vezes
  - `'quero o 5'`, `'ABC-DEF-GHIJ'`, `'AB-CDE-FGH'`, `''`, `null` → `[]`
- [ ] **Step 2: Rodar** `cd shopee-live && npm test` — esperado: falha (módulo inexistente).
- [ ] **Step 3: Implementar** `extractIds`: regex com lookarounds `(?<![A-Z0-9-])[A-Z]{3}-[A-Z]{3}-[A-Z]{3}(?![A-Z0-9-])` com flag `gi`, `toUpperCase`, deduplicar com `Set`.
- [ ] **Step 4: Rodar `npm test`** — esperado: todos passam.
- [ ] **Step 5: Commit** `feat: extração de IDs de produto do chat`.

### Task 2: Estado do lote

**Files:** Create `src/lib/batch.js`, `test/batch.test.cjs`

**Interfaces:**
- Produces (todas puras, devolvem objeto novo):
  - `SLA.batch.STATUS` — objeto com os 7 status acima.
  - `createBatch(ids: string[], opts?: {openIn?: 'tab'|'window', now?: number}): Batch` onde `Batch = { id: string, openIn, createdAt: number, phase: 'resolving'|'adding'|'done', paused: boolean, items: Item[] }` e `Item = { id: string, status: string, name?: string, note?: string }`.
  - `nextPending(b): Item | null` — primeiro item `na_fila`.
  - `setItem(b, id, patch: Partial<Item>): Batch`.
  - `resolvedItems(b): Item[]` — itens `favoritado` ou `ja_favoritado` (candidatos a marcar na live).
  - `advancePhase(b): Batch` — `resolving` → `adding` quando não há `na_fila` e existe item `favoritado`/`ja_favoritado`; `resolving` → `done` direto quando não há `na_fila` nem candidato a marcar (ex.: todos `nao_achei`); `adding` → `done` quando nenhum item está `favoritado`/`ja_favoritado` (todos viraram `adicionado`, `ja_na_sacola`, `conferir` ou `nao_achei`).
  - `summarize(b): { total, porStatus: Record<string, number> }`.

- [ ] **Step 1: Testes que falham:** `createBatch` com IDs repetidos deixa um só item; `createBatch([])` lança `Error('lote vazio')`; `nextPending` anda na ordem; `setItem` não altera o original; `advancePhase` não avança com `na_fila` pendente e avança para `adding` quando só restam `favoritado`/`ja_favoritado`/`nao_achei`; vai a `done` quando nenhum item fica `favoritado`/`ja_favoritado` sem destino; `summarize` conta por status.
- [ ] **Step 2: Rodar** `npm test` — falha.
- [ ] **Step 3: Implementar** os módulos acima; `id` do lote com `now` + sufixo aleatório.
- [ ] **Step 4: Rodar** `npm test` — passa.
- [ ] **Step 5: Commit** `feat: estado puro do lote`.

### Task 3: Casamento de nomes

**Files:** Create `src/lib/match.js`, `test/match.test.cjs`

**Interfaces:**
- Produces: `SLA.match.normalizeName(s: string): string` (minúsculas, sem acentos, espaços únicos, sem `…`/`...` final); `SLA.match.nameMatches(pageName: string, cardName: string): boolean` — verdadeiro se o nome do card (possivelmente truncado com `…` ou `...`) for prefixo do nome da página, ou igual.

- [ ] **Step 1: Testes que falham:** `'Squishy Cubo de Gelo Anti Stress Retorno Rápido com Glitter…'` casa com o título completo da página; acentos e caixa ignorados; `'Maiô Infantil Juvenil F...'` casa com `'Maiô Infantil Juvenil Forrado para Adolescentes'` e **não** casa com `'Maiô manga longa infantil juvenil com ziper'`; texto vazio nunca casa.
- [ ] **Step 2–4:** rodar (falha), implementar, rodar (passa).
- [ ] **Step 5: Commit** `feat: casamento de nome de produto`.

### Task 4: Seletores, utilitários de DOM e sondagem da Shopee

**Files:** Create `src/lib/selectors.js` · Modify `src/lib/dom.js`

**Interfaces:**
- Produces em `SLA.dom`: `qPrefix(root: ParentNode, tag: string, prefix: string): Element[]` (seleciona `${tag}[class*="${prefix}"]`), `waitGone(fn, timeout?): Promise<boolean>`, `scrollUntil(scroller: Element, probe: () => boolean, maxSteps?: number): Promise<boolean>` (rola o contêiner em passos até `probe()` ser verdadeiro ou o fim).
- Produces `SLA.selectors` com as chaves usadas nas Tasks 6 e 8: `liveHost`, `chatContent` (`comment-content`), `toolsProducts`, `listButtonText` (`Lista de produtos`), `addRelatedText` (`Adicionar produtos relacionados`), `favoritesTabText` (`Meus Favoritos`), `modalRoot` (`.shopee-react-modal`), `gridCardName`, `gridCheckbox`, `confirmText` (`Confirmar`), `shopeeSearchInput`, `favoriteButton`, `favoriteFilledMark`, `captchaMarker`.

- [ ] **Step 1: Sondagem no Chrome real (obrigatória, antes de fixar valores).** Com o Claude no Chrome (ou com o Fabio abrindo o DevTools), registrar em `selectors.js` o seletor real de: campo de busca da home da Shopee, botão Favoritar e a marca que distingue coração cheio/vazio, nome e checkbox de cada card da grade de Meus Favoritos, rolagem da grade e indicador de captcha/verificação. Não clicar em Confirmar nem em Mostrar. Cada valor guarda um comentário com a data da sondagem.
- [ ] **Step 2: Sem teste unitário novo:** `qPrefix`, `waitGone` e `scrollUntil` dependem de DOM real e são cobertos pelo e2e (Task 9).
- [ ] **Step 3: Implementar** os três utilitários e o objeto `SLA.selectors`.
- [ ] **Step 4: Commit** `feat: seletores da Shopee e utilitários de DOM`.

### Task 5: Coordenador e service worker

**Files:** Create `src/background/coordinator.js`, `src/background.js`, `test/coordinator.test.cjs` · Modify `manifest.json` (`background.service_worker: "src/background.js"`, permissão `tabs`)

**Interfaces:**
- Consumes: `SLA.batch.*` (Task 2).
- Produces: `createCoordinator(deps)` com `deps = { storage: {get(key): Promise<any>, set(key, value): Promise<void>}, tabs: {create(opts): Promise<{id}>, update(id, opts): Promise<void>, remove(id): Promise<void>, sendMessage(id, msg): Promise<void>}, windows: {create(opts): Promise<{id, tabs: [{id}]}>, update(id, opts): Promise<void>, remove(id): Promise<void>} }` e métodos `handle(msg, sender): Promise<any>`. Mensagens (`msg.type`):
  - `batch:start {ids, openIn}` — cria o lote (`createBatch`), guarda `liveTabId = sender.tab.id`, abre `https://shopee.com.br/` na aba ou janela, devolve o lote. Se já houver lote em `resolving`/`adding` sem `done`, responde `{error: 'lote em andamento'}`.
  - `hand:next` — devolve `{ id, index, total }` do próximo `na_fila`, ou `null`.
  - `hand:result {id, status: 'favoritado'|'ja_favoritado'|'nao_achei'|'captcha', name?}` — `captcha` marca `paused` e mantém `na_fila`; os demais gravam o item. Se `advancePhase` chega a `adding`: fecha a aba/janela da Shopee, ativa a aba da live e envia `batch:resolved` a ela.
  - `batch:get` → lote atual ou `null`; `batch:setStatus {id, status}` → grava; `batch:clear`; `batch:reopen` → reabre a Shopee mantendo o lote.
  - A cada mudança, enviar `batch:update {batch}` à aba da live.
- `src/background.js` só instancia `createCoordinator` com `chrome.*` e liga `chrome.runtime.onMessage` (resposta assíncrona com `return true`); usa `importScripts` para `src/lib/batch.js` e `coordinator.js`.

- [ ] **Step 1: Testes que falham** com `deps` falsos: `batch:start` abre a Shopee uma vez e guarda a aba da live; segundo `batch:start` com lote aberto devolve `{error}`; `hand:next` devolve 1/4 depois 2/4; `hand:result` `nao_achei` não trava o lote; `hand:result` `captcha` deixa o ID `na_fila` com `paused: true`; ao resolver o último ID o coordenador remove a aba da Shopee, ativa a da live e envia `batch:resolved`; com `openIn: 'window'` usa `windows.create` e `windows.remove`; `batch:reopen` abre a Shopee sem alterar os itens.
- [ ] **Step 2–4:** rodar (falha), implementar, rodar (passa).
- [ ] **Step 5: Commit** `feat: coordenador do lote e service worker`.

### Task 6: Mão da Shopee

**Files:** Create `src/shopee/hand.js`, `test/hand.test.cjs`

**Interfaces:**
- Consumes: `SLA.selectors`, `SLA.dom`, mensagens da Task 5.
- Produces (puras, testadas): `isProductUrl(url: string): boolean` (`/affiliation-i.<n>.<n>` ou `/product/<n>/<n>`) e `isFavorited(el: Element): boolean` (usa `selectors.favoriteFilledMark`).
- Comportamento do content script (em `https://shopee.com.br/*`, exceto `live.`): ao carregar, pergunta `batch:get`; se há lote em `resolving`, mostra o aviso flutuante "ID k de N: clique na busca" (com botão "Continuar" quando `paused`). No `click` do campo de busca (`selectors.shopeeSearchInput`), pede `hand:next`, cola o ID com `dom.typeInto` e envia Enter. Se a URL passa a ser de produto: lê o nome (título da página), `isFavorited` decide se clica no coração, responde `hand:result` com `favoritado`/`ja_favoritado` e o nome. Se em 10 s não virou produto: `nao_achei`. Se `selectors.captchaMarker` aparece: `captcha`.

- [ ] **Step 1: Testes que falham** das funções puras: URLs reais (`https://shopee.com.br/affiliation-i.1633716881.58220139713`, `/product/1633716881/58220139713?utm=...`) são produto; `/search?keyword=X` e a home não; `isFavorited` com elemento de coração cheio e vazio montados em `document` falso mínimo (sem biblioteca extra, via objeto simples com `classList`/`getAttribute`).
- [ ] **Step 2–4:** rodar, implementar, rodar.
- [ ] **Step 5: Verificar no Chrome real:** com um lote de teste de 1 ID e a extensão carregada, o clique na busca cola o ID, o produto abre e o coração fica cheio; repetir com o mesmo produto já favoritado e confirmar que o coração **não** é desmarcado.
- [ ] **Step 6: Commit** `feat: mão da Shopee (cola ID e favorita)`.

### Task 7: Painel da live

**Files:** Create `src/live/panel.js` · Modify `manifest.json` (dois grupos de `content_scripts`: live = `https://live.shopee.com.br/*` com `lib/ids.js`, `batch.js`, `match.js`, `selectors.js`, `dom.js`, `live/addProducts.js`, `live/panel.js`; Shopee = `https://*.shopee.com.br/*` com `exclude_matches: ["https://live.shopee.com.br/*"]` e `lib/selectors.js`, `dom.js`, `shopee/hand.js`)

**Interfaces:**
- Consumes: `SLA.ids.extractIds`, `SLA.batch.*`, mensagens da Task 5, `SLA.addProducts.markFavorites` (Task 8).
- Produces: painel em shadow DOM (`#sla-live-host`), arrastável, que só monta em `live.shopee.com.br/pc/live`; `SLA.panel.registerTab(key: string, label: string, render: () => string)` para o Recurso B. Aba "Lote": IDs encontrados com ✕ para remover, botão **Processar lote** (desligado com 0 IDs), lista de status do lote, botão **Retomar** quando há lote aberto sem aba da Shopee, botão **Marcar na live** quando a fase é `adding`. Config: "Abrir a Shopee em: aba / janela" em `chrome.storage.local` (`openIn`).
- Captura da seleção: ouvir `mouseup` no documento; se `getSelection()` começa dentro de `selectors.chatContent`, guardar `extractIds(selection.toString())`; seleção sem IDs não apaga a anterior.

- [ ] **Step 1: Montar o painel** e a captura da seleção; conferir manualmente no mock (Task 9) e na live real que selecionar duas mensagens lista os IDs.
- [ ] **Step 2: Ligar os botões** às mensagens `batch:start`, `batch:get`, `batch:reopen`, `batch:clear` e ao evento `batch:update`/`batch:resolved` (ao resolver, chamar `markFavorites` automaticamente com `resolvedItems(batch)` e depois `batch:setStatus` com o resultado de cada um).
- [ ] **Step 3: Remover `src/content.js` do manifest** (os arquivos antigos só saem na Task 10).
- [ ] **Step 4: Commit** `feat: painel da live com captura do chat e lista do lote`.

### Task 8: Marcar produtos na live

**Files:** Create `src/live/addProducts.js`

**Interfaces:**
- Consumes: `SLA.match.nameMatches`, `SLA.selectors`, `SLA.dom`.
- Produces: `SLA.addProducts.markFavorites(items: {id: string, name: string}[]): Promise<{id: string, status: 'marcado'|'ja_na_sacola'|'conferir'}[]>`. Abre Produtos → Lista de produtos → Adicionar produtos relacionados → aba Meus Favoritos (reconhecendo estado já aberto, porque o popover Produtos alterna ao clicar), e para cada item procura o card pelo nome rolando a grade (`dom.scrollUntil`): checkbox já marcado → `ja_na_sacola`; senão clica no checkbox → `marcado`; não achado → `conferir`. **Termina sem clicar em Confirmar** e deixa o modal aberto.

- [ ] **Step 1: Implementar** conforme acima, com `waitFor` entre passos. Se o tile Produtos estiver desativado (live encerrada) ou algum modal não abrir, lançar `Error` com mensagem em português ("A live parece encerrada" / "Não consegui abrir …"), que o painel mostra como aviso sem alterar o lote.
- [ ] **Step 2: Verificar no e2e (Task 9)** os três resultados (`marcado`, `ja_na_sacola`, `conferir`) e que nenhum clique chega ao botão Confirmar.
- [ ] **Step 3: Verificar na live real de teste** com 2 produtos favoritados: ficam marcados e o modal permanece aberto até o Fabio confirmar.
- [ ] **Step 4: Commit** `feat: marcar produtos do lote em Meus Favoritos`.

### Task 9: Mocks no formato real e e2e

**Files:** Create `test/mock-live.html` (substitui o antigo), `test/mock-shopee.html` · Modify `test/e2e.cjs`

- [ ] **Step 1: Mock da live** com chat virtualizado de classes com sufixo, tile Produtos (popover que alterna), modal Lista de produtos com tabela de 3 linhas, modal Adicionar Produtos com abas, busca, grade com checkbox (um já marcado) e botão Confirmar que registra cliques em `window.__confirmClicks`. **Mock da Shopee** com campo de busca que, para IDs conhecidos, navega para `/affiliation-i.1.1`, e para desconhecidos mantém a busca; página de produto com coração toggle.
- [ ] **Step 2: E2E (`npm run test:e2e`)** roteando `https://live.shopee.com.br/**` e `https://shopee.com.br/**` para os mocks: selecionar texto com 3 pedidos (um inexistente, um já favoritado, um novo) → `Processar lote` → 3 cliques na busca → a aba da Shopee fecha e a live volta → `markFavorites` roda → asserts: favoritos finais corretos, nenhum desfavoritado, `__confirmClicks === 0`, painel mostra `nao_achei`, `ja_favoritado`, `favoritado/marcado`.
- [ ] **Step 3: Rodar** `PLAYWRIGHT_PATH=<caminho> npm run test:e2e`; se o Playwright não estiver instalado, instalar fora do projeto e informar o caminho; esperado: sem erros no console da página.
- [ ] **Step 4: Commit** `test: mocks no formato real e e2e do lote`.

### Task 10: Limpeza, README e teste na live real

**Files:** Delete `src/content.js`, `src/lib/codes.js`, `src/lib/catalog.js`, `src/lib/selector.js`, `test/codes.test.cjs` · Modify `README.md`, `manifest.json` (versão `0.2.0`, descrição)

- [ ] **Step 1: Apagar os arquivos antigos** e confirmar que `npm test` e o e2e seguem passando.
- [ ] **Step 2: Reescrever o README** (instalação, como selecionar e processar um lote, configuração aba/janela, o que a extensão não faz sozinha, como ajustar `selectors.js` se a Shopee mudar).
- [ ] **Step 3: Teste na live real de teste** com o Fabio: lote de 3 IDs (um inexistente, um já favoritado, um novo), parando antes do Confirmar; registrar o resultado e ajustar `selectors.js` se algo divergir.
- [ ] **Step 4: Commit** `chore: remove fluxo antigo, atualiza README e versão 0.2.0`.
