const { test } = require('node:test');
const assert = require('node:assert');
const g = require('../src/live/showGuard.js');

const real = { isTrusted: true };

test('showGuard: constantes', () => {
  assert.strictEqual(g.MIN_INTERVAL_MS, 1500);
  assert.strictEqual(g.MAX_ERROS, 2);
  assert.deepStrictEqual(g.initialGuard(), { emAndamento: false, ultimoEm: -Infinity, errosSeguidos: 0, desligado: false });
});

test('canShow: clique real no estado inicial pode', () => {
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, real), { ok: true });
});

test('canShow: evento simulado (isTrusted false) → simulado', () => {
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, { isTrusted: false }), { ok: false, motivo: 'simulado' });
});

test('canShow: evento nulo ou sem isTrusted → simulado', () => {
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, null), { ok: false, motivo: 'simulado' });
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, undefined), { ok: false, motivo: 'simulado' });
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, {}), { ok: false, motivo: 'simulado' });
  assert.deepStrictEqual(g.canShow(g.initialGuard(), 0, { isTrusted: 'true' }), { ok: false, motivo: 'simulado' });
});

test('canShow: durante emAndamento → em_andamento', () => {
  const s = g.startShow(g.initialGuard(), 1000);
  assert.deepStrictEqual(g.canShow(s, 99999, real), { ok: false, motivo: 'em_andamento' });
});

test('canShow: 1000 ms depois de startShow → cedo; 1500 ms → ok', () => {
  const s = g.finishShow(g.startShow(g.initialGuard(), 10000), { ok: true });
  assert.deepStrictEqual(g.canShow(s, 11000, real), { ok: false, motivo: 'cedo' });
  assert.deepStrictEqual(g.canShow(s, 11499, real), { ok: false, motivo: 'cedo' });
  assert.deepStrictEqual(g.canShow(s, 11500, real), { ok: true });
});

test('canShow: desligado vence os demais motivos', () => {
  const s = { emAndamento: true, ultimoEm: 1000, errosSeguidos: 2, desligado: true };
  assert.deepStrictEqual(g.canShow(s, 1001, null), { ok: false, motivo: 'desligado' });
  assert.deepStrictEqual(g.canShow(s, 1001, { isTrusted: false }), { ok: false, motivo: 'desligado' });
  assert.deepStrictEqual(g.canShow(s, 1001, real), { ok: false, motivo: 'desligado' });
  assert.deepStrictEqual(g.canShow({ ...s, emAndamento: false }, 99999, real), { ok: false, motivo: 'desligado' });
});

test('canShow: simulado vence em_andamento e cedo; em_andamento vence cedo', () => {
  const s = g.startShow(g.initialGuard(), 1000);
  assert.deepStrictEqual(g.canShow(s, 1001, { isTrusted: false }), { ok: false, motivo: 'simulado' });
  assert.deepStrictEqual(g.canShow(s, 1001, real), { ok: false, motivo: 'em_andamento' });
});

test('startShow: marca emAndamento e ultimoEm', () => {
  const s = g.startShow(g.initialGuard(), 5000);
  assert.strictEqual(s.emAndamento, true);
  assert.strictEqual(s.ultimoEm, 5000);
});

test('finishShow: sucesso limpa emAndamento e zera erros', () => {
  const s = g.finishShow({ emAndamento: true, ultimoEm: 1, errosSeguidos: 1, desligado: false }, { ok: true });
  assert.deepStrictEqual(s, { emAndamento: false, ultimoEm: 1, errosSeguidos: 0, desligado: false });
});

test('finishShow: dois erros seguidos desligam', () => {
  let s = g.initialGuard();
  s = g.finishShow(g.startShow(s, 0), { ok: false });
  assert.strictEqual(s.errosSeguidos, 1);
  assert.strictEqual(s.desligado, false);
  assert.strictEqual(s.emAndamento, false);
  s = g.finishShow(g.startShow(s, 2000), { ok: false });
  assert.strictEqual(s.errosSeguidos, 2);
  assert.strictEqual(s.desligado, true);
  assert.deepStrictEqual(g.canShow(s, 99999, real), { ok: false, motivo: 'desligado' });
});

test('finishShow: um erro seguido de sucesso não desliga (e um novo erro não desliga)', () => {
  let s = g.initialGuard();
  s = g.finishShow(g.startShow(s, 0), { ok: false });
  s = g.finishShow(g.startShow(s, 2000), { ok: true });
  assert.strictEqual(s.errosSeguidos, 0);
  assert.strictEqual(s.desligado, false);
  s = g.finishShow(g.startShow(s, 4000), { ok: false });
  assert.strictEqual(s.desligado, false);
  assert.deepStrictEqual(g.canShow(s, 5500, real), { ok: true });
});

test('finishShow: resultado ausente conta como erro', () => {
  const s = g.finishShow(g.startShow(g.initialGuard(), 0), undefined);
  assert.strictEqual(s.errosSeguidos, 1);
});

test('startShow/finishShow não mutam o objeto recebido', () => {
  const ini = Object.freeze(g.initialGuard());
  const s1 = g.startShow(ini, 100);
  assert.notStrictEqual(s1, ini);
  assert.deepStrictEqual(ini, { emAndamento: false, ultimoEm: -Infinity, errosSeguidos: 0, desligado: false });
  const frozen = Object.freeze({ ...s1, errosSeguidos: 1 });
  const s2 = g.finishShow(frozen, { ok: false });
  assert.notStrictEqual(s2, frozen);
  assert.deepStrictEqual(frozen, { emAndamento: true, ultimoEm: 100, errosSeguidos: 1, desligado: false });
  const s3 = g.finishShow(Object.freeze({ ...s1 }), { ok: true });
  assert.strictEqual(s3.emAndamento, false);
  assert.strictEqual(s1.emAndamento, true);
});
