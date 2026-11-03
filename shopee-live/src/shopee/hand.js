// "Mão" da Shopee: roda em shopee.com.br (fora da live). Quando o Fabio clica na busca,
// cola o próximo ID do lote, aperta Enter e, na página do produto, favorita (só se ainda
// não estiver favoritado: o coração é um liga/desliga). Nunca clica em mais nada.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const PENDING_KEY = 'sla-hand-pending'; // sessionStorage: ID colado antes do redirecionamento
  const NOTICE_ID = 'sla-hand-notice';
  const SEARCH_TIMEOUT = 10000;

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

  // "el" é o botão de favoritar (ou um contêiner dele). Coração cheio = já favoritado.
  function isFavorited(el) {
    if (!el) return false;
    const sel = SLA.selectors.favoriteFilledMark;
    return !!((typeof el.matches === 'function' && el.matches(sel)) || el.querySelector(sel));
  }

  function cleanProductName(title) {
    return String(title || '').replace(/\s*\|\s*Shopee Brasil\s*$/i, '').trim();
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  let ocupado = false; // há uma colagem em andamento
  let liberado = false; // o Fabio apertou "Continuar"

  const send = (msg) => chrome.runtime.sendMessage(msg);

  function showNotice(text, withContinue, onContinue) {
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
    if (withContinue) {
      const b = document.createElement('button');
      b.textContent = 'Continuar';
      b.style.cssText = 'margin-left:10px;padding:2px 10px;cursor:pointer';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onContinue();
      });
      box.appendChild(b);
    }
  }

  function hideNotice() {
    const box = document.getElementById(NOTICE_ID);
    if (box) box.remove();
  }

  const captchaVisible = () => !!document.querySelector(SLA.selectors.captchaMarker);

  // Página do produto: lê o nome, favorita se preciso e responde.
  async function finishProduct(item) {
    const D = SLA.dom;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* ignora */ }
    const btn = await D.waitFor(
      () => D.findClickableByText(document, new RegExp('^\s*' + D.escapeRe(SLA.selectors.favoriteButton), 'i')),
      SEARCH_TIMEOUT
    );
    if (!btn) {
      await send({ type: 'hand:result', id: item.id, status: captchaVisible() ? 'captcha' : 'nao_achei' });
      return;
    }
    const name = cleanProductName(document.title);
    let status = 'ja_favoritado';
    if (!isFavorited(btn)) {
      D.realClick(btn); // é um liga/desliga: só clica quando NÃO está favoritado
      status = 'favoritado';
    }
    await send({ type: 'hand:result', id: item.id, status, name });
  }

  // Cola o ID na busca, dá Enter e espera virar página de produto.
  async function pasteAndSearch(input) {
    if (ocupado) return;
    ocupado = true;
    try {
      const item = await send({ type: 'hand:next' });
      if (!item) return;
      try { sessionStorage.setItem(PENDING_KEY, item.id); } catch (_) { /* ignora */ }
      SLA.dom.typeInto(input, item.id);
      SLA.dom.pressKey(input, 'Enter');
      const chegou = await SLA.dom.waitFor(() => isProductUrl(location.href) || captchaVisible(), SEARCH_TIMEOUT);
      if (chegou && isProductUrl(location.href)) await finishProduct(item);
      else await send({ type: 'hand:result', id: item.id, status: chegou ? 'captcha' : 'nao_achei' });
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
    showNotice(`ID ${item.index} de ${item.total}: clique na busca`, parado, () => {
      liberado = true;
      refresh();
    });
    if (clickedInput && !parado) await pasteAndSearch(clickedInput);
  }

  async function init() {
    document.addEventListener('click', onDocumentClick, true);
    const batch = await send({ type: 'batch:get' });
    if (!batch || batch.phase !== 'resolving') return;
    const item = await send({ type: 'hand:next' });
    let pendente = null;
    try { pendente = sessionStorage.getItem(PENDING_KEY); } catch (_) { /* ignora */ }
    // Voltou do redirecionamento depois de colar este ID: termina o fluxo.
    if (item && !batch.paused && isProductUrl(location.href) && pendente === item.id) {
      await finishProduct(item);
      return;
    }
    await refresh();
  }

  SLA.hand = { isProductUrl, isFavorited, cleanProductName, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.hand;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    init().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
