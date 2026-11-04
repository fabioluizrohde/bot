const { test } = require('node:test');
const assert = require('node:assert');
const { isAllowedBridgePath, handleBridgeRequest, isAllowedShowPath, validateShowBody, handleShowRequest, isAllowedAddPath, validateAddBody, handleAddRequest } = require('../src/live/pageBridge.js');

const OK = '/webapi/v1/session/7898272/host/items';

test('isAllowedBridgePath: aceita só a leitura da sacola', () => {
  assert.strictEqual(isAllowedBridgePath(OK), true);
  assert.strictEqual(isAllowedBridgePath(OK + '?visible=true&offset=0&limit=1000'), true);
});

test('isAllowedBridgePath: recusa todo o resto', () => {
  const ruins = [
    '/webapi/v1/session/1/items/2/detail',
    'https://evil.com/x',
    '//evil.com/x',
    '/webapi/v1/session/1/host/items/../../x',
    '/webapi/v1/session/../host/items',
    OK + '?a=1;b=2',
    OK + '?a=1 b=2',
    OK + '?a=<x>',
    OK + '/extra',
    '/webapi/v1/session/abc/host/items',
    'https://live.shopee.com.br' + OK,
    '',
    null,
    undefined,
    42,
    {},
  ];
  for (const r of ruins) assert.strictEqual(isAllowedBridgePath(r), false, String(r));
});

const pedido = (extra) => ({ source: 'sla-ext', type: 'fetch', id: 'x1', path: OK + '?visible=true', ...extra });

test('handleBridgeRequest: caminho permitido chama o fetch uma vez, só com credentials', async () => {
  const calls = [];
  const fakeFetch = async (...a) => { calls.push(a); return { ok: true, status: 200, text: async () => '{"a":1}' }; };
  const r = await handleBridgeRequest(pedido(), fakeFetch);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], [OK + '?visible=true', { credentials: 'include' }]);
  assert.deepStrictEqual(r, { source: 'sla-bridge', id: 'x1', ok: true, status: 200, text: '{"a":1}' });
});

test('handleBridgeRequest: caminho não permitido nunca chama o fetch', async () => {
  let n = 0;
  const fakeFetch = async () => { n++; return { ok: true, status: 200, text: async () => '' }; };
  const r = await handleBridgeRequest(pedido({ path: 'https://evil.com/x' }), fakeFetch);
  assert.strictEqual(n, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.error, 'caminho nao permitido');
  assert.strictEqual(r.id, 'x1');
});

test('handleBridgeRequest: pedido malformado', async () => {
  let n = 0;
  const fakeFetch = async () => { n++; };
  for (const d of [null, undefined, 'x', {}, pedido({ source: 'outro' }), pedido({ type: 'post' })]) {
    const r = await handleBridgeRequest(d, fakeFetch);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.error, 'pedido invalido');
    assert.strictEqual(r.source, 'sla-bridge');
  }
  assert.strictEqual(n, 0);
});

test('handleBridgeRequest: fetch que lança vira erro', async () => {
  const r = await handleBridgeRequest(pedido(), async () => { throw new Error('caiu'); });
  assert.deepStrictEqual(r, { source: 'sla-bridge', id: 'x1', ok: false, status: 0, text: '', error: 'caiu' });
});

