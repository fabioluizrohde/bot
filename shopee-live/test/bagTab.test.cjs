const { test } = require('node:test');
const assert = require('node:assert');
require('../src/live/bag.js');
require('../src/live/protect.js');
const bagTab = require('../src/live/bagTab.js');

const card = (n, extra) => ({
  n, itemId: n, shopId: 1, name: `Produto ${n}`, image: `img-${n}`, price: 'R$10,00',
  priceBefore: '', discount: 0, outOfStock: false, removed: false, ...extra,
});
const base = (extra) => ({
  status: 'ok', itens: [], total: 0, maxItems: 100, query: '', desatualizada: false, erro: '', ...extra,
});
const count = (html, s) => html.split(s).length - 1;

test('renderBagTab: 100 itens mostram contador e 100 tiles', () => {
  const itens = Array.from({ length: 100 }, (_, i) => card(i + 1));
  const html = bagTab.renderBagTab(base({ itens, total: 100 }));
  assert.ok(html.includes('100 de 100'));
  assert.strictEqual(count(html, 'data-act="bag-tile"'), 100);
  assert.strictEqual(count(html, '<div class="grade">'), 1);
  assert.ok(html.includes('<span class="tn">1</span>') && html.includes('<span class="tn">100</span>'));
  assert.ok(html.includes('title="Produto 7 — R$10,00"') && html.includes('data-n="7"'));
  assert.ok(html.includes('data-act="bag-q"') && html.includes('data-focus-key="bag-q"'));
  assert.ok(html.includes('data-act="bag-refresh"'));
});

test('renderBagTab: texto da Shopee é escapado', () => {
  const nome = '<script>alert(1)</script> & "aspas"';
  const html = bagTab.renderBagTab(base({ itens: [card(1, { name: nome, price: '<u>x</u>' })], total: 1 }));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<u>'));
  assert.ok(html.includes('title="&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;aspas&quot; — &lt;u&gt;x&lt;/u&gt;"'));
});

test('renderBagTab: busca digitada volta no value, escapada', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, query: 'a"b<' }));
  assert.ok(html.includes('value="a&quot;b&lt;"'));
});

test('renderBagTab: sacola vazia', () => {
  const html = bagTab.renderBagTab(base({ total: 0 }));
  assert.ok(html.includes('Sacola vazia.'));
  assert.ok(html.includes('0 de 100'));
});

test('renderBagTab: sem maxItems mostra só o total', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, maxItems: 0 }));
  assert.ok(!html.includes(' de '));
});

test('renderBagTab: busca sem resultado', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, query: 'zzz' }));
  assert.ok(html.includes('Nenhum produto encontrado.'));
});

test('renderBagTab: item esgotado/removido fica apagado e desligado; sem onerror', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1, { outOfStock: true }), card(2, { removed: true }), card(3)], total: 3 }));
  assert.strictEqual(count(html, 'apagado'), 2);
  assert.strictEqual(count(html, ' disabled'), 0); // sem disabled: ele bloquearia o clique no ✕ de remover
  assert.strictEqual(count(html, 'aria-disabled="true"'), 2); // os 2 tiles
  assert.ok(!html.includes('onerror')); // sem código embutido: a página pode bloquear (CSP)
  assert.ok(html.includes('data-img="img-1"'));
});

test('renderBagTab: modo padrão é mostrar', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1 }));
  assert.ok(html.includes('<button class="on" data-act="bag-modo" data-modo="mostrar">Mostrar</button>'));
});

test('renderBagTab: title leva o preço antigo quando existe, tudo escapado', () => {
  const com = bagTab.renderBagTab(base({ itens: [card(1, { name: 'Kit 6 Xícaras', price: 'R$19,90', priceBefore: 'R$29,90' })], total: 1 }));
  assert.ok(com.includes('title="Kit 6 Xícaras — R$19,90 (antes R$29,90)"'));
  const sem = bagTab.renderBagTab(base({ itens: [card(1)], total: 1 }));
  assert.ok(sem.includes('title="Produto 1 — R$10,00"') && !sem.includes('antes'));
  const esc = bagTab.renderBagTab(base({ itens: [card(1, { priceBefore: 'R$"<b>' })], total: 1 }));
  assert.ok(esc.includes('(antes R$&quot;&lt;b&gt;)') && !esc.includes('R$"<b>'));
});

