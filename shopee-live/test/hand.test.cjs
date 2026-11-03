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

// Elemento falso mínimo: matches, querySelector (marca de cheio ou ícone) e parentElement.
function fakeEl({ self = false, filled = false, icon = false, parent = null } = {}) {
  return {
    parentElement: parent,
    matches: () => self,
    querySelector: (sel) => (sel.includes('filled') ? (filled ? {} : null) : icon ? {} : null),
  };
}

test('isFavorited: coração cheio dentro do botão ou no contêiner', () => {
  assert.strictEqual(isFavorited(fakeEl({ filled: true })), true);
  assert.strictEqual(isFavorited(fakeEl({ self: true })), true);
  assert.strictEqual(isFavorited(fakeEl({ parent: fakeEl({ filled: true }) })), true);
});

test('isFavorited: coração vazio (ícone sem marca de cheio) é false', () => {
  assert.strictEqual(isFavorited(fakeEl({ icon: true })), false);
});

test('isFavorited: sem como saber (nem ícone) ou elemento ausente é null', () => {
  assert.strictEqual(isFavorited(fakeEl()), null);
  assert.strictEqual(isFavorited(null), null);
});

test('cleanProductName: tira o sufixo da Shopee', () => {
  assert.strictEqual(cleanProductName('Tênis Azul | Shopee Brasil'), 'Tênis Azul');
  assert.strictEqual(cleanProductName('Sem sufixo'), 'Sem sufixo');
});
