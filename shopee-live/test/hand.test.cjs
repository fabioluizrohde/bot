const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/selectors.js');
const { isProductUrl, isFavorited, cleanProductName } = require('../src/shopee/hand.js');

test('isProductUrl: formatos de produto', () => {
  assert.strictEqual(isProductUrl('https://shopee.com.br/affiliation-i.1633716881.58220139713'), true);
  assert.strictEqual(isProductUrl('https://shopee.com.br/product/1633716881/58220139713?utm_source=x'), true);
});

test('isProductUrl: busca, home e lixo não são produto', () => {
  assert.strictEqual(isProductUrl('https://shopee.com.br/search?keyword=X'), false);
  assert.strictEqual(isProductUrl('https://shopee.com.br/'), false);
  assert.strictEqual(isProductUrl(''), false);
  assert.strictEqual(isProductUrl(null), false);
});

// Elemento falso mínimo: só o que isFavorited usa (matches e querySelector).
function fakeEl({ self = false, inner = false } = {}) {
  return { matches: () => self, querySelector: () => (inner ? {} : null) };
}

test('isFavorited: coração cheio dentro do botão', () => {
  assert.strictEqual(isFavorited(fakeEl({ inner: true })), true);
});

test('isFavorited: o próprio elemento é a marca', () => {
  assert.strictEqual(isFavorited(fakeEl({ self: true })), true);
});

test('isFavorited: coração vazio ou elemento ausente', () => {
  assert.strictEqual(isFavorited(fakeEl()), false);
  assert.strictEqual(isFavorited(null), false);
});

test('cleanProductName: tira o sufixo da Shopee', () => {
  assert.strictEqual(cleanProductName('Tênis Azul | Shopee Brasil'), 'Tênis Azul');
  assert.strictEqual(cleanProductName('Sem sufixo'), 'Sem sufixo');
});