test('handleBridgeRequest: status não-ok passa direto', async () => {
  const r = await handleBridgeRequest(pedido(), async () => ({ ok: false, status: 403, text: async () => 'no' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.text, 'no');
});

// ---------- pedido "show" (PUT restrito) ----------

const SHOW = '/webapi/v1/session/7898272/show';
const ITEM = { item_id: 123, shop_id: 456, label: 'Camiseta', name: 'x' };

class FakeXhr {
  constructor() {
    FakeXhr.last = this;
    this.calls = [];
    this.headers = [];
    this.status = 0;
    this.responseText = '';
  }
  open(...a) { this.calls.push(['open', ...a]); }
  setRequestHeader(...a) { this.headers.push(a); }
  send(b) {
    this.sent = b;
    const modo = FakeXhr.modo || { status: 200, text: '{"ok":1}' };
    setImmediate(() => {
      if (modo.erro) { this.onerror && this.onerror(); this.onloadend && this.onloadend(); return; }
      this.status = modo.status; this.responseText = modo.text;
      this.onloadend && this.onloadend();
    });
  }
}
const pedidoShow = (extra) => ({ source: 'sla-ext', type: 'show', id: 's1', path: SHOW, body: ITEM, ...extra });

test('isAllowedShowPath: aceita só /session/<n>/show', () => {
  assert.strictEqual(isAllowedShowPath(SHOW), true);
  for (const r of ['/webapi/v1/session/1/show?x=1', '/webapi/v1/session/1/host/items', '//evil.com/x',
    'https://x/y', '/webapi/v1/session/1/show/', '/webapi/v1/session/abc/show', '', null, undefined, 42, {}]) {
    assert.strictEqual(isAllowedShowPath(r), false, String(r));
  }
});

test('validateShowBody: aceita o item real e recusa o resto', () => {
  assert.strictEqual(validateShowBody(ITEM), true);
  const circ = { item_id: 1, shop_id: 2 }; circ.self = circ;
  const grande = { item_id: 1, shop_id: 2, x: 'a'.repeat(20001) };
  for (const b of [{}, [], null, undefined, 'x', { item_id: 'abc', shop_id: 1 }, { item_id: 1 },
    { item_id: 1, shop_id: NaN }, grande, circ]) {
    assert.strictEqual(validateShowBody(b), false, JSON.stringify(b && b.item_id));
  }
});

test('handleShowRequest: corpo válido faz o PUT exato e resolve ok', async () => {
  FakeXhr.modo = { status: 200, text: '{"ok":1}' };
  let n = 0;
  const r = await handleShowRequest(pedidoShow(), () => { n++; return FakeXhr; });
  const x = FakeXhr.last;
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(x.calls, [['open', 'PUT', SHOW, true]]);
  assert.deepStrictEqual(x.headers, [['Content-Type', 'application/json;charset=UTF-8']]);
  assert.strictEqual(x.withCredentials, true);
  assert.strictEqual(x.timeout, 15000);
  assert.strictEqual(x.sent, JSON.stringify(ITEM));
  assert.deepStrictEqual(r, { source: 'sla-bridge', id: 's1', ok: true, status: 200, text: '{"ok":1}' });
});

test('handleShowRequest: 403 vira ok:false com o status', async () => {
  FakeXhr.modo = { status: 403, text: 'no' };
  const r = await handleShowRequest(pedidoShow(), () => FakeXhr);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.text, 'no');
});

test('handleShowRequest: caminho ou corpo recusado nunca chama getXhr', async () => {
  let n = 0;
  const get = () => { n++; return FakeXhr; };
  for (const d of [pedidoShow({ path: OK }), pedidoShow({ path: 'https://evil.com/x' }), pedidoShow({ body: {} }),
    pedidoShow({ body: [] }), pedidoShow({ body: null })]) {
    const r = await handleShowRequest(d, get);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.error, 'pedido recusado');
    assert.strictEqual(r.id, 's1');
  }
  assert.strictEqual(n, 0);
});

test('handleShowRequest: pedido malformado', async () => {
  let n = 0;
  const get = () => { n++; return FakeXhr; };
  for (const d of [null, undefined, 'x', {}, pedidoShow({ source: 'outro' }), pedidoShow({ type: 'fetch' })]) {
    const r = await handleShowRequest(d, get);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.error, 'pedido invalido');
  }
  assert.strictEqual(n, 0);
});

test('handleShowRequest: erro de rede e exceção viram ok:false status 0', async () => {
  FakeXhr.modo = { erro: true };
  const r = await handleShowRequest(pedidoShow(), () => FakeXhr);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 0);
  assert.ok(r.error);
  const r2 = await handleShowRequest(pedidoShow(), () => { throw new Error('sem xhr'); });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.status, 0);
  assert.strictEqual(r2.error, 'sem xhr');
});

// ---- Adicionar à sacola (PUT add_items) ----
const ADD = '/webapi/v1/session/7907717/add_items';
const CORPO = { items: [{ shop_id: 395166866, item_id: 50268328916 }] };
const pedidoAdd = (extra) => ({ source: 'sla-ext', type: 'add', id: 'a1', path: ADD, body: CORPO, ...extra });

