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
  assert.ok(html.includes("onerror=\"this.style.display='none'\""));
  assert.ok(html.includes('img-1'));
});

test('renderBagTab: preço antigo riscado', () => {
  const html = bagTab.renderBagTab(base({ itens: [card(1, { priceBefore: 'R$20,00' })], total: 1 }));
  assert.ok(html.includes('<s>R$20,00</s>'));
});

test('renderBagTab: desatualizada, carregando e erro', () => {
  assert.ok(bagTab.renderBagTab(base({ desatualizada: true })).includes('Lista desatualizada'));
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
