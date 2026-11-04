const test = require('node:test');
const assert = require('node:assert');
require('../src/lib/selectors.js');
require('../src/lib/dom.js');
const { selectors, dom } = globalThis.SLA;

test('selectors tem todas as chaves, com texto não vazio', () => {
  const chaves = ['liveHost', 'chatContent', 'toolsProducts', 'listButtonText', 'addRelatedText', 'favoritesTabText',
    'modalRoot', 'gridCardName', 'gridCheckbox', 'confirmText', 'shopeeSearchInput', 'favoriteButton',
    'favoriteFilledMark', 'captchaMarker'];
  for (const k of chaves) {
    assert.strictEqual(typeof selectors[k], 'string', k);
    assert.ok(selectors[k].trim().length > 0, k);
  }
});

test('dom exporta os novos utilitários', () => {
  for (const k of ['qPrefix', 'waitGone', 'scrollUntil']) assert.strictEqual(typeof dom[k], 'function', k);
});
