const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/ids.js');
require('../src/lib/batch.js');
require('../src/lib/selectors.js');
const P = require('../src/live/panel.js');
const B = globalThis.SLA.batch;

test('mergeIds: seleção com IDs substitui; sem IDs mantém a anterior', () => {
  const a = P.mergeIds([], 'oi CLH-NZK-QPT e abc-def-ghi', null);
  assert.deepStrictEqual(a, ['CLH-NZK-QPT', 'ABC-DEF-GHI']);
  assert.deepStrictEqual(P.mergeIds(a, 'bom dia sem código', null), a);
  assert.deepStrictEqual(P.mergeIds(a, '', null), a);
});

test('mergeIds: não readiciona IDs que já estão no lote', () => {
  const lote = B.createBatch(['CLH-NZK-QPT']);
  assert.deepStrictEqual(P.mergeIds([], 'CLH-NZK-QPT XXX-YYY-ZZZ', lote), ['XXX-YYY-ZZZ']);
});

test('removeId', () => {
  assert.deepStrictEqual(P.removeId(['A', 'B'], 'A'), ['B']);
});

test('statusLabel: textos em português', () => {
  assert.strictEqual(P.statusLabel('na_fila'), 'na fila');
  assert.strictEqual(P.statusLabel('nao_achei'), 'não achei');
  assert.strictEqual(P.statusLabel('ja_na_sacola'), 'já estava na sacola');
  assert.strictEqual(P.statusLabel('xpto'), 'xpto');
});

test('shouldMount: só em live.shopee.com.br/pc/live', () => {
  assert.strictEqual(P.shouldMount({ hostname: 'live.shopee.com.br', pathname: '/pc/live/123' }), true);
  assert.strictEqual(P.shouldMount({ hostname: 'live.shopee.com.br', pathname: '/home' }), false);
  assert.strictEqual(P.shouldMount({ hostname: 'shopee.com.br', pathname: '/pc/live' }), false);
});

test('viewState: botões por fase', () => {
  assert.deepStrictEqual(P.viewState(null, 0), { canProcess: false, showRetomar: false, showMarcar: false, showLimpar: false });
  assert.strictEqual(P.viewState(null, 2).canProcess, true);
  const l = B.createBatch(['AAA-BBB-CCC']);
  const r = P.viewState(l, 3);
  assert.strictEqual(r.canProcess, false);
  assert.strictEqual(r.showRetomar, true);
  assert.strictEqual(r.showLimpar, true);
  const ad = { ...B.setItem(l, 'AAA-BBB-CCC', { status: 'favoritado' }), phase: 'adding' };
  const a = P.viewState(ad, 0);
  assert.strictEqual(a.showMarcar, true);
  assert.strictEqual(a.showRetomar, false);
  assert.strictEqual(P.viewState({ ...l, phase: 'done' }, 1).canProcess, true);
});

test('isInsideChat: nó de texto e elemento', () => {
  const dentro = { closest: (s) => (s.includes('comment-content') ? {} : null) };
  assert.strictEqual(P.isInsideChat({ nodeType: 3, parentElement: dentro }, 'comment-content'), true);
  assert.strictEqual(P.isInsideChat({ nodeType: 1, closest: () => null }, 'comment-content'), false);
  assert.strictEqual(P.isInsideChat(null, 'x'), false);
});

test('normalizeResults: lista ou mapa', () => {
  assert.deepStrictEqual(P.normalizeResults([{ id: 'A', status: 'adicionado' }]), [{ id: 'A', status: 'adicionado' }]);
  assert.deepStrictEqual(P.normalizeResults({ A: 'conferir' }), [{ id: 'A', status: 'conferir' }]);
  assert.deepStrictEqual(P.normalizeResults(null), []);
});

test('planMarkResults: marcado só vai para a memória; ja_na_sacola e conferir viram status; resto é ignorado', () => {
  const r = P.planMarkResults([
    { id: 'A', status: 'marcado' },
    { id: 'B', status: 'ja_na_sacola' },
    { id: 'C', status: 'conferir' },
    { id: 'D', status: 'xpto' },
    { id: 'E', status: 'adicionado' },
  ]);
  assert.deepStrictEqual(r.marcados, ['A']);
  assert.deepStrictEqual(r.updates, [
    { id: 'B', status: 'ja_na_sacola' },
    { id: 'C', status: 'conferir' },
    { id: 'E', status: 'adicionado' },
  ]);
});
