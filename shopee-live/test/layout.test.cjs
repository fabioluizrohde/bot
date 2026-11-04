const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/live/layout.js');

const W = { innerWidth: 1522, innerHeight: 666 };

function dentro(r, win) {
  for (const k of ['left', 'top', 'width', 'height']) {
    assert.ok(Number.isInteger(r[k]), k + ' inteiro: ' + r[k]);
  }
  assert.ok(r.width > 0 && r.height > 0);
  assert.ok(r.left >= 80 - r.width && r.left <= Math.max(80 - r.width, win.innerWidth - 80));
  assert.ok(r.top >= 0 && r.top <= Math.max(0, win.innerHeight - 40));
}

test('constantes', () => {
  assert.strictEqual(L.MIN_W, 300);
  assert.strictEqual(L.MIN_H, 280);
  assert.strictEqual(L.DEFAULT_W, 440);
  assert.strictEqual(L.DEFAULT_H_RATIO, 0.85);
  assert.strictEqual(L.MARGIN, 16);
  assert.strictEqual(L.TOP, 64);
});

test('defaultRect em 1522x666', () => {
  assert.deepStrictEqual(L.defaultRect(W), { left: 1522 - 440 - 16, top: 64, width: 440, height: 566 });
});

test('defaultRect em janela pequena 360x400', () => {
  const r = L.defaultRect({ innerWidth: 360, innerHeight: 400 });
  assert.strictEqual(r.width, 328);
  assert.ok(r.height >= 280 && r.height <= 400);
  assert.ok(r.left >= 0 && r.top >= 0);
  assert.ok(r.left + r.width <= 360 && r.top + r.height <= 400);
});

test('defaultRect em janela minúscula 200x200 continua positivo e dentro', () => {
  const win = { innerWidth: 200, innerHeight: 200 };
  const r = L.defaultRect(win);
  dentro(r, win);
  assert.ok(r.left >= 0 && r.top >= 0);
  assert.ok(r.left + r.width <= 200 && r.top + r.height <= 200);
});

test('defaultRect nunca devolve NaN ou negativo', () => {
  for (const [w, h] of [[1, 1], [50, 50], [299, 279], [300, 280], [1920, 1080], [800, 300]]) {
    const r = L.defaultRect({ innerWidth: w, innerHeight: h });
    for (const k of Object.keys(r)) {
      assert.ok(Number.isInteger(r[k]) && r[k] >= 0, w + 'x' + h + ' ' + k + '=' + r[k]);
    }
    assert.ok(r.width > 0 && r.height > 0);
  }
});

test('sanitizeRect devolve o padrão para entradas inválidas', () => {
  const d = L.defaultRect(W);
  const ok = { left: 10, top: 10, width: 400, height: 400 };
  const invalidas = [
    null, undefined, 'x', 42, [], [1, 2, 3, 4], {},
    { left: NaN, top: 10, width: 400, height: 400 },
    { ...ok, top: Infinity },
    { ...ok, width: -Infinity },
    { left: 10, top: 10, width: 400 },
    { ...ok, height: '400' },
    { ...ok, left: null },
  ];
  for (const v of invalidas) assert.deepStrictEqual(L.sanitizeRect(v, W), d, JSON.stringify(v));
});

test('sanitizeRect mantém um retângulo válido e arredonda', () => {
  assert.deepStrictEqual(L.sanitizeRect({ left: 100, top: 80, width: 400, height: 300 }, W),
    { left: 100, top: 80, width: 400, height: 300 });
  assert.deepStrictEqual(L.sanitizeRect({ left: 100.4, top: 80.6, width: 400.5, height: 300.2 }, W),
    { left: 100, top: 81, width: 401, height: 300 });
});

test('sanitizeRect sobe largura e altura ao mínimo', () => {
  const r = L.sanitizeRect({ left: 1, top: 2, width: 50, height: 50 }, W);
  assert.strictEqual(r.width, 300);
  assert.strictEqual(r.height, 280);
});

test('sanitizeRect limita largura e altura à janela', () => {
  const r = L.sanitizeRect({ left: 0, top: 0, width: 5000, height: 5000 }, W);
  assert.strictEqual(r.width, 1522);
  assert.strictEqual(r.height, 666);
});

test('sanitizeRect mantém o cabeçalho alcançável (esquerda, direita, cima, baixo)', () => {
  const base = { top: 100, width: 400, height: 300 };
  const esq = L.sanitizeRect({ ...base, left: -5000 }, W);
  assert.strictEqual(esq.left, 80 - 400);
  assert.ok(esq.left + esq.width >= 80);
  const dir = L.sanitizeRect({ ...base, left: 99999 }, W);
  assert.strictEqual(dir.left, 1522 - 80);
  const cima = L.sanitizeRect({ left: 100, top: -300, width: 400, height: 300 }, W);
  assert.strictEqual(cima.top, 0);
  const baixo = L.sanitizeRect({ left: 100, top: 99999, width: 400, height: 300 }, W);
  assert.strictEqual(baixo.top, 666 - 40);
});

test('sanitizeRect em janela pequena fica positivo e dentro', () => {
  const win = { innerWidth: 200, innerHeight: 200 };
  const r = L.sanitizeRect({ left: 5, top: 5, width: 400, height: 400 }, win);
  assert.strictEqual(r.width, 200);
  assert.strictEqual(r.height, 200);
  dentro(r, win);
});

test('rectAfterMove soma o deslocamento sem mexer no original', () => {
  const r = { left: 100, top: 100, width: 400, height: 300 };
  const copia = { ...r };
  assert.deepStrictEqual(L.rectAfterMove(r, 30, -20, W), { left: 130, top: 80, width: 400, height: 300 });
  assert.deepStrictEqual(r, copia);
});

test('rectAfterMove não deixa o cabeçalho sair da janela', () => {
  const r = { left: 100, top: 100, width: 400, height: 300 };
  const a = L.rectAfterMove(r, -100000, -100000, W);
  assert.strictEqual(a.left, 80 - 400);
  assert.strictEqual(a.top, 0);
  const b = L.rectAfterMove(r, 100000, 100000, W);
  assert.strictEqual(b.left, 1522 - 80);
  assert.strictEqual(b.top, 666 - 40);
});

test('rectAfterResize soma e respeita mínimo e máximo', () => {
  const r = { left: 100, top: 100, width: 400, height: 300 };
  const copia = { ...r };
  assert.deepStrictEqual(L.rectAfterResize(r, 50, 40, W), { left: 100, top: 100, width: 450, height: 340 });
  assert.deepStrictEqual(r, copia);
  const min = L.rectAfterResize(r, -100000, -100000, W);
  assert.strictEqual(min.width, 300);
  assert.strictEqual(min.height, 280);
  const max = L.rectAfterResize(r, 100000, 100000, W);
  assert.strictEqual(max.width, 1522);
  assert.strictEqual(max.height, 666);
});

test('loteMaxHeight', () => {
  assert.strictEqual(L.loteMaxHeight(566), 198);
  assert.strictEqual(L.loteMaxHeight(100), 80);
  assert.strictEqual(L.loteMaxHeight(NaN), 80);
  assert.strictEqual(L.loteMaxHeight(Infinity), 80);
  assert.strictEqual(L.loteMaxHeight(undefined), 80);
});
