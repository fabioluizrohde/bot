# Painel da sacola — Etapa 1 (aba "Sacola" só de leitura) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba "Sacola" no painel da live que lista todos os produtos da sacola (até 100), numerados, com foto, nome e preço, busca por número ou nome e contador, atualizada sozinha só por leitura.

**Architecture:** Um leitor da sacola (`src/live/bag.js`: funções puras que transformam a resposta da página em cartões, mais `readBag` com `fetch` injetável) e um controlador da aba (`src/live/bagTab.js`: estado, HTML dos cartões, política de atualização). O painel (`src/live/panel.js`) ganha um ponto de extensão para abas com ações, eventos de digitação e atenção ao foco, sem mudar o comportamento da aba "Lote".

**Tech Stack:** JavaScript sem empacotador (scripts no formato `SLA.*`), Chrome MV3, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-03-shopee-live-painel-da-sacola-design.md` (esta é a etapa 1 da "Ordem de entrega"; as etapas 2 e 3 — trocar o produto no ar e adicionar o lote — dependem da observação na live de teste e terão plano próprio).

## Global Constraints

- Só **leitura**: a única chamada é `GET /webapi/v1/session/<sessionId>/host/items?visible=true&offset=<n>&limit=1000` (mesma forma que a própria página usa), com `credentials: 'include'`. Nenhuma ação (mostrar, adicionar, remover) nesta etapa.
- Limite da sacola vem da resposta (`data.max_items`, 30 a 100 conforme a conta): nunca fixar número.
- Resposta inesperada ou erro nunca quebra o painel: vira `{ ok:false, reason }` e uma mensagem; a última lista boa continua na tela marcada "desatualizada".
- Atualização automática: a cada **20 s** só com a aba "Sacola" ativa e a página visível; para após **3 falhas seguidas** (botão "Atualizar" retoma).
- Texto da interface em português do Brasil; todo texto vindo da Shopee é escapado antes de virar HTML.
- Estilo: módulos `(function (root) { const SLA = (root.SLA = root.SLA || {}); … })(typeof window !== 'undefined' ? window : globalThis)` com `module.exports` quando `typeof module !== 'undefined'`, como `src/live/panel.js`. Commits no ramo `feature/shopee-live-extension`, sem push.
- O "No ar" (qual produto está no ar) **não** entra nesta etapa: a lista da Shopee não traz essa informação e sem o botão Mostrar não há "último escolhido". Entra na etapa 2 (desvio do spec, a confirmar com o Fabio).

## Review Focus

- Sacola com 100 produtos e `has_more` verdadeiro na primeira página: lê todas as páginas, sem repetir nem perder item (Task 2).
- Resposta que não é a esperada (HTML de login, `err_code` diferente de 0, JSON sem `data.items`): `{ ok:false }`, sem exceção (Task 2).
- Nome de produto com `<script>`, aspas ou `&`: aparece como texto, nunca como HTML (Task 4).
- Sacola vazia (0 itens) e busca sem resultado: mensagens claras, contador "0 de 100" (Task 4).
- Aba escondida, outra aba ativa ou 3 falhas seguidas: nenhuma chamada nova (Task 4).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/live/bag.js` (novo) | cartões a partir da resposta, busca, URL da foto, leitura com `fetch` injetável |
| `src/live/bagTab.js` (novo) | estado e HTML da aba "Sacola", política de atualização, ligação ao painel |
| `src/live/panel.js` (alterar) | `registerTab` aceita ações/ativação; eventos `input`; foco preservado; `redraw` |
| `manifest.json` (alterar) | carrega `bag.js` e `bagTab.js` (ordem: `bag.js`, `panel.js`, `bagTab.js`); versão `0.3.0` |
| `README.md` (alterar) | seção da aba "Sacola" |
| `test/bag.test.cjs`, `test/bagTab.test.cjs`, `test/panel.test.cjs` | testes |

---

### Task 1: Cartões, busca e URL da foto (funções puras)

**Files:** Create `src/live/bag.js`, `test/bag.test.cjs`

