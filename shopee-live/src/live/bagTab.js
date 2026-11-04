// Área "Sacola" do painel: grade de fotos numeradas, com busca, contador, modo e atualização automática.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const POLL_MS = 20000;
  const MAX_FALHAS = 3;
  const FRESCO_MS = 5000;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  const ERROS = { rede: 'sem conexão', http: 'a Shopee respondeu com erro', formato: 'resposta inesperada' };

  function initialState() {
    return { status: 'idle', itens: [], total: 0, maxItems: 0, query: '', desatualizada: false, erro: '', falhas: 0, modo: 'mostrar', noAr: null, trocando: false, aviso: '' };
  }

  function shouldPoll(s) {
    return !!s.ativa && !s.escondida && s.falhas < MAX_FALHAS;
  }

  // Texto do erro; "rede" e "http" mostram o detalhe (mensagem ou número do erro) quando houver.
  function erroTexto(reason, detail) {
    const base = ERROS[reason] || ERROS.formato;
    if (!detail || (reason !== 'http' && reason !== 'rede')) return base;
    return `${base} (${detail})`;
  }

  function nextState(prev, r) {
    if (r && r.ok) {
      return { ...prev, status: 'ok', itens: r.items, total: r.total, maxItems: r.maxItems, desatualizada: false, erro: '', falhas: 0 };
    }
    const reason = r && r.reason;
    return { ...prev, status: 'erro', desatualizada: true, erro: erroTexto(reason, r && r.detail), falhas: (prev.falhas || 0) + 1 };
  }

  // Sessão sem "?session=" na URL: mensagem própria, sem lista e sem contar como falha de leitura.
  function noSessionState(prev) {
    return { ...prev, status: 'sem_sessao', itens: [], total: 0, maxItems: 0, desatualizada: false, erro: '' };
  }

  // Outra live na URL: some a lista da anterior antes de ler (falhas e busca continuam).
  function clearForNewSession(prev) {
    return { ...prev, status: 'carregando', itens: [], total: 0, maxItems: 0, desatualizada: false, erro: '' };
  }

  // Lê a sessão da URL a cada leitura. "limpar": a lista na tela é de outra sessão.
  function sessionStep(href, idDaLista) {
    const sessionId = SLA.bag.sessionIdFromHref(href);
    return { sessionId, limpar: !!sessionId && !!idDaLista && sessionId !== idDaLista };
  }

  // Fotos que falharam: não são pedidas de novo nos próximos desenhos.
  const fotosQueFalharam = new Set();
  function markImageFailed(code) {
    if (code) fotosQueFalharam.add(String(code));
  }
  function failedImages() {
    return [...fotosQueFalharam];
  }

  function tileHtml(c, comErro, m) {
    const desligado = c.outOfStock || c.removed;
    const cls = ['tile'];
    if (m.noAr != null && c.itemId != null && String(c.itemId) === String(m.noAr)) cls.push('noar');
    if (desligado) cls.push('apagado');
    if (m.trocando) cls.push('trocando');
    // Sem onerror embutido (a página pode bloquear): o painel esconde a foto que falhar.
    const foto = c.image && !comErro.has(c.image)
      ? `<img src="${esc(SLA.bag.imageUrl(c.image))}" alt="" crossorigin="anonymous" data-img="${esc(c.image)}">`
      : '';
    const off = desligado || m.trocando ? ' disabled' : '';
    return `<button class="${cls.join(' ')}" data-act="bag-tile" data-n="${esc(c.n)}" title="${esc(c.name)} — ${esc(c.price)}${c.priceBefore ? ` (antes ${esc(c.priceBefore)})` : ''}"${off}>${foto}<span class="tn">${esc(c.n)}</span></button>`;
  }

  function renderBagTab(m) {
    // Sem lista e com erro (ou sem sessão), o contador "0" e o "desatualizada" só confundem.
    const soMensagem = !m.itens.length && (m.status === 'erro' || m.status === 'sem_sessao');
    const contador = m.maxItems ? `${m.total} de ${m.maxItems}` : `${m.total}`;
    let h = `<div class="row">${soMensagem ? '' : `<b>${esc(contador)}</b>`}<button data-act="bag-refresh">Atualizar</button></div>`;
    const modo = m.modo || 'mostrar';
    h += `<input class="busca" data-act="bag-q" data-focus-key="bag-q" placeholder="Buscar por nome ou número" value="${esc(m.query || '')}">`;
    h += `<div class="modos"><button${modo === 'mostrar' ? ' class="on"' : ''} data-act="bag-modo" data-modo="mostrar">Mostrar</button><button data-act="bag-modo" data-modo="mover" disabled title="em breve">Mover</button></div>`;
    if (m.aviso) h += `<p class="warn">${esc(m.aviso)}</p>`;
    if (m.status === 'sem_sessao') return h + '<p class="warn">Abra a página da live (sem sessão na URL).</p>';
    if (m.desatualizada && !soMensagem) h += '<p class="warn">Lista desatualizada</p>';
    if (m.status === 'erro') h += `<p class="warn">Não consegui ler a sacola (${esc(m.erro)}).</p>`;
    if (m.status === 'carregando' && !m.itens.length) return h + '<p class="mut">Lendo a sacola…</p>';
    if (m.status === 'idle') return h;
    if (!m.itens.length) {
      return m.status === 'erro' ? h : h + '<p class="mut">Sacola vazia.</p>';
    }
    const lista = SLA.bag.filterBag(m.itens, m.query);
    if (!lista.length) return h + '<p class="mut">Nenhum produto encontrado.</p>';
    const comErro = new Set(m.fotosComErro || []);
    return h + `<div class="grade">${lista.map((c) => tileHtml(c, comErro, m)).join('')}</div>`;
  }

  // ---- efeitos (sem teste automático) ----
  function init() {
    // A aba aparece sempre na página da live; a sessão é lida da URL a cada leitura
    // (a página pode trocar de live sem recarregar).
    if (!/^\/pc\/live/.test(location.pathname)) return;
    if (!SLA.panel || typeof SLA.panel.registerArea !== 'function') return;
    let state = initialState();
    let timer = null;
    let lendo = false;
    let ultimaLeitura = 0;
    let idDaLista = null; // sessão da lista que está na tela

    async function ler() {
      if (lendo) return;
      const passo = sessionStep(location.href, idDaLista);
      if (!passo.sessionId) { // sem sessão: só a mensagem, sem chamada à Shopee
        state = noSessionState(state);
        idDaLista = null;
        try { SLA.panel.redraw(); } catch (e) { /* painel fora do ar */ }
        return;
      }
      if (passo.limpar) { state = clearForNewSession(state); idDaLista = null; SLA.panel.redraw(); }
      lendo = true;
      if (state.status === 'idle' || state.status === 'sem_sessao') { state = { ...state, status: 'carregando' }; SLA.panel.redraw(); }
      let descartada = false;
      try {
        const r = await SLA.bag.readBag(passo.sessionId);
        if (SLA.bag.sessionIdFromHref(location.href) !== passo.sessionId) {
          descartada = true; // a URL mudou de live durante a leitura: o resultado não vale mais
        } else {
          state = nextState(state, r);
          if (r && r.ok) idDaLista = passo.sessionId;
          ultimaLeitura = Date.now();
        }
      } catch (e) {
        state = nextState(state, { ok: false, reason: 'formato' });
      } finally {
        lendo = false;
      }
      if (descartada) return ler(); // lê de novo já com a sessão nova (limpa a lista antiga)
      try { SLA.panel.redraw(); } catch (e) { /* painel fora do ar */ }
    }

    function parar() { if (timer) { clearInterval(timer); timer = null; } }

    function render() { return renderBagTab({ ...state, fotosComErro: fotosQueFalharam }); }

    SLA.panel.registerArea('sacola', render, {
      actions: {
        'bag-q': (el) => { state = { ...state, query: el.value }; SLA.panel.redraw(); },
        'bag-tile': () => {}, // a Task 8 liga o Mostrar
        'bag-modo': () => {}, // só "mostrar" existe por enquanto
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
          if (shouldPoll({ ativa: SLA.panel.isAreaVisible('sacola'), escondida: document.hidden, falhas: state.falhas })) ler();
        }, POLL_MS);
      },
    });
  }

  SLA.bagTab = {
    POLL_MS, MAX_FALHAS, FRESCO_MS, initialState, renderBagTab, shouldPoll, nextState,
    noSessionState, clearForNewSession, sessionStep, markImageFailed, failedImages, init,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.bagTab;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    try { init(); } catch (e) { /* aba é opcional */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
