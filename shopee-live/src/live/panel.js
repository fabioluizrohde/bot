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

  // Junta o que foi selecionado à lista atual. Seleção sem IDs não apaga a lista anterior;
  // seleção com IDs substitui a lista (menos os que já estão no lote).
  function mergeIds(current, selectedText, batch, extract) {
    const ext = extract || (SLA.ids && SLA.ids.extractIds);
    const found = ext(selectedText);
    if (!found.length) return current.slice();
    const noLote = new Set(batch && batch.items ? batch.items.map((i) => i.id) : []);
    return found.filter((id) => !noLote.has(id));
  }

  function removeId(list, id) {
    return list.filter((x) => x !== id);
  }

  // Quais botões aparecem para o estado atual.
  function viewState(batch, idsCount) {
    const phase = batch ? batch.phase : null;
    const marcaveis = batch && SLA.batch ? SLA.batch.resolvedItems(batch).length : 0;
    return {
      canProcess: idsCount > 0 && (!batch || phase === 'done'),
      showRetomar: phase === 'resolving', // sempre: o coordenador não percebe se a aba da Shopee foi fechada
      showMarcar: phase === 'adding' && marcaveis > 0,
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
  // confirmar); os demais só passam se forem status válidos do lote.
  function planMarkResults(res) {
    const validos = new Set(Object.values(SLA.batch.STATUS));
    const marcados = [];
    const updates = [];
    for (const r of normalizeResults(res)) {
      if (r.status === 'marcado') marcados.push(r.id);
      else if (validos.has(r.status)) updates.push({ id: r.id, status: r.status });
    }
    return { marcados, updates };
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  const state = { ids: [], batch: null, openIn: 'tab', aviso: '', tab: 'lote', marcando: false };
  const extraTabs = []; // {key, label, render}
  let shadow = null;
  let stopWatch = null;

  const send = (msg) => chrome.runtime.sendMessage(msg);

  function registerTab(key, label, render) {
    const i = extraTabs.findIndex((t) => t.key === key);
    const t = { key, label, render };
    if (i >= 0) extraTabs[i] = t;
    else extraTabs.push(t);
    if (shadow) draw();
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

  function renderLote() {
    const v = viewState(state.batch, state.ids.length);
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
  `;

  function draw() {
    if (!shadow) return;
    const tabs = [{ key: 'lote', label: 'Lote', render: renderLote }, ...extraTabs, { key: 'config', label: 'Config', render: renderConfig }];
    if (!tabs.some((t) => t.key === state.tab)) state.tab = 'lote';
    const cur = tabs.find((t) => t.key === state.tab);
    shadow.querySelector('.tabs').innerHTML = tabs
      .map((t) => `<button data-act="tab" data-key="${esc(t.key)}" class="${t.key === state.tab ? 'on' : ''}">${esc(t.label)}</button>`)
      .join('');
    shadow.querySelector('.body').innerHTML = cur.render();
  }

  function setBatch(b) {
    state.batch = b || null;
    if (b) state.ids = state.ids.filter((id) => !b.items.some((i) => i.id === id));
    draw();
  }

  // Marca na live os produtos favoritados e grava o resultado de cada um no lote.
  async function markAll() {
    if (state.marcando || !state.batch) return;
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
      const { marcados, updates } = planMarkResults(await add.markFavorites(items));
      for (const r of updates) {
        const nb = await send({ type: 'batch:setStatus', id: r.id, status: r.status });
        if (nb) state.batch = nb;
      }
      if (marcados.length && add.watchConfirm) {
        if (stopWatch) stopWatch();
        // Quando o Fabio clicar em Confirmar na Shopee, os marcados viram "adicionado".
        stopWatch = add.watchConfirm(async () => {
          for (const id of marcados) {
            try {
              const nb = await send({ type: 'batch:setStatus', id, status: 'adicionado' });
              if (nb) state.batch = nb;
            } catch (_) { /* ignora */ }
          }
          state.aviso = '';
          draw();
        });
      }
      if (marcados.length) state.aviso = `${marcados.length} marcados — confira e clique em Confirmar`;
    } catch (e) {
      state.aviso = 'Não consegui marcar na live: ' + ((e && e.message) || e);
    } finally {
      state.marcando = false;
      draw();
    }
  }

  async function onAction(el) {
    const act = el.dataset.act;
    if (act === 'tab') { state.tab = el.dataset.key; return draw(); }
    if (act === 'rm') { state.ids = removeId(state.ids, el.dataset.id); return draw(); }
    if (act === 'openIn') {
      state.openIn = el.value;
      try { await chrome.storage.local.set({ openIn: state.openIn }); } catch (_) { /* ignora */ }
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
      if (el && el.dataset.act !== 'openIn') onAction(el).catch(() => {});
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

  SLA.panel = { registerTab, shouldMount, isInsideChat, mergeIds, removeId, statusLabel, viewState, normalizeResults, planMarkResults, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.panel;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
    init().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
