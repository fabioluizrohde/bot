// Teste ponta a ponta do lote por ID: carrega a extensão num Chromium real, serve os mocks
// (test/mock-live.html e test/mock-shopee.html) como se fossem live.shopee.com.br e shopee.com.br e
// percorre: selecionar texto do chat -> Processar lote -> 3 cliques na busca -> aba da Shopee fecha ->
// a live marca os favoritos. Rodar: PLAYWRIGHT_PATH=<caminho do playwright> npm run test:e2e
//
// Favoritos compartilhados: live e Shopee são origens diferentes (localStorage não é compartilhado), então a
// lista fica AQUI, em memória, e é exposta às duas páginas com context.exposeFunction
// (__favGet / __favHas / __favToggle). Assim o que se favorita na Shopee aparece na grade da live.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright'));
} catch (_) {
  console.log('Playwright não encontrado: e2e escrito, não executado');
  process.exit(0);
}

const EXT = path.resolve(__dirname, '..');
const MOCK_LIVE = fs.readFileSync(path.join(__dirname, 'mock-live.html'), 'utf8');
const MOCK_SHOPEE = fs.readFileSync(path.join(__dirname, 'mock-shopee.html'), 'utf8');

const NOME_CLH = 'Caneca Térmica Inox 500ml Azul Premium'; // CLH-NZK-QPT: novo (ainda não favoritado)
const NOME_ANJ = 'Garrafa Squeeze 1L Preta com Tampa Rosqueável'; // ANJ-EGH-KLV: já favoritado
const NOME_NA_SACOLA = 'Camiseta Dry Fit Preta Masculina Esportiva'; // favorito que já está na sacola
const SELECT_ID = 'input.shopee-searchbar-input__input';

