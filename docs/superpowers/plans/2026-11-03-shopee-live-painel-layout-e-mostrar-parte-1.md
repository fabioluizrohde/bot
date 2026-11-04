# Painel maior, Lote sempre visível, grade de fotos e MOSTRAR (parte 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel grande e ajustável com o quadro Lote sempre visível, a Sacola em grade de fotos numeradas e o modo MOSTRAR (um clique real na foto coloca o produto no ar pela ponte da página).

**Architecture:** Funções puras novas (`layout.js` para tamanho/posição, `showGuard.js` para as travas do Mostrar) e o pedido `show` na ponte `pageBridge.js` (restrito ao caminho `/session/<n>/show`). O painel (`panel.js`) deixa de ter abas: um quadro Lote fixo em cima e uma área de Sacola que a aba atual (`bagTab.js`) preenche. O modo MOVER P/ CIMA fica fora desta parte (aparece desligado, "em breve").

**Tech Stack:** JavaScript sem empacotador (scripts no formato `SLA.*`), Chrome MV3, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-03-shopee-live-painel-layout-e-modos-design.md` (layout) e `docs/superpowers/specs/2026-11-03-shopee-live-painel-etapa-2-mostrar-design.md` (`show`, ponte, travas). Onde falam do cartão, vale a grade do primeiro.

## Global Constraints

- Painel: largura padrão **440 px**, altura padrão **85%** da janela; mínimo **300 × 280 px**; máximo a janela; tamanho e posição em `chrome.storage.local`, chave `panelRect`, sempre validados ao ler (inválido → padrão).
- Grade: `grid-template-columns: repeat(auto-fill, minmax(72px, 1fr))`; tiles quadrados, foto `object-fit: cover`, **número no canto**, `title` com nome e preço; foto `https://cf.shopee.com.br/file/<código>` com `crossorigin="anonymous"`, sem `onerror` embutido (o ouvinte de erro do painel esconde a foto quebrada).
- Leitura da sacola continua só `GET …/host/items` pela ponte, a cada **20 s**, só com a página visível, para após **3** falhas seguidas, uma leitura por vez.
- Escrita: **só** `POST /webapi/v1/session/<n>/show` (regex `^/webapi/v1/session/\d+/show$`), corpo = o objeto `raw` do item, `item_id` e `shop_id` numéricos, `JSON.stringify` ≤ **20000** caracteres, `Content-Type: application/json;charset=UTF-8`, `withCredentials: true`, pelo `XMLHttpRequest` da página resolvido na hora do pedido.
- Travas do Mostrar: só clique real (`event.isTrusted`), um pedido por vez, intervalo mínimo **1500 ms**, sem nova tentativa, **2 erros seguidos** desligam o Mostrar na live, produto esgotado/removido sem ação, só envia se a sessão da URL for a da lista lida.
- Todo texto vindo da Shopee é escapado antes de virar HTML. Texto da interface em português do Brasil. Estilo IIFE `SLA` com `module.exports` guardado, como `src/live/panel.js`. Commits no ramo `feature/shopee-live-extension`, sem push.
- O modo MOVER P/ CIMA aparece **desligado** ("em breve"): nenhuma chamada de reordenar nesta parte.
- A lógica do lote (captura da seleção, coordenador, marcação, vigia do Confirmar) **não muda**.

## Review Focus

