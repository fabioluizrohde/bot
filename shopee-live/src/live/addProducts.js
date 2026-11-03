// Marca na live (modal "Adicionar produtos relacionados" > "Meus Favoritos") os produtos do lote.
// NUNCA clica em "Confirmar" nem "Cancelar": só nas caixinhas dos cards; quem confirma é o Fabio.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  // ---------- Funções puras (testadas) ----------

  // cards: [{name, checked, ...}]. Devolve {status, card}: ambíguo ou nenhum -> 'conferir'.
  function decide(pageName, cards, nameMatches) {
    const match = nameMatches || (SLA.match && SLA.match.nameMatches);
    const achados = (cards || []).filter((c) => match(pageName, c.name));
    if (achados.length !== 1) return { status: 'conferir', card: null };
    const card = achados[0];
    return { status: card.checked ? 'ja_na_sacola' : 'marcado', card };
  }

  // O texto do botão clicado é exatamente o do "Confirmar"?
  function isConfirmText(txt, confirmText) {
    return String(txt == null ? '' : txt).trim().toLowerCase() === String(confirmText).trim().toLowerCase();
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  const D = () => SLA.dom;
  const S = () => SLA.selectors;

  function openModals() {
    return [...document.querySelectorAll(S().modalRoot)].filter((m) => D().visible(m));
  }

  function modalWith(label) {
    return openModals().find((m) => D().findClickableByText(m, label)) || null;
  }

  function isDisabled(el) {
    return !!(el && el.closest('[disabled], [aria-disabled="true"], [class*="disabled"]'));
  }

  // Cards da grade: sobe de cada checkbox até o maior ancestral que só tem esse checkbox.
  function collectCards(modal) {
    if (!modal) return [];
    const s = S();
    const out = [];
    for (const cb of modal.querySelectorAll(s.gridCheckbox)) {
      let el = cb;
      while (el.parentElement && el.parentElement !== modal && el.parentElement.querySelectorAll(s.gridCheckbox).length === 1) {
        el = el.parentElement;
      }
      const nomes = [...el.querySelectorAll(s.gridCardName)].map((n) => D().text(n)).filter(Boolean);
      if (!nomes.length) continue;
      out.push({ name: nomes[0], checkbox: cb, el, get checked() { return !!cb.checked; } });
    }
    return out;
  }

  // Abre Produtos > Lista de produtos > Adicionar produtos relacionados > Meus Favoritos.
  // Reconhece passos já abertos (o popover Produtos alterna a cada clique).
  async function openFavorites() {
    const d = D();
    const s = S();
    const fav = () => modalWith(s.favoritesTabText);
    const related = () => modalWith(s.addRelatedText);

    if (!fav()) {
      if (!related()) {
        const listBtn = () => d.findClickableByText(document, s.listButtonText);
        if (!listBtn()) {
          const tile = d.findClickableByText(document, s.toolsProducts);
          if (!tile) throw new Error('Não consegui abrir Produtos: bloco não encontrado na página');
          if (isDisabled(tile)) throw new Error('A live parece encerrada (o bloco Produtos está desativado)');
          d.realClick(tile);
        }
        const lb = await d.waitFor(listBtn, 6000);
        if (!lb) throw new Error('Não consegui abrir a Lista de produtos');
        d.realClick(lb);
        if (!(await d.waitFor(related, 6000))) throw new Error('Não consegui abrir a lista de produtos da live');
      }
      const addBtn = d.findClickableByText(related(), s.addRelatedText);
      if (!addBtn) throw new Error('Não consegui abrir "' + s.addRelatedText + '"');
      d.realClick(addBtn);
      if (!(await d.waitFor(fav, 8000))) throw new Error('Não consegui abrir "' + s.addRelatedText + '"');
    }
    const tab = d.findClickableByText(fav(), s.favoritesTabText);
    if (tab) d.realClick(tab);
    const ok = await d.waitFor(() => collectCards(fav()).length > 0, 8000);
    if (!ok) throw new Error('Não consegui abrir a aba "' + s.favoritesTabText + '"');
    return fav();
  }

  function findScroller(modal) {
    const cb = modal.querySelector(S().gridCheckbox);
    for (let el = cb && cb.parentElement; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    }
    return modal;
  }

  async function markFavorites(items) {
    const d = D();
    const modal = await openFavorites();
    const scroller = findScroller(modal);

    // Uma passada pela grade inteira, juntando os cards (sem repetir).
    scroller.scrollTop = 0;
    const vistos = new Set();
    const todos = [];
    const coleta = () => {
      for (const c of collectCards(modal)) {
        if (!vistos.has(c.checkbox)) { vistos.add(c.checkbox); todos.push(c); }
      }
      return false; // continua rolando até o fim
    };
    coleta();
    await d.scrollUntil(scroller, coleta);
    coleta();

    const results = [];
    for (const it of items) {
      const { status, card } = decide(it.name, todos);
      if (status !== 'marcado') { results.push({ id: it.id, status }); continue; }
      let cb = card.checkbox;
      if (!cb.isConnected) { // lista virtual reciclou o card: acha de novo pelo nome
        scroller.scrollTop = 0;
        const achado = () => collectCards(modal).find((c) => c.name === card.name);
        if (!(await d.scrollUntil(scroller, () => !!achado()))) { results.push({ id: it.id, status: 'conferir' }); continue; }
        cb = achado().checkbox;
        if (cb.checked) { results.push({ id: it.id, status: 'ja_na_sacola' }); continue; }
      }
      d.realClick(cb);
      await d.sleep(200);
      if (!cb.checked) { // às vezes só o rótulo/contêiner responde
        const alvo = cb.closest('label') || cb.parentElement;
        if (alvo) d.realClick(alvo);
        await d.sleep(200);
      }
      results.push({ id: it.id, status: cb.checked ? 'marcado' : 'conferir' });
    }
    return results;
  }

  // Só ESCUTA o clique do usuário no "Confirmar" do modal (nunca clica). Devolve a função de cancelar.
  // Cancela sozinho quando o modal fecha.
  function watchConfirm(onConfirm) {
    const s = S();
    let ativo = true;
    let timer = null;
    function parar() {
      if (!ativo) return;
      ativo = false;
      document.removeEventListener('click', onClick, true);
      if (timer) clearInterval(timer);
    }
    function onClick(e) {
      const t = e.target;
      if (!t || typeof t.closest !== 'function' || !t.closest(s.modalRoot)) return;
      const btn = t.closest(SLA.dom.CLICKABLE) || t;
      if (!isConfirmText(SLA.dom.text(btn), s.confirmText)) return;
      try { onConfirm(); } catch (_) { /* ignora */ }
    }
    document.addEventListener('click', onClick, true);
    timer = setInterval(() => { if (!openModals().length) parar(); }, 500);
    return parar;
  }

  SLA.addProducts = { decide, isConfirmText, markFavorites, watchConfirm };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.addProducts;
})(typeof window !== 'undefined' ? window : globalThis);
