const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/ids.js');

const { extractIds } = globalThis.SLA.ids;

test('extrai um ID simples', () => {
  assert.deepStrictEqual(extractIds('Adiciona esse CLH-NZK-QPT'), ['CLH-NZK-QPT']);
});

test('aceita minúsculas e pontuação colada', () => {
  assert.deepStrictEqual(extractIds('adiciona:clh-nzk-qpt!'), ['CLH-NZK-QPT']);
});

test('texto multilinha com vários usuários, em ordem e sem repetir', () => {
  const texto = [
    'Maria 🌸',
    'quero o abc-def-ghi',
    'João',
    'me vê XYZ-QWE-RTY e também ABC-DEF-GHI 😍',
    'Ana',
    'adiciona KLM-NOP-QRS',
  ].join('\n');
  assert.deepStrictEqual(extractIds(texto), [
    'ABC-DEF-GHI',
    'XYZ-QWE-RTY',
    'KLM-NOP-QRS',
  ]);
});

test('não reconhece o que não é ID', () => {
  assert.deepStrictEqual(extractIds('quero o 5'), []);
  assert.deepStrictEqual(extractIds('ABC-DEF-GHIJ'), []);
  assert.deepStrictEqual(extractIds('AB-CDE-FGH'), []);
  assert.deepStrictEqual(extractIds(''), []);
  assert.deepStrictEqual(extractIds(null), []);
});
