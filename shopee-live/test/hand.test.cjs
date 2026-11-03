const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/selectors.js');
const H = require('../src/shopee/hand.js');
const { isProductUrl, isFavorited, cleanProductName } = H;

test('isProductUrl: formatos de produto', () => {
  assert.strictEqual(isProductUrl('https://shopee.com.br/affiliation-i.1633716881.58220139713'), true);
  assert.strictEqual(isProductUrl('https://shopee.com.br/product/1633716881/58220139713?utm_source=x'), true);
});

test('isProductUrl: busca, home e lixo não são produto', () => {
  assert.strictEqual(isProductUrl('https://shopee.com.br/search?keyword=X'), false);
  assert.strictEqual(isProductUrl('https://shopee.com.br/'), false);
  assert.strictEqual(isProductUrl(''), false);
  assert.strictEqual(isProductUrl(null), false);
});

// Elemento falso mínimo: matches, querySelector (marca de cheio ou ícone) e parentElement.
function fakeEl({ self = false, filled = false, icon = false, parent = null } = {}) {
  return {
    parentElement: parent,
    matches: () => self,
    querySelector: (sel) => (sel.includes('filled') ? (filled ? {} : null) : icon ? {} : null),
  };
}

test('isFavorited: coração cheio dentro do botão ou no contêiner', () => {
  assert.strictEqual(isFavorited(fakeEl({ filled: true })), true);
  assert.strictEqual(isFavorited(fakeEl({ self: true })), true);
  assert.strictEqual(isFavorited(fakeEl({ parent: fakeEl({ filled: true }) })), true);
});

test('isFavorited: coração vazio (ícone sem marca de cheio) é false', () => {
  assert.strictEqual(isFavorited(fakeEl({ icon: true })), false);
});

test('isFavorited: sem como saber (nem ícone) ou elemento ausente é null', () => {
  assert.strictEqual(isFavorited(fakeEl()), null);
  assert.strictEqual(isFavorited(null), null);
});

test('cleanProductName: tira o sufixo da Shopee', () => {
  assert.strictEqual(cleanProductName('Tênis Azul | Shopee Brasil'), 'Tênis Azul');
  assert.strictEqual(cleanProductName('Sem sufixo'), 'Sem sufixo');
});

// ---------- Crítico 1: não aceitar a página do produto anterior como resultado ----------

const P1 = 'https://shopee.com.br/affiliation-i.111.222';
const P1Q = 'https://shopee.com.br/affiliation-i.111.222?sp_atk=abc';
const P1B = 'https://shopee.com.br/product/111/222';
const P2 = 'https://shopee.com.br/affiliation-i.333.444';
const HOME = 'https://shopee.com.br/';
const BUSCA = 'https://shopee.com.br/search?keyword=ZZZ-YYY-XXX';

test('productIdFromUrl: mesmo produto nos dois formatos; não-produto é null', () => {
  assert.strictEqual(H.productIdFromUrl(P1), '111.222');
  assert.strictEqual(H.productIdFromUrl(P1Q), '111.222');
  assert.strictEqual(H.productIdFromUrl(P1B), '111.222');
  assert.strictEqual(H.productIdFromUrl(HOME), null);
  assert.strictEqual(H.productIdFromUrl(BUSCA), null);
  assert.strictEqual(H.productIdFromUrl(''), null);
  assert.strictEqual(H.productIdFromUrl(null), null);
});

test('shouldFinish: mesma URL (ou mesmo produto com outra query) NÃO termina', () => {
  assert.strictEqual(H.shouldFinish({ startUrl: P1, currentUrl: P1 }), false);
  assert.strictEqual(H.shouldFinish({ startUrl: P1, currentUrl: P1Q }), false);
  assert.strictEqual(H.shouldFinish({ startUrl: P1, currentUrl: P1B }), false);
});

test('shouldFinish: da home ou da busca para um produto termina', () => {
  assert.strictEqual(H.shouldFinish({ startUrl: HOME, currentUrl: P1 }), true);
  assert.strictEqual(H.shouldFinish({ startUrl: BUSCA, currentUrl: P2 }), true);
});

test('shouldFinish: busca feita na página de um produto que abre OUTRO produto termina', () => {
  assert.strictEqual(H.shouldFinish({ startUrl: P1, currentUrl: P2 }), true);
});

test('shouldFinish: da página de um produto para "nenhum resultado" não termina (vira nao_achei no tempo)', () => {
  assert.strictEqual(H.shouldFinish({ startUrl: P1, currentUrl: BUSCA }), false);
  assert.strictEqual(H.decideAfterWait({ start: { startUrl: P1 }, currentUrl: BUSCA, captcha: false }), 'nao_achei');
});

