// Área "Sacola" do painel: grade de fotos numeradas, com busca, contador, modo e atualização automática.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const POLL_MS = 20000;
  const MAX_FALHAS = 3;
  const FRESCO_MS = 5000;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  const ERROS = { rede: 'sem conexão', http: 'a Shopee respondeu com erro', formato: 'resposta inesperada' };

  const AVISO_DESLIGADO = 'O Mostrar foi desligado nesta live após 2 erros. Use a tela da Shopee.';

  // Aviso quando a Shopee não trocou o produto: "(motivo: detalhe)" ou só "(motivo)".
  const CONFIRMA_MS = 4000;
  const AVISO_RM_DESLIGADO = 'O Remover foi desligado nesta live após 2 erros. Use a tela da Shopee.';
  const AVISO_PIN_DESLIGADO = 'O Mover p/ cima foi desligado nesta live após 2 erros. Use a tela da Shopee.';

  function avisoDeErro(r) {
    const motivo = (r && r.reason) || 'erro';
    const detalhe = r && r.detail;
    return `Não consegui trocar o produto (${motivo}${detalhe ? `: ${detalhe}` : ''}).`;
  }

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

  // O que é da live anterior e não pode passar para outra: "No ar", "trocando" e avisos de erro.
  // Fica só o aviso de Mostrar desligado (a trava vale até recarregar a página, não por live).
  function semRestosDaLive(prev) {
    const fica = prev && (prev.aviso === AVISO_DESLIGADO || prev.aviso === AVISO_PIN_DESLIGADO || prev.aviso === AVISO_RM_DESLIGADO) ? prev.aviso : '';
    return { noAr: null, trocando: false, fixando: false, confirmando: null, aviso: fica };
  }

  // Sessão sem "?session=" na URL: mensagem própria, sem lista e sem contar como falha de leitura.
  function noSessionState(prev) {
    return { ...prev, status: 'sem_sessao', itens: [], total: 0, maxItems: 0, desatualizada: false, erro: '', ...semRestosDaLive(prev) };
  }

  // Outra live na URL: some a lista da anterior antes de ler (falhas e busca continuam).
  function clearForNewSession(prev) {
    return { ...prev, status: 'carregando', itens: [], total: 0, maxItems: 0, desatualizada: false, erro: '', ...semRestosDaLive(prev) };
  }

  // Produto do tile clicado, pelo itemId (data-item) comparado como texto; nunca pelo número do tile.
  // Sem valor, ou sem produto com esse itemId: null (o clique não faz nada).
  function cardByItemId(itens, valor) {
    if (valor == null || valor === '' || !Array.isArray(itens)) return null;
    const v = String(valor);
    return itens.find((c) => c && c.itemId != null && String(c.itemId) === v) || null;
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
    const semEstoque = c.outOfStock || c.removed;
    const cls = ['tile'];
    if (m.noAr != null && c.itemId != null && String(c.itemId) === String(m.noAr)) cls.push('noar');
    if (semEstoque) cls.push('apagado');
    if (m.trocando) cls.push('trocando');
    if (m.desligado) cls.push('desligado'); // Mostrar desligado nesta live após 2 erros
    const protegido = SLA.protect ? SLA.protect.isProtected(m.protegidos, c.itemId) : false;
    const modoProteger = m.modo === 'proteger';
    const naPrevia = !!(m.limpar && Array.isArray(m.limpar.ids) && c.itemId != null && m.limpar.ids.some((id) => String(id) === String(c.itemId)));
    if (naPrevia) cls.push('previa');
    // Sem onerror embutido (a página pode bloquear): o painel esconde a foto que falhar.
    const foto = c.image && !comErro.has(c.image)
      ? `<img src="${esc(SLA.bag.imageUrl(c.image))}" alt="" crossorigin="anonymous" data-img="${esc(c.image)}">`
      : '';
    // Esgotado/removido NÃO usa disabled (ele bloquearia o clique no ✕ de remover): usa aria-disabled, e o Mostrar já ignora.
    const off = m.trocando || m.desligado ? ' disabled' : (semEstoque ? ' aria-disabled="true"' : '');
    const item = c.itemId == null ? '' : esc(c.itemId);
    const noAr = cls.includes('noar');
    // Etiqueta embaixo da foto: no produto "No ar" mostra "No ar"; ao passar o mouse (e nos outros produtos,
    // só no hover) vira "Mover p/ cima" (clicável). Sem o botão enquanto há pedido em andamento ou produto esgotado.
    const podeMover = !modoProteger && !semEstoque && !m.fixando && !m.trocando && !m.desligado && !m.pinDesligado;
    // ✕ de remover (canto superior direito): nunca no produto No ar; pede confirmação no próprio card.
    const livre = !m.fixando && !m.trocando && !m.desligado && !m.pinDesligado;
    // Protegido não tem ✕ (precisa desproteger antes); no modo Proteger também não há ✕.
    const podeRemover = livre && !noAr && !m.rmDesligado && !protegido && !modoProteger; // esgotado e removido também podem sair
    const confirmando = podeRemover && m.confirmando != null && String(m.confirmando) === String(c.itemId);
    const botaoRm = podeRemover
      ? (confirmando
        ? `<span class="rm sim" data-act="bag-rm" data-item="${item}">Remover?</span>`
        : `<span class="rm" data-act="bag-rm" data-item="${item}" title="Remover da sacola">✕</span>`)
      : '';
    let etiqueta = '';
    if (podeMover) {
      etiqueta = `<span class="tag${noAr ? '' : ' off'}" data-act="bag-pin" data-item="${item}"><span class="t1">${noAr ? 'No ar' : ''}</span><span class="t2">Mover p/ cima</span></span>`;
    } else if (noAr) {
      etiqueta = '<span class="tag"><span class="t1">No ar</span></span>';
    }
    const titulo = `${esc(c.name)} — ${esc(c.price)}${c.priceBefore ? ` (antes ${esc(c.priceBefore)})` : ''}${m.desligado ? ' · Mostrar desligado nesta live' : ''}`;
    const cadeado = protegido ? '<span class="lock" title="Protegido">🔒</span>' : '';
    const acao = modoProteger ? 'bag-protect' : 'bag-tile';
    return `<button class="${cls.join(' ')}" data-act="${acao}" data-n="${esc(c.n)}" data-item="${item}" title="${titulo}"${off}>${foto}<span class="tn">${esc(c.n)}</span>${cadeado}${etiqueta}${botaoRm}</button>`;
  }

  // Botão Limpar (remover em lote), opções 5/10/15/20 e prévia com Confirmar/Cancelar.
  function limparHtml(m) {
    if (m.fixando || m.trocando || m.desligado || m.rmDesligado) return '';
    const l = m.limpar;
    if (!l || !l.aberto) return '<div class="limpar"><button data-act="bag-limpar">Limpar</button></div>';
    const limites = (SLA.protect && SLA.protect.LIMITES) || [5, 10, 15, 20];
    let h = '<div class="limpar"><b>Remover os últimos:</b> ';
    h += limites.map((n) => `<button${l.n === n ? ' class="on"' : ''} data-act="bag-limpar-n" data-n="${n}">${n}</button>`).join('');
    h += ' <button data-act="bag-limpar-cancel">Cancelar</button>';
    if (l.n) {
      const k = (l.ids || []).length;
      if (!k) {
        h += '<p class="warn">Nenhum produto pode ser removido (os protegidos e o que está No ar ficam).</p>';
      } else {
        h += `<p class="warn">${k} ${k === 1 ? 'produto será removido' : 'produtos serão removidos'} (destacados em vermelho abaixo).</p>`;
        if (l.faltam > 0) h += `<p class="mut">Só há ${k} ${k === 1 ? 'produto que pode' : 'produtos que podem'} ser removido${k === 1 ? '' : 's'}.</p>`;
        h += `<button class="pri" data-act="bag-limpar-ok">Confirmar remoção de ${k}</button>`;
      }
    }
    return h + '</div>';
  }

  function renderBagTab(m) {
    // Sem lista e com erro (ou sem sessão), o contador "0" e o "desatualizada" só confundem.
    const soMensagem = !m.itens.length && (m.status === 'erro' || m.status === 'sem_sessao');
    const contador = m.maxItems ? `${m.total} de ${m.maxItems}` : `${m.total}`;
    let h = `<div class="row">${soMensagem ? '' : `<b>${esc(contador)}</b>`}<button data-act="bag-refresh">Atualizar</button></div>`;
    const modo = m.modo || 'mostrar';
    h += `<input class="busca" data-act="bag-q" data-focus-key="bag-q" placeholder="Buscar por nome ou número" value="${esc(m.query || '')}">`;
    h += `<div class="modos"><button${modo === 'mostrar' ? ' class="on"' : ''} data-act="bag-modo" data-modo="mostrar">Mostrar</button><button${modo === 'proteger' ? ' class="on"' : ''} data-act="bag-modo" data-modo="proteger">Proteger</button></div>`;
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
    h += limparHtml(m);
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
    // Travas do Mostrar: valem só enquanto a página não recarrega (recarregar religa o Mostrar).
    let guarda = SLA.showGuard ? SLA.showGuard.initialGuard() : null; // sem o módulo, o Mostrar fica inativo
    let guardaPin = SLA.showGuard ? SLA.showGuard.initialGuard() : null; // mesmas travas para o Mover p/ cima
    let guardaRm = SLA.showGuard ? SLA.showGuard.initialGuard() : null; // e para o Remover

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

    SLA.bagTab.refresh = () => { state = { ...state, falhas: 0 }; return ler(); }; // lê agora (ex.: depois de adicionar)

    function parar() { if (timer) { clearInterval(timer); timer = null; } }

    function render() { return renderBagTab({ ...state, fotosComErro: fotosQueFalharam, desligado: !!(guarda && guarda.desligado), pinDesligado: !!(guardaPin && guardaPin.desligado), rmDesligado: !!(guardaRm && guardaRm.desligado) }); }

    function redesenhar() { try { SLA.panel.redraw(); } catch (e) { /* painel fora do ar */ } }

    // Modo Mostrar: um clique real do usuário num produto = um pedido à Shopee, e nada mais.
    async function mostrar(el, ev) {
      // Clique simulado (ou sem evento): não faz nada, nem mensagem.
      if (!ev || ev.isTrusted !== true || ev.type !== 'click') return;
      if (!guarda || state.modo !== 'mostrar') return;
      const pode = SLA.showGuard.canShow(guarda, Date.now(), ev);
      if (!pode.ok) {
        if (pode.motivo === 'desligado') { state = { ...state, aviso: AVISO_DESLIGADO }; redesenhar(); }
        return; // 'em_andamento' e 'cedo': ignora em silêncio
      }
      // Acha o produto pelo itemId do tile (não pelo número): um tile velho na tela não troca o produto errado.
      const card = cardByItemId(state.itens, el && el.dataset ? el.dataset.item : undefined);
      if (!card || card.outOfStock || card.removed) return;
      const sessionId = SLA.bag.sessionIdFromHref(location.href);
      if (!sessionId || sessionId !== idDaLista) return; // a lista na tela é de outra live
      guarda = SLA.showGuard.startShow(guarda, Date.now());
      let reler = false;
      try {
        state = { ...state, trocando: true };
        redesenhar();
        const r = await SLA.bag.showItem(sessionId, card); // card.raw vai direto da memória
        guarda = SLA.showGuard.finishShow(guarda, { ok: !!(r && r.ok) });
        if (r && r.ok) {
          state = { ...state, noAr: card.itemId, aviso: '' };
          reler = true;
        } else {
          state = { ...state, aviso: guarda.desligado ? AVISO_DESLIGADO : avisoDeErro(r) }; // sem nova tentativa
        }
      } catch (e) {
        if (guarda.emAndamento) guarda = SLA.showGuard.finishShow(guarda, { ok: false });
        state = { ...state, aviso: guarda.desligado ? AVISO_DESLIGADO : avisoDeErro({ reason: 'erro', detail: String((e && e.message) || e) }) };
      } finally {
        state = { ...state, trocando: false };
        redesenhar();
      }
      if (reler) ler().catch(() => {});
    }

    // Mover p/ cima: um clique real na etiqueta do produto "No ar" = um pedido (fixar no topo), e nada mais.
    async function mover(el, ev) {
      if (!ev || ev.isTrusted !== true || ev.type !== 'click') return;
      if (!guardaPin) return;
      const pode = SLA.showGuard.canShow(guardaPin, Date.now(), ev);
      if (!pode.ok) {
        if (pode.motivo === 'desligado') { state = { ...state, aviso: AVISO_PIN_DESLIGADO }; redesenhar(); }
        return;
      }
      const card = cardByItemId(state.itens, el && el.dataset ? el.dataset.item : undefined);
      if (!card || card.outOfStock || card.removed) return;
      const sessionId = SLA.bag.sessionIdFromHref(location.href);
      if (!sessionId || sessionId !== idDaLista) return;
      guardaPin = SLA.showGuard.startShow(guardaPin, Date.now());
      let reler = false;
      try {
        state = { ...state, fixando: true };
        redesenhar();
        const r = await SLA.bag.pinItem(sessionId, { shopId: card.shopId, itemId: card.itemId });
        guardaPin = SLA.showGuard.finishShow(guardaPin, { ok: !!(r && r.ok) });
        if (r && r.ok) {
          state = { ...state, aviso: 'Pedido enviado: produto fixado no topo da lista.' };
          reler = true;
        } else {
          state = { ...state, aviso: guardaPin.desligado ? AVISO_PIN_DESLIGADO : `Não consegui mover o produto (${(r && r.reason) || 'erro'}${r && r.detail ? `: ${r.detail}` : ''}).` };
        }
      } catch (e) {
        if (guardaPin.emAndamento) guardaPin = SLA.showGuard.finishShow(guardaPin, { ok: false });
        state = { ...state, aviso: guardaPin.desligado ? AVISO_PIN_DESLIGADO : 'Não consegui mover o produto: ' + String((e && e.message) || e) };
      } finally {
        state = { ...state, fixando: false };
        redesenhar();
      }
      if (reler) ler().catch(() => {});
    }

    // Remover da sacola: 1º clique no ✕ pede confirmação no próprio card; o 2º (em até 4 s) envia o pedido.
    // Nunca remove o produto que está No ar. Um clique real = no máximo um pedido.
    let timerConfirma = null;
    function limparConfirmacao() { if (timerConfirma) { clearTimeout(timerConfirma); timerConfirma = null; } }
    async function remover(el, ev) {
      if (!ev || ev.isTrusted !== true || ev.type !== 'click') return;
      if (!guardaRm) return;
      const valor = el && el.dataset ? el.dataset.item : undefined;
      const card = cardByItemId(state.itens, valor);
      if (!card) return;
      if (state.noAr != null && String(card.itemId) === String(state.noAr)) return; // nunca o que está no ar
      if (state.confirmando == null || String(state.confirmando) !== String(card.itemId)) {
        limparConfirmacao();
        state = { ...state, confirmando: card.itemId };
        redesenhar();
        timerConfirma = setTimeout(() => { timerConfirma = null; state = { ...state, confirmando: null }; redesenhar(); }, CONFIRMA_MS);
        return;
      }
      limparConfirmacao();
      state = { ...state, confirmando: null };
      const pode = SLA.showGuard.canShow(guardaRm, Date.now(), ev);
      if (!pode.ok) {
        if (pode.motivo === 'desligado') state = { ...state, aviso: AVISO_RM_DESLIGADO };
        redesenhar();
        return;
      }
      const sessionId = SLA.bag.sessionIdFromHref(location.href);
      if (!sessionId || sessionId !== idDaLista) { redesenhar(); return; }
      guardaRm = SLA.showGuard.startShow(guardaRm, Date.now());
      let reler = false;
      try {
        state = { ...state, fixando: true };
        redesenhar();
        const r = await SLA.bag.removeItem(sessionId, card.itemId);
        guardaRm = SLA.showGuard.finishShow(guardaRm, { ok: !!(r && r.ok) });
        if (r && r.ok) {
          state = { ...state, aviso: 'Pedido enviado: produto removido da sacola.' };
          reler = true;
        } else {
          state = { ...state, aviso: guardaRm.desligado ? AVISO_RM_DESLIGADO : `Não consegui remover o produto (${(r && r.reason) || 'erro'}${r && r.detail ? `: ${r.detail}` : ''}).` };
        }
      } catch (e) {
        if (guardaRm.emAndamento) guardaRm = SLA.showGuard.finishShow(guardaRm, { ok: false });
        state = { ...state, aviso: guardaRm.desligado ? AVISO_RM_DESLIGADO : 'Não consegui remover o produto: ' + String((e && e.message) || e) };
      } finally {
        state = { ...state, fixando: false };
        redesenhar();
      }
      if (reler) ler().catch(() => {});
    }

    SLA.panel.registerArea('sacola', render, {
      actions: {
        'bag-q': (el) => { state = { ...state, query: el.value }; SLA.panel.redraw(); },
        'bag-tile': (el, ev) => mostrar(el, ev).catch(() => {}),
        'bag-pin': (el, ev) => mover(el, ev).catch(() => {}),
        'bag-rm': (el, ev) => remover(el, ev).catch(() => {}),
        'bag-modo': (el, ev) => {
          if (ev && ev.type && ev.type !== 'click') return;
          if (!el || el.disabled || el.dataset.modo !== 'mostrar') return; // só "mostrar" existe por enquanto
          state = { ...state, modo: 'mostrar' };
          redesenhar();
        },
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
    POLL_MS, MAX_FALHAS, FRESCO_MS, AVISO_DESLIGADO, AVISO_PIN_DESLIGADO, AVISO_RM_DESLIGADO, avisoDeErro, initialState, renderBagTab, shouldPoll, nextState,
    noSessionState, clearForNewSession, cardByItemId, sessionStep, markImageFailed, failedImages, init,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.bagTab;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    try { init(); } catch (e) { /* aba é opcional */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