// Favoritos iniciais: 1 já na sacola, ANJ, e enchimento para a grade precisar de rolagem.
const favoritos = [
  { name: NOME_NA_SACOLA, inBag: true },
  { name: NOME_ANJ, inBag: false },
  ...Array.from({ length: 12 }, (_, i) => ({ name: `Produto de enchimento número ${String(i + 1).padStart(2, '0')} para rolagem`, inBag: false })),
];
const iniciais = favoritos.map((f) => f.name);
const toggles = []; // nomes favoritados/desfavoritados pela Shopee, em ordem

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const errors = [];
  const vigia = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  };
  ctx.on('page', vigia);

  await ctx.exposeFunction('__favGet', () => favoritos.map((f) => ({ ...f })));
  await ctx.exposeFunction('__favHas', (nome) => favoritos.some((f) => f.name === nome));
  await ctx.exposeFunction('__favToggle', (nome) => {
    toggles.push(nome);
    const i = favoritos.findIndex((f) => f.name === nome);
    if (i >= 0) favoritos.splice(i, 1);
    else favoritos.push({ name: nome, inBag: false });
    return i < 0;
  });

  const serve = (html) => (r) =>
    r.request().url().endsWith('/favicon.ico')
      ? r.fulfill({ status: 204 })
      : r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  await ctx.route('https://live.shopee.com.br/**', serve(MOCK_LIVE));
  await ctx.route('https://shopee.com.br/**', serve(MOCK_SHOPEE));

  const step = (msg) => console.log('OK', msg);
  const until = async (fn, msg, timeout = 30000) => {
    const fim = Date.now() + timeout;
    for (;;) {
      if (await fn()) return;
      if (Date.now() > fim) throw new Error('tempo esgotado: ' + msg);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const page = ctx.pages()[0] || (await ctx.newPage());
  vigia(page);
  await page.goto('https://live.shopee.com.br/pc/live');
  const painel = page.locator('#sla-live-host');
  await painel.waitFor({ state: 'attached' });
  const body = () => painel.locator('.body').innerText();
  const statusDoLote = () => painel.locator('li:has(.st) .st').allTextContents();
  step('painel injetado na live');

  // 1. selecionar do pedido do ANJ ao último CLH (ZZZ não existe; CLH aparece de dois usuários)
  await page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[class*="message-content"]')];
    const a = msgs.find((m) => m.textContent.includes('ANJ-EGH-KLV'));
    const b = msgs.find((m) => m.textContent.includes('eu também'));
    const r = document.createRange();
    r.setStart(a.firstChild, 0);
    r.setEnd(b.firstChild, b.firstChild.length);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await until(async () => (await painel.locator('ul li code').count()) === 3, 'painel listar 3 IDs', 5000);
  assert.deepStrictEqual(await painel.locator('ul li code').allTextContents(), ['ANJ-EGH-KLV', 'ZZZ-YYY-XXX', 'CLH-NZK-QPT']);
  step('painel lista os 3 IDs do chat (repetido contado uma vez)');

  // 2. Processar lote abre a aba da Shopee
  const [shopee] = await Promise.all([ctx.waitForEvent('page'), painel.locator('button[data-act=start]').click()]);
  let shopeeFechou = false;
  shopee.on('close', () => { shopeeFechou = true; });
  await shopee.waitForLoadState('load');
  step('aba da Shopee aberta');

  // 3. um clique na busca por ID (a extensão cola o ID, dá Enter e favorita se preciso)
  for (let k = 1; k <= 3; k++) {
    await shopee.waitForTimeout(800); // deixa o script da extensão instalar o ouvinte de clique
    await shopee.locator(SELECT_ID).click();
    await until(async () => (await statusDoLote()).filter((s) => s !== 'na fila').length >= k, `ID ${k} resolvido`);
    step(`clique ${k}: ID resolvido`);
  }

  // 4. a aba da Shopee fecha sozinha e a live marca os favoritos
  await until(() => shopeeFechou, 'aba da Shopee fechar');
  step('aba da Shopee fechou');
  await until(async () => /2 marcados/.test(await body()), 'aviso "2 marcados"', 40000);
  step('live marcou os favoritos');

  // 5. verificações
  assert.deepStrictEqual(await statusDoLote(), ['já estava favoritado', 'não achei', 'favoritado']);
  assert.deepStrictEqual(toggles, [NOME_CLH], 'só o produto novo foi favoritado; ninguém foi desfavoritado');
  for (const n of iniciais) assert.ok(favoritos.some((f) => f.name === n), 'favorito inicial removido: ' + n);
  assert.ok(favoritos.some((f) => f.name === NOME_CLH), 'CLH deveria estar favoritado');
  assert.strictEqual(favoritos.length, iniciais.length + 1);

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('#grade label')].map((l) => ({ nome: l.querySelector('[class*="name"]').textContent, marcado: l.querySelector('input').checked }))
  );
  const marcado = (prefixo) => (cards.find((c) => c.nome.startsWith(prefixo)) || {}).marcado;
  assert.strictEqual(marcado('Caneca Térmica Inox'), true, 'CLH marcado na grade (nome truncado)');
  assert.strictEqual(marcado('Garrafa Squeeze 1L Preta'), true, 'ANJ marcado na grade');
  assert.strictEqual(marcado('Camiseta Dry Fit'), true, 'o que já estava na sacola continua marcado');
  assert.strictEqual(cards.filter((c) => c.marcado).length, 3, 'só 3 marcados (nenhum card a mais)');
  assert.strictEqual(await page.evaluate(() => window.__confirmClicks), 0, 'a extensão nunca clica em Confirmar');
  step('favoritos finais, grade marcada e __confirmClicks === 0');

  await page.screenshot({ path: process.env.SHOT || path.join(os.tmpdir(), 'sla-e2e.png') });
  assert.deepStrictEqual(errors, [], 'sem erros no console');
  await ctx.close();
  console.log('\nE2E OK');
})().catch((e) => {
  console.error('\nE2E FALHOU:', e);
  process.exit(1);
});