test('renderBagTab: noAr aceita número ou texto e null nunca marca', () => {
  const um = [card(5)];
  assert.ok(bagTab.renderBagTab(base({ itens: um, total: 1, noAr: 5 })).includes('tile noar'));
  assert.ok(bagTab.renderBagTab(base({ itens: um, total: 1, noAr: '5' })).includes('tile noar'));
  assert.ok(!bagTab.renderBagTab(base({ itens: [card(1, { itemId: null })], total: 1, noAr: null })).includes('noar'));
  assert.ok(!bagTab.renderBagTab(base({ itens: [card(1, { itemId: undefined })], total: 1 })).includes('noar'));
});

test('renderBagTab: noAr marca só o tile certo', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1), card(2), card(3)], total: 3, noAr: 2 }));
  assert.strictEqual(count(html, 'noar'), 1);
  assert.ok(/class="tile noar"[^>]*data-n="2"/.test(html));
});

test('renderBagTab: trocando desliga todos os tiles', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1), card(2)], total: 2, trocando: true }));
  assert.strictEqual(count(html, 'trocando'), 2);
  assert.strictEqual((html.match(/<button class="tile[^>]*disabled/g) || []).length, 2);
});

test('renderBagTab: aviso aparece em <p class="warn">', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, aviso: 'Falhou <b>' }));
  assert.ok(html.includes('<p class="warn">Falhou &lt;b&gt;</p>'));
});

// Conferido na live real em 2026-11-03: o servidor de fotos (cf.shopee.com.br) recusa o carregamento
// comum de <img> mas entrega a foto quando o pedido é feito no modo CORS (crossorigin="anonymous").
test('renderBagTab: toda foto pede o modo CORS (crossorigin="anonymous")', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1), card(2)], total: 2 }));
  assert.strictEqual(count(html, '<img'), 2);
  assert.strictEqual(count(html, 'crossorigin="anonymous"'), 2);
});

test('renderBagTab: desatualizada, carregando e erro', () => {
  assert.ok(bagTab.renderBagTab(base({ itens: [card(1)], total: 1, desatualizada: true })).includes('Lista desatualizada'));
  assert.ok(bagTab.renderBagTab(base({ status: 'carregando' })).includes('Lendo a sacola…'));
  const e = bagTab.renderBagTab(base({ status: 'erro', erro: 'sem conexão' }));
  assert.ok(e.includes('Não consegui ler a sacola (sem conexão)'));
  assert.ok(e.includes('data-act="bag-refresh"'));
});

test('shouldPoll', () => {
  assert.strictEqual(bagTab.shouldPoll({ ativa: false, escondida: false, falhas: 0 }), false);
  assert.strictEqual(bagTab.shouldPoll({ ativa: true, escondida: true, falhas: 0 }), false);
  assert.strictEqual(bagTab.shouldPoll({ ativa: true, escondida: false, falhas: 3 }), false);
  assert.strictEqual(bagTab.shouldPoll({ ativa: true, escondida: false, falhas: 2 }), true);
});

test('nextState: ok substitui lista e zera falhas', () => {
  const prev = { ...bagTab.initialState(), itens: [card(9)], total: 1, falhas: 2, desatualizada: true, status: 'erro', erro: 'x', query: 'q' };
  const s = bagTab.nextState(prev, { ok: true, items: [card(1), card(2)], total: 2, maxItems: 100 });
  assert.deepStrictEqual(
    { status: s.status, n: s.itens.length, total: s.total, max: s.maxItems, falhas: s.falhas, des: s.desatualizada, query: s.query },
    { status: 'ok', n: 2, total: 2, max: 100, falhas: 0, des: false, query: 'q' },
  );
});