- Clique simulado (`isTrusted` falso), clique durante um pedido, clique antes de 1,5 s e Mostrar já desligado: nenhuma chamada sai (Task 8).
- Corpo do `show` sem `item_id`/`shop_id`, muito grande, não-objeto ou com referência circular: a ponte recusa sem criar `XMLHttpRequest` (Task 2).
- Tamanho/posição salvos com `NaN`, negativos, enormes ou fora da janela, e janela menor que o mínimo: volta ao padrão e o painel continua alcançável (Task 4).
- Quadro Lote recolhido nunca esconde aviso urgente (pedido de clique em Produtos, erro da marcação) (Task 5).
- 100 tiles, nome com `<script>`/aspas, foto ausente e produto esgotado na grade (Task 7).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/live/layout.js` (novo) | tamanho/posição padrão, validação, redimensionar/mover |
| `src/live/showGuard.js` (novo) | travas do Mostrar (estado puro) |
| `src/live/bag.js` (alterar) | `raw` no cartão; `showItem`; ponte genérica |
| `src/live/pageBridge.js` (alterar) | pedido `show` restrito |
| `src/live/panel.js` (alterar) | sem abas: Lote fixo + área; ⚙; recolher; redimensionar; persistir |
| `src/live/bagTab.js` (alterar) | grade de fotos, seletor de modo, ação Mostrar |
| `manifest.json`, `README.md` | carregar `layout.js`/`showGuard.js`; versão `0.4.0`; texto |
| `test/layout.test.cjs`, `test/showGuard.test.cjs`, `test/pageBridge.test.cjs`, `test/bag.test.cjs`, `test/bagTab.test.cjs`, `test/panel.test.cjs` | testes |

---

### Task 1: Cartão guarda o item original (`raw`)

**Files:** Modify `src/live/bag.js` · Test `test/bag.test.cjs`

**Interfaces:**
- Produces: `Card` ganha `raw: object` — a **mesma referência** do item recebido em `data.items`, sem cópia nem alteração; os demais campos não mudam.

- [ ] **Step 1: Testes que falham:** `normalizeBag(resposta).items[0].raw` é o mesmo objeto (`assert.strictEqual`) do item de entrada; `JSON.stringify(raw)` mantém todos os campos originais (inclui `label`, `affiliate`); ajustar os testes antigos que comparam o cartão inteiro com `deepStrictEqual` para ignorar `raw` (ou incluí-lo).
- [ ] **Step 2: Rodar** `cd shopee-live && npm test` — falha nos testes novos.
- [ ] **Step 3: Implementar** `raw: it` em `toCard`.
- [ ] **Step 4: Rodar `npm test`** — passa.
- [ ] **Step 5: Commit** `feat(sacola): cartão guarda o item original (raw)`.

### Task 2: Ponte aprende o pedido `show` (restrito)

**Files:** Modify `src/live/pageBridge.js` · Test `test/pageBridge.test.cjs`

**Interfaces:**
- Produces (exportadas em `module.exports`): `isAllowedShowPath(path: string): boolean` (regex da Global Constraints); `validateShowBody(body: any): boolean` (objeto simples — não array, não `null` —, `Number.isFinite(item_id)` e `Number.isFinite(shop_id)`, `JSON.stringify(body).length <= 20000`; exceção do `stringify` ou referência circular → `false`); `handleShowRequest(data, getXhr: () => XMLHttpRequestCtor): Promise<{ source:'sla-bridge', id, ok:boolean, status:number, text:string, error?:string }>` com `data = { source:'sla-ext', type:'show', id, path, body }`.
- Comportamento: dado inválido/`type` errado → `error:'pedido invalido'`; caminho ou corpo recusado → `ok:false, status:0, error:'pedido recusado'` **sem** chamar `getXhr`; senão `const x = new (getXhr())()`, `x.open('POST', path, true)`, `x.setRequestHeader('Content-Type','application/json;charset=UTF-8')`, `x.withCredentials = true`, `x.timeout = 15000`, `x.send(JSON.stringify(body))`; em `loadend` resolve `{ ok: status in 200–299, status, text: x.responseText }`; `onerror`/`ontimeout`/`onabort` ou exceção → `ok:false, status:0, error`. O ouvinte de mensagens existente ganha o ramo `type === 'show'` (mesmas checagens `ev.source === window`/origem) usando `() => window.XMLHttpRequest`; o ramo `fetch` fica **idêntico**.

- [ ] **Step 1: Testes que falham** (com uma classe `FakeXhr` que registra `open`, `setRequestHeader`, `withCredentials`, `timeout`, `send` e dispara `loadend`/`onerror`): aceita `/webapi/v1/session/7898272/show`; recusa `/webapi/v1/session/1/show?x=1`, `/webapi/v1/session/1/host/items`, `//evil.com/x`, `https://x/y`, `/webapi/v1/session/1/show/`, vazio, `null`; `validateShowBody` aceita o item real (com `item_id`, `shop_id`, `label`…), recusa `{}`, array, `null`, `item_id:'abc'`, `shop_id` faltando, objeto com mais de 20000 caracteres, objeto circular; `handleShowRequest` com corpo válido faz exatamente `open('POST', path, true)`, o cabeçalho, `withCredentials === true`, `send` com o JSON do corpo e resolve `{ok:true,status:200,text}`; resposta 403 → `ok:false,status:403`; caminho/corpo inválido → `getXhr` **nunca** chamado; erro de rede → `ok:false,status:0`.
- [ ] **Step 2: Rodar** `npm test` — falha.
- [ ] **Step 3: Implementar** as três funções e o ramo no ouvinte; atualizar o comentário do cabeçalho do arquivo (agora um pedido de leitura e um de escrita, ambos restritos).
- [ ] **Step 4: Rodar `npm test`** e `node --check src/live/pageBridge.js` — passa.
- [ ] **Step 5: Commit** `feat(ponte): pedido show restrito (POST em /session/<n>/show)`.