**Interfaces:**
- Produces em `SLA.bag` (e `module.exports`):
  - `Card = { n: number, itemId: number, shopId: number, name: string, image: string, price: string, priceBefore: string, discount: number, outOfStock: boolean, removed: boolean }`.
  - `sessionIdFromHref(href: string): string | null` — valor numérico do parâmetro `session` da URL.
  - `formatPrice(s: string): string` — `"19.99"` → `"R$19,99"`; `"1234.5"` → `"R$1.234,50"`; vazio/inválido → `""`.
  - `normalizeBag(json: any): { items: Card[], total: number, maxItems: number, hasMore: boolean, nextOffset: number } | null` — `null` quando `err_code !== 0` ou não existe `data.items` como lista. `n` = `id` do item; ordenado por `n`. `price`: `formatPrice(price_min)` se `price_min === price_max` (ou um deles faltar), senão `"R$min – R$max"`. `priceBefore`: o mesmo para `price_min_before_discount`/`price_max_before_discount` (ou `price_before_discount`), só se maior que o preço; senão `""`. `outOfStock = !!is_oos`; `removed = !!(is_del || is_unlisted || is_prohibited)`.
  - `filterBag(items: Card[], query: string): Card[]` — consulta vazia devolve tudo; só dígitos = número **exato**; texto = nome contendo a consulta, sem acento e sem diferença de maiúsculas.
  - `imageUrl(hash: string): string` — `IMG_BASE + hash`; `IMG_BASE = 'https://down-br.img.susercontent.com/file/'` com comentário `PROBE-PENDING` (a resposta traz só o código da foto, ex. `sg-11134201-…`; o endereço da foto ainda não foi confirmado na página real).

- [ ] **Step 1: Escrever os testes que falham** (`test/bag.test.cjs`, estilo de `ids.test.cjs`), usando uma resposta no formato real: `{ err_code:0, err_msg:'', data:{ items:[{ id:2, item_id:11, shop_id:1, name:'Bolsa Feminina', image:'sg-11134201-aaa', price:'39.90', price_min:'39.90', price_max:'56.90', price_before_discount:'59.90', price_min_before_discount:'59.90', price_max_before_discount:'89.90', discount:33, is_oos:false, is_del:false, is_unlisted:false }, { id:1, … }], has_more:false, next_offset:2, total_count:2, max_items:100, max_id:2 } }`. Casos: ordena por `n`; faixa de preço `"R$39,90 – R$56,90"` e `priceBefore` `"R$59,90 – R$89,90"`; preço único sem faixa; `formatPrice('1234.5') === 'R$1.234,50'`; item `is_oos` e item `is_del` marcam `outOfStock`/`removed`; `normalizeBag({err_code:5})`, `normalizeBag({})`, `normalizeBag(null)`, `normalizeBag({err_code:0,data:{}})` → `null`; `sessionIdFromHref('https://live.shopee.com.br/pc/live?session=7034350')` → `'7034350'` e sem parâmetro → `null`; `filterBag` por `'7'` acha só o número 7, por `'bolsa'` e por `'BÓLSA'` acham a Bolsa, por `'zzz'` devolve `[]`, por `''` devolve todos.
- [ ] **Step 2: Rodar** `cd shopee-live && npm test` — esperado: falha (módulo inexistente).
- [ ] **Step 3: Implementar** as funções acima em `src/live/bag.js`. Normalização de texto da busca: `NFD` sem marcas combinantes, minúsculas (como `SLA.match.normalizeName`, mas sem remover reticências).
- [ ] **Step 4: Rodar `npm test`** — esperado: tudo passa.
- [ ] **Step 5: Commit** `feat(sacola): cartões, busca e preço a partir da resposta da Shopee`.

### Task 2: Leitura da sacola com paginação e erros

**Files:** Modify `src/live/bag.js` · Test `test/bag.test.cjs`

**Interfaces:**
- Consumes: `normalizeBag`, `sessionIdFromHref` (Task 1).
- Produces: `readBag(sessionId: string, fetchFn?: typeof fetch): Promise<{ ok:true, items: Card[], total: number, maxItems: number } | { ok:false, reason: 'rede' | 'http' | 'formato', detail?: string }>`. Pede `GET /webapi/v1/session/${sessionId}/host/items?visible=true&offset=${offset}&limit=1000` com `{ credentials:'include' }`; `offset` começa em 0 e avança com `nextOffset` enquanto `hasMore` (no máximo 20 páginas, para não girar para sempre). `fetchFn` padrão = `fetch` global. Exceção do `fetch` → `reason:'rede'`; `!res.ok` → `'http'` (com `detail` = status); `res.json()` que falha ou `normalizeBag === null` → `'formato'`. Junta as páginas e remove item repetido (mesmo `n`).