test('nextState: erro mantém a lista e soma falhas; três seguidas', () => {
  let s = bagTab.nextState(bagTab.initialState(), { ok: true, items: [card(1)], total: 1, maxItems: 100 });
  s = bagTab.nextState(s, { ok: false, reason: 'rede' });
  assert.strictEqual(s.status, 'erro');
  assert.strictEqual(s.itens.length, 1);
  assert.strictEqual(s.total, 1);
  assert.strictEqual(s.falhas, 1);
  assert.strictEqual(s.desatualizada, true);
  assert.strictEqual(s.erro, 'sem conexão');
  s = bagTab.nextState(s, { ok: false, reason: 'http' });
  assert.strictEqual(s.erro, 'a Shopee respondeu com erro');
  s = bagTab.nextState(s, { ok: false, reason: 'formato' });
  assert.strictEqual(s.erro, 'resposta inesperada');
  assert.strictEqual(s.falhas, 3);
});

test('nextState: texto do erro inclui o detalhe quando existe', () => {
  const e = (r) => bagTab.nextState(bagTab.initialState(), r).erro;
  assert.strictEqual(e({ ok: false, reason: 'http', detail: '403' }), 'a Shopee respondeu com erro (403)');
  assert.strictEqual(e({ ok: false, reason: 'http' }), 'a Shopee respondeu com erro');
  assert.strictEqual(e({ ok: false, reason: 'rede', detail: 'sem resposta da página' }), 'sem conexão (sem resposta da página)');
  assert.strictEqual(e({ ok: false, reason: 'rede' }), 'sem conexão');
  assert.strictEqual(e({ ok: false, reason: 'formato', detail: 'json' }), 'resposta inesperada');
});

// ---------- Revisão final: fotos que falharam (Importante 3) ----------

test('renderBagTab: foto que já falhou não é pedida de novo (Set ou lista)', () => {
  const itens = [card(1), card(2)];
  for (const fotosComErro of [new Set(['img-1']), ['img-1']]) {
    const html = bagTab.renderBagTab(base({ itens, total: 2, fotosComErro }));
    assert.ok(!html.includes('img-1'));
    assert.ok(html.includes('data-img="img-2"'));
    assert.strictEqual(count(html, '<img'), 1);
  }
  assert.strictEqual(count(bagTab.renderBagTab(base({ itens, total: 2 })), '<img'), 2);
});

test('markImageFailed: guarda o código da foto que falhou', () => {
  bagTab.markImageFailed('img-77');
  bagTab.markImageFailed('');
  bagTab.markImageFailed(null);
  assert.ok(bagTab.failedImages().includes('img-77'));
  assert.ok(!bagTab.failedImages().includes(''));
  const html = bagTab.renderBagTab(base({ itens: [card(77)], total: 1, fotosComErro: bagTab.failedImages() }));
  assert.ok(!html.includes('<img'));
});

// ---------- Revisão final: sessão lida a cada leitura (Importante 4) ----------

test('sessionStep: sem sessão, mesma sessão, outra sessão', () => {
  assert.deepStrictEqual(bagTab.sessionStep('https://live.shopee.com.br/pc/live', null), { sessionId: null, limpar: false });
  assert.deepStrictEqual(bagTab.sessionStep('https://live.shopee.com.br/pc/live', '5'), { sessionId: null, limpar: false });
  assert.deepStrictEqual(bagTab.sessionStep('https://live.shopee.com.br/pc/live?session=5', null), { sessionId: '5', limpar: false });
  assert.deepStrictEqual(bagTab.sessionStep('https://live.shopee.com.br/pc/live?session=5', '5'), { sessionId: '5', limpar: false });
  assert.deepStrictEqual(bagTab.sessionStep('https://live.shopee.com.br/pc/live?session=6', '5'), { sessionId: '6', limpar: true });
});

test('noSessionState: mensagem própria, sem lista e sem somar falha', () => {
  const prev = { ...bagTab.initialState(), status: 'ok', itens: [card(1)], total: 1, maxItems: 100, falhas: 1, query: 'q', desatualizada: true };
  const s = bagTab.noSessionState(prev);
  assert.strictEqual(s.status, 'sem_sessao');
  assert.deepStrictEqual(s.itens, []);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.desatualizada, false);
  assert.strictEqual(s.falhas, 1);
  assert.strictEqual(s.query, 'q');
  const html = bagTab.renderBagTab(s);
  assert.ok(html.includes('<p class="warn">Abra a página da live (sem sessão na URL).</p>'));
  assert.ok(!html.includes('Não consegui ler a sacola'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('Sacola vazia.'));
  assert.ok(html.includes('data-act="bag-refresh"'));
});

