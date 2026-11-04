const { test } = require('node:test');
const assert = require('node:assert');
require('../src/live/bag.js');
const bagTab = require('../src/live/bagTab.js');

const card = (n, extra) => ({
  n, itemId: n, shopId: 1, name: `Produto ${n}`, image: `img-${n}`, price: 'R$10,00',
  priceBefore: '', discount: 0, outOfStock: false, removed: false, ...extra,
});
const base = (extra) => ({
  status: 'ok', itens: [], total: 0, maxItems: 100, query: '', desatualizada: false, erro: '', ...extra,
});
const count = (html, s) => html.split(s).length - 1;

test('renderBagTab: 100 itens mostram contador e 100 cartões', () => {
  const itens = Array.from({ length: 100 }, (_, i) => card(i + 1));
  const html = bagTab.renderBagTab(base({ itens, total: 100 }));
  assert.ok(html.includes('100 de 100'));
  assert.strictEqual(count(html, 'class="cartao'), 100);
  assert.ok(html.includes('data-act="bag-q"') && html.includes('data-focus-key="bag-q"'));
  assert.ok(html.includes('data-act="bag-refresh"'));
});

test('renderBagTab: texto da Shopee é escapado', () => {
  const nome = '<script>alert(1)</script> & "aspas"';
  const html = bagTab.renderBagTab(base({ itens: [card(1, { name: nome, price: '<u>x</u>' })], total: 1 }));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<u>'));
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

test('renderBagTab: item esgotado/removido fica apagado; foto some se falhar', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1, { outOfStock: true }), card(2, { removed: true }), card(3)], total: 3 }));
  assert.strictEqual(count(html, 'apagado'), 2);
  assert.ok(!html.includes('onerror')); // sem código embutido: a página pode bloquear (CSP)
  assert.ok(html.includes('data-img="img-1"'));
  assert.ok(html.includes('img-1'));
});

test('renderBagTab: preço antigo riscado', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1, { priceBefore: 'R$20,00' })], total: 1 }));
  assert.ok(html.includes('<s>R$20,00</s>'));
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