### Task 3: `showItem` do lado da extensão

**Files:** Modify `src/live/bag.js` · Test `test/bag.test.cjs`

**Interfaces:**
- Consumes: protocolo da ponte (Task 2), `Card.raw` (Task 1).
- Produces em `SLA.bag`: `showItem(sessionId: string, card: Card, win?: Window, opts?: { timeoutMs?: number }): Promise<{ ok:true } | { ok:false, reason:'recusado'|'rede'|'http', detail?: string }>`. Valida antes de enviar: `sessionId` só dígitos e `card.raw` objeto com `item_id` e `shop_id` numéricos; senão `{ok:false, reason:'recusado'}` **sem** postar mensagem. Envia `{ source:'sla-ext', type:'show', id, path:'/webapi/v1/session/<sessionId>/show', body: card.raw }` por `postMessage` (mesmas regras de origem/`ev.source` e de limpeza de ouvinte/timer do `makeBridgeFetch`; tempo limite padrão 15000 ms). Resposta com `ok:false && status===0` → `reason:'recusado'` se `error` for `pedido recusado`/`pedido invalido`, senão `'rede'` (`detail` = erro); `!ok` → `'http'` com `detail` = status; HTTP ok mas o JSON do `text` tem `err_code !== 0` ou não é JSON → `'http'` com `detail` = `err_code <n>` ou `resposta inesperada`; sucesso = HTTP ok **e** `err_code === 0`.
- Reaproveitar o código de mensagem/limpeza de `makeBridgeFetch` numa função interna comum (sem mudar o comportamento nem os testes existentes de `makeBridgeFetch`).

- [ ] **Step 1: Testes que falham** com uma janela de mentira (como nos testes de `makeBridgeFetch`): mensagem postada tem `type:'show'`, `path` certo e `body === card.raw`; sucesso (`ok:true,status:200,text:'{"err_code":0}'`) → `{ok:true}`; `text:'{"err_code":5}'` → `'http'`/`err_code 5`; status 403 → `'http'`/`403`; resposta `ok:false,status:0,error:'pedido recusado'` → `'recusado'`; tempo esgotado (`timeoutMs:20`) → `'rede'` e nenhum ouvinte restante; `card.raw` ausente, `sessionId` `'12a'` → `'recusado'` e **nenhuma** mensagem postada; resposta com outro `id`/`source`/origem é ignorada.
- [ ] **Step 2–4:** rodar (falha), implementar, rodar (passa).
- [ ] **Step 5: Commit** `feat(sacola): showItem pela ponte da página`.

### Task 4: Tamanho e posição do painel (funções puras)

**Files:** Create `src/live/layout.js`, `test/layout.test.cjs`