test('clearForNewSession: tira a lista da live anterior e mantém busca e falhas', () => {
  const prev = { ...bagTab.initialState(), status: 'ok', itens: [card(1)], total: 1, maxItems: 100, falhas: 2, query: 'q', desatualizada: true, erro: 'x' };
  const s = bagTab.clearForNewSession(prev);
  assert.deepStrictEqual(
    { status: s.status, itens: s.itens, total: s.total, max: s.maxItems, des: s.desatualizada, erro: s.erro, falhas: s.falhas, query: s.query },
    { status: 'carregando', itens: [], total: 0, max: 0, des: false, erro: '', falhas: 2, query: 'q' },
  );
});

test('sessão nova que sempre falha ainda para a atualização em MAX_FALHAS', () => {
  let s = bagTab.nextState(bagTab.initialState(), { ok: true, items: [card(1)], total: 1, maxItems: 100 });
  let idDaLista = '5';
  for (let i = 0; i < 10 && bagTab.shouldPoll({ ativa: true, escondida: false, falhas: s.falhas }); i++) {
    const p = bagTab.sessionStep('https://live.shopee.com.br/pc/live?session=6', idDaLista);
    if (p.limpar) { s = bagTab.clearForNewSession(s); idDaLista = null; }
    s = bagTab.nextState(s, { ok: false, reason: 'rede' });
  }
  assert.strictEqual(s.falhas, bagTab.MAX_FALHAS);
  assert.deepStrictEqual(s.itens, []);
});

// ---------- Revisão final: primeira leitura falhou (menor) ----------

test('renderBagTab: falha sem lista mostra só o erro (sem contador e sem "desatualizada")', () => {
  const s = bagTab.nextState(bagTab.initialState(), { ok: false, reason: 'rede' });
  const html = bagTab.renderBagTab({ ...s, maxItems: 0 });
  assert.ok(html.includes('Não consegui ler a sacola (sem conexão)'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('Lista desatualizada'));
  // com lista, o contador e o aviso continuam
  const c = bagTab.renderBagTab(bagTab.nextState({ ...bagTab.initialState(), status: 'ok', itens: [card(1)], total: 1, maxItems: 100 }, { ok: false, reason: 'rede' }));
  assert.ok(c.includes('<b>1 de 100</b>') && c.includes('Lista desatualizada'));
});

test('avisoDeErro: com detalhe mostra motivo e detalhe', () => {
  assert.strictEqual(bagTab.avisoDeErro({ ok: false, reason: 'http', detail: '403' }), 'Não consegui trocar o produto (http: 403).');
  assert.strictEqual(bagTab.avisoDeErro({ ok: false, reason: 'rede', detail: 'timeout' }), 'Não consegui trocar o produto (rede: timeout).');
});

test('avisoDeErro: sem detalhe mostra só o motivo', () => {
  assert.strictEqual(bagTab.avisoDeErro({ ok: false, reason: 'rede' }), 'Não consegui trocar o produto (rede).');
  assert.strictEqual(bagTab.avisoDeErro({ ok: false, reason: 'recusado', detail: '' }), 'Não consegui trocar o produto (recusado).');
});

test('avisoDeErro: resultado sem motivo vira "erro"', () => {
  assert.strictEqual(bagTab.avisoDeErro(undefined), 'Não consegui trocar o produto (erro).');
});

test('AVISO_DESLIGADO: texto fixo', () => {
  assert.strictEqual(bagTab.AVISO_DESLIGADO, 'O Mostrar foi desligado nesta live após 2 erros. Use a tela da Shopee.');
});

// ---------- Revisão final da parte 1: troca de live sem recarregar (Importante 2) ----------

for (const nome of ['clearForNewSession', 'noSessionState']) {
  test(`${nome}: "No ar", "trocando" e aviso de erro não passam para outra live`, () => {
    const prev = { ...bagTab.initialState(), status: 'ok', itens: [card(5)], total: 1, noAr: 5, trocando: true, aviso: 'Não consegui trocar o produto (rede).' };
    const s = bagTab[nome](prev);
    assert.strictEqual(s.noAr, null);
    assert.strictEqual(s.trocando, false);
    assert.strictEqual(s.aviso, '');
    // mesma lista de produtos na live nova: nada marcado "No ar"
    assert.ok(!bagTab.renderBagTab({ ...s, status: 'ok', itens: [card(5)], total: 1 }).includes('noar'));
  });

  test(`${nome}: aviso de Mostrar desligado continua (a trava vale até recarregar a página)`, () => {
    const prev = { ...bagTab.initialState(), noAr: 5, aviso: bagTab.AVISO_DESLIGADO };
    const s = bagTab[nome](prev);
    assert.strictEqual(s.aviso, bagTab.AVISO_DESLIGADO);
    assert.strictEqual(s.noAr, null);
  });
}

// ---------- Revisão final da parte 1: Mostrar desligado aparece nos tiles (menor 4) ----------

test('renderBagTab: Mostrar desligado deixa todos os tiles desligados, com classe e explicação', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1), card(2)], total: 2, desligado: true }));
  const tiles = html.match(/<button class="tile[^>]*>/g);
  assert.strictEqual(tiles.length, 2);
  for (const t of tiles) {
    assert.ok(/class="tile[^"]* desligado"/.test(t), t);
    assert.ok(t.includes(' disabled'), t);
    assert.ok(t.includes('Mostrar desligado nesta live'), t);
  }
  // nome e preço continuam no title
  assert.ok(html.includes('title="Produto 1 — R$10,00 · Mostrar desligado nesta live"'));
});

