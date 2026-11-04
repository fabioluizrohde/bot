const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/batch.js');
const B = globalThis.SLA.batch;
const A = require('../src/live/autoAdd.js');

const S = B.STATUS;
function lote(over, itens) {
  let b = { ...B.createBatch(['A', 'B', 'C']), phase: 'adding', sessionId: '777', ...over };
  const base = itens || [['A', 1, 10], ['B', 2, 20], ['C', 3, 30]];
  for (const [id, shopId, itemId] of base) b = B.setItem(b, id, { status: S.FAVORITADO, shopId, itemId });
  return b;
}
const sacola = (ids, extra) => ({ ok: true, items: ids.map((n) => ({ itemId: n })), total: ids.length, maxItems: 100, ...extra });
const G = (batch, o) => A.gate({ batch, sessionId: '777', auto: true, erros: 0, ...o });

// ---- gate: trava antes de qualquer pedido ----
test('gate: só passa lote em "adding", sem pausa, na mesma sessão, ainda não tentado (auto)', () => {
  assert.strictEqual(G(lote()), null);
  assert.strictEqual(G(null), 'sem_lote');
  assert.strictEqual(G(lote({ phase: 'resolving' })), 'fase');
  assert.strictEqual(G(lote({ phase: 'done' })), 'fase');
  assert.strictEqual(G(lote({ paused: true })), 'pausado');
  assert.strictEqual(G(lote(), { sessionId: '888' }), 'outra_sessao');
  assert.strictEqual(G(lote(), { sessionId: null }), 'outra_sessao');
  assert.strictEqual(G(lote({ sessionId: null })), 'outra_sessao');
  assert.strictEqual(G(lote({ addTried: true })), 'ja_tentou');
  assert.strictEqual(G(lote(), { erros: 2 }), 'desligado');
});

test('gate: clique manual ignora "já tentou" e o disjuntor, mas não a sessão, fase nem pausa', () => {
  assert.strictEqual(G(lote({ addTried: true }), { auto: false, erros: 5 }), null);
  assert.strictEqual(G(lote({ paused: true }), { auto: false }), 'pausado');
  assert.strictEqual(G(lote(), { auto: false, sessionId: '888' }), 'outra_sessao');
  assert.strictEqual(G(lote({ phase: 'done' }), { auto: false }), 'fase');
});

// ---- planItems: tira o que já está na sacola e confere a capacidade ----
test('planItems: separa os que já estão na sacola e o que vai enviar', () => {
  const cand = B.addableItems(lote());
  const p = A.planItems(cand, sacola([20]));
  assert.deepStrictEqual(p.already.map((x) => x.id), ['B']);
  assert.deepStrictEqual(p.toAdd.map((x) => x.id), ['A', 'C']);
  assert.strictEqual(p.reason, undefined);
});

test('planItems: nada novo e sacola cheia não enviam nada', () => {
  const cand = B.addableItems(lote());
  assert.strictEqual(A.planItems(cand, sacola([10, 20, 30])).reason, 'nada');
  assert.deepStrictEqual(A.planItems(cand, sacola([10, 20, 30])).toAdd, []);
  const justo = A.planItems(cand, sacola([1, 2, 3], { maxItems: 5, total: 3 })); // 3 + 3 > 5
  assert.strictEqual(justo.reason, 'sacola_cheia');
  assert.deepStrictEqual(justo.toAdd, []);
  assert.strictEqual(A.planItems(cand, sacola([1, 2], { maxItems: 5, total: 2 })).toAdd.length, 3); // cabe (5)
  assert.strictEqual(A.planItems(cand, sacola([1], { maxItems: 0, total: 1 })).toAdd.length, 3); // sem limite conhecido
});

test('chunks: pedaços de até 20, em ordem', () => {
  const l = Array.from({ length: 45 }, (_, i) => i);
  assert.deepStrictEqual(A.chunks(l).map((c) => c.length), [20, 20, 5]);
  assert.deepStrictEqual(A.chunks([]), []);
});

// ---- run: fluxo inteiro com dependências falsas ----
function deps(over) {
  const calls = { add: [], marks: 0, reads: 0 };
  const d = {
    calls,
    bags: [],
    addResult: { ok: true },
    markAdd: async () => { calls.marks++; return { ok: true }; },
    readBag: async () => { calls.reads++; return d.bags.length > 1 ? d.bags.shift() : d.bags[0]; },
    addItems: async (sid, entries) => { calls.add.push({ sid, entries }); return d.addResult; },
    ...over,
  };
  return d;
}
const R = (batch, d, o) => A.run({ batch, sessionId: '777', auto: true, circuit: { erros: 0 }, deps: d, ...o });

test('run: caminho feliz marca a tentativa ANTES de enviar, envia só o novo e confirma pela sacola', async () => {
  const d = deps();
  d.bags = [sacola([20]), sacola([20, 10, 30])];
  const ordem = [];
  d.markAdd = async () => { ordem.push('mark'); return { ok: true }; };
  d.addItems = async (sid, e) => { ordem.push('add'); d.calls.add.push({ sid, entries: e }); return { ok: true }; };
  const circuit = { erros: 1 };
  const r = await R(lote(), d, { circuit });
  assert.deepStrictEqual(ordem, ['mark', 'add']);
  assert.deepStrictEqual(d.calls.add, [{ sid: '777', entries: [{ shopId: 1, itemId: 10 }, { shopId: 3, itemId: 30 }] }]);
  assert.deepStrictEqual(r.updates, [{ id: 'B', status: 'ja_na_sacola' }, { id: 'A', status: 'adicionado' }, { id: 'C', status: 'adicionado' }]);
  assert.strictEqual(circuit.erros, 0); // sucesso zera o disjuntor
  assert.match(r.aviso, /2 adicionados/);
});

