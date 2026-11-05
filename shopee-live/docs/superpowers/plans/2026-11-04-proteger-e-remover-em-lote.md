# Proteger produtos e remover em lote — Plano de implementação

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Os passos usam caixas `- [ ]`.

**Objetivo:** proteger produtos da sacola (🔒, automático na 1ª leitura de cada live e manual) e remover em lote os últimos 5/10/15/20, com prévia na grade e confirmação.

**Arquitetura:** um módulo puro novo (`protect.js`) decide quem é protegido e quais são "os últimos N"; a ponte e o `bag.js` ganham a remoção de vários itens; a aba Sacola (`bagTab.js`) desenha 🔒, o modo Proteger, o botão Limpar e a prévia, e guarda a proteção em `chrome.storage.local` por live.

**Tecnologia:** JS puro (IIFE `SLA.*` com `module.exports`), testes `node --test test/*.test.cjs`, MV3.

**Especificação:** `docs/superpowers/specs/2026-11-04-proteger-e-remover-em-lote-design.md`

## Restrições globais

- Textos para o usuário em português do Brasil, linguagem simples.
- Escritas na Shopee só pela ponte (`pageBridge.js`), com caminho exato e corpo validado; um clique real = no máximo um lote; nunca repetir sozinho.
- Nunca remover produto protegido nem o "No ar" (conferir na hora de enviar).
- Dois erros seguidos desligam o Remover (individual e lote) até recarregar a página (`SLA.showGuard`, mesmas travas).
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; ramo `feature/proteger-e-remover-lote`; **sem push/merge sem ok do Fabio**.
- Sobe a versão do `manifest.json` e do README para **0.6.0** no fim.

## Foco da revisão (casos que o spec implica e nenhuma tarefa cobre por si)

1. Sacola vazia na primeira leitura: marca como iniciada com ninguém protegido (depois, produtos que o lote adicionar não ficam protegidos).
2. Só há protegidos (ou nada removível): Limpar avisa "nenhum produto pode ser removido" e não envia.
3. A sacola muda entre a prévia e o Confirmar (relida pelo timer de 20 s): a prévia é invalidada e nada é enviado.
4. Falha no meio do lote: relê a sacola e reporta quantos saíram de verdade e quantos falharam.
5. Troca de live: proteção e prévia da live anterior não passam para a nova.

---

### Tarefa 1: módulo puro `protect.js`

**Arquivos:**
- Criar: `src/live/protect.js`
- Criar: `test/protect.test.cjs`
- Modificar: `manifest.json` (grupo de scripts da live: inserir `src/live/protect.js` antes de `src/live/bagTab.js`)

**Interfaces:**
- Produz (`SLA.protect`, também `module.exports`):
  - `initialSnapshot(itens) -> number[]` — `itemId`s de todos os itens (números válidos, sem repetir).
  - `toggle(protegidos: number[], itemId: number) -> number[]` — liga/desliga (devolve array novo, sem alterar o recebido).
  - `isProtected(protegidos: number[], itemId) -> boolean` — compara como texto (`String`).
  - `removables(itens, protegidos, noAr) -> card[]` — itens que não são protegidos e cujo `itemId` não é `noAr` (esgotados e removidos entram).
  - `pickLast(itens, protegidos, noAr, n) -> { ids: number[], cards: card[], faltam: number }` — até `n` removíveis de **maior `n`** (campo `n` do card), em ordem decrescente de `n`; `faltam = max(0, n - ids.length)`.
  - `LIMITES = [5, 10, 15, 20]`.
- Consome: cards de `SLA.bag` (`{ n, itemId, shopId, outOfStock, removed, ... }`).