test('isAllowedAddPath: aceita só /session/<n>/add_items', () => {
  assert.strictEqual(isAllowedAddPath(ADD), true);
  for (const r of ['/webapi/v1/session/1/add_items?x=1', '/webapi/v1/session/1/show', '//evil.com/x', 'https://x/y',
    '/webapi/v1/session/1/add_items/', '/webapi/v1/session/abc/add_items', '/webapi/v1/session/1/add_items/../x', '', null, undefined, 42, {}]) {
    assert.strictEqual(isAllowedAddPath(r), false, String(r));
  }
});

test('validateAddBody: só items com shop_id e item_id inteiros, até 20, sem repetir', () => {
  assert.strictEqual(validateAddBody(CORPO), true);
  const vinte = { items: Array.from({ length: 20 }, (_, i) => ({ shop_id: 1, item_id: 100 + i })) };
  assert.strictEqual(validateAddBody(vinte), true);
  const vinteUm = { items: Array.from({ length: 21 }, (_, i) => ({ shop_id: 1, item_id: 100 + i })) };
  const ruins = [null, undefined, 'x', [], {}, { items: [] }, { items: 'x' }, vinteUm,
    { items: [{ shop_id: 1, item_id: 2 }], extra: 1 },
    { items: [{ shop_id: 1, item_id: 2, name: 'x' }] },
    { items: [{ shop_id: 1 }] }, { items: [{ item_id: 1 }] },
    { items: [{ shop_id: '1', item_id: 2 }] }, { items: [{ shop_id: 1, item_id: NaN }] },
    { items: [{ shop_id: 1.5, item_id: 2 }] }, { items: [{ shop_id: 0, item_id: 2 }] },
    { items: [{ shop_id: -1, item_id: 2 }] }, { items: [{ shop_id: 1, item_id: 2 }, { shop_id: 1, item_id: 2 }] },
    { items: [null] }, { items: [[1, 2]] }];
  for (const b of ruins) assert.strictEqual(validateAddBody(b), false, JSON.stringify(b));
});

test('handleAddRequest: corpo válido faz o PUT exato e resolve ok', async () => {
  FakeXhr.modo = { status: 200, text: '{"err_code":0}' };
  let n = 0;
  const r = await handleAddRequest(pedidoAdd(), () => { n++; return FakeXhr; });
  const x = FakeXhr.last;
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(x.calls, [['open', 'PUT', ADD, true]]);
  assert.deepStrictEqual(x.headers, [['Content-Type', 'application/json;charset=UTF-8']]);
  assert.strictEqual(x.withCredentials, true);
  assert.strictEqual(x.timeout, 15000);
  assert.strictEqual(x.sent, JSON.stringify(CORPO));
  assert.deepStrictEqual(r, { source: 'sla-bridge', id: 'a1', ok: true, status: 200, text: '{"err_code":0}' });
});

test('handleAddRequest: caminho ou corpo recusado nunca chama getXhr', async () => {
  let n = 0;
  const get = () => { n++; return FakeXhr; };
  for (const d of [pedidoAdd({ path: SHOW }), pedidoAdd({ path: 'https://evil.com/x' }), pedidoAdd({ body: {} }),
    pedidoAdd({ body: { items: [{ shop_id: 1, item_id: 2, x: 1 }] } }), pedidoAdd({ body: null })]) {
    const r = await handleAddRequest(d, get);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.error, 'pedido recusado');
    assert.strictEqual(r.id, 'a1');
  }
  assert.strictEqual(n, 0);
});

test('handleAddRequest: pedido malformado e tipo errado', async () => {
  let n = 0;
  const get = () => { n++; return FakeXhr; };
  for (const d of [null, undefined, 'x', {}, pedidoAdd({ source: 'outro' }), pedidoAdd({ type: 'show' })]) {
    const r = await handleAddRequest(d, get);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'pedido invalido');
  }
  assert.strictEqual(n, 0);
});

test('handleAddRequest: erro de rede vira ok:false status 0', async () => {
  FakeXhr.modo = { erro: true };
  const r = await handleAddRequest(pedidoAdd(), () => FakeXhr);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.error, 'erro de rede');
});