test('renderBagTab: sem desligado, nada muda nos tiles', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, desligado: false }));
  assert.ok(!html.includes('desligado'));
  assert.ok(!/<button class="tile[^>]*disabled/.test(html));
});

// ---------- Revisão final da parte 1: tile achado pelo itemId (menor 6) ----------

test('renderBagTab: todo tile leva data-item com o itemId (escapado); sem itemId fica vazio', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1, { itemId: 9001 }), card(2, { itemId: '7"<' }), card(3, { itemId: null })], total: 3 }));
  assert.ok(/data-n="1" data-item="9001"/.test(html));
  assert.ok(html.includes('data-item="7&quot;&lt;"'));
  assert.ok(/data-n="3" data-item=""/.test(html));
  assert.ok(!html.includes('data-item="null"'));
});

test('cardByItemId: acha pelo itemId comparado como texto, nunca pelo número do tile', () => {
  const itens = [card(1, { itemId: 999 }), card(2, { itemId: '1000' }), card(3, { itemId: null })];
  assert.strictEqual(bagTab.cardByItemId(itens, '999'), itens[0]);
  assert.strictEqual(bagTab.cardByItemId(itens, 999), itens[0]);
  assert.strictEqual(bagTab.cardByItemId(itens, '1000'), itens[1]);
  assert.strictEqual(bagTab.cardByItemId(itens, '1'), null); // n=1 não conta
  assert.strictEqual(bagTab.cardByItemId(itens, '3'), null);
  for (const v of [undefined, null, '', 'null', 'undefined']) assert.strictEqual(bagTab.cardByItemId(itens, v), null, String(v));
  assert.strictEqual(bagTab.cardByItemId(null, '999'), null);
  assert.strictEqual(bagTab.cardByItemId([], '999'), null);
});

// ---------- Mover p/ cima (etiqueta "No ar" vira o botão ao passar o mouse) ----------

