const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/batch.js');
const { createCoordinator } = require('../src/background/coordinator.js');

const IDS = ['AAA', 'BBB', 'CCC', 'DDD'];
const LIVE = { tab: { id: 10, windowId: 1 } };

function fakeDeps() {
  const store = {};
  const calls = { tabsCreate: [], tabsUpdate: [], tabsRemove: [], send: [], winCreate: [], winUpdate: [], winRemove: [] };
  let nextId = 100;
  const deps = {
    storage: {
      async get(k) { return store[k]; },
      async set(k, v) { store[k] = v; },
    },
    tabs: {
      async create(o) { calls.tabsCreate.push(o); return { id: nextId++ }; },
      async update(id, o) { calls.tabsUpdate.push([id, o]); },
      async remove(id) { calls.tabsRemove.push(id); },
      async sendMessage(id, m) { calls.send.push([id, m]); },
    },
    windows: {
      async create(o) { calls.winCreate.push(o); const id = nextId++; return { id, tabs: [{ id: nextId++ }] }; },
      async update(id, o) { calls.winUpdate.push([id, o]); },
      async remove(id) { calls.winRemove.push(id); },
    },
  };
  return { deps, calls, store };
}

async function started(openIn = 'tab', ids = IDS) {
  const f = fakeDeps();
  const c = createCoordinator(f.deps);
  await c.handle({ type: 'batch:start', ids, openIn }, LIVE);
  return { ...f, c };
}

test('batch:start abre a Shopee uma vez e guarda a aba da live', async () => {
  const { c, calls, store } = await started();
  assert.strictEqual(calls.tabsCreate.length, 1);
  assert.deepStrictEqual(calls.tabsCreate[0], { url: 'https://shopee.com.br/', active: true });
  assert.strictEqual(store.liveTabId, 10);
  const b = await c.handle({ type: 'batch:get' });
  assert.strictEqual(b.items.length, 4);
  assert.ok(calls.send.some(([id, m]) => id === 10 && m.type === 'batch:update'));
});

test('segundo batch:start com lote aberto devolve erro', async () => {
  const { c, calls } = await started();
  const r = await c.handle({ type: 'batch:start', ids: ['X'], openIn: 'tab' }, LIVE);
  assert.deepStrictEqual(r, { error: 'lote em andamento' });
  assert.strictEqual(calls.tabsCreate.length, 1);
});

test('hand:next devolve 1/4 depois 2/4 e null no fim', async () => {
  const { c } = await started();
  assert.deepStrictEqual(await c.handle({ type: 'hand:next' }), { id: 'AAA', index: 1, total: 4 });
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'favoritado' });
  assert.deepStrictEqual(await c.handle({ type: 'hand:next' }), { id: 'BBB', index: 2, total: 4 });
});

test('hand:result nao_achei não trava o lote', async () => {
  const { c } = await started();
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'nao_achei' });
  const b = await c.handle({ type: 'batch:get' });
  assert.strictEqual(b.items[0].status, 'nao_achei');
  assert.strictEqual(b.paused, false);
  assert.strictEqual((await c.handle({ type: 'hand:next' })).id, 'BBB');
});

test('hand:result captcha pausa e mantém na_fila', async () => {
  const { c } = await started();
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'captcha' });
  const b = await c.handle({ type: 'batch:get' });
  assert.strictEqual(b.paused, true);
  assert.strictEqual(b.items[0].status, 'na_fila');
});

test('último ID resolvido fecha a aba, ativa a live e envia batch:resolved', async () => {
  const { c, calls } = await started('tab', ['AAA', 'BBB']);
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'favoritado', name: 'Prod A' });
  assert.strictEqual(calls.tabsRemove.length, 0);
  await c.handle({ type: 'hand:result', id: 'BBB', status: 'ja_favoritado' });
  assert.deepStrictEqual(calls.tabsRemove, [100]);
  assert.ok(calls.tabsUpdate.some(([id, o]) => id === 10 && o.active === true));
  assert.ok(calls.send.some(([id, m]) => id === 10 && m.type === 'batch:resolved'));
  const b = await c.handle({ type: 'batch:get' });
  assert.strictEqual(b.phase, 'adding');
  assert.strictEqual(b.items[0].name, 'Prod A');
});

test('tudo nao_achei leva a done e também fecha a Shopee', async () => {
  const { c, calls } = await started('tab', ['AAA']);
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'nao_achei' });
  const b = await c.handle({ type: 'batch:get' });
  assert.strictEqual(b.phase, 'done');
  assert.deepStrictEqual(calls.tabsRemove, [100]);
});

test('openIn window usa windows.create e windows.remove', async () => {
  const { c, calls } = await started('window', ['AAA']);
  assert.strictEqual(calls.tabsCreate.length, 0);
  assert.deepStrictEqual(calls.winCreate[0], { url: 'https://shopee.com.br/', focused: true });
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'favoritado' });
  assert.strictEqual(calls.winRemove.length, 1);
  assert.strictEqual(calls.tabsRemove.length, 0);
  assert.ok(calls.winUpdate.some(([id, o]) => id === 1 && o.focused === true));
  assert.ok(calls.tabsUpdate.some(([id, o]) => id === 10 && o.active === true));
});

test('batch:reopen abre a Shopee sem alterar os itens', async () => {
  const { c, calls } = await started();
  await c.handle({ type: 'hand:result', id: 'AAA', status: 'favoritado' });
  const antes = await c.handle({ type: 'batch:get' });
  await c.handle({ type: 'batch:reopen' }, LIVE);
  assert.strictEqual(calls.tabsCreate.length, 2);
  const depois = await c.handle({ type: 'batch:get' });
  assert.deepStrictEqual(depois.items, antes.items);
});

test('batch:setStatus grava e batch:clear apaga', async () => {
  const { c } = await started();
  await c.handle({ type: 'batch:setStatus', id: 'AAA', status: 'adicionado' });
  assert.strictEqual((await c.handle({ type: 'batch:get' })).items[0].status, 'adicionado');
  await c.handle({ type: 'batch:clear' });
  assert.strictEqual(await c.handle({ type: 'batch:get' }), null);
});

test('novo coordenador com o mesmo storage recupera o lote', async () => {
  const { deps, c } = await started();
  const c2 = createCoordinator(deps);
  assert.strictEqual((await c2.handle({ type: 'batch:get' })).items.length, 4);
});
