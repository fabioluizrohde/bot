const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/codes.js');
require('../src/lib/catalog.js');
const { parseCodes, splitAuthor, canon } = globalThis.SLA.codes;
const { parseCatalog } = globalThis.SLA.catalog;

const P = (t, o) => parseCodes(t, { allowBare: true, ...o });

test('formatos comuns de pedido', () => {
  assert.deepStrictEqual(P('#5'), ['5']);
  assert.deepStrictEqual(P('quero o 12'), ['12']);
  assert.deepStrictEqual(P('Quero o 3 e o 7 por favor'), ['3', '7']);
  assert.deepStrictEqual(P('código: A12'), ['A12']);
  assert.deepStrictEqual(P('cod 045'), ['45']);
  assert.deepStrictEqual(P('produto nº 9'), ['9']);
  assert.deepStrictEqual(P('item 8'), ['8']);
  assert.deepStrictEqual(P('#3 e #5!!'), ['3', '5']);
  assert.deepStrictEqual(P('4'), ['4']);
  assert.deepStrictEqual(P('1, 3 e 5'), ['1', '3', '5']);
  assert.deepStrictEqual(P('reserva o #10 pra mim'), ['10']);
});

test('não pega números soltos no meio de frases', () => {
  assert.deepStrictEqual(P('quanto custa o frete pra 22 reais?'), []);
  assert.deepStrictEqual(P('tem no 42?'), []);
  assert.deepStrictEqual(P('boa noite a todos'), []);
  assert.deepStrictEqual(P('5', { allowBare: false }), []);
});

test('filtro de catálogo e regex extra', () => {
  const catalogCodes = new Set(['5']);
  assert.deepStrictEqual(P('#5 e #6', { onlyCatalog: true, catalogCodes }), ['5']);
  assert.deepStrictEqual(P('manda o X-99', { customRegex: '(x-\\d+)' }), ['X-99']);
  assert.strictEqual(canon('007'), '7');
});

test('autor', () => {
  assert.deepStrictEqual(splitAuthor('maria_s\nquero o #2'), { author: 'maria_s', body: 'quero o #2' });
  assert.deepStrictEqual(splitAuthor('joao: #4'), { author: 'joao', body: '#4' });
  assert.deepStrictEqual(splitAuthor('#4'), { author: '', body: '#4' });
});

test('catálogo CSV', () => {
  const items = parseCatalog('codigo;nome;busca\n1;Camiseta Preta;\n02;"Caneca; térmica";77123\n');
  assert.deepStrictEqual(items, [
    { code: '1', name: 'Camiseta Preta', search: '' },
    { code: '2', name: 'Caneca; térmica', search: '77123' },
  ]);
  assert.strictEqual(parseCatalog('1,Boné,\n2,Meia,').length, 2);
});