test('renderBagTab: todo tile em estoque tem a etiqueta clicável de mover, com o itemId', () => {
  const itens = [card(1), card(2), card(3, { outOfStock: true }), card(4, { removed: true })];
  const html = bagTab.renderBagTab(base({ itens, total: 4, noAr: 2 }));
  assert.strictEqual(count(html, 'data-act="bag-pin"'), 2); // 1 e 2; esgotado e removido não
  assert.ok(/<span class="tag" data-act="bag-pin" data-item="2"[^>]*>/.test(html));
  assert.ok(/<span class="tag off" data-act="bag-pin" data-item="1"[^>]*>/.test(html)); // fora do ar: só aparece no hover
  assert.strictEqual(count(html, 'No ar'), 1); // só o produto no ar mostra "No ar"
  assert.ok(html.includes('Mover p/ cima'));
  assert.strictEqual(count(bagTab.renderBagTab(base({ itens: [card(1)], total: 1, noAr: null })), 'data-act="bag-pin"'), 1);
});

test('renderBagTab: sem etiqueta de mover quando fixando, trocando ou Mostrar desligado', () => {
  const itens = [card(1), card(2)];
  for (const extra of [{ fixando: true }, { trocando: true }, { desligado: true }, { pinDesligado: true }]) {
    const html = bagTab.renderBagTab(base({ itens, total: 2, noAr: 1, ...extra }));
    assert.strictEqual(count(html, 'data-act="bag-pin"'), 0, JSON.stringify(extra));
    assert.strictEqual(count(html, 'No ar'), 1);
  }
});

test('renderBagTab: o botão "Mover" em breve deixou de existir', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1 }));
  assert.ok(!html.includes('em breve'));
  assert.ok(!html.includes('data-modo="mover"'));
});

test('AVISO_FIXAR_DESLIGADO existe e pinGuard usa as travas do showGuard', () => {
  assert.ok(/fixar|mover/i.test(bagTab.AVISO_PIN_DESLIGADO));
});

// ---------- Remover da sacola (✕ no canto, confirmação no próprio card) ----------

test('renderBagTab: ✕ de remover em todo tile (inclusive esgotado e removido), menos no que está No ar', () => {
  const itens = [card(1), card(2), card(3, { outOfStock: true }), card(4, { removed: true })];
  const html = bagTab.renderBagTab(base({ itens, total: 4, noAr: 2 }));
  assert.strictEqual(count(html, 'data-act="bag-rm"'), 3); // 1, 3 (esgotado) e 4 (removido)
  assert.ok(/<span class="rm" data-act="bag-rm" data-item="1"[^>]*>/.test(html));
  assert.ok(/<span class="rm" data-act="bag-rm" data-item="3"[^>]*>/.test(html));
  assert.ok(/<span class="rm" data-act="bag-rm" data-item="4"[^>]*>/.test(html));
  assert.ok(!/data-act="bag-rm" data-item="2"/.test(html)); // nunca o produto no ar
});

test('renderBagTab: aguardando confirmação, o ✕ do produto vira "Remover?" (só dele)', () => {
  const itens = [card(1), card(2)];
  const html = bagTab.renderBagTab(base({ itens, total: 2, confirmando: 1 }));
  assert.strictEqual(count(html, 'Remover?'), 1);
  assert.ok(/<span class="rm sim" data-act="bag-rm" data-item="1"[^>]*>Remover\?<\/span>/.test(html));
  assert.ok(/<span class="rm" data-act="bag-rm" data-item="2"/.test(html));
});

test('renderBagTab: sem ✕ quando há pedido em andamento ou Mostrar/Mover desligado', () => {
  const itens = [card(1)];
  for (const extra of [{ fixando: true }, { trocando: true }, { desligado: true }, { pinDesligado: true }, { rmDesligado: true }]) {
    const html = bagTab.renderBagTab(base({ itens, total: 1, ...extra }));
    assert.strictEqual(count(html, 'data-act="bag-rm"'), 0, JSON.stringify(extra));
  }
});

test('AVISO_RM_DESLIGADO existe', () => {
  assert.ok(/remover/i.test(bagTab.AVISO_RM_DESLIGADO));
});

// ---------- Proteger (🔒), modo Proteger e Limpar em lote (desenho) ----------

test('renderBagTab: card protegido tem 🔒 e não tem ✕; os outros têm ✕', () => {
  const itens = [card(1), card(2), card(3)];
  const html = bagTab.renderBagTab(base({ itens, total: 3, protegidos: [2] }));
  assert.strictEqual(count(html, 'class="lock"'), 1);
  assert.ok(/data-item="2"[^>]*>[\s\S]*?class="lock"/.test(html));
  assert.ok(!/data-act="bag-rm" data-item="2"/.test(html));
  assert.ok(/data-act="bag-rm" data-item="1"/.test(html) && /data-act="bag-rm" data-item="3"/.test(html));
});