- [ ] **Passo 1: escrever os testes (RED)** em `test/protect.test.cjs`, com `card(n, extra)` como em `bagTab.test.cjs`:
  - `initialSnapshot([card(1), card(2), card(2)])` → `[1, 2]`; `initialSnapshot([])` → `[]`; itens sem `itemId` válido são ignorados.
  - `toggle([1], 2)` → `[1, 2]`; `toggle([1, 2], 1)` → `[2]`; o array recebido não muda.
  - `isProtected([1], '1')` → `true`; `isProtected([1], 2)` → `false`; `isProtected(undefined, 1)` → `false`.
  - `pickLast` com itens 1..8, protegidos `[8, 7]`, `noAr = 6`, `n = 3` → `ids = [5, 4, 3]`, `faltam = 0`.
  - `pickLast` com só 2 removíveis e `n = 5` → `ids.length === 2`, `faltam === 3`.
  - `pickLast` inclui esgotado/removido (card com `outOfStock: true` aparece se for dos últimos).
  - `pickLast` com tudo protegido → `ids = []`, `faltam = n`.
  - `LIMITES` deep-equal `[5, 10, 15, 20]`.
- [ ] **Passo 2: rodar `node --test test/protect.test.cjs` e ver falhar** (módulo não existe).
- [ ] **Passo 3: implementar `src/live/protect.js`** no padrão IIFE das outras (`SLA.protect`, `module.exports`). `pickLast` ordena por `n` decrescente.
- [ ] **Passo 4: rodar `node --test test/*.test.cjs`**; tudo passa.
- [ ] **Passo 5: commit** `git add src/live/protect.js test/protect.test.cjs manifest.json` + mensagem "Proteger: modulo puro (snapshot, toggle, ultimos N)".

---

### Tarefa 2: remoção de vários itens (ponte e `bag.js`)

**Arquivos:**
- Modificar: `src/live/pageBridge.js` (`validateRemoveBody`)
- Modificar: `src/live/bag.js` (nova `removeItems`; exporta)
- Modificar: `test/pageBridge.test.cjs`, `test/bag.test.cjs`

**Interfaces:**
- Consome: `bridgeRoundTrip`, `interpretWrite`, `removeItem(sessionId, itemId, win, opts)` (já existe).
- Produz:
  - `validateRemoveBody(body)` passa a aceitar `{ item_ids: [1..20 inteiros positivos, sem repetir] }`; qualquer outro corpo continua recusado.
  - `SLA.bag.REMOVE_MAX = 20` e `SLA.bag.removeItems(sessionId, itemIds, win, opts) -> Promise<{ ok: boolean, removidos: number[], falhou: null | { itemId, reason, detail? } }>`.
    - Valida: `sessionId` só dígitos; 1 a 20 ids inteiros positivos sem repetir; caso contrário `{ ok:false, removidos:[], falhou:{ itemId:null, reason:'recusado' } }` e nada é postado.
    - `opts.modo`: `'um_a_um'` (padrão: **seguro até a live provar que o pedido junto funciona**) manda um pedido por id via `removeItem`, esperando `opts.pausaMs` (padrão 300) entre eles com `opts.wait` (injetável; padrão `setTimeout`), **parando no primeiro erro**; `'junto'` manda um único pedido com todos os ids.
    - `removidos` lista os ids que a Shopee confirmou (`ok`) — no modo `'junto'`, todos ou nenhum.
    - Nunca lança nem rejeita.

- [ ] **Passo 1: testes (RED).**
  - `pageBridge.test.cjs`: **trocar** o teste "só 1" por: aceita 1 e 20 ids; recusa `[]`, 21 ids, repetido, `'1'`, `1.5`, `0`, `-1`, `NaN`, campos extras e corpo sem `item_ids`. `handleRemoveRequest` com 3 ids faz o `DELETE` exato (`JSON.stringify` do corpo).
  - `bag.test.cjs`: `removeItems` em `'um_a_um'` (3 ids → 3 mensagens `type:'remove'` em sequência, `wait` chamado 2 vezes, `removidos` = 3 ids); parando no primeiro erro (2º falha com `err_code` ≠ 0 → `ok:false`, `removidos` só o 1º, 3º nunca postado, `falhou.itemId` = 2º); `'junto'` (1 mensagem com `item_ids` completo); entradas inválidas recusadas sem postar.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** (`validateRemoveBody` com 1..20; `removeItems` como descrito; exportar `removeItems`, `REMOVE_MAX`).
- [ ] **Passo 4: `node --test test/*.test.cjs`** passa.
- [ ] **Passo 5: commit** "Ponte e bag: remover de 1 a 20 itens".

