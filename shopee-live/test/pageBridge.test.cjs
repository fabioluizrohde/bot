const { test } = require('node:test');
const assert = require('node:assert');
const { isAllowedBridgePath, handleBridgeRequest } = require('../src/live/pageBridge.js');

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