test('renderBagTab: modo proteger troca a ação do tile e esconde Mover e ✕', () => {
  const itens = [card(1), card(2)];
  const html = bagTab.renderBagTab(base({ itens, total: 2, modo: 'proteger', protegidos: [1] }));
  assert.strictEqual(count(html, 'data-act="bag-protect"'), 2);
  assert.strictEqual(count(html, 'data-act="bag-tile"'), 0);
  assert.strictEqual(count(html, 'data-act="bag-pin"'), 0);
  assert.strictEqual(count(html, 'data-act="bag-rm"'), 0);
  assert.ok(html.includes('<button class="on" data-act="bag-modo" data-modo="proteger">Proteger</button>'));
  assert.ok(html.includes('<button data-act="bag-modo" data-modo="mostrar">Mostrar</button>'));
  assert.strictEqual(count(html, 'class="lock"'), 1); // o 🔒 continua à vista
});

test('renderBagTab: botão Limpar fechado; aberto mostra 5, 10, 15 e 20', () => {
  const itens = [card(1), card(2)];
  const fechado = bagTab.renderBagTab(base({ itens, total: 2 }));
  assert.strictEqual(count(fechado, 'data-act="bag-limpar"'), 1);
  assert.strictEqual(count(fechado, 'data-act="bag-limpar-n"'), 0);
  const aberto = bagTab.renderBagTab(base({ itens, total: 2, limpar: { aberto: true, n: null, ids: [], faltam: 0 } }));
  for (const n of [5, 10, 15, 20]) assert.ok(aberto.includes(`data-act="bag-limpar-n" data-n="${n}"`), String(n));
  assert.strictEqual(count(aberto, 'data-act="bag-limpar-ok"'), 0);
});

test('renderBagTab: prévia destaca só os cards da lista, avisa a falta e traz Confirmar e Cancelar', () => {
  const itens = [card(1), card(2), card(3), card(4)];
  const html = bagTab.renderBagTab(base({ itens, total: 4, limpar: { aberto: true, n: 10, ids: [3, 4], faltam: 8 } }));
  assert.strictEqual(count(html, 'tile previa'), 2);
  assert.ok(/data-n="3"/.test(html) && /class="tile previa[^"]*"[^>]*data-n="3"/.test(html));
  assert.ok(/2 produtos serão removidos/.test(html));
  assert.ok(/só há 2/i.test(html));
  assert.ok(/data-act="bag-limpar-ok"[^>]*>[^<]*Confirmar remoção de 2/.test(html));
  assert.strictEqual(count(html, 'data-act="bag-limpar-cancel"'), 1);
  const um = bagTab.renderBagTab(base({ itens, total: 4, limpar: { aberto: true, n: 1, ids: [4], faltam: 0 } }));
  assert.ok(/1 produto será removido/.test(um));
  assert.ok(!/só há/i.test(um));
});

test('renderBagTab: sem nenhum removível avisa e não oferece Confirmar', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1)], total: 1, protegidos: [1], limpar: { aberto: true, n: 5, ids: [], faltam: 5 } }));
  assert.ok(/Nenhum produto pode ser removido/.test(html));
  assert.strictEqual(count(html, 'data-act="bag-limpar-ok"'), 0);
  assert.strictEqual(count(html, 'tile previa'), 0);
});

test('renderBagTab: ocupado ou Remover desligado esconde Limpar e Confirmar', () => {
  const itens = [card(1)];
  for (const extra of [{ fixando: true }, { trocando: true }, { desligado: true }, { rmDesligado: true }]) {
    const html = bagTab.renderBagTab(base({ itens, total: 1, limpar: { aberto: true, n: 5, ids: [10], faltam: 4 }, ...extra }));
    assert.strictEqual(count(html, 'data-act="bag-limpar'), 0, JSON.stringify(extra));
  }
});