---

### Tarefa 3: desenho da aba Sacola (🔒, modo Proteger, Limpar, prévia)

**Arquivos:**
- Modificar: `src/live/bagTab.js` (`tileHtml`, `renderBagTab`)
- Modificar: `src/live/panel.js` (CSS)
- Modificar: `test/bagTab.test.cjs`

**Interfaces:**
- Consome: `SLA.protect` (Tarefa 1).
- Novos campos do estado de desenho `m` (opcionais; ausentes = comportamento atual):
  - `m.protegidos: number[]`
  - `m.modo: 'mostrar' | 'proteger'`
  - `m.limpar: null | { aberto: boolean, n: number|null, ids: number[], faltam: number }` — `aberto` mostra as opções 5/10/15/20; `ids` (com `n` escolhido) é a prévia; `faltam` avisa quando há menos removíveis que `n`.
- Produz (HTML):
  - Card protegido: `<span class="lock">🔒</span>` e **sem** `data-act="bag-rm"`.
  - Card da prévia: classe extra `previa` (vermelho).
  - Em modo `proteger`, o clique no card é a ação `bag-protect` (o tile passa a ter `data-act="bag-protect"` em vez de `bag-tile`) e as etiquetas "Mover p/ cima" e o ✕ não aparecem.
  - Seletor de modo: botões `data-modo="mostrar"` e `data-modo="proteger"` (`class="on"` no ativo).
  - Botão `data-act="bag-limpar"` ("Limpar"); aberto: botões `data-act="bag-limpar-n" data-n="5|10|15|20"`; com prévia: aviso "N produtos serão removidos" (+ "só há X..." quando `faltam > 0`), `data-act="bag-limpar-ok"` ("Confirmar remoção de N") e `data-act="bag-limpar-cancel"` ("Cancelar"). Sem removíveis: aviso "Nenhum produto pode ser removido" e sem botão de confirmar.

- [ ] **Passo 1: testes (RED)** em `bagTab.test.cjs` (ajustar os que contam `bag-rm` ou o seletor de modo):
  - card protegido tem 🔒 e não tem ✕; card não protegido tem ✕; No ar continua sem ✕.
  - `modo: 'proteger'` → tiles com `data-act="bag-protect"`, sem `bag-tile`, sem `bag-pin`, sem `bag-rm`; os 2 botões de modo existem, `on` no certo.
  - `limpar.aberto` → 4 botões `bag-limpar-n`; sem `ids`, sem Confirmar.
  - `limpar: { n: 10, ids: [..3 ids..], faltam: 7 }` → exatamente 3 cards com `previa`, texto "3 produtos serão removidos", texto "só há 3", botão Confirmar com "3" e botão Cancelar.
  - `limpar: { n: 5, ids: [], faltam: 5 }` → "Nenhum produto pode ser removido", sem Confirmar.
  - Ocupado (`fixando`/`trocando`/`desligado`/`rmDesligado`) → sem botão `bag-limpar` e sem Confirmar.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** em `bagTab.js` e CSS em `panel.js` (`.tile .lock` canto inferior esquerdo; `.tile.previa{outline:3px solid #d32f2f;filter:...}`; `.limpar` caixa de opções).
- [ ] **Passo 4: `node --test test/*.test.cjs`** passa.
- [ ] **Passo 5: commit** "Sacola: desenho do cadeado, modo Proteger e Limpar com previa".

---

### Tarefa 4: efeitos — guardar proteção, 1ª leitura, modo Proteger e fluxo do Limpar

**Arquivos:**
- Modificar: `src/live/bagTab.js` (função `init` e exports puros novos)
- Modificar: `src/live/panel.js` (`addAll`: passa o que foi lido ao `SLA.bagTab.noteBag`)
- Modificar: `test/bagTab.test.cjs`

