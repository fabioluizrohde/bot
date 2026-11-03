// "Mão" da Shopee: roda em shopee.com.br (fora da live). Quando o Fabio clica na busca,
// cola o próximo ID do lote, aperta Enter e, na página do produto, favorita (só se ainda
// não estiver favoritado: o coração é um liga/desliga). Nunca clica em mais nada.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const PENDING_KEY = 'sla-hand-pending'; // sessionStorage: ID colado e onde a busca começou (sobrevive ao redirecionamento)
  const NOTICE_ID = 'sla-hand-notice';
  const SEARCH_TIMEOUT = 10000;
  const TITLE_TIMEOUT = 3000; // espera o título mudar para o do produto novo
  const LOAD_CHECK_TIMEOUT = 2000; // página recarregada com busca pendente: espera produto novo ou verificação

  // ---------- Funções puras (testadas) ----------

  // /affiliation-i.<n>.<n> ou /product/<n>/<n>
  function isProductUrl(url) {
    if (!url) return false;
    let path;
    try {
      path = new URL(String(url)).pathname;
    } catch (_) {
      return false;
    }
    return /\/affiliation-i\.\d+\.\d+/.test(path) || /\/product\/\d+\/\d+/.test(path);
  }

  // "el" é o botão de favoritar. Procura o coração no botão e no contêiner dele.
  // true = cheio (favoritado); false = coração vazio visível; null = não deu para saber.
  function isFavorited(el) {
    if (!el) return null;
    const escopos = [el, el.parentElement].filter(Boolean);
    const cheio = SLA.selectors.favoriteFilledMark;
    for (const e of escopos) {
      if ((typeof e.matches === 'function' && e.matches(cheio)) || e.querySelector(cheio)) return true;
    }
    for (const e of escopos) {
      if (e.querySelector('svg, [class*="icon"]')) return false; // há ícone, mas sem a marca de cheio
    }
    return null;
  }

  function cleanProductName(title) {
    return String(title || '').replace(/\s*\|\s*Shopee Brasil\s*$/i, '').trim();
  }

  // Identidade do produto pela URL: "<loja>.<item>" nos dois formatos; null se não for produto.
  function productIdFromUrl(url) {
    if (!url) return null;
    let path;
    try {
      path = new URL(String(url)).pathname;
    } catch (_) {
      return null;
    }
    const m = path.match(/\/affiliation-i\.(\d+)\.(\d+)/) || path.match(/\/product\/(\d+)\/(\d+)/);
    return m ? m[1] + '.' + m[2] : null;
  }

  // A busca terminou num produto NOVO? Só se a URL atual for de produto e de outro produto que
  // não o da página onde a busca começou (a busca pode ser feita na página do produto anterior).
  function shouldFinish({ startUrl, currentUrl }) {
    const atual = productIdFromUrl(currentUrl);
    return !!atual && atual !== productIdFromUrl(startUrl);
  }

  // Depois da espera: 'finish' (produto novo), 'captcha' (verificação) ou 'nao_achei'.
  function decideAfterWait({ start, currentUrl, captcha }) {
    if (shouldFinish({ startUrl: start ? start.startUrl : '', currentUrl })) return 'finish';
    if (captcha) return 'captcha';
    return 'nao_achei';
  }

  // Nome do produto só quando o título mudou desde o início da busca (senão pode ser o do
  // produto anterior, ainda na tela). '' = nome desconhecido.
  function nameFromTitles(startTitle, currentTitle) {
    if (startTitle && String(currentTitle || '') === String(startTitle)) return '';
    return cleanProductName(currentTitle);
  }

  // Só clica no coração se a URL é de um produto novo E o título já confirma a página nova.
  function canClickHeart({ startUrl, currentUrl, name }) {
    return shouldFinish({ startUrl, currentUrl }) && !!name;
  }

  // O que fica guardado antes de apertar Enter.
  function makePending(id, startUrl, startTitle) {
    return JSON.stringify({ id, startUrl: startUrl || '', startTitle: startTitle || '' });
  }

  function parsePending(raw) {
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.id) return { id: String(o.id), startUrl: o.startUrl || '', startTitle: o.startTitle || '' };
    } catch (_) { /* formato antigo: só o id */ }
    return { id: String(raw), startUrl: '', startTitle: '' };
  }

  // Ao carregar uma página da Shopee: 'finish' (voltou da busca num produto novo),
  // 'check' (havia busca deste ID, mas não há produto novo: espera um pouco e decide)
  // ou 'refresh' (só mostra o aviso).
  function decideOnLoad({ paused, itemId, pending, currentUrl }) {
    if (paused || !itemId || !pending || pending.id !== itemId) return 'refresh';
    return shouldFinish({ startUrl: pending.startUrl, currentUrl }) ? 'finish' : 'check';
  }

  function noticeText(item, parado) {
    if (parado) return `Verificação da Shopee (ID ${item.index} de ${item.total}): resolva e clique em Continuar`;
    return `ID ${item.index} de ${item.total}: clique na busca`;
  }

  // A aba da Shopee continua aberta (há mais IDs) depois deste resultado?
  function keepsTab(batch) {
    return !!batch && batch.phase === 'resolving';
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  let ocupado = false; // há uma colagem (ou conferência) em andamento
  let liberado = false; // o Fabio apertou "Continuar"
  const pulados = new Set(); // IDs que o Fabio mandou pular: a busca em andamento é abandonada

  const send = (msg) => chrome.runtime.sendMessage(msg);

  function readPending() {
    try { return parsePending(sessionStorage.getItem(PENDING_KEY)); } catch (_) { return null; }
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* ignora */ }
  }

  function addButton(box, label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin-left:10px;padding:2px 10px;cursor:pointer';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    box.appendChild(b);
  }

  // opts.onContinue: mostra "Continuar"; opts.onSkip: mostra "Pular este ID".
  function showNotice(text, opts) {
    const o = opts || {};
    let box = document.getElementById(NOTICE_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = NOTICE_ID;
      box.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#ee4d2d;color:#fff;' +
        'padding:10px 14px;border-radius:8px;font:14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      document.documentElement.appendChild(box);
    }
    box.textContent = text;
    if (o.onContinue) addButton(box, 'Continuar', o.onContinue);
    if (o.onSkip) addButton(box, 'Pular este ID', o.onSkip);
  }

  function hideNotice() {
    const box = document.getElementById(NOTICE_ID);
    if (box) box.remove();
  }

  const captchaVisible = () => !!document.querySelector(SLA.selectors.captchaMarker);

  // Envia o resultado (a não ser que o ID tenha sido pulado) e atualiza o aviso se a aba continua.
  async function sendResult(id, status, name) {
    if (pulados.has(id)) return null;
    if (status === 'captcha') liberado = false; // nova verificação: espera um novo "Continuar"
    const msg = { type: 'hand:result', id, status };
    if (name) msg.name = name;
    const nb = await send(msg);
    if (keepsTab(nb)) refresh().catch(() => {});
    return nb;
  }

  // "Pular este ID": registra "não achei" para o ID atual. Não clica em nada da página.
  async function pular(id) {
    pulados.add(id);
    clearPending();
    hideNotice();
    const nb = await send({ type: 'hand:result', id, status: 'nao_achei' });
    if (keepsTab(nb)) refresh().catch(() => {});
  }

  // Página de um produto NOVO (a URL já foi conferida): lê o nome, favorita se preciso e responde.
  async function finishProduct(item, start) {
    const D = SLA.dom;
    const st = start || { startUrl: '', startTitle: '' };
    clearPending();
    const achaBotao = () =>
      D.findClickableByText(document, new RegExp('^\\s*' + D.escapeRe(SLA.selectors.favoriteButton), 'i'));
    const primeiro = await D.waitFor(() => pulados.has(item.id) || achaBotao(), SEARCH_TIMEOUT);
    if (pulados.has(item.id)) return;
    if (!primeiro) {
      await sendResult(item.id, captchaVisible() ? 'captcha' : 'nao_achei');
      return;
    }
    // O título precisa mudar (até ~3 s); senão a tela ainda pode ser a do produto anterior.
    const lerNome = () => nameFromTitles(st.startTitle, document.title);
    const name = (await D.waitFor(() => pulados.has(item.id) || lerNome(), TITLE_TIMEOUT)) ? lerNome() : '';
    if (pulados.has(item.id)) return;
    const btn = achaBotao() || primeiro; // procura de novo: a tela pode ter sido redesenhada
    // Sem certeza (da página, do estado do coração ou do clique): não reporta sucesso; o Fabio favorita à mão.
    const manual = (texto) =>
      showNotice(texto, {
        onContinue: async () => {
          hideNotice();
          await sendResult(item.id, 'ja_favoritado', lerNome());
        },
        onSkip: () => pular(item.id),
      });
    if (!name) {
      return manual('Não consegui confirmar que esta é a página do produto novo — confira o coração, favorite à mão se precisar e clique em Continuar');
    }
    const estado = isFavorited(btn);
    if (estado === null) return manual('Não consegui ver se o coração está cheio — favorite à mão e clique em Continuar');
    if (estado === true) {
      await sendResult(item.id, 'ja_favoritado', name);
      return;
    }
    if (!canClickHeart({ startUrl: st.startUrl, currentUrl: location.href, name })) {
      return manual('Não consegui confirmar que esta é a página do produto novo — favorite à mão e clique em Continuar');
    }
    D.realClick(btn); // é um liga/desliga: só clica quando o coração está vazio
    const ok = await D.waitFor(() => isFavorited(achaBotao()) === true, 4000);
    if (!ok) return manual('Não consegui ver se o coração está cheio — favorite à mão e clique em Continuar');
    await sendResult(item.id, 'favoritado', name);
  }

  // Cola o ID na busca, dá Enter e espera virar a página de um produto NOVO.
  async function pasteAndSearch(input) {
    if (ocupado) return;
    ocupado = true;
    try {
      const item = await send({ type: 'hand:next' });
      if (!item) return;
      // Anota onde a busca começou ANTES do Enter: a página do produto anterior não vale como resultado.
      const start = { id: item.id, startUrl: location.href, startTitle: document.title };
      try { sessionStorage.setItem(PENDING_KEY, makePending(item.id, start.startUrl, start.startTitle)); } catch (_) { /* ignora */ }
      SLA.dom.typeInto(input, item.id);
      SLA.dom.pressKey(input, 'Enter');
      await SLA.dom.waitFor(
        () => pulados.has(item.id) || shouldFinish({ startUrl: start.startUrl, currentUrl: location.href }) || captchaVisible(),
        SEARCH_TIMEOUT
      );
      if (pulados.has(item.id)) return;
      const d = decideAfterWait({ start, currentUrl: location.href, captcha: captchaVisible() });
      if (d === 'finish') await finishProduct(item, start);
      else {
        clearPending();
        await sendResult(item.id, d);
      }
    } finally {
      ocupado = false;
    }
  }

  function onDocumentClick(event) {
    const t = event.target;
    const input = t && t.closest ? t.closest(SLA.selectors.shopeeSearchInput) : null;
    if (!input) return;
    refresh(input);
  }

  async function refresh(clickedInput) {
    const batch = await send({ type: 'batch:get' });
    if (!batch || batch.phase !== 'resolving') return hideNotice();
    const item = await send({ type: 'hand:next' });
    if (!item) return hideNotice();
    const parado = batch.paused && !liberado;
    showNotice(noticeText(item, parado), {
      onContinue: parado
        ? () => {
            liberado = true;
            refresh();
          }
        : null,
      onSkip: () => pular(item.id),
    });
    if (clickedInput && !parado) await pasteAndSearch(clickedInput);
  }

  async function init() {
    document.addEventListener('click', onDocumentClick, true);
    const batch = await send({ type: 'batch:get' });
    if (!batch || batch.phase !== 'resolving') return;
    const item = await send({ type: 'hand:next' });
    const pending = readPending();
    const d = decideOnLoad({ paused: batch.paused, itemId: item && item.id, pending, currentUrl: location.href });
    // Voltou do redirecionamento depois de colar este ID, num produto novo: termina o fluxo.
    if (d === 'finish') {
      await finishProduct(item, pending);
      return;
    }
    // Havia busca deste ID, mas a página não é de um produto novo (ex.: a busca recarregou a página
    // em /search, ou recarregou o produto anterior): espera um pouco; sem produto novo nem
    // verificação, vira "não achei" (assim o mesmo ID não é colado de novo para sempre).
    if (d === 'check') {
      ocupado = true;
      try {
        await SLA.dom.waitFor(
          () => pulados.has(item.id) || shouldFinish({ startUrl: pending.startUrl, currentUrl: location.href }) || captchaVisible(),
          LOAD_CHECK_TIMEOUT
        );
        if (pulados.has(item.id)) return;
        const r = decideAfterWait({ start: pending, currentUrl: location.href, captcha: captchaVisible() });
        if (r === 'finish') {
          await finishProduct(item, pending);
          return;
        }
        clearPending();
        await sendResult(item.id, r);
      } finally {
        ocupado = false;
      }
      return;
    }
    await refresh();
  }

  SLA.hand = {
    isProductUrl,
    isFavorited,
    cleanProductName,
    productIdFromUrl,
    shouldFinish,
    decideAfterWait,
    nameFromTitles,
    canClickHeart,
    makePending,
    parsePending,
    decideOnLoad,
    noticeText,
    keepsTab,
    init,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.hand;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    init().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
