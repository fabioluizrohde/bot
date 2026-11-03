// Aba "Sacola" do painel: lista só de leitura, com busca, contador e atualização automática.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const POLL_MS = 20000;
  const MAX_FALHAS = 3;
  const FRESCO_MS = 5000;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  const ERROS = { rede: 'sem conexão', http: 'a Shopee respondeu com erro', formato: 'resposta inesperada' };

  function initialState() {
    return { status: 'idle', itens: [], total: 0, maxItems: 0, query: '', desatualizada: false, erro: '', falhas: 0 };
  }

  function shouldPoll(s) {
    return !!s.ativa && !s.escondida && s.falhas < MAX_FALHAS;
  }

  function nextState(prev, r) {
    if (r && r.ok) {
      return { ...prev, status: 'ok', itens: r.items, total: r.total, maxItems: r.maxItems, desatualizada: false, erro: '', falhas: 0 };
    }
    const reason = r && r.reason;
    return { ...prev, status: 'erro', desatualizada: true, erro: ERROS[reason] || ERROS.formato, falhas: (prev.falhas || 0) + 1 };
  }

  function cardHtml(c) {
    const apagado = c.outOfStock || c.removed ? ' apagado' : '';
    const foto = c.image
      ? `<img src="${esc(SLA.bag.imageUrl(c.image))}" alt="" onerror="this.style.display='none'">`
      : '';
    const antes = c.priceBefore ? ` <s>${esc(c.priceBefore)}</s>` : '';
    const aviso = c.removed ? ' <span class="mut">(removido)</span>' : c.outOfStock ? ' <span class="mut">(esgotado)</span>' : '';
    return `<div class="cartao${apagado}"><span class="num">${esc(c.n)}</span>${foto}<div class="info"><div class="nome">${esc(c.name)}${aviso}</div><div class="preco">${esc(c.price)}${antes}</div></div></div>`;
  }

  function renderBagTab(m) {
    const contador = m.maxItems ? `${m.total} de ${m.maxItems}` : `${m.total}`;
    let h = `<div class="row"><b>${esc(contador)}</b><button data-act="bag-refresh">Atualizar</button></div>`;
    h += `<input class="busca" data-act="bag-q" data-focus-key="bag-q" placeholder="Buscar por nome ou número" value="${esc(m.query || '')}">`;
    if (m.desatualizada) h += '<p class="warn">Lista desatualizada</p>';
    if (m.status === 'erro') h += `<p class="warn">Não consegui ler a sacola (${esc(m.erro)}).</p>`;
    if (m.status === 'carregando' && !m.itens.length) return h + '<p class="mut">Lendo a sacola…</p>';
    if (m.status === 'idle') return h;
    if (!m.itens.length) {
      return m.status === 'erro' ? h : h + '<p class="mut">Sacola vazia.</p>';
    }
    const lista = SLA.bag.filterBag(m.itens, m.query);
    if (!lista.length) return h + '<p class="mut">Nenhum produto encontrado.</p>';
    return h + lista.map(cardHtml).join('');
  }

  // ---- efeitos (sem teste automático) ----
  function init() {
    if (!/^\/pc\/live/.test(location.pathname)) return;
    const sessionId = SLA.bag.sessionIdFromHref(location.href);
    if (!sessionId || !SLA.panel) return;
    let state = initialState();
    let timer = null;
    let lendo = false;
    let ultimaLeitura = 0;

    async function ler() {
      if (lendo) return;
      lendo = true;
      if (state.status === 'idle') { state = { ...state, status: 'carregando' }; SLA.panel.redraw(); }
      try {
        const r = await SLA.bag.readBag(sessionId);
        state = nextState(state, r);
        ultimaLeitura = Date.now();
      } catch (e) {
        state = nextState(state, { ok: false, reason: 'formato' });
      } finally {
        lendo = false;
      }
      try { SLA.panel.redraw(); } catch (e) { /* painel fora do ar */ }
    }

    function parar() { if (timer) { clearInterval(timer); timer = null; } }

    function render() { return renderBagTab(state); }

    SLA.panel.registerTab('sacola', 'Sacola', render, {
      actions: {
        'bag-q': (el) => { state = { ...state, query: el.value }; SLA.panel.redraw(); },
        'bag-refresh': (el, ev) => {
          if (ev && ev.type && ev.type !== 'click') return;
          state = { ...state, falhas: 0 };
          ler();
        },
      },
      onActive: (ativa) => {
        parar();
        if (!ativa) return;
        if (Date.now() - ultimaLeitura > FRESCO_MS) ler();
        timer = setInterval(() => {
          if (shouldPoll({ ativa: SLA.panel.isTabActive('sacola'), escondida: document.hidden, falhas: state.falhas })) ler();
        }, POLL_MS);
      },
    });
  }

  SLA.bagTab = { POLL_MS, MAX_FALHAS, FRESCO_MS, initialState, renderBagTab, shouldPoll, nextState, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.bagTab;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    try { init(); } catch (e) { /* aba é opcional */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
