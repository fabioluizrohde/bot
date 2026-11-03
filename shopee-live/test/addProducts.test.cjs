const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/match.js');
const A = require('../src/live/addProducts.js');

const card = (name, checked = false) => ({ name, checked });

test('decide: um card casa e não está marcado -> marcado', () => {
  const r = A.decide('Fone Bluetooth Sem Fio Preto', [card('Capa de celular'), card('Fone Bluetooth Sem…')]);
  assert.strictEqual(r.status, 'marcado');
  assert.strictEqual(r.card.name, 'Fone Bluetooth Sem…');
});

test('decide: card já marcado -> ja_na_sacola', () => {
  assert.strictEqual(A.decide('Fone Bluetooth', [card('Fone Bluetooth', true)]).status, 'ja_na_sacola');
});

test('decide: nenhum casa -> conferir', () => {
  const r = A.decide('Fone', [card('Capa')]);
  assert.strictEqual(r.status, 'conferir');
  assert.strictEqual(r.card, null);
  assert.strictEqual(A.decide('Fone', []).status, 'conferir');
});

test('decide: mais de um casa -> conferir (não escolhe)', () => {
  assert.strictEqual(A.decide('Fone Bluetooth Preto', [card('Fone Blue…'), card('Fone Bluetooth P…')]).status, 'conferir');
});

test('isConfirmText: igual ao texto do Confirmar, sem diferenciar caixa/espaços', () => {
  assert.strictEqual(A.isConfirmText('  Confirmar ', 'Confirmar'), true);
  assert.strictEqual(A.isConfirmText('Cancelar', 'Confirmar'), false);
  assert.strictEqual(A.isConfirmText(null, 'Confirmar'), false);
});

test('sameName: ignora acento, caixa e reticências; vazio nunca é igual', () => {
  assert.strictEqual(A.sameName('Fone Bluetooth…', 'fone bluetooth'), true);
  assert.strictEqual(A.sameName('Fone', 'Capa'), false);
  assert.strictEqual(A.sameName('', ''), false);
});

test('mergeCards: junta por nome, não repete entre passadas e mantém duplicados do mesmo snapshot', () => {
  const a = { name: 'Fone A' }, b = { name: 'Capa B' }, a2 = { name: 'Fone A' };
  let todos = A.mergeCards([], [a, b]);
  assert.strictEqual(todos.length, 2);
  todos = A.mergeCards(todos, [{ name: 'fone a' }, b]); // nó reciclado/visto de novo: não duplica
  assert.strictEqual(todos.length, 2);
  todos = A.mergeCards([], [a, a2, b]); // dois cards reais com o mesmo nome
  assert.strictEqual(todos.length, 3);
  assert.strictEqual(A.decide('Fone A completo', todos).status, 'conferir');
});

test('mergeCards: identidade por posição/nó separa homônimos em janelas de rolagem diferentes', () => {
  const p = (y, x = 0) => ({ x, y });
  // (1) mesmo card revisto em dois snapshots -> uma vez só (mesmo com nó diferente)
  let t = A.mergeCards([], [{ name: 'Fone A', pos: p(100), node: 'n1' }]);
  t = A.mergeCards(t, [{ name: 'Fone A', pos: p(101), node: 'n2' }]);
  assert.strictEqual(t.length, 1);
  // (2) dois homônimos no mesmo snapshot -> dois
  t = A.mergeCards([], [{ name: 'Fone A', pos: p(100) }, { name: 'Fone A', pos: p(100, 200) }]);
  assert.strictEqual(t.length, 2);
  // (3) homônimos em snapshots diferentes, posições diferentes -> dois e ambíguo
  t = A.mergeCards([], [{ name: 'Fone A', pos: p(100) }]);
  t = A.mergeCards(t, [{ name: 'Fone A', pos: p(900) }]);
  assert.strictEqual(t.length, 2);
  assert.strictEqual(A.decide('Fone A completo', t).status, 'conferir');
  // (4) nó reciclado com outro nome -> entrada nova do nome novo, sem duplicar o antigo
  t = A.mergeCards([], [{ name: 'Fone A', pos: p(100), node: 'n1' }]);
  t = A.mergeCards(t, [{ name: 'Capa B', pos: p(900), node: 'n1' }]);
  assert.strictEqual(t.length, 2);
  assert.deepStrictEqual(t.map((c) => c.name).sort(), ['Capa B', 'Fone A']);
});
