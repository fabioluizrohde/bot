const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/ids.js');
require('../src/lib/batch.js');
require('../src/lib/selectors.js');
const P = require('../src/live/panel.js');
const B = globalThis.SLA.batch;

test('mergeIds: seleção com IDs substitui; sem IDs mantém a anterior', () => {
  const a = P.mergeIds([], 'oi CLH-NZK-QPT e abc-def-ghi', null);
  assert.deepStrictEqual(a, ['CLH-NZK-QPT', 'ABC-DEF-GHI']);
  assert.deepStrictEqual(P.mergeIds(a, 'bom dia sem código', null), a);
  assert.deepStrictEqual(P.mergeIds(a, '', null), a);
});

test('mergeIds: não readiciona IDs que já estão no lote', () => {
  const lote = B.createBatch(['CLH-NZK-QPT']);
  assert.deepStrictEqual(P.mergeIds([], 'CLH-NZK-QPT XXX-YYY-ZZZ', lote), ['XXX-YYY-ZZZ']);
});

test('removeId', () => {
  assert.deepStrictEqual(P.removeId(['A', 'B'], 'A'), ['B']);
});

test('statusLabel: textos em português', () => {
  assert.strictEqual(P.statusLabel('na_fila'), 'na fila');
  assert.strictEqual(P.statusLabel('nao_achei'), 'não achei');
  assert.strictEqual(P.statusLabel('ja_na_sacola'), 'já estava na sacola');
  assert.strictEqual(P.statusLabel('xpto'), 'xpto');
});

test('shouldMount: só em live.shopee.com.br/pc/live', () => {
  assert.strictEqual(P.shouldMount({ hostname: 'live.shopee.com.br', pathname: '/pc/live/123' }), true);
  assert.strictEqual(P.shouldMount({ hostname: 'live.shopee.com.br', pathname: '/home' }), false);
  assert.strictEqual(P.shouldMount({ hostname: 'shopee.com.br', pathname: '/pc/live' }), false);
});

test('viewState: botões por fase', () => {
  assert.deepStrictEqual(P.viewState(null, 0), { canProcess: false, showRetomar: false, showMarcar: false, showAguardando: false, showLimpar: false });
  assert.strictEqual(P.viewState(null, 2).canProcess, true);
  const l = B.createBatch(['AAA-BBB-CCC']);
  const r = P.viewState(l, 3);
  assert.strictEqual(r.canProcess, false);
  assert.strictEqual(r.showRetomar, true);
  assert.strictEqual(r.showLimpar, true);
  const ad = { ...B.setItem(l, 'AAA-BBB-CCC', { status: 'favoritado' }), phase: 'adding' };
  const a = P.viewState(ad, 0);
  assert.strictEqual(a.showMarcar, true);
  assert.strictEqual(a.showRetomar, false);
  assert.strictEqual(P.viewState({ ...l, phase: 'done' }, 1).canProcess, true);
});

test('isInsideChat: nó de texto e elemento', () => {
  const dentro = { closest: (s) => (s.includes('comment-content') ? {} : null) };
  assert.strictEqual(P.isInsideChat({ nodeType: 3, parentElement: dentro }, 'comment-content'), true);
  assert.strictEqual(P.isInsideChat({ nodeType: 1, closest: () => null }, 'comment-content'), false);
  assert.strictEqual(P.isInsideChat(null, 'x'), false);
});

test('normalizeResults: lista ou mapa', () => {
  assert.deepStrictEqual(P.normalizeResults([{ id: 'A', status: 'adicionado' }]), [{ id: 'A', status: 'adicionado' }]);
  assert.deepStrictEqual(P.normalizeResults({ A: 'conferir' }), [{ id: 'A', status: 'conferir' }]);
  assert.deepStrictEqual(P.normalizeResults(null), []);
});

