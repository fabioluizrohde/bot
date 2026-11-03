const { test } = require('node:test');
const assert = require('node:assert');
const bag = require('../src/live/bag.js');

const RESP = {
  err_code: 0,
  err_msg: '',
  data: {
    items: [
      {
        id: 2, item_id: 11, shop_id: 1, name: 'Bolsa Feminina', image: 'sg-11134201-aaa',
        price: '39.90', price_min: '39.90', price_max: '56.90',
        price_before_discount: '59.90', price_min_before_discount: '59.90', price_max_before_discount: '89.90',
        discount: 33, is_oos: false, is_del: false, is_unlisted: false,
      },
      {
        id: 1, item_id: 10, shop_id: 1, name: 'Camiseta', image: 'sg-11134201-bbb',
        price: '19.99', price_min: '19.99', price_max: '19.99',
        price_before_discount: '34.99', price_min_before_discount: '34.99', price_max_before_discount: '34.99',
        discount: 42, is_oos: true, is_del: false, is_unlisted: false,
      },
      {
        id: 7, item_id: 12, shop_id: 1, name: 'Vestido', image: 'sg-11134201-ccc',
        price: '10.00', price_min: '10.00', price_max: '10.00',
        discount: 0, is_oos: false, is_del: true, is_unlisted: false,
      },
    ],
    has_more: false, next_offset: 3, total_count: 3, max_items: 100, max_id: 7,
  },
};

test('normalizeBag ordena por n e copia os totais', () => {
  const r = bag.normalizeBag(RESP);
  assert.deepStrictEqual(r.items.map((c) => c.n), [1, 2, 7]);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.maxItems, 100);
  assert.strictEqual(r.hasMore, false);
  assert.strictEqual(r.nextOffset, 3);
});

test('normalizeBag: faixa de preço e preço antes', () => {
  const c = bag.normalizeBag(RESP).items.find((x) => x.n === 2);
  assert.strictEqual(c.price, 'R$39,90 – R$56,90');
  assert.strictEqual(c.priceBefore, 'R$59,90 – R$89,90');
  assert.strictEqual(c.itemId, 11);
  assert.strictEqual(c.shopId, 1);
  assert.strictEqual(c.discount, 33);
});

test('normalizeBag: preço único sem faixa', () => {
  const c = bag.normalizeBag(RESP).items.find((x) => x.n === 1);
  assert.strictEqual(c.price, 'R$19,99');
  assert.strictEqual(c.priceBefore, 'R$34,99');
});

test('normalizeBag: sem preço antes quando não é maior', () => {
  const c = bag.normalizeBag(RESP).items.find((x) => x.n === 7);
  assert.strictEqual(c.priceBefore, '');
});

test('normalizeBag: sem min/max usa price', () => {
  const r = bag.normalizeBag({ err_code: 0, data: { items: [{ id: 1, price: '5.5' }] } });
  assert.strictEqual(r.items[0].price, 'R$5,50');
});

test('normalizeBag: só um dos dois vira preço único', () => {
  const r = bag.normalizeBag({ err_code: 0, data: { items: [{ id: 1, price_min: '8.00' }] } });
  assert.strictEqual(r.items[0].price, 'R$8,00');
});

test('normalizeBag marca esgotado e removido', () => {
  const r = bag.normalizeBag(RESP);
  const oos = r.items.find((x) => x.n === 1);
  const del = r.items.find((x) => x.n === 7);
  assert.strictEqual(oos.outOfStock, true);
  assert.strictEqual(oos.removed, false);
  assert.strictEqual(del.removed, true);
  assert.strictEqual(del.outOfStock, false);
});

test('normalizeBag devolve null para resposta inválida', () => {
  assert.strictEqual(bag.normalizeBag({ err_code: 5 }), null);
  assert.strictEqual(bag.normalizeBag({}), null);
  assert.strictEqual(bag.normalizeBag(null), null);
  assert.strictEqual(bag.normalizeBag({ err_code: 0, data: {} }), null);
});

test('formatPrice', () => {
  assert.strictEqual(bag.formatPrice('19.99'), 'R$19,99');
  assert.strictEqual(bag.formatPrice('1234.5'), 'R$1.234,50');
  assert.strictEqual(bag.formatPrice(''), '');
  assert.strictEqual(bag.formatPrice('abc'), '');
});

test('sessionIdFromHref', () => {
  assert.strictEqual(bag.sessionIdFromHref('https://live.shopee.com.br/pc/live?session=7034350'), '7034350');
  assert.strictEqual(bag.sessionIdFromHref('https://live.shopee.com.br/pc/live'), null);
});

test('filterBag', () => {
  const items = bag.normalizeBag(RESP).items;
  assert.deepStrictEqual(bag.filterBag(items, '7').map((c) => c.n), [7]);
  assert.deepStrictEqual(bag.filterBag(items, 'bolsa').map((c) => c.n), [2]);
  assert.deepStrictEqual(bag.filterBag(items, 'BÓLSA').map((c) => c.n), [2]);
  assert.deepStrictEqual(bag.filterBag(items, 'zzz'), []);
  assert.strictEqual(bag.filterBag(items, '').length, 3);
});

test('imageUrl', () => {
  assert.strictEqual(bag.imageUrl('sg-1'), bag.IMG_BASE + 'sg-1');
});
