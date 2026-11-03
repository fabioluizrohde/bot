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

// No chat real o nome de quem pediu vem colado no ID, sem espaço (visto na live em 2026-11-03).
test('ID colado ao nome do autor (sem espaço)', () => {
  assert.deepStrictEqual(extractIds('kellianegomesdesousaANJ-EGH-KLV'), ['ANJ-EGH-KLV']);
  assert.deepStrictEqual(extractIds('maria123BYL-BBA-JBR'), ['BYL-BBA-JBR']);
});

test('seleção de várias linhas do chat, cada ID colado ao seu autor', () => {
  const texto = [
    'ApresentadorBaseweb Gráfica DigitalANJ-EGH-KLV',
    'kellian... entrou!',
    'kellianegomesdesousaANJ-EGH-KLV',
    'kellianegomesdesousaZZZ-***-ZZZ',
    'kellianegomesdesousaZZZ-AAA-SSS',
    'kellianegomesdesousaBYL-BBA-JBR',
    'kellianegomesdesousaBQM-AFG-GKM',
  ].join('\n');
  assert.deepStrictEqual(extractIds(texto), ['ANJ-EGH-KLV', 'ZZZ-AAA-SSS', 'BYL-BBA-JBR', 'BQM-AFG-GKM']);
});

test('não reconhece o que não é ID', () => {
  assert.deepStrictEqual(extractIds('ABC-DEF-GHI-JKL'), []);
  assert.deepStrictEqual(extractIds('quero o 5'), []);
  assert.deepStrictEqual(extractIds('ABC-DEF-GHIJ'), []);
  assert.deepStrictEqual(extractIds('AB-CDE-FGH'), []);
  assert.deepStrictEqual(extractIds(''), []);
  assert.deepStrictEqual(extractIds(null), []);
});