test('planMarkResults: marcado só vai para a memória; ja_na_sacola e conferir viram status; resto é ignorado', () => {
  const r = P.planMarkResults([
    { id: 'A', status: 'marcado' },
    { id: 'B', status: 'ja_na_sacola' },
    { id: 'C', status: 'conferir' },
    { id: 'D', status: 'xpto' },
    { id: 'E', status: 'adicionado' },
  ]);
  assert.deepStrictEqual(r.marcados, ['A']);
  assert.deepStrictEqual(r.updates, [
    { id: 'B', status: 'ja_na_sacola' },
    { id: 'C', status: 'conferir' },
    { id: 'E', status: 'adicionado' },
  ]);
});

// ---------- Menor 8: lote terminado não bloqueia novas seleções ----------

test('mergeIds: lote terminado (done) não impede selecionar os mesmos IDs de novo', () => {
  const lote = { ...B.createBatch(['CLH-NZK-QPT']), phase: 'done' };
  assert.deepStrictEqual(P.mergeIds([], 'CLH-NZK-QPT XXX-YYY-ZZZ', lote), ['CLH-NZK-QPT', 'XXX-YYY-ZZZ']);
});

test('filterOutBatch: tira os IDs do lote em andamento; lote done ou nenhum não tira nada', () => {
  const lote = B.createBatch(['AAA-BBB-CCC']);
  assert.deepStrictEqual(P.filterOutBatch(['AAA-BBB-CCC', 'DDD-EEE-FFF'], lote), ['DDD-EEE-FFF']);
  assert.deepStrictEqual(P.filterOutBatch(['AAA-BBB-CCC'], { ...lote, phase: 'done' }), ['AAA-BBB-CCC']);
  assert.deepStrictEqual(P.filterOutBatch(['AAA-BBB-CCC'], null), ['AAA-BBB-CCC']);
});

// ---------- Importante 2: marcação automática, botão só para tentar de novo ----------

test('viewState: aguardando o Confirmar esconde "Marcar na live" e mostra o aviso de espera', () => {
  const l = B.createBatch(['AAA-BBB-CCC']);
  const ad = { ...B.setItem(l, 'AAA-BBB-CCC', { status: 'favoritado' }), phase: 'adding' };
  const w = P.viewState(ad, 0, true);
  assert.strictEqual(w.showMarcar, false);
  assert.strictEqual(w.showAguardando, true);
  const n = P.viewState(ad, 0, false);
  assert.strictEqual(n.showMarcar, true);
  assert.strictEqual(n.showAguardando, false);
  assert.strictEqual(P.viewState({ ...l, phase: 'done' }, 0, true).showAguardando, false);
});

test('planMarkResults: ja_na_sacola de um ID que a própria extensão marcou antes conta como marcado', () => {
  const r = P.planMarkResults(
    [
      { id: 'A', status: 'ja_na_sacola' },
      { id: 'B', status: 'ja_na_sacola' },
      { id: 'C', status: 'marcado' },
    ],
    ['A', 'C']
  );
  assert.deepStrictEqual(r.marcados, ['A', 'C']);
  assert.deepStrictEqual(r.updates, [{ id: 'B', status: 'ja_na_sacola' }]);
});

// ---------- Ponto de extensão: abas extras com ações ----------

test('findExtraAction: acha a ação em qualquer aba extra; null para desconhecida, aba sem opts e lista vazia', () => {
  const fa = () => 'a';
  const fb = () => 'b';
  const tabs = [
    { key: 'x', label: 'X', render: () => '' },
    { key: 'a', opts: { actions: { buscar: fa } } },
    { key: 'b', opts: { actions: { salvar: fb } } },
    { key: 'c', opts: {} },
  ];
  assert.strictEqual(P.findExtraAction(tabs, 'buscar'), fa);
  assert.strictEqual(P.findExtraAction(tabs, 'salvar'), fb);
  assert.strictEqual(P.findExtraAction(tabs, 'nada'), null);
  assert.strictEqual(P.findExtraAction([{ key: 'x' }], 'buscar'), null);
  assert.strictEqual(P.findExtraAction([], 'buscar'), null);
});

