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

test('normalizeBag ignora elementos que não são objetos', () => {
  const r = bag.normalizeBag({ err_code: 0, data: { items: [null, 5, 'x', { id: 3, name: 'Ok' }, undefined] } });
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].n, 3);
  assert.strictEqual(r.items[0].name, 'Ok');
});

// ---- readBag ----
function mkItems(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push({ id: i, item_id: 100 + i, shop_id: 1, name: 'P' + i, price: '1.00' });
  return out;
}
function fakeFetch(responses) {
  const urls = [];
  const opts = [];
  let i = 0;
  const fn = async (url, o) => {
    urls.push(url);
    opts.push(o);
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  fn.urls = urls;
  fn.opts = opts;
  return fn;
}
function page(items, extra) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ err_code: 0, data: Object.assign({ items, has_more: false, next_offset: 0, total_count: items.length, max_items: 100 }, extra) }),
  };
}

test('readBag: uma página só', async () => {
  const f = fakeFetch([page(mkItems(1, 3), { max_items: 100 })]);
  const r = await bag.readBag('7034350', f);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.maxItems, 100);
  assert.strictEqual(f.urls.length, 1);
  assert.ok(f.urls[0].includes('/session/7034350/host/items'));
  assert.ok(f.urls[0].includes('visible=true'));
  assert.ok(f.urls[0].includes('offset=0'));
  assert.ok(f.urls[0].includes('limit=1000'));
  assert.deepStrictEqual(f.opts[0], { credentials: 'include' });
});

test('readBag: 100 itens em duas páginas', async () => {
  const f = fakeFetch([
    page(mkItems(1, 60), { has_more: true, next_offset: 60, total_count: 100 }),
    page(mkItems(61, 100), { has_more: false, next_offset: 100, total_count: 100 }),
  ]);
  const r = await bag.readBag('1', f);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items.length, 100);
  assert.strictEqual(f.urls.length, 2);
  assert.ok(f.urls[1].includes('offset=60'));
  assert.strictEqual(new Set(r.items.map((c) => c.n)).size, 100);
});

test('readBag: página que repete o último item não duplica', async () => {
  const f = fakeFetch([
    page(mkItems(1, 60), { has_more: true, next_offset: 59 }),
    page(mkItems(60, 100), { has_more: false }),
  ]);
  const r = await bag.readBag('1', f);
  assert.strictEqual(r.items.length, 100);
  assert.strictEqual(new Set(r.items.map((c) => c.n)).size, 100);
});

test('readBag: fetch que lança vira rede', async () => {
  const r = await bag.readBag('1', fakeFetch([new Error('offline')]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'rede');
});

test('readBag: status 500 vira http', async () => {
  const r = await bag.readBag('1', fakeFetch([{ ok: false, status: 500, json: async () => ({}) }]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'http');
  assert.strictEqual(r.detail, '500');
});

test('readBag: corpo que não é JSON vira formato', async () => {
  const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError('<html>'); } };
  const r = await bag.readBag('1', fakeFetch([bad]));
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'formato' });
});

test('readBag: err_code diferente de 0 vira formato', async () => {
  const r = await bag.readBag('1', fakeFetch([{ ok: true, status: 200, json: async () => ({ err_code: 3, data: {} }) }]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'formato');
});

test('readBag: exceção ao normalizar vira formato, sem escapar', async () => {
  const weird = { ok: true, status: 200, json: async () => ({ err_code: 0, data: { items: [{ id: 1, get name() { throw new Error('boom'); } }] } }) };
  const r = await bag.readBag('1', fakeFetch([weird]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'formato');
});

test('readBag: para em 20 páginas com has_more sempre true', async () => {
  let n = 0;
  const f = async (url) => {
    f.urls.push(url);
    const start = n * 10 + 1;
    n++;
    return page(mkItems(start, start + 9), { has_more: true, next_offset: n * 10 });
  };
  f.urls = [];
  const r = await bag.readBag('1', f);
  assert.strictEqual(f.urls.length, 20);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items.length, 200);
});