**Interfaces:**
- Consome: `SLA.protect`, `SLA.bag.removeItems`, `SLA.showGuard`.
- Produz (puras, testáveis, exportadas em `SLA.bagTab`):
  - `storageKey(sessionId) -> string` (`'sla-protect-' + sessionId`).
  - `applyFirstRead(saved, itens) -> { iniciado: true, protegidos: number[] }` — se `saved` já está `iniciado`, devolve `saved` intacto; senão `initialSnapshot(itens)` (sacola vazia → `iniciado:true, protegidos:[]`).
  - `buildPreview(itens, protegidos, noAr, n) -> { n, ids, faltam }` (usa `pickLast`).
  - `previewStillValid(prev, itens, protegidos, noAr) -> boolean` — `true` só se todos os `ids` da prévia ainda existem em `itens`, nenhum virou protegido e nenhum é o No ar.
  - `SLA.bagTab.noteBag(sessionId, bag)` (efeito): se a live ainda não tem proteção iniciada, inicializa com `bag.items` e grava. Chamado por `panel.addAll` no `readBag` **antes** da primeira adição.
- Efeitos dentro de `init()` (sem teste automático além das funções puras):
  - Ao ler a sacola pela primeira vez numa live (inclusive na leitura inicial feita ao abrir o painel, mesmo com a aba Sacola fechada): carrega `chrome.storage.local[storageKey]`, aplica `applyFirstRead` e grava.
  - Modo `proteger`: ação `bag-protect` faz `toggle` no card (só clique real: `ev.isTrusted === true && ev.type === 'click'`), grava, redesenha.
  - `bag-limpar` abre/fecha as opções; `bag-limpar-n` calcula `buildPreview`; a leitura periódica invalida a prévia se `previewStillValid` der `false`; timer de 15 s fecha a prévia.
  - `bag-limpar-ok`: só com clique real; confere `guardaRm` (`canShow`), mesma sessão da lista na tela, `previewStillValid`; recalcula os ids a enviar a partir da prévia confirmada, **removendo qualquer protegido/No ar de última hora**; chama `SLA.bag.removeItems(sessionId, ids, undefined, { modo: 'um_a_um' })`; `startShow`/`finishShow` no `guardaRm`; relê a sacola; aviso final com o que saiu de fato ("12 removidos" / "5 de 10 removidos; a Shopee recusou o resto (...)") comparando com a sacola relida.
  - Troca de live: `semRestosDaLive` zera `limpar`, `protegidos` e `modo`; recarrega a proteção da nova live.

- [ ] **Passo 1: testes (RED)** das funções puras: `storageKey`; `applyFirstRead` (primeira vez com itens; sacola vazia; já iniciado não muda); `buildPreview`; `previewStillValid` (item sumiu → falso; item virou protegido → falso; virou No ar → falso; tudo igual → verdadeiro); `semRestosDaLive` zera `limpar`/`modo`.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** as funções puras e os efeitos acima.
- [ ] **Passo 4: `node --test test/*.test.cjs`** passa; `node --check` em `bagTab.js`, `panel.js`, `bag.js`, `pageBridge.js`, `protect.js`.
- [ ] **Passo 5: commit** "Sacola: protecao guardada por live, modo Proteger e Limpar em lote".

---

### Tarefa 5: documentação, versão 0.6.0 e verificação na live

**Arquivos:**
- Modificar: `README.md` (seção Sacola: 🔒, modo Proteger, Limpar 5/10/15/20, 1ª leitura, protegido sem ✕; checklist de conferência na live; versão)
- Modificar: `manifest.json` (`"version": "0.6.0"`)

- [ ] **Passo 1:** atualizar README (versão 0.6.0, regras novas, checklist: proteger automático ao abrir a live; marcar/desmarcar; ✕ some no protegido; Limpar mostra a prévia certa; Confirmar remove; protegidos intactos; recarregar mantém os 🔒).
- [ ] **Passo 2:** subir a versão no `manifest.json`.
- [ ] **Passo 3:** `node --test test/*.test.cjs`; tudo passa.
- [ ] **Passo 4: commit** "README e versao 0.6.0: proteger e remover em lote".
- [ ] **Passo 5 (com o Fabio, numa live real):** conferir os 3 pontos do spec — se o `DELETE` aceita vários ids (então trocar o padrão de `removeItems` para `'junto'`), se a lista tem campo de data/ordem, e se a numeração recompacta. Registrar o resultado na memória do projeto.
