// Assistente de Live Shopee — painel flutuante injetado na página da live.
//
// Funções:
//  1. Lê o chat e registra os códigos de produto pedidos pelos clientes.
//  2. Adiciona esses produtos à sacola repetindo um fluxo gravado pelo apresentador.
//  3. Destaca (fixa) um produto da sacola com um clique ou com atalho de teclado.
//
// Como a Shopee muda o layout com frequência, nada aqui depende de classes fixas:
// o apresentador "ensina" onde fica cada coisa clicando na própria página.
(() => {
  if (window.__slaLoaded) return;
  window.__slaLoaded = true;

  const { codes, catalog: catalogLib, selector: sel, dom } = window.SLA;
  const N = codes.normalize;

  // ---------------------------------------------------------------- estado
  const DEFAULT_CONFIG = {
    selectors: {
      chatContainer: '',
      chatMessage: '',
      bagRow: '',
      highlightRel: '',
      highlightText: '',
    },
    flows: { add: [] },
    flowExample: '',
    parse: { allowBare: true, onlyCatalog: false, customRegex: '' },
    auto: { add: false, minRequests: 1 },
  };

  let config = structuredClone(DEFAULT_CONFIG);
  let catalog = [];
  let requests = {};
  let logs = [];
  let ui = { tab: 'pedidos', minimized: false, x: null, y: null, current: -1 };

  const store = {
    async get(key, def) {
      try {
        const r = await chrome.storage.local.get(key);
        return r[key] === undefined ? def : r[key];
      } catch (_) {
        return def;
      }
    },
    set(key, value) {
      try {
        chrome.storage.local.set({ [key]: value });
      } catch (_) {
        /* contexto da extensão invalidado (extensão recarregada) */
      }
    },
  };

  const save = {
    config: () => store.set('sla.config', config),
    catalog: () => store.set('sla.catalog', catalog),
    requests: () => store.set('sla.requests', requests),
    ui: () => store.set('sla.ui', ui),
  };

  function mergeConfig(c) {
    const d = structuredClone(DEFAULT_CONFIG);
    c = c || {};
    return {
      ...d,
      ...c,
      selectors: { ...d.selectors, ...(c.selectors || {}) },
      flows: { ...d.flows, ...(c.flows || {}) },
      parse: { ...d.parse, ...(c.parse || {}) },
      auto: { ...d.auto, ...(c.auto || {}) },
    };
  }

  function log(msg, kind = 'info') {
    const t = new Date().toLocaleTimeString('pt-BR');
    logs.unshift({ t, msg, kind });
    logs = logs.slice(0, 80);
    scheduleRender();
  }

  const findItem = (code) => catalog.find((i) => i.code === codes.canon(code));
  const searchTerm = (item) => (item && (item.search || item.name)) || '';

  // ---------------------------------------------------------------- chat
  const chat = { observer: null, el: null, lastText: new WeakMap(), recent: new Map() };

  function attachChat() {
    const s = config.selectors.chatContainer;
    if (!s) return;
    let el = null;
    try {
      el = document.querySelector(s);
    } catch (_) {
      return;
    }
    if (el === chat.el && el && el.isConnected) return;
    if (chat.observer) chat.observer.disconnect();
    chat.el = el;
    chat.observer = null;
    if (!el) return;
    // mensagens que já estavam na tela não contam
    messagesIn(el).forEach((m) => chat.lastText.set(m, dom.text(m)));
    chat.observer = new MutationObserver(onChatMutations);
    chat.observer.observe(el, { childList: true, subtree: true, characterData: true });
    log('Lendo o chat da live.');
    scheduleRender();
  }

  function messagesIn(root) {
    const ms = config.selectors.chatMessage;
    if (ms) {
      try {
        return [...root.querySelectorAll(ms)];
      } catch (_) {
        /* seletor inválido */
      }
    }
    return [...root.children];
  }

  function messagesFor(node) {
    const ms = config.selectors.chatMessage;
    if (ms) {
      try {
        if (node.matches(ms)) return [node];
        const inner = [...node.querySelectorAll(ms)];
        if (inner.length) return inner;
        const up = node.closest(ms);
        return up ? [up] : [];
      } catch (_) {
        /* cai no padrão abaixo */
      }
    }
    let cur = node;
    while (cur && cur.parentElement !== chat.el) cur = cur.parentElement;
    return cur ? [cur] : [];
  }

  function onChatMutations(mutations) {
    const touched = new Set();
    for (const m of mutations) {
      const nodes = m.type === 'characterData' ? [m.target] : [...m.addedNodes];
      for (const n of nodes) {
        const el = n.nodeType === 1 ? n : n.parentElement;
        if (el) messagesFor(el).forEach((x) => touched.add(x));
      }
    }
    // espera o próximo frame para o texto da mensagem estar completo
    requestAnimationFrame(() => touched.forEach(processMessage));
  }

  function processMessage(el) {
    const raw = dom.text(el);
    if (!raw || chat.lastText.get(el) === raw) return;
    chat.lastText.set(el, raw);
    const now = Date.now();
    // listas virtualizadas re-renderizam a mesma mensagem: ignora repetição em 3s
    for (const [k, t] of chat.recent) if (now - t > 3000) chat.recent.delete(k);
    if (chat.recent.has(raw)) return;
    chat.recent.set(raw, now);
    handleChatText(raw);
  }

  function handleChatText(raw) {
    const { author, body } = codes.splitAuthor(raw);
    const found = codes.parseCodes(body, {
      ...config.parse,
      catalogCodes: new Set(catalog.map((i) => i.code)),
    });
    found.forEach((c) => registerRequest(c, author, body));
    return found;
  }

  function registerRequest(code, author, body) {
    const key = codes.canon(code);
    const r = (requests[key] = requests[key] || { code: key, count: 0, users: [], status: 'novo', first: Date.now() });
    r.count++;
    r.last = Date.now();
    r.lastText = String(body).slice(0, 140);
    if (author && !r.users.includes(author)) r.users = [author, ...r.users].slice(0, 30);
    const item = findItem(key);
    if (!item && r.status === 'novo') r.status = 'desconhecido';
    if (item && r.status === 'desconhecido') r.status = 'novo';
    save.requests();
    scheduleRender();
    if (config.auto.add && r.status === 'novo' && r.count >= (config.auto.minRequests || 1)) enqueueAdd(key);
  }

  // ---------------------------------------------------------------- sacola
  function bagRows() {
    const s = config.selectors.bagRow;
    if (!s) return [];
    try {
      return [...document.querySelectorAll(s)].filter(dom.visible);
    } catch (_) {
      return [];
    }
  }

  function rowMatchesItem(row, item) {
    const t = N(dom.text(row));
    return [item.name, item.search].some((s) => s && t.includes(N(s)));
  }

  function findRow(code) {
    const rows = bagRows();
    const item = findItem(code);
    if (item) {
      const r = rows.find((row) => rowMatchesItem(row, item));
      if (r) return r;
    }
    // sem catálogo: procura "#5" ou linha começando com "5"
    const c = dom.escapeRe(codes.canon(code).toLowerCase());
    const re = new RegExp(`(^|\\s)#0*${c}\\b|^\\s*0*${c}\\b`);
    return rows.find((row) => re.test(N(dom.text(row)))) || null;
  }

  async function highlightRow(row) {
    let btn = null;
    const { highlightRel, highlightText } = config.selectors;
    if (highlightRel) {
      try {
        btn = row.querySelector(highlightRel);
      } catch (_) {
        btn = null;
      }
    }
    if ((!btn || !dom.visible(btn)) && highlightText) btn = dom.findClickableByText(row, highlightText);
    if (!btn) btn = dom.findClickableByText(row, /^(destacar|fixar|mostrar|exibir|apresentar|pin)\b/i);
    if (!btn) throw new Error('Botão de destacar não encontrado. Ensine em Config.');
    dom.realClick(btn);
    const rows = bagRows();
    ui.current = rows.indexOf(row);
    save.ui();
    log(`Destacado: ${dom.text(row).split('\n')[0].slice(0, 60)}`, 'ok');
    scheduleRender();
  }

  async function highlightCode(code) {
    const row = findRow(code);
    if (!row) {
      log(`Código ${code} não está visível na sacola.`, 'erro');
      return false;
    }
    await highlightRow(row);
    return true;
  }

  async function highlightStep(delta) {
    const rows = bagRows();
    if (!rows.length) return log('Nenhum produto visível na sacola.', 'erro');
    const next = (((ui.current < 0 ? (delta > 0 ? -1 : 0) : ui.current) + delta) % rows.length + rows.length) % rows.length;
    try {
      await highlightRow(rows[next]);
    } catch (e) {
      log(e.message, 'erro');
    }
  }

  function refreshBagStatus() {
    if (!bagRows().length) return; // sacola fechada: não dá pra concluir nada
    let changed = false;
    for (const r of Object.values(requests)) {
      if (['novo', 'verificar', 'erro'].includes(r.status) && findItem(r.code) && findRow(r.code)) {
        r.status = 'na_sacola';
        changed = true;
      }
    }
    if (changed) {
      save.requests();
      scheduleRender();
    }
  }

  // ---------------------------------------------------------------- fluxo "adicionar"
  const queue = [];
  let running = false;

  function enqueueAdd(code) {
    const r = requests[code] || (requests[code] = { code, count: 0, users: [], status: 'novo', first: Date.now() });
    if (['fila', 'adicionando', 'na_sacola'].includes(r.status)) return;
    const item = findItem(code);
    if (!item) return log(`Código ${code} não está no catálogo.`, 'erro');
    if (!config.flows.add.length) {
      r.status = 'erro';
      r.error = 'Grave o fluxo "adicionar à sacola" em Config.';
      log(r.error, 'erro');
      return scheduleRender();
    }
    if (findRow(code)) {
      r.status = 'na_sacola';
      save.requests();
      return scheduleRender();
    }
    r.status = 'fila';
    r.error = '';
    queue.push(code);
    scheduleRender();
    pump();
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        if (rec.active || teach.active) {
          await dom.sleep(800);
          continue;
        }
        const code = queue.shift();
        const r = requests[code];
        const item = findItem(code);
        r.status = 'adicionando';
        scheduleRender();
        try {
          await runFlow(config.flows.add, item);
          await dom.sleep(1200);
          r.status = !config.selectors.bagRow || findRow(code) ? 'na_sacola' : 'verificar';
          log(`Produto ${code} (${item.name}) adicionado à sacola.`, 'ok');
        } catch (e) {
          r.status = 'erro';
          r.error = e.message;
          log(`Falha ao adicionar ${code}: ${e.message}`, 'erro');
          dom.pressKey(document.activeElement || document.body, 'Escape');
        }
        save.requests();
        scheduleRender();
        await dom.sleep(600);
      }
    } finally {
      running = false;
    }
  }

  function fill(template, item) {
    return String(template)
      .replace(/\{busca\}/g, searchTerm(item))
      .replace(/\{nome\}/g, item.name || '')
      .replace(/\{codigo\}/g, item.code);
  }

  function query(s) {
    try {
      return [...document.querySelectorAll(s)].filter((e) => dom.visible(e) && !inPanel(e));
    } catch (_) {
      return [];
    }
  }

  async function resolveStep(s, item) {
    if (s.type === 'clickInRow') {
      const needles = [searchTerm(item), item.name].filter(Boolean).map(N);
      return dom.waitFor(() => {
        const rows = query(s.rowSelector);
        let row = rows.find((r) => needles.some((n) => N(dom.text(r)).includes(n)));
        if (!row && rows.length === 1) row = rows[0];
        if (!row) return null;
        if (!s.rel) return row;
        try {
          return row.querySelector(s.rel) || row;
        } catch (_) {
          return row;
        }
      });
    }
    return dom.waitFor(() => {
      const el = query(s.selector)[0];
      if (el) return el;
      if (s.text) {
        const byText = dom.findClickableByText(document.body, s.text);
        if (byText && !inPanel(byText)) return byText;
      }
      return null;
    });
  }

  async function runFlow(steps, item) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await dom.sleep(300);
      const el = s.type === 'key' ? query(s.selector)[0] || document.activeElement : await resolveStep(s, item);
      if (!el) throw new Error(`passo ${i + 1} (${describeStep(s)}) não encontrado na página`);
      if (s.type === 'type') dom.typeInto(el, fill(s.value, item));
      else if (s.type === 'key') dom.pressKey(el, s.key);
      else dom.realClick(el);
    }
  }

  function describeStep(s) {
    if (s.type === 'type') return `digitar "${s.value}"`;
    if (s.type === 'key') return `tecla ${s.key}`;
    if (s.type === 'clickInRow') return `clicar no resultado do produto${s.text ? ` (${s.text})` : ''}`;
    return `clicar em "${s.text || s.selector}"`;
  }

  // ---------------------------------------------------------------- gravação de fluxo
  const rec = { active: false, steps: [], example: '' };

  function startRecording(example) {
    if (!example) return log('Informe o produto de exemplo antes de gravar.', 'erro');
    rec.active = true;
    rec.steps = [];
    rec.example = example;
    window.addEventListener('click', recClick, true);
    window.addEventListener('input', recInput, true);
    window.addEventListener('keydown', recKey, true);
    log(`Gravando: faça o caminho para adicionar "${example}" à sacola e clique em Parar.`);
    render(true);
  }

  function stopRecording() {
    window.removeEventListener('click', recClick, true);
    window.removeEventListener('input', recInput, true);
    window.removeEventListener('keydown', recKey, true);
    rec.active = false;
    if (rec.steps.length) {
      config.flows.add = rec.steps;
      config.flowExample = rec.example;
      save.config();
      const hasVar = rec.steps.some((s) => s.type === 'clickInRow' || /\{busca\}/.test(s.value || ''));
      log(
        `Fluxo gravado com ${rec.steps.length} passos.` +
          (hasVar ? '' : ' Atenção: não encontrei o texto de exemplo digitado na busca.'),
        hasVar ? 'ok' : 'erro'
      );
    } else log('Nenhum passo gravado.', 'erro');
    render(true);
  }

  function labelOf(el) {
    return (el.getAttribute('aria-label') || dom.text(el) || el.getAttribute('placeholder') || el.value || '').slice(0, 40);
  }

  function recClick(e) {
    if (inPanel(e.target)) return;
    // clicar num <label> gera um 2º clique no input ligado a ele: ignora o 2º
    if (rec.lastLabel && rec.lastLabel.control === e.target && Date.now() - rec.lastT < 300) return;
    rec.lastLabel = e.target.closest('label');
    rec.lastT = Date.now();
    const target = e.target.closest(dom.CLICKABLE) || e.target;
    if (target.matches('input:not([type=checkbox]):not([type=radio]), textarea')) {
      rec.steps.push({ type: 'click', selector: sel.uniquePath(target), text: '' });
      return scheduleRender();
    }
    const ex = N(rec.example);
    const row = resultRow(target);
    if (row && ex && N(dom.text(row)).includes(ex)) {
      rec.steps.push({
        type: 'clickInRow',
        rowSelector: sel.listSelector(row),
        rel: sel.pathTo(target, row),
        text: labelOf(target),
      });
    } else {
      const text = labelOf(target);
      rec.steps.push({ type: 'click', selector: sel.uniquePath(target), text: text.length <= 30 ? text : '' });
    }
    scheduleRender();
  }

  // Linha de resultado que contém o elemento clicado. Funciona mesmo quando a
  // busca retornou um único resultado (não dá pra detectar "lista" por repetição).
  function resultRow(target) {
    const rep = sel.repeatingAncestor(target);
    if (rep) return rep;
    // sem lista repetida, só aceita se o clique foi no próprio produto (nome ou checkbox),
    // senão botões como "Confirmar" dentro do modal seriam tratados como resultado
    const ex = N(rec.example);
    const isPick =
      target.matches('input[type=checkbox], input[type=radio], [role=checkbox]') ||
      (ex && N(dom.text(target)).includes(ex));
    if (!isPick) return null;
    const semantic = target.closest('label, li, tr, [role=row], [role=option], [role=listitem]');
    if (semantic) return semantic;
    let cur = target;
    for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
      if (cur.querySelector('input[type=checkbox], input[type=radio], [role=checkbox]')) return cur;
    }
    return null;
  }

  function recInput(e) {
    const t = e.target;
    if (inPanel(t) || !(t.matches('input:not([type=checkbox]):not([type=radio]), textarea') || t.isContentEditable)) return;
    const value = t.isContentEditable ? dom.text(t) : t.value;
    const selector = sel.uniquePath(t);
    const ex = N(rec.example);
    const tpl = ex && N(value) && ex.startsWith(N(value)) ? '{busca}' : value;
    const last = rec.steps[rec.steps.length - 1];
    if (last && last.type === 'type' && last.selector === selector) last.value = tpl;
    else rec.steps.push({ type: 'type', selector, value: tpl });
    scheduleRender();
  }

  function recKey(e) {
    if (e.key !== 'Enter' || inPanel(e.target)) return;
    rec.steps.push({ type: 'key', key: 'Enter', selector: sel.uniquePath(e.target) });
    scheduleRender();
  }

  // ---------------------------------------------------------------- modo ensinar
  const teach = { active: false, target: '', box: null };
  const TEACH_HELP = {
    chat: 'Clique em uma MENSAGEM do chat da live.',
    bag: 'Clique em um PRODUTO da lista da sacola.',
    highlight: 'Clique no botão de DESTACAR/FIXAR de um produto da sacola.',
  };

  function startTeach(target) {
    if (rec.active) stopRecording();
    teach.active = true;
    teach.target = target;
    teach.box = document.createElement('div');
    Object.assign(teach.box.style, {
      position: 'fixed',
      pointerEvents: 'none',
      border: '2px solid #ee4d2d',
      background: 'rgba(238,77,45,.12)',
      zIndex: 2147483646,
      borderRadius: '4px',
      transition: 'all .05s',
    });
    document.documentElement.appendChild(teach.box);
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) =>
      window.addEventListener(t, teachBlock, true)
    );
    window.addEventListener('mousemove', teachHover, true);
    window.addEventListener('keydown', teachKey, true);
    log(TEACH_HELP[target] + ' (Esc cancela)');
  }

  function stopTeach() {
    teach.active = false;
    if (teach.box) teach.box.remove();
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) =>
      window.removeEventListener(t, teachBlock, true)
    );
    window.removeEventListener('mousemove', teachHover, true);
    window.removeEventListener('keydown', teachKey, true);
    render(true);
  }

  function teachHover(e) {
    if (inPanel(e.target)) return;
    const r = e.target.getBoundingClientRect();
    Object.assign(teach.box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }

  function teachKey(e) {
    if (e.key === 'Escape') {
      log('Ensino cancelado.');
      stopTeach();
    }
  }

  function teachBlock(e) {
    if (inPanel(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') {
      try {
        learn(teach.target, e.target);
      } catch (err) {
        log('Não consegui aprender: ' + err.message, 'erro');
      }
      stopTeach();
    }
  }

  function learn(target, el) {
    const S = config.selectors;
    if (target === 'chat') {
      const row = sel.repeatingAncestor(el);
      if (!row) throw new Error('não achei a lista de mensagens; espere ter 2+ mensagens no chat');
      S.chatContainer = sel.uniquePath(row.parentElement);
      S.chatMessage = sel.listSelector(row);
      chat.el = null;
      attachChat();
      log(`Chat aprendido (${messagesIn(row.parentElement).length} mensagens visíveis).`, 'ok');
    } else if (target === 'bag') {
      const row = sel.repeatingAncestor(el);
      if (!row) throw new Error('não achei a lista da sacola; precisa ter 2+ produtos');
      S.bagRow = sel.listSelector(row);
      log(`Sacola aprendida (${bagRows().length} produtos visíveis).`, 'ok');
    } else if (target === 'highlight') {
      let row = null;
      try {
        row = S.bagRow ? el.closest(S.bagRow) : null;
      } catch (_) {
        row = null;
      }
      row = row || sel.repeatingAncestor(el);
      if (!row) throw new Error('o botão precisa estar dentro de um produto da sacola');
      const btn = el.closest(dom.CLICKABLE) || el;
      S.highlightRel = sel.pathTo(btn, row);
      S.highlightText = dom.text(btn).length <= 25 ? dom.text(btn) : '';
      if (!S.bagRow) S.bagRow = sel.listSelector(row);
      log(`Botão de destaque aprendido${S.highlightText ? ` ("${S.highlightText}")` : ''}.`, 'ok');
    }
    save.config();
  }

  // ---------------------------------------------------------------- painel
  const host = document.createElement('div');
  host.id = 'sla-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const inPanel = (node) => node === host || (node && host.contains(node));

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .panel { position: fixed; top: 80px; right: 16px; width: 360px; max-height: 80vh; display: flex; flex-direction: column;
      background: #fff; color: #222; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.25); z-index: 2147483647;
      font-size: 13px; overflow: hidden; border: 1px solid #f0d0c8; }
    .head { background: #ee4d2d; color: #fff; padding: 8px 10px; display: flex; align-items: center; gap: 8px; cursor: move; user-select: none; }
    .head b { flex: 1; font-size: 14px; }
    .head .dot { width: 8px; height: 8px; border-radius: 50%; background: #ffd2c7; }
    .head .dot.on { background: #6dffa0; box-shadow: 0 0 6px #6dffa0; }
    .head button { background: rgba(255,255,255,.2); color: #fff; border: 0; border-radius: 4px; padding: 2px 8px; cursor: pointer; }
    .tabs { display: flex; border-bottom: 1px solid #eee; }
    .tabs button { flex: 1; border: 0; background: none; padding: 8px 4px; cursor: pointer; color: #666; font-size: 12px; }
    .tabs button.on { color: #ee4d2d; border-bottom: 2px solid #ee4d2d; font-weight: 600; }
    .body { overflow: auto; padding: 10px; flex: 1; }
    .bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
    button.b { border: 1px solid #ee4d2d; background: #fff; color: #ee4d2d; border-radius: 5px; padding: 4px 8px; cursor: pointer; font-size: 12px; }
    button.b.p { background: #ee4d2d; color: #fff; }
    button.b:disabled { opacity: .4; cursor: default; }
    .req { border: 1px solid #eee; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; display: grid;
      grid-template-columns: auto 1fr auto; gap: 2px 8px; align-items: center; }
    .code { font-weight: 700; font-size: 16px; color: #ee4d2d; min-width: 34px; }
    .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { grid-column: 2 / 4; color: #888; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acts { display: flex; gap: 4px; }
    .pill { font-size: 10px; padding: 1px 6px; border-radius: 9px; background: #eee; color: #555; margin-left: 4px; }
    .pill.novo { background: #fff3cd; color: #8a6100; } .pill.na_sacola { background: #d4f5dd; color: #1b6b34; }
    .pill.erro { background: #fde2e1; color: #b3261e; } .pill.fila, .pill.adicionando { background: #dbe8ff; color: #1d4fb8; }
    .pill.desconhecido, .pill.ignorado { background: #eee; color: #777; } .pill.verificar { background: #ffe9d6; color: #9a4b00; }
    .row { display: flex; gap: 6px; align-items: center; border-bottom: 1px solid #f3f3f3; padding: 5px 0; }
    .row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row.cur { background: #fff4f1; }
    textarea, input[type=text], input[type=number] { width: 100%; border: 1px solid #ddd; border-radius: 5px; padding: 5px; font-size: 12px; }
    textarea { font-family: ui-monospace, monospace; min-height: 90px; }
    h4 { margin: 12px 0 6px; font-size: 12px; text-transform: uppercase; color: #999; letter-spacing: .04em; }
    .ok { color: #1b6b34; } .no { color: #b3261e; }
    .log div { font-size: 11px; padding: 2px 0; border-bottom: 1px dotted #eee; } .log .erro { color: #b3261e; } .log .ok { color: #1b6b34; }
    .muted { color: #999; font-size: 11px; }
    label.chk { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
    ol.steps { margin: 4px 0; padding-left: 18px; font-size: 11px; color: #555; }
    .rec { color: #b3261e; font-weight: 600; }
    .min .tabs, .min .body { display: none; }
  `;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const STATUS_LABEL = {
    novo: 'novo',
    desconhecido: 'fora do catálogo',
    fila: 'na fila',
    adicionando: 'adicionando…',
    na_sacola: 'na sacola',
    verificar: 'adicionado?',
    erro: 'erro',
    ignorado: 'ignorado',
  };
  const STATUS_ORDER = ['adicionando', 'fila', 'novo', 'erro', 'verificar', 'na_sacola', 'desconhecido', 'ignorado'];

  function tabPedidos() {
    const list = Object.values(requests).sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.count - a.count || b.last - a.last
    );
    const pending = list.filter((r) => r.status === 'novo').length;
    const rows = list
      .map((r) => {
        const item = findItem(r.code);
        const canAdd = item && !['fila', 'adicionando', 'na_sacola'].includes(r.status);
        const who = r.users.slice(0, 3).join(', ') + (r.users.length > 3 ? ` +${r.users.length - 3}` : '');
        return `<div class="req">
          <div class="code">#${esc(r.code)}</div>
          <div class="name">${item ? esc(item.name) : '<i class="muted">não está no catálogo</i>'}
            <span class="pill ${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span></div>
          <div class="acts">
            ${canAdd ? `<button class="b p" data-a="add" data-c="${esc(r.code)}">+ Sacola</button>` : ''}
            <button class="b" data-a="hl" data-c="${esc(r.code)}" title="Destacar">★</button>
            <button class="b" data-a="ignore" data-c="${esc(r.code)}" title="Ignorar">✕</button>
          </div>
          <div class="meta" title="${esc(r.error || r.lastText)}">${r.count}× pedido${who ? ' · ' + esc(who) : ''}${
            r.error && r.status === 'erro' ? ' · ' + esc(r.error) : r.lastText ? ' · “' + esc(r.lastText) + '”' : ''
          }</div>
        </div>`;
      })
      .join('');
    return `
      <div class="bar">
        <label class="chk"><input type="checkbox" data-a="auto" ${config.auto.add ? 'checked' : ''}> Adicionar automático</label>
        <button class="b p" data-a="addAll" ${pending ? '' : 'disabled'}>+ Todos novos (${pending})</button>
        <button class="b" data-a="clear">Limpar</button>
      </div>
      ${rows || '<p class="muted">Nenhum pedido ainda. Os códigos digitados no chat aparecem aqui.</p>'}
      <h4>Simular mensagem</h4>
      <div class="bar"><input type="text" id="sim" placeholder="ex.: quero o #3"><button class="b" data-a="sim">Testar</button></div>`;
  }

  function tabSacola() {
    const rows = bagRows();
    const list = rows
      .map(
        (r, i) => `<div class="row ${i === ui.current ? 'cur' : ''}">
          <span title="${esc(dom.text(r))}">${i === ui.current ? '★ ' : ''}${esc(dom.text(r).split('\n').slice(0, 2).join(' · '))}</span>
          <button class="b ${i === ui.current ? 'p' : ''}" data-a="hlRow" data-i="${i}">Destacar</button></div>`
      )
      .join('');
    return `
      <div class="bar">
        <button class="b" data-a="prev">◀ Anterior</button>
        <button class="b p" data-a="next">Próximo ▶</button>
        <input type="text" id="hlcode" placeholder="código" style="width:80px"><button class="b" data-a="hlCode">Destacar</button>
      </div>
      <p class="muted">Atalhos: Alt+↓ próximo · Alt+↑ anterior · Alt+Shift+L mostra/esconde o painel</p>
      ${
        config.selectors.bagRow
          ? list || '<p class="muted">Nenhum produto visível. Abra a lista da sacola na página da live.</p>'
          : '<p class="no">Ensine a sacola na aba Config.</p>'
      }`;
  }

  function tabCatalogo() {
    const items = catalog
      .map(
        (i) => `<div class="row"><b style="min-width:34px;color:#ee4d2d">#${esc(i.code)}</b><span title="${esc(
          i.search
        )}">${esc(i.name)}</span>${i.search ? `<span class="muted" style="flex:0 0 auto">busca: ${esc(i.search)}</span>` : ''}</div>`
      )
      .join('');
    return `
      <p class="muted">Cole linhas <b>codigo;nome;busca</b>. “busca” é o que digitar na pesquisa de adicionar produto (nome ou ID do anúncio); vazio = usa o nome.</p>
      <textarea id="csv" placeholder="1;Camiseta Dry Fit Preta;\n2;Caneca Térmica 500ml;7712345678">${esc(catalogLib.toCsv(catalog))}</textarea>
      <div class="bar" style="margin-top:6px">
        <button class="b p" data-a="csvSave">Salvar catálogo</button>
        <button class="b" data-a="fromBag" title="Numera 1, 2, 3… os produtos visíveis na sacola">Gerar da sacola</button>
      </div>
      <h4>${catalog.length} produtos</h4>${items}`;
  }

  function tabConfig() {
    const S = config.selectors;
    const st = (ok) => (ok ? '<b class="ok">✔</b>' : '<b class="no">✖</b>');
    const steps = (rec.active ? rec.steps : config.flows.add).map((s) => `<li>${esc(describeStep(s))}</li>`).join('');
    return `
      <h4>1. Ensinar a página</h4>
      <div class="row">${st(S.chatContainer)}<span>Chat da live ${chat.el ? '<span class="ok">(lendo)</span>' : ''}</span><button class="b" data-a="teach" data-t="chat">Ensinar</button></div>
      <div class="row">${st(S.bagRow)}<span>Lista da sacola</span><button class="b" data-a="teach" data-t="bag">Ensinar</button></div>
      <div class="row">${st(S.highlightRel || S.highlightText)}<span>Botão destacar ${S.highlightText ? '“' + esc(S.highlightText) + '”' : ''}</span><button class="b" data-a="teach" data-t="highlight">Ensinar</button></div>

      <h4>2. Gravar “adicionar à sacola”</h4>
      <p class="muted">Escreva o nome (ou o texto de busca) de um produto, clique em Gravar e faça na página todo o caminho para colocá-lo na sacola: abrir “adicionar produto”, digitar na busca, marcar o resultado e confirmar. Depois clique em Parar.</p>
      <div class="bar">
        <input type="text" id="example" placeholder="produto de exemplo" value="${esc(rec.example || config.flowExample)}" style="flex:1">
        ${
          rec.active
            ? '<button class="b p" data-a="recStop">■ Parar</button>'
            : '<button class="b p" data-a="recStart">● Gravar</button>'
        }
      </div>
      ${rec.active ? '<p class="rec">● Gravando…</p>' : ''}
      ${steps ? `<ol class="steps">${steps}</ol>` : '<p class="muted">Nenhum fluxo gravado.</p>'}
      <div class="bar"><input type="text" id="testcode" placeholder="código" style="width:80px"><button class="b" data-a="testFlow" ${
        config.flows.add.length ? '' : 'disabled'
      }>Testar fluxo</button></div>

      <h4>3. Leitura do chat</h4>
      <label class="chk"><input type="checkbox" data-a="opt" data-k="allowBare" ${config.parse.allowBare ? 'checked' : ''}> Aceitar mensagem só com número (“5”, “1, 3 e 5”)</label>
      <label class="chk"><input type="checkbox" data-a="opt" data-k="onlyCatalog" ${config.parse.onlyCatalog ? 'checked' : ''}> Ignorar códigos fora do catálogo</label>
      <div class="bar"><span class="muted">Regex extra (grupo 1 = código):</span><input type="text" id="regex" value="${esc(config.parse.customRegex)}" placeholder="ex.: (kit\\d+)"></div>
      <div class="bar"><span class="muted">Auto-adicionar após</span><input type="number" id="minreq" min="1" value="${config.auto.minRequests}" style="width:60px"><span class="muted">pedido(s)</span><button class="b" data-a="saveParse">Salvar</button></div>

      <h4>Backup da configuração</h4>
      <div class="bar"><button class="b" data-a="export">Exportar</button><button class="b" data-a="import">Importar</button><button class="b" data-a="reset">Zerar tudo</button></div>
      <textarea id="cfgjson" placeholder="JSON da configuração" style="min-height:50px"></textarea>`;
  }

  function tabLog() {
    return `<div class="log">${logs.map((l) => `<div class="${l.kind}">${esc(l.t)} — ${esc(l.msg)}</div>`).join('') || '<p class="muted">Sem atividade.</p>'}</div>`;
  }

  const TABS = { pedidos: ['Pedidos', tabPedidos], sacola: ['Sacola', tabSacola], catalogo: ['Catálogo', tabCatalogo], config: ['Config', tabConfig], log: ['Log', tabLog] };

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render(false);
    });
  }

  function render(force) {
    const panel = shadow.querySelector('.panel');
    if (!panel) return;
    panel.classList.toggle('min', ui.minimized);
    const pending = Object.values(requests).filter((r) => r.status === 'novo').length;
    shadow.querySelector('.dot').classList.toggle('on', !!(chat.el && chat.el.isConnected));
    shadow.querySelector('.tabs').innerHTML = Object.entries(TABS)
      .map(([k, [label]]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${label}${k === 'pedidos' && pending ? ` (${pending})` : ''}</button>`)
      .join('');
    // não redesenha abas com campos de edição enquanto a pessoa digita
    const editing = shadow.activeElement && /^(INPUT|TEXTAREA)$/.test(shadow.activeElement.tagName) && shadow.activeElement.type !== 'checkbox';
    if (!force && (editing || ui.tab === 'catalogo' || (ui.tab === 'config' && !rec.active))) return;
    shadow.querySelector('.body').innerHTML = TABS[ui.tab][1]();
  }

  function mountPanel() {
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="panel">
        <div class="head"><span class="dot" title="Chat conectado"></span><b>Assistente de Live</b>
          <button data-a="min" title="Minimizar">–</button></div>
        <div class="tabs"></div>
        <div class="body"></div>
      </div>`;
    const panel = shadow.querySelector('.panel');
    if (ui.x != null) Object.assign(panel.style, { left: ui.x + 'px', top: ui.y + 'px', right: 'auto' });
    document.documentElement.appendChild(host);

    // arrastar pelo cabeçalho
    const head = shadow.querySelector('.head');
    head.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = panel.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const move = (ev) => {
        ui.x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - dx));
        ui.y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - dy));
        Object.assign(panel.style, { left: ui.x + 'px', top: ui.y + 'px', right: 'auto' });
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        save.ui();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    shadow.addEventListener('click', onPanelClick);
    shadow.addEventListener('change', onPanelChange);
    shadow.addEventListener('keydown', (e) => {
      e.stopPropagation(); // atalhos da página não disparam enquanto digita no painel
      if (e.key === 'Enter' && e.target.id === 'sim') shadow.querySelector('[data-a=sim]').click();
      if (e.key === 'Enter' && e.target.id === 'hlcode') shadow.querySelector('[data-a=hlCode]').click();
    });
    render(true);
  }

  const val = (id) => (shadow.getElementById(id) || {}).value || '';

  async function onPanelClick(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      ui.tab = tabBtn.dataset.tab;
      save.ui();
      return render(true);
    }
    const b = e.target.closest('[data-a]');
    if (!b || b.type === 'checkbox') return;
    const code = b.dataset.c;
    try {
      switch (b.dataset.a) {
        case 'min':
          ui.minimized = !ui.minimized;
          save.ui();
          return render(true);
        case 'add':
          return enqueueAdd(code);
        case 'addAll':
          return Object.values(requests)
            .filter((r) => r.status === 'novo')
            .forEach((r) => enqueueAdd(r.code));
        case 'hl':
          return highlightCode(code);
        case 'ignore':
          requests[code].status = 'ignorado';
          save.requests();
          return render(true);
        case 'clear':
          if (!confirm('Apagar todos os pedidos desta live?')) return;
          requests = {};
          queue.length = 0;
          save.requests();
          return render(true);
        case 'sim': {
          const found = handleChatText(val('sim'));
          log(found.length ? `Simulação: códigos ${found.join(', ')}` : 'Simulação: nenhum código reconhecido.', found.length ? 'ok' : 'erro');
          return render(true);
        }
        case 'next':
          return highlightStep(1);
        case 'prev':
          return highlightStep(-1);
        case 'hlRow':
          return highlightRow(bagRows()[+b.dataset.i]);
        case 'hlCode':
          return highlightCode(codes.canon(val('hlcode')));
        case 'csvSave':
          catalog = catalogLib.parseCatalog(val('csv'));
          save.catalog();
          for (const r of Object.values(requests)) {
            if (r.status === 'desconhecido' && findItem(r.code)) r.status = 'novo';
            else if (r.status === 'novo' && !findItem(r.code)) r.status = 'desconhecido';
          }
          save.requests();
          log(`Catálogo salvo: ${catalog.length} produtos.`, 'ok');
          return render(true);
        case 'fromBag': {
          const rows = bagRows();
          if (!rows.length) return log('Nenhum produto visível na sacola.', 'erro');
          catalog = rows.map((r, i) => ({ code: String(i + 1), name: dom.text(r).split('\n')[0].slice(0, 80), search: '' }));
          save.catalog();
          log(`Catálogo gerado com ${catalog.length} produtos da sacola. Revise os nomes.`, 'ok');
          return render(true);
        }
        case 'teach':
          return startTeach(b.dataset.t);
        case 'recStart':
          return startRecording(val('example').trim());
        case 'recStop':
          return stopRecording();
        case 'testFlow': {
          const c = codes.canon(val('testcode'));
          if (!findItem(c)) return log(`Código ${c || '(vazio)'} não está no catálogo.`, 'erro');
          if (requests[c] && requests[c].status !== 'fila') requests[c].status = 'novo';
          return enqueueAdd(c);
        }
        case 'saveParse':
          config.parse.customRegex = val('regex').trim();
          config.auto.minRequests = Math.max(1, parseInt(val('minreq'), 10) || 1);
          save.config();
          return log('Opções salvas.', 'ok');
        case 'export':
          shadow.getElementById('cfgjson').value = JSON.stringify({ config, catalog }, null, 1);
          return;
        case 'import': {
          const data = JSON.parse(val('cfgjson'));
          config = mergeConfig(data.config || data);
          if (Array.isArray(data.catalog)) catalog = data.catalog;
          save.config();
          save.catalog();
          chat.el = null;
          attachChat();
          log('Configuração importada.', 'ok');
          return render(true);
        }
        case 'reset':
          if (!confirm('Zerar configuração, catálogo e pedidos?')) return;
          config = structuredClone(DEFAULT_CONFIG);
          catalog = [];
          requests = {};
          save.config();
          save.catalog();
          save.requests();
          if (chat.observer) chat.observer.disconnect();
          chat.el = null;
          return render(true);
      }
    } catch (err) {
      log(err.message, 'erro');
    }
  }

  function onPanelChange(e) {
    const b = e.target;
    if (b.dataset.a === 'auto') {
      config.auto.add = b.checked;
      save.config();
      log(b.checked ? 'Adição automática LIGADA.' : 'Adição automática desligada.', b.checked ? 'ok' : 'info');
      if (b.checked) {
        Object.values(requests)
          .filter((r) => r.status === 'novo' && r.count >= config.auto.minRequests)
          .forEach((r) => enqueueAdd(r.code));
      }
    } else if (b.dataset.a === 'opt') {
      config.parse[b.dataset.k] = b.checked;
      save.config();
    }
  }

  // ---------------------------------------------------------------- atalhos
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || teach.active) return;
      if (e.shiftKey && e.code === 'KeyL') {
        host.style.display = host.style.display === 'none' ? '' : 'none';
        e.preventDefault();
      } else if (!e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        highlightStep(e.key === 'ArrowDown' ? 1 : -1);
      }
    },
    true
  );

  // ---------------------------------------------------------------- início
  (async () => {
    config = mergeConfig(await store.get('sla.config', null));
    catalog = await store.get('sla.catalog', []);
    requests = await store.get('sla.requests', {});
    ui = { ...ui, ...(await store.get('sla.ui', {})) };
    // pedidos que ficaram "na fila" de uma sessão anterior voltam a "novo"
    for (const r of Object.values(requests)) if (['fila', 'adicionando'].includes(r.status)) r.status = 'novo';
    mountPanel();
    attachChat();
    setInterval(() => {
      attachChat(); // a Shopee troca o chat de lugar ao navegar
      refreshBagStatus();
      if (ui.tab === 'sacola') scheduleRender();
    }, 2500);
  })();
})();