**Interfaces:**
- Produces em `SLA.layout` (e `module.exports`), com `Win = { innerWidth:number, innerHeight:number }` e `Rect = { left:number, top:number, width:number, height:number }`:
  - `MIN_W = 300`, `MIN_H = 280`, `DEFAULT_W = 440`, `DEFAULT_H_RATIO = 0.85`, `MARGIN = 16`, `TOP = 64`.
  - `defaultRect(win: Win): Rect` — largura `min(440, innerWidth - 2·MARGIN)` (nunca abaixo de `MIN_W` se a janela couber), altura `min(0.85·innerHeight, innerHeight - TOP - MARGIN)` (nunca abaixo de `MIN_H` se couber), `top = TOP`, `left = innerWidth - width - MARGIN`.
  - `sanitizeRect(saved: any, win: Win): Rect` — `saved` precisa ser objeto com os quatro números finitos; limita largura a `[MIN_W, innerWidth]` e altura a `[MIN_H, innerHeight]`; ajusta `left`/`top` para que ao menos **80 px** da largura e do cabeçalho fiquem dentro da janela (`left ∈ [80 - width, innerWidth - 80]`, `top ∈ [0, innerHeight - 40]`); qualquer entrada inválida (`null`, texto, `NaN`, `Infinity`, faltando campo) → `defaultRect(win)`. Arredonda para inteiros.
  - `rectAfterMove(rect: Rect, dx: number, dy: number, win: Win): Rect` e `rectAfterResize(rect: Rect, dw: number, dh: number, win: Win): Rect` — somam o deslocamento e passam por `sanitizeRect`.
  - `loteMaxHeight(panelHeight: number): number` — `Math.max(80, Math.floor(0.35 · panelHeight))`.

- [ ] **Step 1: Testes que falham:** `defaultRect` em 1522×666 (largura 440, `left = 1522-440-16`, `top 64`, altura `min(566, 666-64-16=586)` → 566); janela pequena 360×400 (largura 328, altura ≥ 280 só se couber, nada negativo); `sanitizeRect` com `{left:NaN,…}`, `null`, `'x'`, `{left:1,top:2,width:50,height:50}` (largura/altura sobem ao mínimo), `{left:-5000,…}` e `{left:99999,…}` (continuam alcançáveis: ≥ 80 px dentro), largura maior que a janela; `rectAfterResize` não passa do máximo nem do mínimo; `rectAfterMove` não deixa o cabeçalho sair da janela; `loteMaxHeight(566) === 198`, `loteMaxHeight(100) === 80`.
- [ ] **Step 2–4:** rodar (falha), implementar, rodar (passa).
- [ ] **Step 5: Commit** `feat(painel): tamanho e posição padrão, validação e ajuste (puros)`.

### Task 5: Painel sem abas: Lote fixo + área da Sacola + ⚙ + recolher

**Files:** Modify `src/live/panel.js` · Test `test/panel.test.cjs`

**Interfaces:**
- Produces: `SLA.panel.registerArea(key: string, render: () => string, opts?: { actions?: Record<string, (el, ev) => void>, onActive?: (active:boolean) => void }): void` (a área aparece abaixo do Lote; `onActive(true)` é chamado quando o painel está montado e desenhado pela primeira vez e `onActive(false)` nunca é necessário nesta parte), `SLA.panel.isAreaVisible(key: string): boolean` (verdadeiro quando a área existe e o painel está montado), `SLA.panel.redraw()` (mantido). `registerTab(key, label, render, opts)` continua existindo como **alias** de `registerArea(key, render, opts)` (ignora `label`) para o `bagTab.js` atual funcionar até a Task 7; `isTabActive(key)` vira alias de `isAreaVisible`.
- Funções puras novas exportadas: `loteSummary(batch: Batch|null, ids: string[]): string` ("Lote: 3 IDs" / "Lote: vazio" / "Lote: 3 IDs · adicionando…" conforme a fase) e `shouldExpandLote(aviso: string, batch: Batch|null): boolean` (verdadeiro quando há `aviso` não vazio ou lote pausado).
- Estrutura do painel: `.box` → `.head` (título; botão ⚙ `data-act="menu"`; botão recolher/expandir `data-act="toggle-lote"`) → `.lote` (conteúdo de `renderLote`, altura máxima `SLA.layout.loteMaxHeight`, rola por dentro; quando recolhido mostra só `loteSummary`) → `.area` (cresce, rola) → `.grip` (reservado para a Task 6). A aba Config deixa de existir: o ⚙ abre `.menu` com as opções "Abrir a Shopee em: aba / janela" (mesmos `data-act="openIn"` de hoje). `state.tab`, os botões de aba, `setTab`, `tabAfterMessage` e a ação `tab` são removidos; no `batch:resolved` o painel chama `setBatch` e `markAll()` (o Lote já está à vista) e expande o Lote se `shouldExpandLote`.
- `draw()` desenha `.lote` e `.area` separadamente, preservando rolagem de ambas e o foco do campo com `data-focus-key` (reaproveitar `refocus`/`scrollToRestore` com a área como "aba" fixa).

