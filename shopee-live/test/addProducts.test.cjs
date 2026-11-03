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
