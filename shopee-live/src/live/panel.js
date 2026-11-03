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

  // ---------- Comportamento no navegador (sem teste automático) ----------

  // marcados: IDs que a extensão marcou e esperam o Confirmar; stopWatch: vigia do Confirmar ativa (ou null).
  const state = { ids: [], batch: null, openIn: 'tab', aviso: '', tab: 'lote', marcando: false, marcados: [], stopWatch: null };
  const extraTabs = []; // {key, label, render, opts}
  const BUILTIN_ACTS = ['tab', 'rm', 'openIn', 'start', 'reopen', 'clear', 'mark'];
  let shadow = null;

  const send = (msg) => chrome.runtime.sendMessage(msg);

  // opts.actions: {data-act: (el, ev) => void}; opts.onActive(ativa:boolean): aviso ao entrar/sair da aba.
  function registerTab(key, label, render, opts) {
    const i = extraTabs.findIndex((t) => t.key === key);
    const t = { key, label, render, opts: opts || {} };
    if (i >= 0) extraTabs[i] = t;
    else extraTabs.push(t);
    if (shadow) draw();
  }

  function redraw() { draw(); }

  function isTabActive(key) { return state.tab === key; }

  // Avisa a aba extra (se tiver onActive) sem deixar um erro dela quebrar o painel.
  function notifyActive(key, active) {
    const t = extraTabs.find((x) => x.key === key);
    if (t && t.opts && typeof t.opts.onActive === 'function') {
      try { t.opts.onActive(active); } catch (e) { console.error(`[SLA] onActive da aba "${key}" falhou`, e); }
    }
  }

  function setTab(key) {
    if (key === state.tab) return;
    const anterior = state.tab;
    state.tab = key;
    notifyActive(anterior, false);
    notifyActive(key, true);
  }

  // Chama a ação de uma aba extra, se existir; erro dela é ignorado.
  function runExtra(el, ev) {
    const act = el.dataset.act;
    const tab = extraTabs.find((t) => findExtraAction([t], act));
    if (!tab) return false;
    const log = (e) => console.error(`[SLA] ação "${act}" da aba "${tab.key}" falhou`, e);
    try {
      const r = tab.opts.actions[act](el, ev); // síncrona continua síncrona
      if (r && typeof r.then === 'function') r.then(null, log); // async que rejeita também é registrada
    } catch (e) { log(e); }
    return true;
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  function renderLote() {
    const v = viewState(state.batch, state.ids.length, !!state.stopWatch);
    let h = '<h4>IDs encontrados no chat</h4>';
    if (state.ids.length) {
      h += '<ul>' + state.ids
        .map((id) => `<li><code>${esc(id)}</code><button class="x" data-act="rm" data-id="${esc(id)}" title="Remover">✕</button></li>`)
        .join('') + '</ul>';
    } else {
      h += '<p class="mut">Selecione mensagens do chat com o mouse para listar os IDs.</p>';
    }
    h += `<button class="pri" data-act="start" ${v.canProcess ? '' : 'disabled'}>Processar lote</button>`;
    if (state.batch) {
      h += '<h4>Lote</h4><ul>' + state.batch.items
        .map((i) => `<li><code>${esc(i.id)}</code> <span class="st">${esc(statusLabel(i.status))}</span>${i.name ? ` <span class="mut">${esc(i.name)}</span>` : ''}</li>`)
        .join('') + '</ul>';
      if (state.batch.paused) h += '<p class="warn">Pausado (verificação da Shopee). Resolva na aba da Shopee e continue.</p>';
    }
    h += '<div class="row">';
    if (v.showRetomar) h += '<button data-act="reopen">Retomar</button>';
    if (v.showMarcar) h += `<button class="pri" data-act="mark" ${state.marcando ? 'disabled' : ''}>Marcar na live</button>`;
    if (v.showAguardando) h += '<span class="mut">Aguardando seu Confirmar…</span>';
    if (v.showLimpar) h += '<button data-act="clear">Limpar lote</button>';
    h += '</div>';
    if (state.aviso) h += `<p class="warn">${esc(state.aviso)}</p>`;
    return h;
  }

  function renderConfig() {
    return `<h4>Abrir a Shopee em</h4>
      <label><input type="radio" name="openIn" data-act="openIn" value="tab" ${state.openIn === 'tab' ? 'checked' : ''}> aba</label>
      <label><input type="radio" name="openIn" data-act="openIn" value="window" ${state.openIn === 'window' ? 'checked' : ''}> janela</label>`;
  }

  const CSS = `
    :host{all:initial}
    .box{position:fixed;top:80px;right:16px;width:300px;max-height:80vh;display:flex;flex-direction:column;z-index:2147483647;
      background:#fff;color:#222;font:13px/1.4 sans-serif;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);overflow:hidden}
    .head{background:#ee4d2d;color:#fff;padding:8px 10px;cursor:move;user-select:none}
    .tabs{display:flex;border-bottom:1px solid #ddd}
    .tabs button{flex:1;border:0;background:#f6f6f6;padding:6px;cursor:pointer}
    .tabs button.on{background:#fff;font-weight:bold;border-bottom:2px solid #ee4d2d}
    .body{padding:10px;overflow:auto}
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
    .cartao{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #eee}
    .cartao .num{font-size:20px;font-weight:bold;min-width:32px;text-align:center;color:#ee4d2d}
    .cartao img{width:40px;height:40px;object-fit:cover;border-radius:4px}
    .cartao .info{min-width:0}
    .cartao .nome{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .cartao .preco s{color:#999;margin-left:4px}
    .apagado{opacity:.45}
  `;

  function draw() {
    if (!shadow) return;
    const tabs = [{ key: 'lote', label: 'Lote', render: renderLote }, ...extraTabs, { key: 'config', label: 'Config', render: renderConfig }];
    if (!tabs.some((t) => t.key === state.tab)) setTab('lote');
    const cur = tabs.find((t) => t.key === state.tab);
    // Guarda o foco (e o cursor) do campo marcado com data-focus-key, para a digitação não travar.
    const ae = shadow.activeElement;
    const focusKey = ae && ae.dataset ? ae.dataset.focusKey : null;
    const selStart = focusKey ? ae.selectionStart : null;
    const selEnd = focusKey ? ae.selectionEnd : null;
    shadow.querySelector('.tabs').innerHTML = tabs
      .map((t) => `<button data-act="tab" data-key="${esc(t.key)}" class="${t.key === state.tab ? 'on' : ''}">${esc(t.label)}</button>`)
      .join('');
    shadow.querySelector('.body').innerHTML = cur.render();
    if (focusKey) {
      try {
        const novo = Array.from(shadow.querySelectorAll('[data-focus-key]')).find((e) => e.dataset.focusKey === focusKey);
        if (novo) {
          novo.focus();
          if (selStart != null && typeof novo.setSelectionRange === 'function') novo.setSelectionRange(selStart, selEnd);
        }
      } catch (_) { /* ignora */ }
    }
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
    if (act === 'tab') { setTab(el.dataset.key); return draw(); }
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
      setBatch(msg.batch);
      markAll(); // marca sozinho; sem a Tarefa 8 só mostra o aviso
    }
  }

  function enableDrag(box, handle) {
    handle.addEventListener('mousedown', (e) => {
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const move = (ev) => {
        box.style.left = Math.max(0, ev.clientX - dx) + 'px';
        box.style.top = Math.max(0, ev.clientY - dy) + 'px';
        box.style.right = 'auto';
      };
      const up = () => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    });
  }

  async function init() {
    if (!shouldMount(location) || document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div class="box"><div class="head"><b>Assistente de Live</b></div><div class="tabs"></div><div class="body"></div></div>`;
    enableDrag(shadow.querySelector('.box'), shadow.querySelector('.head'));
    shadow.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-act]');
      if (el && el.dataset.act !== 'openIn') onAction(el, e).catch(() => {});
    });
    // Digitação (ex.: busca) só vai para ações de abas extras, nunca para as do painel.
    shadow.addEventListener('input', (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-act]');
      if (el && !BUILTIN_ACTS.includes(el.dataset.act)) runExtra(el, e);
    });
    shadow.addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.act === 'openIn') onAction(e.target).catch(() => {});
    });
    document.documentElement.appendChild(host);
    document.addEventListener('mouseup', onMouseUp, true);
    chrome.runtime.onMessage.addListener(onMessage);
    try {
      const s = await chrome.storage.local.get('openIn');
      if (s && (s.openIn === 'tab' || s.openIn === 'window')) state.openIn = s.openIn;
    } catch (_) { /* ignora */ }
    try { state.batch = await send({ type: 'batch:get' }); } catch (_) { /* ignora */ }
    draw();
  }

  SLA.panel = { registerTab, redraw, isTabActive, findExtraAction, shouldMount, isInsideChat, filterOutBatch, mergeIds, removeId, statusLabel, viewState, normalizeResults, planMarkResults, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.panel;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    init().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