- [ ] **Step 1: Escrever os testes que falham** com um `fetch` falso (função que devolve `{ ok, status, json: async () => ... }` e guarda as URLs pedidas): uma página só (assert na URL: contém `/session/7034350/host/items`, `visible=true`, `offset=0`, `limit=1000`); 100 itens em duas páginas (`has_more:true, next_offset:60`) → `items.length === 100`, segunda URL com `offset=60`, nenhum `n` repetido; página que repete o último item não duplica; `fetch` que lança → `{ok:false, reason:'rede'}`; status 500 → `'http'`; corpo `<html>` (json falha) → `'formato'`; `err_code:3` → `'formato'`; mais de 20 páginas seguidas com `has_more:true` para em 20 sem travar.
- [ ] **Step 2: Rodar** `npm test` — esperado: falha.
- [ ] **Step 3: Implementar `readBag`** como descrito.
- [ ] **Step 4: Rodar `npm test`** — esperado: passa.
- [ ] **Step 5: Commit** `feat(sacola): leitura da sacola com paginação e erros tratados`.

### Task 3: Ponto de extensão do painel para abas com ações

**Files:** Modify `src/live/panel.js` · Test `test/panel.test.cjs`

**Interfaces:**
- Produces: `SLA.panel.registerTab(key: string, label: string, render: () => string, opts?: { actions?: Record<string, (el: Element, ev: Event) => void>, onActive?: (active: boolean) => void }): void` (a assinatura antiga de 3 argumentos continua valendo); `SLA.panel.redraw(): void`; `SLA.panel.isTabActive(key: string): boolean`; função pura `findExtraAction(tabs: {key, opts?}[], act: string): Function | null` (exportada) que procura a ação nas abas extras.
- Comportamento: cliques em `[data-act]` que o painel não conhece vão para `findExtraAction`; eventos `input` em `[data-act]` também (busca digitada); ao trocar de aba, chama `onActive(false)` da anterior e `onActive(true)` da nova; `draw()` guarda o elemento com foco que tenha `data-focus-key` (e a posição do cursor) e o restaura depois de redesenhar, para a digitação na busca não perder o foco.

- [ ] **Step 1: Escrever os testes que falham** para `findExtraAction`: acha a ação pela chave `act` em qualquer aba extra; devolve `null` para ação desconhecida, aba sem `opts` e `tabs` vazio.
- [ ] **Step 2: Rodar** `npm test` — esperado: falha.
- [ ] **Step 3: Implementar** `findExtraAction`, `registerTab` com `opts`, `redraw`, `isTabActive`, o listener `input` no shadow, o repasse de ações desconhecidas em `onAction` e a preservação de foco em `draw()`. A aba "Lote" e a "Config" não mudam de comportamento.
- [ ] **Step 4: Rodar `npm test`** — esperado: passa; `node --check src/live/panel.js` sem erro.
- [ ] **Step 5: Commit** `feat(painel): abas extras com ações, digitação e foco preservado`.

### Task 4: Aba "Sacola": estado, cartões e atualização

**Files:** Create `src/live/bagTab.js`, `test/bagTab.test.cjs`

**Interfaces:**
- Consumes: `SLA.bag.readBag/filterBag/imageUrl/sessionIdFromHref` (Tasks 1–2); `SLA.panel.registerTab/redraw/isTabActive` (Task 3).
- Produces (puras, em `SLA.bagTab` e `module.exports`):
  - `renderBagTab(m: { status: 'idle'|'carregando'|'ok'|'erro', itens: Card[], total: number, maxItems: number, query: string, desatualizada: boolean, erro: string }): string` — HTML: contador `"${total} de ${maxItems}"`; campo de busca (`<input data-act="bag-q" data-focus-key="bag-q" value="…">`); botão `<button data-act="bag-refresh">Atualizar</button>`; um cartão por item filtrado (`n` grande, foto com `onerror` que a esconde, nome, preço, preço antigo riscado se houver, cartão com classe `apagado` se `outOfStock`/`removed`); mensagens: `"Sacola vazia."` (0 itens), `"Nenhum produto encontrado."` (busca sem resultado), `"Lendo a sacola…"`, `"Não consegui ler a sacola (…)"` + o botão Atualizar, `"Lista desatualizada"` quando `desatualizada`. Todo texto da Shopee passa por `esc`.
  - `shouldPoll(s: { ativa: boolean, escondida: boolean, falhas: number }): boolean` — verdadeiro só com a aba ativa, página visível e menos de 3 falhas.
  - `nextState(prev, resultado): estado` — aplica o resultado de `readBag` ao estado `{ status, itens, total, maxItems, query, desatualizada, erro, falhas }` (ok → `itens = resultado.items`, `total`, `maxItems`, `status:'ok'`, zera falhas, `desatualizada=false`; erro → mantém `itens`/`total`/`maxItems` anteriores, `status:'erro'`, soma uma falha, `desatualizada=true`, `erro` com texto em português por `reason`: `'rede'` "sem conexão", `'http'` "a Shopee respondeu com erro", `'formato'` "resposta inesperada").
