// Teste ponta a ponta: carrega a extensão num Chromium real e usa a página falsa
// test/mock-live.html servida como se fosse https://seller.shopee.com.br/live
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const EXT = path.resolve(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-live.html'), 'utf8');

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await ctx.route('https://seller.shopee.com.br/**', (r) => r.fulfill({ contentType: 'text/html', body: MOCK }));
  await page.goto('https://seller.shopee.com.br/live');

  const P = (s) => page.locator('#sla-host').locator(s);
  const step = (msg) => console.log('✔', msg);
  await P('.panel').waitFor();
  step('painel injetado');

  // 1. ensinar
  await P('[data-tab=config]').click();
  await P('[data-a=teach][data-t=chat]').click();
  await page.locator('.k2Msg').nth(1).click();
  await P('[data-a=teach][data-t=bag]').click();
  await page.locator('.q9Item .t').first().click();
  await P('[data-a=teach][data-t=highlight]').click();
  await page.locator('.q9Item .pinBtn').first().click();
  assert.strictEqual(await page.textContent('#pinned'), 'nenhum', 'clique de ensino não deve chegar à página');
  assert.strictEqual(await P('.body .row .no').count(), 0, 'os 3 itens devem estar ensinados');
  step('chat, sacola e botão destacar ensinados');

  // 2. gravar fluxo
  await P('#example').fill('Caneca Térmica');
  await P('[data-a=recStart]').click();
  await page.click('#openAdd');
  await page.click('.srch');
  await page.fill('.srch', 'Caneca Térmica');
  await page.locator('label.res span').first().click();
  await page.click('#confirm');
  await P('[data-a=recStop]').click();
  const steps = await P('ol.steps li').allTextContents();
  console.log('   passos:', steps);
  assert.ok(steps.some((s) => s.includes('{busca}')), 'busca deve virar variável');
  assert.ok(steps.some((s) => s.includes('resultado do produto')), 'clique no resultado deve ser por produto');
  step('fluxo gravado');

  // 3. catálogo
  await P('[data-tab=catalogo]').click();
  await P('#csv').fill('codigo;nome;busca\n1;Camiseta Dry Fit Preta;\n2;Caneca Térmica 500ml;\n3;Boné Aba Curva;\n4;Meia Cano Alto Kit 3;Meia Cano\n5;Garrafa Squeeze 1L;1005');
  await P('[data-a=csvSave]').click();
  assert.strictEqual(await P('.body .row').count(), 5);
  step('catálogo importado');

  // 4. chat -> pedidos
  await P('[data-tab=pedidos]').click();
  await page.evaluate(() => {
    postChat('bia', 'quero o #4 por favor');
    postChat('carlos', '#99');
    postChat('duda', 'quero o 4 tbm');
    postChat('ana', '1');
  });
  await P('.req:has(.code:text-is("#4")) .pill.novo').waitFor();
  assert.match(await P('.req:has(.code:text-is("#4")) .meta').textContent(), /2× pedido · duda, bia/);
  await P('.req:has(.code:text-is("#99")) .pill.desconhecido').waitFor();
  await P('.req:has(.code:text-is("#1")) .pill.na_sacola').waitFor({ timeout: 5000 });
  step('pedidos lidos do chat (#4 ×2, #99 fora do catálogo, #1 já na sacola)');

  // 5. adicionar manualmente
  await P('[data-a=add][data-c="4"]').click();
  await P('.req:has(.code:text-is("#4")) .pill.na_sacola').waitFor({ timeout: 15000 });
  assert.deepStrictEqual(await page.evaluate(() => window.__added), ['Caneca Térmica 500ml', 'Meia Cano Alto Kit 3']);
  step('#4 adicionado à sacola pelo fluxo gravado');

  // 6. destacar
  await P('[data-a=hl][data-c="4"]').click();
  await page.waitForFunction(() => document.querySelector('#pinned').textContent === 'Meia Cano Alto Kit 3');
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForFunction(() => document.querySelector('#pinned').textContent === 'Caneca Térmica 500ml');
  step('destaque por botão e por atalho Alt+↑');

  // 7. automático (busca pelo ID do anúncio)
  await P('[data-a=auto]').check();
  await page.evaluate(() => postChat('dani', 'manda o 5'));
  await P('.req:has(.code:text-is("#5")) .pill.na_sacola').waitFor({ timeout: 15000 });
  assert.ok((await page.evaluate(() => window.__added)).includes('Garrafa Squeeze 1L'));
  step('modo automático adicionou #5 assim que pediram no chat');

  // 8. persiste após recarregar
  await page.reload();
  await P('.req:has(.code:text-is("#5"))').waitFor();
  step('estado mantido após recarregar a página');

  await page.screenshot({ path: process.env.SHOT || path.join(os.tmpdir(), 'sla-e2e.png') });
  assert.deepStrictEqual(errors, [], 'sem erros no console');
  await ctx.close();
  console.log('\nE2E OK');
})().catch((e) => {
  console.error('\nE2E FALHOU:', e);
  process.exit(1);
});