test('decideAfterWait: produto novo termina; captcha pausa; mesmo produto vira nao_achei', () => {
  assert.strictEqual(H.decideAfterWait({ start: { startUrl: P1 }, currentUrl: P2, captcha: false }), 'finish');
  assert.strictEqual(H.decideAfterWait({ start: { startUrl: P1 }, currentUrl: P1, captcha: true }), 'captcha');
  assert.strictEqual(H.decideAfterWait({ start: { startUrl: P1 }, currentUrl: P1Q, captcha: false }), 'nao_achei');
  assert.strictEqual(H.decideAfterWait({ start: null, currentUrl: P2, captcha: false }), 'finish');
});

test('nameFromTitles: só aceita o nome quando o título mudou', () => {
  assert.strictEqual(H.nameFromTitles('Produto Um | Shopee Brasil', 'Produto Dois | Shopee Brasil'), 'Produto Dois');
  assert.strictEqual(H.nameFromTitles('Produto Um | Shopee Brasil', 'Produto Um | Shopee Brasil'), '');
  assert.strictEqual(H.nameFromTitles('Shopee Brasil', ' | Shopee Brasil'), '');
  assert.strictEqual(H.nameFromTitles(undefined, 'Produto Dois | Shopee Brasil'), 'Produto Dois');
});

test('canClickHeart: só com produto novo pela URL E título confirmado', () => {
  assert.strictEqual(H.canClickHeart({ startUrl: P1, currentUrl: P2, name: 'Produto Dois' }), true);
  assert.strictEqual(H.canClickHeart({ startUrl: HOME, currentUrl: P2, name: 'Produto Dois' }), true);
  assert.strictEqual(H.canClickHeart({ startUrl: P1, currentUrl: P2, name: '' }), false); // título não mudou: tela velha?
  assert.strictEqual(H.canClickHeart({ startUrl: P1, currentUrl: P1, name: 'Produto Um' }), false);
  assert.strictEqual(H.canClickHeart({ startUrl: P1, currentUrl: BUSCA, name: 'x' }), false);
});

test('parsePending: JSON com o início da busca; texto antigo vira só o id; lixo é null', () => {
  const raw = H.makePending('AAA-BBB-CCC', P1, 'Produto Um | Shopee Brasil');
  assert.deepStrictEqual(H.parsePending(raw), { id: 'AAA-BBB-CCC', startUrl: P1, startTitle: 'Produto Um | Shopee Brasil' });
  assert.deepStrictEqual(H.parsePending('AAA-BBB-CCC'), { id: 'AAA-BBB-CCC', startUrl: '', startTitle: '' });
  assert.strictEqual(H.parsePending(null), null);
  assert.strictEqual(H.parsePending(''), null);
});

// ---------- Importante 3: ID desconhecido não pode repetir para sempre ----------

test('decideOnLoad: voltou com o ID pendente num produto NOVO -> finish', () => {
  const pending = { id: 'AAA', startUrl: P1, startTitle: 't' };
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: 'AAA', pending, currentUrl: P2 }), 'finish');
});

test('decideOnLoad: ID pendente numa página que não é produto -> check (espera e vira nao_achei)', () => {
  const pending = { id: 'AAA', startUrl: P1, startTitle: 't' };
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: 'AAA', pending, currentUrl: BUSCA }), 'check');
});

test('decideOnLoad: ID pendente e recarregou o MESMO produto do início -> check (nunca finish)', () => {
  const pending = { id: 'AAA', startUrl: P1, startTitle: 't' };
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: 'AAA', pending, currentUrl: P1Q }), 'check');
});

test('decideOnLoad: sem pendente, pendente de outro ID, ou pausado -> refresh', () => {
  const pending = { id: 'AAA', startUrl: P1, startTitle: 't' };
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: 'AAA', pending: null, currentUrl: P2 }), 'refresh');
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: 'BBB', pending, currentUrl: P2 }), 'refresh');
  assert.strictEqual(H.decideOnLoad({ paused: true, itemId: 'AAA', pending, currentUrl: P2 }), 'refresh');
  assert.strictEqual(H.decideOnLoad({ paused: false, itemId: null, pending, currentUrl: P2 }), 'refresh');
});

// ---------- Menor 4: aviso atualizado depois de cada resultado ----------

test('noticeText: ID k de N, ou pedido de verificação quando pausado', () => {
  assert.strictEqual(H.noticeText({ index: 2, total: 3 }, false), 'ID 2 de 3: clique na busca');
  assert.match(H.noticeText({ index: 2, total: 3 }, true), /resolva e clique em Continuar/);
});

test('keepsTab: só continua na Shopee enquanto o lote está resolvendo', () => {
  assert.strictEqual(H.keepsTab({ phase: 'resolving' }), true);
  assert.strictEqual(H.keepsTab({ phase: 'adding' }), false);
  assert.strictEqual(H.keepsTab({ phase: 'done' }), false);
  assert.strictEqual(H.keepsTab(null), false);
});