test('findExtraAction: só chaves próprias (constructor/toString herdados não valem)', () => {
  const f = () => {};
  const tabs = [{ key: 'a', opts: { actions: { buscar: f } } }];
  assert.strictEqual(P.findExtraAction(tabs, 'constructor'), null);
  assert.strictEqual(P.findExtraAction(tabs, 'toString'), null);
  assert.strictEqual(P.findExtraAction(tabs, 'hasOwnProperty'), null);
  assert.strictEqual(typeof P.findExtraAction(tabs, 'buscar'), 'function');
});

// ---------- Revisão final: Importante 1 e 2 ----------

test('scrollToRestore: mesma aba devolve a rolagem; troca de aba volta ao topo', () => {
  assert.strictEqual(P.scrollToRestore('sacola', 'sacola', 340), 340);
  assert.strictEqual(P.scrollToRestore('sacola', 'lote', 340), 0);
  assert.strictEqual(P.scrollToRestore(null, 'lote', 0), 0);
  assert.strictEqual(P.scrollToRestore('sacola', 'sacola', undefined), 0);
});

test('refocus: devolve o foco sem rolar e recoloca o cursor', () => {
  const chamadas = [];
  const el = { focus: (o) => chamadas.push(['focus', o]), setSelectionRange: (a, b) => chamadas.push(['sel', a, b]) };
  P.refocus(el, 2, 4);
  assert.deepStrictEqual(chamadas, [['focus', { preventScroll: true }], ['sel', 2, 4]]);
  const so = [];
  P.refocus({ focus: (o) => so.push(o) }, null, null); // sem setSelectionRange e sem cursor
  assert.deepStrictEqual(so, [{ preventScroll: true }]);
  P.refocus(null, 1, 1); // sem elemento: não quebra
});

// ---------- Painel sem abas: Lote fixo + área ----------

test('loteSummary: vazio, só IDs e lote em andamento', () => {
  assert.strictEqual(P.loteSummary(null, []), 'Lote: vazio');
  assert.strictEqual(P.loteSummary(null, ['AAA-BBB-CCC', 'DDD-EEE-FFF', 'GGG-HHH-III']), 'Lote: 3 IDs');
  assert.strictEqual(P.loteSummary(null, ['AAA-BBB-CCC']), 'Lote: 1 ID');
  const l = B.createBatch(['AAA-BBB-CCC', 'DDD-EEE-FFF', 'GGG-HHH-III']);
  const ad = P.loteSummary({ ...l, phase: 'adding' }, []);
  assert.ok(ad.startsWith('Lote: 3 IDs'), ad);
  assert.ok(ad.endsWith('adicionando…'), ad);
  assert.ok(P.loteSummary(l, []).startsWith('Lote: 3 IDs'));
});

test('shouldExpandLote: aviso não vazio ou lote pausado', () => {
  assert.strictEqual(P.shouldExpandLote('', null), false);
  assert.strictEqual(P.shouldExpandLote('Clique no bloco…', null), true);
  const l = B.createBatch(['AAA-BBB-CCC']);
  assert.strictEqual(P.shouldExpandLote('', { ...l, paused: true }), true);
  assert.strictEqual(P.shouldExpandLote('', l), false);
  assert.strictEqual(P.shouldExpandLote(undefined, undefined), false);
});

test('API de áreas: registerArea, isAreaVisible, redraw e o alias registerTab', () => {
  assert.strictEqual(typeof P.registerArea, 'function');
  assert.strictEqual(typeof P.isAreaVisible, 'function');
  assert.strictEqual(typeof P.redraw, 'function');
  assert.strictEqual(typeof P.registerTab, 'function');
  assert.strictEqual(typeof P.isTabActive, 'function');
  assert.strictEqual(globalThis.SLA.panel.registerTab, P.registerTab);
  assert.strictEqual(P.tabAfterMessage, undefined);
  // Sem painel montado (node): registrar não quebra e a área não está visível.
  P.registerArea('teste', () => '<p>x</p>', { actions: { 'teste-act': () => {} } });
  assert.strictEqual(P.isAreaVisible('teste'), false);
  assert.strictEqual(P.isTabActive('teste'), false);
  assert.strictEqual(P.isAreaVisible('nao-existe'), false);
});