- Efeitos (sem teste automático): `init()` registra a aba `"sacola"`/"Sacola" no painel com ações `bag-q` (atualiza `query` e `redraw`) e `bag-refresh` (lê agora e zera `falhas`); `onActive(true)` lê agora (se passaram mais de 5 s) e inicia o intervalo de 20 s que chama `shouldPoll`; `onActive(false)` para o intervalo. Só inicia em `location.pathname.startsWith('/pc/live')` com `session` na URL.

- [ ] **Step 1: Escrever os testes que falham:** `renderBagTab` — 100 itens mostram `"100 de 100"` e 100 cartões; item com nome `<script>alert(1)</script> & "aspas"` aparece escapado (assert que `<script>` não está no HTML e `&lt;script&gt;` está); `total 0` → `"Sacola vazia."` e `"0 de 100"`; busca sem resultado → `"Nenhum produto encontrado."`; item `outOfStock` tem `apagado`; `desatualizada:true` mostra `"Lista desatualizada"`; `status:'erro'` mostra `"Não consegui ler a sacola"`. `shouldPoll` — falso com aba inativa, com página escondida e com `falhas:3`; verdadeiro com `{ativa:true, escondida:false, falhas:2}`. `nextState` — ok substitui lista e zera falhas; erro mantém a lista anterior, `falhas+1`, `desatualizada:true`; três erros seguidos → `falhas:3`.
- [ ] **Step 2: Rodar** `npm test` — esperado: falha.
- [ ] **Step 3: Implementar** as três funções puras e o HTML (CSS do painel fica em `panel.js`; acrescentar as poucas regras da aba ao `CSS` do painel: cartão em linha com número em destaque, `.apagado{opacity:.45}`, preço antigo riscado, campo de busca ocupando a largura).
- [ ] **Step 4: Implementar `init()`** com os efeitos acima (chamada guardada: só roda quando `document` e `chrome.runtime` existem, como `panel.js`).
- [ ] **Step 5: Rodar `npm test`** e `node --check src/live/bagTab.js` — esperado: passa.
- [ ] **Step 6: Commit** `feat(sacola): aba Sacola só de leitura com busca, contador e atualização`.

### Task 5: Manifest, README e verificação na live real

**Files:** Modify `manifest.json`, `README.md`

- [ ] **Step 1: Manifest:** no grupo da live, carregar `src/live/bag.js` antes de `src/live/panel.js` e `src/live/bagTab.js` depois dele; versão `0.3.0`; descrição mencionando a sacola. Conferir que todo arquivo listado existe.
- [ ] **Step 2: README:** seção "Aba Sacola" em português simples (o que mostra, busca por número ou nome, atualização a cada 20 s só com a aba aberta, o que significa "Lista desatualizada", que nesta versão ela só lê e não altera nada, que "No ar" e o botão Mostrar vêm na próxima etapa) e, na checklist do "Primeiro teste na live real", o item: conferir com o Fabio se as fotos aparecem (endereço `IMG_BASE` em `src/live/bag.js` é palpite) e se os números batem com a Lista de produtos da Shopee.
- [ ] **Step 3: Rodar** `npm test` e `node --check` em todos os arquivos de `src/live` — esperado: tudo passa.
- [ ] **Step 4: Verificação na live real (com o Fabio, fora do alcance de subagentes):** carregar a extensão, abrir a aba "Sacola" numa live com produtos; conferir contador, números iguais aos da Lista de produtos, busca por número e por nome, fotos, e que nenhuma chamada nova é feita com a aba "Lote" ativa. Se as fotos não aparecerem, corrigir `IMG_BASE` olhando o endereço de uma foto na página.
- [ ] **Step 5: Commit** `chore(sacola): carrega a aba Sacola, README e versão 0.3.0`.