- [ ] **Step 1: Testes que falham:** `loteSummary(null, [])` → "Lote: vazio"; com 3 IDs e sem lote → "Lote: 3 IDs"; com lote em `adding` → termina com "adicionando…"; `shouldExpandLote('', null)` falso, `shouldExpandLote('Clique no bloco…', null)` verdadeiro, lote `paused:true` verdadeiro; remover os testes de `tabAfterMessage`; os testes de `findExtraAction`/`registerTab` passam a usar `registerArea` onde fizer sentido (mantendo um teste do alias).
- [ ] **Step 2: Rodar** `npm test` — falha.
- [ ] **Step 3: Implementar** a reestruturação descrita (HTML/CSS do shadow DOM, `draw()`, ⚙, recolher, `registerArea`, aliases, `onMessage` sem troca de aba). CSS: o `.box` passa a `display:flex; flex-direction:column` ocupando a altura do painel; `.area` com `flex:1; min-height:0; overflow:auto`; `.lote` com `max-height`.
- [ ] **Step 4: Rodar `npm test`** e `node --check src/live/panel.js` — passa. Conferir por leitura que nenhuma referência a `state.tab`, `setTab` ou `tabAfterMessage` sobrou.
- [ ] **Step 5: Commit** `feat(painel): Lote sempre visível, área da Sacola, ⚙ e recolher`.

### Task 6: Redimensionar, mover e lembrar o tamanho

**Files:** Modify `src/live/panel.js`

**Interfaces:**
- Consumes: `SLA.layout.defaultRect/sanitizeRect/rectAfterMove/rectAfterResize` (Task 4).
- Comportamento: ao montar, lê `panelRect` de `chrome.storage.local`, aplica `sanitizeRect(saved, window)` e posiciona o `.box` (`left/top/width/height` em px, sem `right`); o `.grip` (canto inferior direito) arrasta para redimensionar com `rectAfterResize`; o cabeçalho arrasta com `rectAfterMove` (substitui `enableDrag` atual, sem perder o comportamento de arrastar); ao soltar, grava `panelRect` (com atraso de ~400 ms para não gravar a cada pixel); em `window` `resize`, reaplica `sanitizeRect` ao retângulo atual. Erros de storage/DOM nunca quebram o painel.

- [ ] **Step 1: Implementar** conforme acima (sem teste automático de DOM; a lógica numérica está testada na Task 4). Incluir `node --check`.
- [ ] **Step 2: Rodar `npm test`** — passa (sem regressão).
- [ ] **Step 3: Commit** `feat(painel): redimensionar, mover e lembrar tamanho e posição`.

### Task 7: Sacola em grade de fotos e seletor de modo

**Files:** Modify `src/live/bagTab.js`, `src/live/panel.js` (só CSS) · Test `test/bagTab.test.cjs`