test('run: gate fechado não faz nenhum pedido', async () => {
  const d = deps();
  const r = await R(lote({ addTried: true }), d);
  assert.strictEqual(d.calls.marks, 0);
  assert.strictEqual(d.calls.reads, 0);
  assert.strictEqual(d.calls.add.length, 0);
  assert.deepStrictEqual(r.updates, []);
});

test('run: se não conseguiu marcar a tentativa (outra aba já marcou), não envia', async () => {
  const d = deps({ markAdd: async () => ({ ok: false }) });
  d.bags = [sacola([])];
  const r = await R(lote(), d);
  assert.strictEqual(d.calls.add.length, 0);
  assert.strictEqual(d.calls.reads, 0);
  assert.deepStrictEqual(r.updates, []);
});

test('run: manual não chama markAdd', async () => {
  const d = deps();
  d.bags = [sacola([]), sacola([10, 20, 30])];
  await R(lote({ addTried: true }), d, { auto: false });
  assert.strictEqual(d.calls.marks, 0);
  assert.strictEqual(d.calls.add.length, 1);
});

test('run: falha ao ler a sacola não envia e conta erro', async () => {
  const d = deps();
  d.bags = [{ ok: false, reason: 'rede' }];
  const circuit = { erros: 0 };
  const r = await R(lote(), d, { circuit });
  assert.strictEqual(d.calls.add.length, 0);
  assert.strictEqual(circuit.erros, 1);
  assert.match(r.aviso, /sacola/i);
});

test('run: erro no envio não repete; relê a sacola e só confirma o que apareceu', async () => {
  const d = deps({ addResult: { ok: false, reason: 'rede', detail: 'tempo' } });
  d.bags = [sacola([]), sacola([10])]; // só o produto 10 chegou
  const circuit = { erros: 0 };
  const r = await R(lote(), d, { circuit });
  assert.strictEqual(d.calls.add.length, 1); // não tentou de novo
  assert.deepStrictEqual(r.updates, [{ id: 'A', status: 'adicionado' }]);
  assert.strictEqual(circuit.erros, 1);
  assert.match(r.aviso, /1 de 3/);
});

test('run: dois erros seguidos (em lotes diferentes) ligam o disjuntor do automático', async () => {
  const circuit = { erros: 0 };
  for (let i = 0; i < 2; i++) {
    const d = deps({ addResult: { ok: false, reason: 'http', detail: '403' } });
    d.bags = [sacola([]), sacola([])];
    await R(lote(), d, { circuit });
  }
  assert.strictEqual(circuit.erros, 2);
  const d = deps();
  const r = await R(lote(), d, { circuit });
  assert.strictEqual(d.calls.marks, 0);
  assert.strictEqual(d.calls.add.length, 0);
  assert.match(r.aviso, /desligad/i);
});

test('run: mais de 20 produtos vão em pedidos de 20 e param no primeiro erro', async () => {
  const itens = Array.from({ length: 45 }, (_, i) => ['I' + i, 1, 100 + i]);
  const b = lote({ ...B.createBatch(itens.map((x) => x[0])), phase: 'adding', sessionId: '777' }, itens);
  const d = deps();
  d.bags = [sacola([], { maxItems: 100 }), sacola(itens.slice(0, 20).map((x) => x[2]))];
  let n = 0;
  d.addItems = async (sid, e) => { d.calls.add.push({ sid, entries: e }); return ++n === 1 ? { ok: true } : { ok: false, reason: 'http', detail: '500' }; };
  const r = await R(b, d);
  assert.deepStrictEqual(d.calls.add.map((c) => c.entries.length), [20, 20]); // o terceiro pedido não saiu
  assert.strictEqual(r.updates.filter((u) => u.status === 'adicionado').length, 20);
});

test('run: tudo já na sacola vira ja_na_sacola sem enviar', async () => {
  const d = deps();
  d.bags = [sacola([10, 20, 30])];
  const r = await R(lote(), d);
  assert.strictEqual(d.calls.add.length, 0);
  assert.deepStrictEqual(r.updates.map((u) => u.status), ['ja_na_sacola', 'ja_na_sacola', 'ja_na_sacola']);
});

test('run: sacola cheia não envia e avisa', async () => {
  const d = deps();
  d.bags = [sacola([1, 2, 3], { maxItems: 4, total: 3 })];
  const r = await R(lote(), d);
  assert.strictEqual(d.calls.add.length, 0);
  assert.match(r.aviso, /cheia|limite/i);
});

test('run: lote sem nenhum produto com números avisa para conferir', async () => {
  const b = B.setItem({ ...B.createBatch(['A']), phase: 'adding', sessionId: '777' }, 'A', { status: S.FAVORITADO });
  const d = deps();
  const r = await R(b, d);
  assert.strictEqual(d.calls.add.length, 0);
  assert.match(r.aviso, /não consegui/i);
});

test('run: nunca lança, mesmo se uma dependência estourar', async () => {
  const d = deps({ readBag: async () => { throw new Error('boom'); } });
  const r = await R(lote(), d);
  assert.ok(r && typeof r.aviso === 'string');
  assert.strictEqual(d.calls.add.length, 0);
});
