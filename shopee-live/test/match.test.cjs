const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/match.js');
const { normalizeName, nameMatches } = globalThis.SLA.match;

test('normalizeName: minúsculas, sem acentos, espaços únicos, sem reticências finais', () => {
  assert.strictEqual(normalizeName('  Maiô   Infantil… '), 'maio infantil');
  assert.strictEqual(normalizeName('Rápido F...'), 'rapido f');
  assert.strictEqual(normalizeName(null), '');
});

test('card truncado com … casa com o título completo da página', () => {
  const page = 'Squishy Cubo de Gelo Anti Stress Retorno Rápido com Glitter Brinquedo Sensorial 5cm 3 Cores';
  assert.ok(nameMatches(page, 'Squishy Cubo de Gelo Anti Stress Retorno Rápido com Glitter…'));
});

test('acentos e caixa são ignorados', () => {
  assert.ok(nameMatches('MAIÔ INFANTIL', 'maio infantil'));
});

test('truncado com ... casa só com o nome certo', () => {
  assert.ok(nameMatches('Maiô Infantil Juvenil Forrado para Adolescentes', 'Maiô Infantil Juvenil F...'));
  assert.ok(!nameMatches('Maiô manga longa infantil juvenil com ziper', 'Maiô Infantil Juvenil F...'));
});

test('texto vazio nunca casa', () => {
  assert.ok(!nameMatches('', ''));
  assert.ok(!nameMatches('Produto', ''));
  assert.ok(!nameMatches('', 'Produto'));
  assert.ok(!nameMatches('Produto', '…'));
});