**Interfaces:**
- Consumes: `SLA.panel.registerArea/redraw/isAreaVisible` (Task 5), `SLA.bag.filterBag/imageUrl`, `Card.raw`.
- Produces: `renderBagTab(m)` passa a desenhar a grade; `m` ganha `modo: 'mostrar'|'mover'` (padrão `'mostrar'`), `noAr: number|null` (o `itemId` do último produto enviado com sucesso), `trocando: boolean`, `aviso: string`. HTML: linha de topo (contador `N de máx`, botão Atualizar `data-act="bag-refresh"`), campo de busca `data-act="bag-q" data-focus-key="bag-q"` (valor reemitido e escapado), seletor de modo com dois botões `data-act="bag-modo" data-modo="mostrar"` e `data-modo="mover"` — o `mover` vem **desligado** (`disabled`, `title="em breve"`); depois `<div class="grade">` com um `<button class="tile…" data-act="bag-tile" data-n="<n>" title="<nome> — <preço>">` por produto contendo `<img … crossorigin="anonymous" data-img="<código>">` (omitida se a foto está em `fotosComErro` ou sem código) e `<span class="tn"><n></span>`; classes: `noar` (quando `c.itemId === m.noAr`), `apagado` + atributo `disabled` (esgotado/removido), `trocando` + `disabled` em todos enquanto `m.trocando`. Mensagens do spec da etapa 1 mantidas (`Sacola vazia.`, `Nenhum produto encontrado.`, `Lendo a sacola…`, `Não consegui ler a sacola (…)`, `Lista desatualizada`, sem sessão); `m.aviso` aparece em `<p class="warn">`.
- `init()` registra com `SLA.panel.registerArea('sacola', render, { actions, onActive })`; a leitura automática passa a valer enquanto a página estiver visível (`shouldPoll({ ativa: true, escondida: document.hidden, falhas })` — a lógica de `shouldPoll` não muda). CSS da grade e dos tiles acrescentado ao `CSS` do painel (tile quadrado com `aspect-ratio:1`, número no canto, `.noar` com borda e etiqueta, `.apagado{opacity:.45}`, seletor de modo).

- [ ] **Step 1: Testes que falham** (adaptar os atuais de cartão para tile): 100 itens → 100 tiles e `100 de 100`; número visível em cada tile e `title` com nome e preço; nome `<script>alert(1)</script> & "x"` escapado em `title`; foto com `crossorigin="anonymous"`, sem `onerror`; item com foto em `fotosComErro` sem `<img>`; item esgotado → `apagado` e `disabled`; `m.noAr` marca só o tile certo com `noar`; `m.trocando` deixa todos `disabled`; o botão do modo `mover` sempre `disabled`; busca sem resultado e sacola vazia mantêm as mensagens.
- [ ] **Step 2: Rodar** `npm test` — falha.
- [ ] **Step 3: Implementar** a grade, o seletor, os estados e o CSS; trocar `registerTab` por `registerArea` e `isTabActive('sacola')` por `isAreaVisible('sacola')`. Ainda **sem** ação no tile (a Task 8 liga o Mostrar); o clique em tile não faz nada.
- [ ] **Step 4: Rodar `npm test`** e `node --check` (`bagTab.js`, `panel.js`) — passa.
- [ ] **Step 5: Commit** `feat(sacola): grade de fotos numeradas e seletor de modo`.

### Task 8: Modo MOSTRAR (travas + ação no tile)

**Files:** Create `src/live/showGuard.js`, `test/showGuard.test.cjs` · Modify `src/live/bagTab.js`, `test/bagTab.test.cjs`

**Interfaces:**
- Produces em `SLA.showGuard` (e `module.exports`), puro: `MIN_INTERVAL_MS = 1500`, `MAX_ERROS = 2`; `initialGuard(): { emAndamento:boolean, ultimoEm:number, errosSeguidos:number, desligado:boolean }` (`ultimoEm` inicia em `-Infinity`); `canShow(g, now: number, ev: { isTrusted?: boolean } | null): { ok:boolean, motivo?: 'simulado'|'em_andamento'|'cedo'|'desligado' }` (verdadeiro só se `ev.isTrusted === true`, `!g.emAndamento`, `now - g.ultimoEm >= MIN_INTERVAL_MS` e `!g.desligado`; ordem de checagem: `desligado`, `simulado`, `em_andamento`, `cedo`); `startShow(g, now): g` (marca `emAndamento` e `ultimoEm = now`); `finishShow(g, resultado: { ok:boolean }): g` (limpa `emAndamento`; sucesso zera `errosSeguidos`; erro soma um e, ao chegar em `MAX_ERROS`, `desligado = true`).
- Em `bagTab.js`: ação `bag-tile` (só no modo `'mostrar'`): acha o cartão por `data-n` em `state.itens`; ignora se não achar, se `esgotado/removido`, se `canShow(...)` for falso (com `motivo:'simulado'` não mostra nada; `'cedo'`/`'em_andamento'` ignora em silêncio; `'desligado'` mostra o aviso), ou se `SLA.bag.sessionIdFromHref(location.href)` for diferente da sessão da lista lida (`idDaLista`); senão `startShow`, `state.trocando = true`, redesenha, `await SLA.bag.showItem(sessionId, card)`; sucesso → `state.noAr = card.itemId`, `finishShow`, limpa o aviso e relê a sacola (`ler()`); erro → `finishShow`, aviso `Não consegui trocar o produto (<motivo>: <detalhe>).` sem nova tentativa; ao desligar, aviso fixo `O Mostrar foi desligado nesta live após 2 erros. Use a tela da Shopee.`; sempre `state.trocando = false` e redesenha.

