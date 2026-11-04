// Painel da live: roda em live.shopee.com.br/pc/live, em shadow DOM, arrastável.
// Captura IDs selecionados no chat, mostra o lote e conversa com o coordenador
// (batch:start / batch:get / batch:reopen / batch:clear / batch:setStatus).
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const HOST_ID = 'sla-live-host';
  const LABELS = {
    na_fila: 'na fila',
    favoritado: 'favoritado',
    ja_favoritado: 'já estava favoritado',
    adicionado: 'adicionado',
    ja_na_sacola: 'já estava na sacola',
    conferir: 'conferir à mão',
    nao_achei: 'não achei',
  };

  // ---------- Funções puras (testadas) ----------

  function statusLabel(status) {
    return LABELS[status] || String(status || '');
  }

  // Só monta na página da live.
  function shouldMount(loc) {
    return !!loc && loc.hostname === 'live.shopee.com.br' && String(loc.pathname || '').startsWith('/pc/live');
  }

  // O nó (texto ou elemento) está dentro do contêiner do chat? "prefix" é o prefixo de classe.
  function isInsideChat(node, prefix) {
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el || typeof el.closest !== 'function') return false;
    return !!el.closest(`[class*="${prefix}"]`);
  }

  // Tira da lista os IDs que já estão num lote EM ANDAMENTO (lote terminado não bloqueia nada).
  function filterOutBatch(ids, batch) {
    const ativo = batch && batch.items && batch.phase !== 'done';
    const noLote = new Set(ativo ? batch.items.map((i) => i.id) : []);
    return ids.filter((id) => !noLote.has(id));
  }

  // Junta o que foi selecionado à lista atual. Seleção sem IDs não apaga a lista anterior;
  // seleção com IDs substitui a lista (menos os que já estão no lote em andamento).
  function mergeIds(current, selectedText, batch, extract) {
    const ext = extract || (SLA.ids && SLA.ids.extractIds);
    const found = ext(selectedText);
    if (!found.length) return current.slice();
    return filterOutBatch(found, batch);
  }

  function removeId(list, id) {
    return list.filter((x) => x !== id);
  }

  // Quais botões aparecem para o estado atual. "watching" = itens marcados, esperando o Confirmar do Fabio.
  // A marcação é automática; "Marcar na live" só aparece para tentar de novo (ex.: o Fabio fechou a tela).
  function viewState(batch, idsCount, watching) {
    const phase = batch ? batch.phase : null;
    const marcaveis = batch && SLA.batch ? SLA.batch.resolvedItems(batch).length : 0;
    const adding = phase === 'adding' && marcaveis > 0;
    return {
      canProcess: idsCount > 0 && (!batch || phase === 'done'),
      showRetomar: phase === 'resolving', // sempre: o coordenador não percebe se a aba da Shopee foi fechada
      showMarcar: adding && !watching,
      showAguardando: adding && !!watching,
      showLimpar: !!batch,
    };
  }

  // Aceita lista [{id,status}] ou mapa {id: status}.
  function normalizeResults(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res.filter((r) => r && r.id && r.status).map((r) => ({ id: r.id, status: r.status }));
    return Object.keys(res).map((id) => ({ id, status: res[id] }));
  }

  // Separa o resultado da marcação: "marcado" não é status do lote (fica na memória até o Fabio
  // confirmar); os demais só passam se forem status válidos do lote. "jaMarcados": IDs que a
  // própria extensão marcou numa rodada anterior; se vierem marcados agora, continuam "marcado"
  // (não "já estava na sacola").
  function planMarkResults(res, jaMarcados) {
    const validos = new Set(Object.values(SLA.batch.STATUS));
    const antes = new Set(jaMarcados || []);
    const marcados = [];
    const updates = [];
    for (const r of normalizeResults(res)) {
      if (r.status === 'marcado' || (r.status === 'ja_na_sacola' && antes.has(r.id))) marcados.push(r.id);
      else if (validos.has(r.status)) updates.push({ id: r.id, status: r.status });
    }
    return { marcados, updates };
  }

  // Procura a ação (valor de data-act) nas abas extras. tabs: [{key, opts?: {actions?}}].
  function findExtraAction(tabs, act) {
    for (const t of tabs || []) {
      const actions = t && t.opts && t.opts.actions;
      if (actions && Object.prototype.hasOwnProperty.call(actions, act) && typeof actions[act] === 'function') return actions[act];
    }
    return null;
  }

  const FASES = { resolving: 'buscando…', adding: 'adicionando…', done: 'pronto' };
  const contaIds = (n) => `${n} ${n === 1 ? 'ID' : 'IDs'}`;

  // Resumo de uma linha do Lote recolhido: "Lote: vazio", "Lote: 3 IDs", "Lote: 3 IDs · adicionando…".
  // Lote em andamento manda; depois dele, os IDs selecionados; lote terminado sem IDs novos aparece como "pronto".
  function loteSummary(batch, ids) {
    const itens = batch && Array.isArray(batch.items) ? batch.items.length : 0;
    const sel = Array.isArray(ids) ? ids.length : 0;
    if (batch && batch.phase !== 'done' && itens) return `Lote: ${contaIds(itens)}${FASES[batch.phase] ? ' · ' + FASES[batch.phase] : ''}`;
    if (sel) return `Lote: ${contaIds(sel)}`;
    if (batch && itens) return `Lote: ${contaIds(itens)} · ${FASES.done}`;
    return 'Lote: vazio';
  }

  // O Lote precisa ficar aberto? Sim quando há aviso (ex.: "Clique no bloco Produtos", erro da
  // marcação) ou o lote está pausado: essas mensagens nunca podem ficar escondidas.
  function shouldExpandLote(aviso, batch) {
    return !!(aviso && String(aviso).trim()) || !!(batch && batch.paused);
  }

  // Decide se o Lote abre sozinho agora: só com aviso NOVO (texto diferente do último que já
  // abriu) ou pausa NOVA (passou a pausado). Assim, se o Fabio recolher com o mesmo aviso na
  // tela, o Lote fica recolhido. Aviso vazio zera a memória: o mesmo texto depois abre de novo.
  function nextLoteExpansion(prev, aviso, batch) {
    const p = prev || {};
    const a = aviso && String(aviso).trim() ? String(aviso) : '';
    const pausa = !!(batch && batch.paused);
    const expandir = (a !== '' && a !== (p.ultimoAviso || '')) || (pausa && !p.ultimaPausa);
    return { expandir, ultimoAviso: a, ultimaPausa: pausa };
  }

  // Rolagem a devolver depois de redesenhar: no mesmo bloco, a de antes; ao trocar de conteúdo, o topo.
  function scrollToRestore(prevTab, curTab, savedTop) {
    return prevTab === curTab && Number.isFinite(savedTop) ? savedTop : 0;
  }

  // Devolve o foco ao campo sem rolar a lista, e recoloca o cursor onde estava.
  function refocus(el, selStart, selEnd) {
    if (!el || typeof el.focus !== 'function') return;
    el.focus({ preventScroll: true });
    if (selStart != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(selStart, selEnd);
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  // marcados: IDs que a extensão marcou e esperam o Confirmar; stopWatch: vigia do Confirmar ativa (ou null).
  // loteRecolhido: o Fabio recolheu o Lote (só o resumo aparece); menuAberto: menu do ⚙ aberto.
  const state = { ids: [], batch: null, openIn: 'tab', aviso: '', loteRecolhido: false, menuAberto: false, marcando: false, marcados: [], stopWatch: null };
  const areas = []; // {key, render, opts, ativada}: blocos abaixo do Lote (ex.: Sacola)
  const BUILTIN_ACTS = ['menu', 'toggle-lote', 'rm', 'openIn', 'start', 'reopen', 'clear', 'mark'];
  let shadow = null;
  let desenhado = false; // o painel já foi desenhado ao menos uma vez
  // O que .lote e .area mostravam no último draw(), para saber se a rolagem de cada um deve ser mantida.
  let loteDesenhado = null;
  let expansao = { ultimoAviso: '', ultimaPausa: false }; // último aviso/pausa que já abriu o Lote
  let areaDesenhada = null;

  const send = (msg) => chrome.runtime.sendMessage(msg);

  // opts.actions: {data-act: (el, ev) => void}; opts.onActive(true): avisado quando a área
  // passa a aparecer no painel (no primeiro desenho, ou na hora se o painel já está montado).
  function registerArea(key, render, opts) {
    const i = areas.findIndex((a) => a.key === key);
    const a = { key, render, opts: opts || {}, ativada: false };
    if (i >= 0) areas[i] = a;
    else areas.push(a);
    if (shadow) draw();
  }

  // Alias para o bagTab.js atual (o rótulo da aba não é mais usado).
  function registerTab(key, _label, render, opts) { registerArea(key, render, opts); }

  function redraw() { draw(); }

  function isAreaVisible(key) { return !!shadow && desenhado && areas.some((a) => a.key === key); }

  const isTabActive = isAreaVisible;

  // Avisa (uma vez) as áreas ainda não avisadas de que estão à vista, sem deixar um erro delas quebrar o painel.
  function notifyPendingActive() {
    for (const a of areas) {
      if (a.ativada) continue;
      a.ativada = true;
      if (typeof a.opts.onActive === 'function') {
        try { a.opts.onActive(true); } catch (e) { console.error(`[SLA] onActive da área "${a.key}" falhou`, e); }
      }
    }
  }

  // Chama a ação de uma área extra, se existir; erro dela é registrado no console e não quebra o painel.
  function runExtra(el, ev) {
    const act = el.dataset.act;
    const tab = areas.find((t) => findExtraAction([t], act));
    if (!tab) return false;
    const log = (e) => console.error(`[SLA] ação "${act}" da área "${tab.key}" falhou`, e);
    try {
      const r = tab.opts.actions[act](el, ev); // síncrona continua síncrona
      if (r && typeof r.then === 'function') r.then(null, log); // async que rejeita também é registrada
    } catch (e) { log(e); }
    return true;
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  // HTML do Lote aberto (função pura). s: {ids, batch, aviso, marcando, watching}.
  // A pausa e o aviso vêm PRIMEIRO: com muitos itens o Lote rola, e o pedido de clique em
  // "Produtos" ou o "confira e clique em Confirmar" não podem ficar escondidos lá embaixo.
  function loteHtml(s) {
    const ids = (s && s.ids) || [];
    const batch = (s && s.batch) || null;
    const v = viewState(batch, ids.length, !!(s && s.watching));
    let h = '';
    if (batch && batch.paused) h += '<p class="warn">Pausado (verificação da Shopee). Resolva na aba da Shopee e continue.</p>';
    if (s && s.aviso) h += `<p class="warn">${esc(s.aviso)}</p>`;
    h += '<h4>IDs encontrados no chat</h4>';
    if (ids.length) {
      h += '<ul>' + ids
        .map((id) => `<li><code>${esc(id)}</code><button class="x" data-act="rm" data-id="${esc(id)}" title="Remover">✕</button></li>`)
        .join('') + '</ul>';
    } else {
      h += '<p class="mut">Selecione mensagens do chat com o mouse para listar os IDs.</p>';
    }
    h += `<button class="pri" data-act="start" ${v.canProcess ? '' : 'disabled'}>Processar lote</button>`;
    if (batch) {
      h += '<h4>Lote</h4><ul>' + batch.items
        .map((i) => `<li><code>${esc(i.id)}</code> <span class="st">${esc(statusLabel(i.status))}</span>${i.name ? ` <span class="mut">${esc(i.name)}</span>` : ''}</li>`)
        .join('') + '</ul>';
    }
    h += '<div class="row">';
    if (v.showRetomar) h += '<button data-act="reopen">Retomar</button>';
    if (v.showMarcar) h += `<button class="pri" data-act="mark" ${s.marcando ? 'disabled' : ''}>Marcar na live</button>`;
    if (v.showAguardando) h += '<span class="mut">Aguardando seu Confirmar…</span>';
    if (v.showLimpar) h += '<button data-act="clear">Limpar lote</button>';
    h += '</div>';
    return h;
  }

  function renderLote() {
    return loteHtml({ ...state, watching: !!state.stopWatch });
  }

  // Menu do ⚙ (as opções que antes ficavam na aba Config).
  function renderMenu() {
    return `<h4>Abrir a Shopee em</h4>
      <label><input type="radio" name="openIn" data-act="openIn" value="tab" ${state.openIn === 'tab' ? 'checked' : ''}> aba</label>
      <label><input type="radio" name="openIn" data-act="openIn" value="window" ${state.openIn === 'window' ? 'checked' : ''}> janela</label>`;
  }

  function renderHead(recolhido) {
    return `<b class="titulo">Assistente de Live</b>
      <button class="hb" data-act="menu" title="Configurações" aria-expanded="${state.menuAberto}">⚙</button>
      <button class="hb" data-act="toggle-lote" title="${recolhido ? 'Mostrar o lote' : 'Recolher o lote'}">${recolhido ? '▸' : '▾'}</button>`;
  }

  // Desenha uma área extra sem deixar um erro dela apagar o painel inteiro.
  function renderArea(a) {
    try { return `<section data-area="${esc(a.key)}">${a.render()}</section>`; } catch (e) {
      console.error(`[SLA] desenho da área "${a.key}" falhou`, e);
      return `<section data-area="${esc(a.key)}"><p class="warn">Esta parte do painel falhou ao aparecer.</p></section>`;
    }
  }

  // Altura de referência do painel para limitar o Lote: a altura fixa do painel, se houver;
  // senão o teto do CSS (80% da janela). Não usa a altura medida, que depende do próprio Lote.
  function alturaPainel(box) {
    const fixa = box && box.style ? parseFloat(box.style.height) : NaN;
    if (Number.isFinite(fixa) && fixa > 0) return fixa;
    const h = typeof innerHeight === 'number' ? innerHeight : NaN;
    return Number.isFinite(h) && h > 0 ? Math.round(0.8 * h) : NaN;
  }

  // Teto de altura do Lote conforme a altura do painel (sem SLA.layout: fica o 40vh do CSS).
  function aplicarLoteMax(box, lote) {
    if (!lote) return;
    const max = SLA.layout && typeof SLA.layout.loteMaxHeight === 'function' ? SLA.layout.loteMaxHeight(alturaPainel(box)) : NaN;
    lote.style.maxHeight = Number.isFinite(max) && max > 0 ? max + 'px' : '';
  }

  const CSS = `
    :host{all:initial}
    .box{position:fixed;top:80px;right:16px;width:300px;max-height:80vh;display:flex;flex-direction:column;z-index:2147483647;
      background:#fff;color:#222;font:13px/1.4 sans-serif;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);overflow:hidden}
    .head{flex:none;display:flex;align-items:center;gap:4px;background:#ee4d2d;color:#fff;padding:6px 8px 6px 10px;cursor:move;user-select:none}
    .head .titulo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .head .hb{background:none;border:0;color:#fff;padding:2px 6px;font-size:15px;line-height:1;border-radius:4px}
    .head .hb:hover{background:rgba(255,255,255,.2)}
    .menu{flex:none;padding:6px 10px;background:#fafafa;border-bottom:1px solid #ddd}
    .menu h4{margin:2px 0 4px}
    .lote{flex:none;max-height:40vh;overflow:auto;padding:0 10px 8px;border-bottom:2px solid #eee}
    .lote.recolhido{padding:6px 10px}
    .area{flex:1;min-height:0;overflow:auto;padding:0 10px 10px}
    .area:empty{display:none}
    .grip{flex:none;align-self:flex-end;width:16px;height:16px;cursor:nwse-resize;user-select:none;
      background:linear-gradient(135deg,transparent 0 50%,#bbb 50% 58%,transparent 58% 70%,#bbb 70% 78%,transparent 78%)}
    h4{margin:8px 0 4px}
    ul{list-style:none;margin:0 0 8px;padding:0}
    li{display:flex;align-items:center;gap:6px;padding:2px 0}
    .x{border:0;background:none;cursor:pointer;color:#888;margin-left:auto}
    .mut{color:#777}.warn{color:#b00}
    .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    button{font:inherit;padding:4px 10px;cursor:pointer}
    button.pri{background:#ee4d2d;color:#fff;border:0;border-radius:4px}
    button:disabled{opacity:.5;cursor:default}
    label{display:block;margin:4px 0}
    .busca{box-sizing:border-box;width:100%;margin:6px 0;padding:4px 6px;font:inherit}
    .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px}
    .tile{position:relative;aspect-ratio:1;padding:0;border:2px solid transparent;border-radius:6px;background:#eee;overflow:hidden;cursor:pointer}
    .tile img{width:100%;height:100%;object-fit:cover;display:block}
    .tile .tn{position:absolute;top:2px;left:2px;min-width:18px;padding:0 4px;border-radius:4px;background:rgba(0,0,0,.65);color:#fff;font-size:12px;font-weight:bold;line-height:18px;text-align:center}
    .tile.noar{border-color:#ee4d2d}
    .tile.noar::after{content:"No ar";position:absolute;left:0;right:0;bottom:0;background:#ee4d2d;color:#fff;font-size:11px;line-height:16px;text-align:center}
    .tile.apagado{opacity:.45;cursor:default}
    .tile.trocando{opacity:.6}
    .tile.desligado{opacity:.45;filter:grayscale(1);cursor:not-allowed}
    .modos{display:flex;gap:6px;margin:6px 0}
    .modos button{flex:1;border:1px solid #ccc;border-radius:4px;background:#fff}
    .modos button.on{background:#ee4d2d;border-color:#ee4d2d;color:#fff}
    .modos button:disabled{background:#f3f3f3;color:#999}
    .apagado{opacity:.45}
  `;

  function draw() {
    if (!shadow) return;
    // Aviso novo ou pausa nova: o Lote abre sozinho (o pedido de clique e os erros aparecem);
    // recolhido à mão com o mesmo aviso na tela, continua recolhido.
    expansao = nextLoteExpansion(expansao, state.aviso, state.batch);
    if (expansao.expandir) state.loteRecolhido = false;
    const recolhido = state.loteRecolhido;
    // Guarda o foco (e o cursor) do campo marcado com data-focus-key, para a digitação não travar.
    const ae = shadow.activeElement;
    const focusKey = ae && ae.dataset ? ae.dataset.focusKey : null;
    const selStart = focusKey ? ae.selectionStart : null;
    const selEnd = focusKey ? ae.selectionEnd : null;
    const box = shadow.querySelector('.box');
    const head = shadow.querySelector('.head');
    const menu = shadow.querySelector('.menu');
    const lote = shadow.querySelector('.lote');
    const area = shadow.querySelector('.area');
    // Guarda a rolagem de cada bloco: a atualização automática não pode jogar as listas para o topo.
    const topoLote = lote ? lote.scrollTop : 0;
    const topoArea = area ? area.scrollTop : 0;
    const chaveLote = recolhido ? 'lote:recolhido' : 'lote';
    const chaveArea = areas.map((a) => a.key).join(',');
    if (head) head.innerHTML = renderHead(recolhido);
    if (menu) {
      menu.hidden = !state.menuAberto;
      menu.innerHTML = state.menuAberto ? renderMenu() : '';
    }
    if (lote) {
      lote.classList.toggle('recolhido', recolhido);
      lote.innerHTML = recolhido ? `<span class="mut">${esc(loteSummary(state.batch, state.ids))}</span>` : renderLote();
      aplicarLoteMax(box, lote);
    }
    if (area) area.innerHTML = areas.map(renderArea).join('');
    if (focusKey) {
      try {
        const novo = Array.from(shadow.querySelectorAll('[data-focus-key]')).find((e) => e.dataset.focusKey === focusKey);
        refocus(novo, selStart, selEnd);
      } catch (_) { /* ignora */ }
    }
    if (lote) lote.scrollTop = scrollToRestore(loteDesenhado, chaveLote, topoLote);
    if (area) area.scrollTop = scrollToRestore(areaDesenhada, chaveArea, topoArea);
    loteDesenhado = chaveLote;
    areaDesenhada = chaveArea;
    desenhado = true;
    notifyPendingActive(); // áreas registradas antes da montagem: avisa depois do primeiro desenho
  }

  function stopWatching() {
    if (state.stopWatch) state.stopWatch();
    state.stopWatch = null;
  }

  function setBatch(b) {
    const anterior = state.batch;
    state.batch = b || null;
    if (!b || !anterior || anterior.id !== b.id) { // outro lote: esquece o que foi marcado no anterior
      stopWatching();
      state.marcados = [];
    }
    if (b) state.ids = filterOutBatch(state.ids, b);
    draw();
  }

  // Marca na live os produtos favoritados e grava o resultado de cada um no lote.
  async function markAll() {
    if (state.marcando || state.stopWatch || !state.batch) return; // já há marcados esperando o Confirmar
    const items = SLA.batch.resolvedItems(state.batch);
    if (!items.length) return;
    const add = SLA.addProducts;
    if (!(add && add.markFavorites)) {
      state.aviso = 'Marcar na live ainda não disponível';
      return draw();
    }
    state.marcando = true;
    state.aviso = '';
    draw();
    try {
      // Se a página não aceitar o clique simulado no bloco "Produtos", pede o clique ao apresentador.
      const pedir = (texto) => { state.aviso = texto; draw(); };
      const { marcados, updates } = planMarkResults(await add.markFavorites(items, { onWaitUser: pedir }), state.marcados);
      for (const r of updates) {
        const nb = await send({ type: 'batch:setStatus', id: r.id, status: r.status });
        if (nb) state.batch = nb;
      }
      stopWatching(); // no máximo UMA vigia do Confirmar
      state.marcados = marcados;
      if (marcados.length && add.watchConfirm) {
        // Quando o Fabio clicar em Confirmar na Shopee, os marcados viram "adicionado".
        let confirmou = false;
        const parar = add.watchConfirm(
          async () => {
            confirmou = true;
            for (const id of marcados) {
              try {
                const nb = await send({ type: 'batch:setStatus', id, status: 'adicionado' });
                if (nb) state.batch = nb;
              } catch (_) { /* ignora */ }
            }
            state.marcados = [];
            state.aviso = '';
            draw();
          },
          () => { // a tela de Adicionar Produtos fechou: "Marcar na live" volta, para tentar de novo
            if (state.stopWatch !== parar) return; // já foi trocada por outra vigia
            state.stopWatch = null;
            if (!confirmou) state.aviso = 'A tela de Adicionar Produtos fechou sem Confirmar. Para tentar de novo, clique em Marcar na live.';
            draw();
          }
        );
        state.stopWatch = parar;
      }
      state.aviso = marcados.length
        ? `${marcados.length} marcados — confira e clique em Confirmar`
        : 'Nenhum produto novo para marcar (os do lote já estavam na sacola ou precisam de conferência).';
    } catch (e) {
      state.aviso = 'Não consegui marcar na live: ' + ((e && e.message) || e);
    } finally {
      state.marcando = false;
      draw();
    }
  }

  async function onAction(el, ev) {
    const act = el.dataset.act;
    if (act === 'menu') { state.menuAberto = !state.menuAberto; return draw(); }
    if (act === 'toggle-lote') { state.loteRecolhido = !state.loteRecolhido; return draw(); }
    if (act === 'rm') { state.ids = removeId(state.ids, el.dataset.id); return draw(); }
    if (act === 'openIn') {
      state.openIn = el.value;
      try { await chrome.storage.local.set({ openIn: state.openIn }); } catch (_) { /* ignora */ }
      return;
    }
    if (!BUILTIN_ACTS.includes(act)) { // ação desconhecida: pode ser de uma aba extra
      runExtra(el, ev);
      return;
    }
    state.aviso = '';
    if (act === 'start') {
      const r = await send({ type: 'batch:start', ids: state.ids, openIn: state.openIn });
      if (r && r.error) {
        state.aviso = r.error === 'lote em andamento' ? 'Já existe um lote em andamento.' : String(r.error);
        return draw();
      }
      state.ids = [];
      return setBatch(r);
    }
    if (act === 'reopen') return setBatch(await send({ type: 'batch:reopen' }));
    if (act === 'clear') {
      await send({ type: 'batch:clear' });
      return setBatch(null);
    }
    if (act === 'mark') return markAll();
  }

  function onMouseUp() {
    const sel = typeof getSelection === 'function' ? getSelection() : null;
    if (!sel || sel.isCollapsed || !isInsideChat(sel.anchorNode, SLA.selectors.chatContent)) return;
    const novo = mergeIds(state.ids, sel.toString(), state.batch);
    if (novo.join() !== state.ids.join()) {
      state.ids = novo;
      draw();
    }
  }

  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'batch:update') setBatch(msg.batch);
    else if (msg.type === 'batch:resolved') {
      // O Lote está sempre à vista; aviso novo ou pausa nova fazem o draw() abri-lo mesmo recolhido.
      setBatch(msg.batch);
      markAll(); // marca sozinho; sem a Tarefa 8 só mostra o aviso
    }
  }

  // ---- Posição e tamanho do painel (sem teste automático de DOM; a conta está em layout.js) ----
  let rectAtual = null; // {left, top, width, height} em px; null = layout.js ausente (vale o CSS)
  let saveTimer = null;

  function aplicarRect(box, rect) {
    try {
      rectAtual = rect;
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
      box.style.right = 'auto';
      box.style.maxHeight = 'none';
      aplicarLoteMax(box, shadow && shadow.querySelector('.lote'));
    } catch (_) { /* ignora */ }
  }

  // Grava o retângulo ~400 ms depois do último ajuste; um save pendente é sempre substituído.
  function salvarRectDepois() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        if (rectAtual) Promise.resolve(chrome.storage.local.set({ panelRect: rectAtual })).catch(() => {});
      } catch (_) { /* ignora */ }
    }, 400);
  }

  // Arrasto genérico: parte do retângulo do mousedown + deslocamento do mouse; calc(rect, dx, dy) dá o novo.
  function iniciarArrasto(e, box, calc) {
    if (!SLA.layout || !rectAtual) return;
    e.preventDefault(); // evita selecionar texto da página
    const inicio = rectAtual;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev) => {
      if (ev.buttons === 0) return up(); // soltou fora da janela ou sobre um iframe: o mouseup se perdeu
      try { aplicarRect(box, calc(inicio, ev.clientX - x0, ev.clientY - y0, window)); } catch (_) { /* ignora */ }
    };
    const up = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      window.removeEventListener('blur', up, true);
      salvarRectDepois();
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
    window.addEventListener('blur', up, true);
  }

  function enableDrag(box, handle, grip) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) return; // ⚙ e recolher não arrastam
      iniciarArrasto(e, box, (r, dx, dy, w) => SLA.layout.rectAfterMove(r, dx, dy, w));
    });
    if (grip) grip.addEventListener('mousedown', (e) => iniciarArrasto(e, box, (r, dx, dy, w) => SLA.layout.rectAfterResize(r, dx, dy, w)));
  }

  // Lê o retângulo salvo (ou o padrão), aplica ao painel e passa a seguir o tamanho da janela.
  async function restaurarRect(box) {
    if (!SLA.layout) return;
    let saved = null;
    try {
      const s = await chrome.storage.local.get('panelRect');
      saved = s && s.panelRect;
    } catch (_) { /* ignora: vale o padrão */ }
    try { aplicarRect(box, SLA.layout.sanitizeRect(saved, window)); } catch (_) { /* ignora */ }
    window.addEventListener('resize', () => {
      try { if (rectAtual) aplicarRect(box, SLA.layout.sanitizeRect(rectAtual, window)); } catch (_) { /* ignora */ }
    });
  }

  async function init() {
    if (!shouldMount(location) || document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div class="box"><div class="head">${renderHead(false)}</div>`
      + '<div class="menu" hidden></div><div class="lote"></div><div class="area"></div><div class="grip"></div></div>';
    enableDrag(shadow.querySelector('.box'), shadow.querySelector('.head'), shadow.querySelector('.grip'));
    shadow.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-act]');
      if (el && el.dataset.act !== 'openIn') onAction(el, e).catch(() => {});
    });
    // Digitação (ex.: busca) só vai para ações de abas extras, nunca para as do painel.
    shadow.addEventListener('input', (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-act]');
      if (el && !BUILTIN_ACTS.includes(el.dataset.act)) runExtra(el, e);
    });
    // Foto que não carregou: some, e a aba Sacola não a pede de novo. Fica aqui (e não num
    // onerror embutido no HTML) porque a página da Shopee pode bloquear código embutido.
    shadow.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      img.style.display = 'none';
      try {
        const code = img.dataset && img.dataset.img;
        if (code && SLA.bagTab && typeof SLA.bagTab.markImageFailed === 'function') SLA.bagTab.markImageFailed(code);
      } catch (err) { console.error('[SLA] registro de foto com erro falhou', err); }
    }, true);
    shadow.addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.act === 'openIn') onAction(e.target).catch(() => {});
    });
    document.documentElement.appendChild(host);
    document.addEventListener('mouseup', onMouseUp, true);
    chrome.runtime.onMessage.addListener(onMessage);
    await restaurarRect(shadow.querySelector('.box'));
    try {
      const s = await chrome.storage.local.get('openIn');
      if (s && (s.openIn === 'tab' || s.openIn === 'window')) state.openIn = s.openIn;
    } catch (_) { /* ignora */ }
    try { state.batch = await send({ type: 'batch:get' }); } catch (_) { /* ignora */ }
    draw();
  }

  SLA.panel = { registerArea, registerTab, redraw, isAreaVisible, isTabActive, findExtraAction, loteHtml, loteSummary, shouldExpandLote, nextLoteExpansion, scrollToRestore, refocus, shouldMount, isInsideChat, filterOutBatch, mergeIds, removeId, statusLabel, viewState, normalizeResults, planMarkResults, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.panel;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    init().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
