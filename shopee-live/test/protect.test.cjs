const { test } = require('node:test');
const assert = require('node:assert');
const protect = require('../src/live/protect.js');

const card = (n, extra) => ({ n, itemId: n * 10, shopId: 1, name: `Produto ${n}`, outOfStock: false, removed: false, ...extra });
const lista = (k) => Array.from({ length: k }, (_, i) => card(i + 1));

test('initialSnapshot: itemIds válidos, sem repetir; vazio e inválidos', () => {
  assert.deepStrictEqual(protect.initialSnapshot([card(1), card(2), card(2)]), [10, 20]);
  assert.deepStrictEqual(protect.initialSnapshot([]), []);
  assert.deepStrictEqual(protect.initialSnapshot(undefined), []);
  assert.deepStrictEqual(protect.initialSnapshot([card(1, { itemId: null }), card(2, { itemId: NaN }), card(3, { itemId: 0 }), card(4)]), [40]);
});

test('toggle: liga e desliga sem alterar o array recebido', () => {
  const a = [10];
  assert.deepStrictEqual(protect.toggle(a, 20), [10, 20]);
  assert.deepStrictEqual(protect.toggle([10, 20], 10), [20]);
  assert.deepStrictEqual(a, [10]);
  assert.deepStrictEqual(protect.toggle(undefined, 5), [5]);
});

test('isProtected: compara como texto e aceita lista ausente', () => {
  assert.strictEqual(protect.isProtected([10], '10'), true);
  assert.strictEqual(protect.isProtected([10], 20), false);
  assert.strictEqual(protect.isProtected(undefined, 10), false);
  assert.strictEqual(protect.isProtected([10], null), false);
});

test('removables: tira protegidos e o No ar; esgotado e removido entram', () => {
  const itens = [card(1), card(2), card(3, { outOfStock: true }), card(4, { removed: true }), card(5)];
  const r = protect.removables(itens, [10], 50);
  assert.deepStrictEqual(r.map((c) => c.n), [2, 3, 4]);
  assert.deepStrictEqual(protect.removables(itens, [], null).map((c) => c.n), [1, 2, 3, 4, 5]);
});

test('pickLast: os de maior número entre os removíveis, em ordem decrescente', () => {
  // itens 1..8; protegidos 8 e 7; No ar 6; n = 3 → 5, 4, 3
  const r = protect.pickLast(lista(8), [80, 70], 60, 3);
  assert.deepStrictEqual(r.ids, [50, 40, 30]);
  assert.deepStrictEqual(r.cards.map((c) => c.n), [5, 4, 3]);
  assert.strictEqual(r.faltam, 0);
});

test('pickLast: menos removíveis que N avisa quantos faltam', () => {
  const r = protect.pickLast(lista(4), [10, 20], null, 5); // sobram 3 e 4
  assert.deepStrictEqual(r.ids, [40, 30]);
  assert.strictEqual(r.faltam, 3);
});

test('pickLast: esgotado entra se estiver entre os últimos', () => {
  const itens = [card(1), card(2), card(3, { outOfStock: true })];
  assert.deepStrictEqual(protect.pickLast(itens, [], null, 1).ids, [30]);
});

test('pickLast: tudo protegido não escolhe nada', () => {
  const r = protect.pickLast(lista(3), [10, 20, 30], null, 5);
  assert.deepStrictEqual(r.ids, []);
  assert.strictEqual(r.faltam, 5);
});

test('LIMITES', () => {
  assert.deepStrictEqual(protect.LIMITES, [5, 10, 15, 20]);
});
