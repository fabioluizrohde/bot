const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/batch.js');
const B = globalThis.SLA.batch;

const ids = ['AAA-AAA-AAA', 'BBB-BBB-BBB', 'CCC-CCC-CCC'];

test('STATUS tem os 7 status', () => {
  assert.deepStrictEqual(Object.values(B.STATUS).sort(),
    ['adicionado', 'conferir', 'favoritado', 'ja_favoritado', 'ja_na_sacola', 'na_fila', 'nao_achei']);
});

test('createBatch remove IDs repetidos e preenche padrões', () => {
  const b = B.createBatch(['AAA-AAA-AAA', 'BBB-BBB-BBB', 'AAA-AAA-AAA'], { now: 1000 });
  assert.strictEqual(b.items.length, 2);
  assert.strictEqual(b.createdAt, 1000);
  assert.strictEqual(b.phase, 'resolving');
  assert.strictEqual(b.paused, false);
  assert.strictEqual(b.openIn, 'tab');
  assert.ok(b.id.startsWith('1000'));
  assert.ok(b.items.every((i) => i.status === 'na_fila'));
});

test('createBatch vazio lança', () => {
  assert.throws(() => B.createBatch([]), { message: 'lote vazio' });
});

test('nextPending anda na ordem', () => {
  let b = B.createBatch(ids);
  assert.strictEqual(B.nextPending(b).id, ids[0]);
  b = B.setItem(b, ids[0], { status: 'favoritado' });
  assert.strictEqual(B.nextPending(b).id, ids[1]);
  b = B.setItem(b, ids[1], { status: 'nao_achei' });
  b = B.setItem(b, ids[2], { status: 'nao_achei' });
  assert.strictEqual(B.nextPending(b), null);
});

test('setItem não altera o original', () => {
  const b = B.createBatch(ids);
  const b2 = B.setItem(b, ids[0], { status: 'favoritado', name: 'X' });
  assert.strictEqual(b.items[0].status, 'na_fila');
  assert.strictEqual(b.items[0].name, undefined);
  assert.strictEqual(b2.items[0].status, 'favoritado');
  assert.strictEqual(b2.items[0].name, 'X');
  assert.notStrictEqual(b2, b);
});

test('resolvedItems devolve favoritado e ja_favoritado', () => {
  let b = B.createBatch(ids);
  b = B.setItem(b, ids[0], { status: 'favoritado' });
  b = B.setItem(b, ids[1], { status: 'ja_favoritado' });
  b = B.setItem(b, ids[2], { status: 'nao_achei' });
  assert.deepStrictEqual(B.resolvedItems(b).map((i) => i.id), [ids[0], ids[1]]);
});

test('advancePhase não avança com na_fila pendente', () => {
  let b = B.createBatch(ids);
  b = B.setItem(b, ids[0], { status: 'favoritado' });
  assert.strictEqual(B.advancePhase(b).phase, 'resolving');
});

test('advancePhase vai a adding quando só restam favoritado/ja_favoritado/nao_achei', () => {
  let b = B.createBatch(ids);
  b = B.setItem(b, ids[0], { status: 'favoritado' });
  b = B.setItem(b, ids[1], { status: 'ja_favoritado' });
  b = B.setItem(b, ids[2], { status: 'nao_achei' });
  assert.strictEqual(B.advancePhase(b).phase, 'adding');
});

test('advancePhase vai direto a done se todos nao_achei', () => {
  let b = B.createBatch(ids);
  for (const id of ids) b = B.setItem(b, id, { status: 'nao_achei' });
  assert.strictEqual(B.advancePhase(b).phase, 'done');
});

test('advancePhase em adding: done só quando ninguém fica favoritado/ja_favoritado', () => {
  let b = B.createBatch(ids);
  b = B.setItem(b, ids[0], { status: 'favoritado' });
  b = B.setItem(b, ids[1], { status: 'ja_favoritado' });
  b = B.setItem(b, ids[2], { status: 'nao_achei' });
  b = B.advancePhase(b);
  assert.strictEqual(B.advancePhase(b).phase, 'adding');
  b = B.setItem(b, ids[0], { status: 'adicionado' });
  assert.strictEqual(B.advancePhase(b).phase, 'adding');
  b = B.setItem(b, ids[1], { status: 'ja_na_sacola' });
  assert.strictEqual(B.advancePhase(b).phase, 'done');
});

test('summarize conta por status', () => {
  let b = B.createBatch(ids);
  b = B.setItem(b, ids[0], { status: 'nao_achei' });
  b = B.setItem(b, ids[1], { status: 'nao_achei' });
  assert.deepStrictEqual(B.summarize(b), { total: 3, porStatus: { nao_achei: 2, na_fila: 1 } });
});

test('addableItems: só resolvidos com loja e produto válidos, sem repetir, com o ID de texto', () => {
  const S = B.STATUS;
  let b = B.createBatch(['A', 'B', 'C', 'D', 'E']);
  b = B.setItem(b, 'A', { status: S.FAVORITADO, shopId: 1, itemId: 10 });
  b = B.setItem(b, 'B', { status: S.JA_FAVORITADO, shopId: 2, itemId: 20 });
  b = B.setItem(b, 'C', { status: S.FAVORITADO }); // sem números: fica de fora
  b = B.setItem(b, 'D', { status: S.NAO_ACHEI, shopId: 4, itemId: 40 }); // não resolvido: fora
  b = B.setItem(b, 'E', { status: S.FAVORITADO, shopId: 5, itemId: 10 }); // item repetido: fora
  assert.deepStrictEqual(B.addableItems(b), [
    { id: 'A', shopId: 1, itemId: 10 },
    { id: 'B', shopId: 2, itemId: 20 },
  ]);
  assert.deepStrictEqual(B.addableItems(null), []);
});