- [ ] **Step 1: Testes que falham (`showGuard`):** `canShow` com `ev.isTrusted:false` → `{ok:false,motivo:'simulado'}`; `ev` nulo → `'simulado'`; durante `emAndamento` → `'em_andamento'`; 1000 ms depois de `startShow` → `'cedo'`; 1500 ms depois → ok; `desligado` vence os demais motivos; `finishShow` ok zera erros; dois erros seguidos desligam, um erro seguido de sucesso não; `startShow`/`finishShow` não mutam o objeto recebido.
- [ ] **Step 2: Rodar** `npm test` — falha.
- [ ] **Step 3: Implementar** `showGuard.js` e a ação `bag-tile` em `bagTab.js` como acima (efeitos sem teste automático; manter a ação pequena e com `try/catch` que nunca derruba o painel).
- [ ] **Step 4: Rodar `npm test`** e `node --check src/live/showGuard.js src/live/bagTab.js` — passa.
- [ ] **Step 5: Commit** `feat(sacola): modo MOSTRAR com travas de segurança`.

### Task 9: Manifest, README e verificação na live real

**Files:** Modify `manifest.json`, `README.md`

- [ ] **Step 1: Manifest:** no grupo da live, ordem: `ids`, `batch`, `match`, `selectors`, `dom`, `addProducts`, `bag`, `layout`, `showGuard`, `panel`, `bagTab`; o grupo da ponte (`world: "MAIN"`) e o da Shopee ficam como estão; versão `0.4.0`; descrição atualizada. Conferir que todo arquivo listado existe e que o JSON é válido.
- [ ] **Step 2: README** em português simples: novo layout (painel grande e ajustável, Lote sempre visível, ⚙ para "abrir a Shopee em aba/janela", recolher o Lote), a grade de fotos (número no canto, nome e preço ao passar o mouse, "No ar", esgotado apagado), o modo MOSTRAR (um clique na foto coloca no ar; só clique real; um pedido por vez; dois erros seguidos desligam o Mostrar nessa live; **aviso de risco**: o Mostrar usa uma chamada interna da Shopee, área cinzenta nos termos; "No ar" é o último produto enviado pelo painel e pode ficar desatualizado se você trocar pela tela), MOVER P/ CIMA "em breve"; atualizar a lista do que a extensão faz sozinha e o que nunca faz sozinha ("nunca clica em Confirmar/Remover"; o Mostrar só com clique seu); checklist "Conferências na live real" com os itens novos (tamanho e posição lembrados após recarregar; cinco fotos por linha; Lote visível durante um lote; trocar de produto pela foto e conferir na tela da Shopee; o painel não cobre o que você precisa ver).
- [ ] **Step 3: Rodar** `npm test` e `node --check` em todos os arquivos de `src/live` — esperado: tudo passa.
- [ ] **Step 4: Verificação na live real (com o Fabio, fora do alcance de subagentes):** carregar a extensão, F5 na live; conferir layout, redimensionar e lembrar, grade, e **uma troca de produto pelo tile** conferida na tela da Shopee; se a Shopee recusar, o painel mostra o erro e desliga o Mostrar após 2 erros (o método e os cabeçalhos assumidos são confirmados aqui).
- [ ] **Step 5: Commit** `chore(painel): carrega layout e showGuard, README e versão 0.4.0`.
