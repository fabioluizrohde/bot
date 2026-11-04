// Sacola da live: cartões, busca e preço a partir da resposta da Shopee (funções puras, sem DOM).
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  // A resposta traz só o código da foto (ex.: "br-11134207-7r98o-..."). Endereço conferido na página
  // real em 2026-11-03: https://cf.shopee.com.br/file/<código> devolve a foto (200, image/jpeg).
  const IMG_BASE = 'https://cf.shopee.com.br/file/';

  function imageUrl(hash) {
    return IMG_BASE + hash;
  }

  function sessionIdFromHref(href) {
    const m = /[?&]session=(\d+)(?![\d])/.exec(String(href || ''));
    return m ? m[1] : null;
  }

  // "1234.5" -> "R$1.234,50"; vazio/inválido -> "".
  function formatPrice(s) {
    if (s === null || s === undefined || String(s).trim() === '') return '';
    const n = Number(s);
    if (!Number.isFinite(n)) return '';
    const [int, dec] = n.toFixed(2).split('.');
    return 'R$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  }

  function has(v) {
    return v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));
  }

  // Devolve { text, low } — texto do preço (único ou faixa) e o menor valor numérico (para comparar).
  function range(min, max, single) {
    let a = min;
    let b = max;
    if (!has(a) && !has(b)) a = b = single;
    else if (!has(a)) a = b;
    else if (!has(b)) b = a;
    if (!has(a)) return { text: '', low: NaN, high: NaN };
    const lo = Number(a);
    const hi = Number(b);
    const text = lo === hi ? formatPrice(a) : formatPrice(a) + ' – ' + formatPrice(b);
    return { text, low: lo, high: hi };
  }

  function toCard(it) {
    const now = range(it.price_min, it.price_max, it.price);
    const before = range(it.price_min_before_discount, it.price_max_before_discount, it.price_before_discount);
    const showBefore = before.text !== '' && now.text !== '' && before.high > now.high;
    return {
      n: Number(it.id),
      itemId: Number(it.item_id),
      shopId: Number(it.shop_id),
      name: String(it.name || ''),
      image: String(it.image || ''),
      price: now.text,
      priceBefore: showBefore ? before.text : '',
      discount: Number(it.discount) || 0,
      outOfStock: !!it.is_oos,
      removed: !!(it.is_del || it.is_unlisted || it.is_prohibited),
      raw: it, // item original da Shopee, mesma referência (volta intacto como corpo de pedidos)
    };
  }

  // O número do produto na sacola (id) precisa ser um número de verdade (ou texto numérico).
  function hasValidId(it) {
    const id = it.id;
    if (typeof id === 'number') return Number.isFinite(id);
    return typeof id === 'string' && id.trim() !== '' && Number.isFinite(Number(id));
  }

  function normalizeBag(json) {
    if (!json || json.err_code !== 0) return null;
    const data = json.data;
    if (!data || typeof data !== 'object') return null;
    // Sacola vazia: sucesso, com os campos de uma sacola, mas sem a lista (ausente ou nula).
    const temCamposDeSacola = ['total_count', 'max_items', 'has_more'].some((k) => k in data);
    const lista = data.items == null && temCamposDeSacola ? [] : data.items;
    if (!Array.isArray(lista)) return null;
    const items = lista
      .filter((it) => it && typeof it === 'object' && hasValidId(it)) // sem número válido: ignora (não mostra "NaN")
      .map(toCard).sort((a, b) => a.n - b.n);
    return {
      items,
      total: Number(data.total_count) || items.length,
      maxItems: Number(data.max_items) || 0,
      hasMore: !!data.has_more,
      nextOffset: Number(data.next_offset) || 0,
    };
  }

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function filterBag(items, query) {
    const q = String(query || '').trim();
    if (!q) return items;
    if (/^\d+$/.test(q)) return items.filter((c) => c.n === Number(q));
    const nq = norm(q);
    return items.filter((c) => norm(c.name).includes(nq));
  }

  const MAX_PAGES = 20;

  // Ida e volta com a ponte da página (pageBridge.js): posta `msg` (ganha um id único) e espera a
  // resposta da própria página. Resolve com a resposta crua da ponte; rejeita só por tempo esgotado
  // ou falha ao postar. Sempre remove o ouvinte e limpa o timer.
  function bridgeRoundTrip(win, msg, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = 'sla-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      let timer = null;
      const onMessage = (ev) => {
        const d = ev && ev.data;
        if (!ev || ev.source !== win || ev.origin !== win.location.origin) return;
        if (!d || d.source !== 'sla-bridge' || d.id !== id) return;
        done();
        resolve(d);
      };
      function done() {
        if (timer) clearTimeout(timer);
        timer = null;
        win.removeEventListener('message', onMessage);
      }
      win.addEventListener('message', onMessage);
      timer = setTimeout(() => {
        done();
        reject(new Error('sem resposta da página'));
      }, timeoutMs);
      try {
        win.postMessage({ ...msg, source: 'sla-ext', id }, win.location.origin);
      } catch (e) {
        done();
        reject(e);
      }
    });
  }

  // fetch que passa pela ponte da página (pageBridge.js): a Shopee recusa pedidos diretos da extensão.
  function makeBridgeFetch(win, opts) {
    const timeoutMs = (opts && opts.timeoutMs) || 10000;
    return async function bridgeFetch(url) {
      const u = new URL(String(url), win.location.origin);
      const path = u.pathname + u.search;
      const d = await bridgeRoundTrip(win, { type: 'fetch', path }, timeoutMs);
      if (d.ok === false && d.status === 0) throw new Error(d.error || 'ponte indisponível');
      const text = String(d.text === undefined || d.text === null ? '' : d.text);
      return {
        ok: !!d.ok,
        status: Number(d.status) || 0,
        json: async () => JSON.parse(text),
        text: async () => text,
      };
    };
  }

  // Espera pela resposta do Mostrar: maior que os 15 s do pedido feito na página (pageBridge.js),
  // para chegar o veredito da própria ponte (inclusive "tempo esgotado") antes de a extensão desistir.
  const SHOW_TIMEOUT_MS = 20000;

  // Resposta da ponte a um pedido de escrita -> resultado. Sucesso só com HTTP 2xx e err_code 0.
  function interpretWrite(d) {
    if (d.ok === false && d.status === 0) {
      if (d.error === 'pedido recusado' || d.error === 'pedido invalido') return { ok: false, reason: 'recusado' };
      return { ok: false, reason: 'rede', detail: String(d.error || 'ponte indisponível') };
    }
    if (!d.ok) return { ok: false, reason: 'http', detail: String(Number(d.status) || 0) };
    let json;
    try {
      json = JSON.parse(String(d.text === undefined || d.text === null ? '' : d.text));
    } catch (e) {
      return { ok: false, reason: 'http', detail: 'resposta inesperada' };
    }
    if (!json || typeof json !== 'object') return { ok: false, reason: 'http', detail: 'resposta inesperada' };
    if (json.err_code !== 0) return { ok: false, reason: 'http', detail: 'err_code ' + json.err_code };
    return { ok: true };
  }

  const ADD_MAX_ITEMS = 20;

  // Manda a Shopee mostrar o produto na live (pela ponte). Nunca lança nem rejeita.
  async function showItem(sessionId, card, win, opts) {
    try {
      const raw = card && card.raw;
      if (typeof sessionId !== 'string' || !/^\d+$/.test(sessionId)
        || !raw || typeof raw !== 'object'
        || typeof raw.item_id !== 'number' || !Number.isFinite(raw.item_id)
        || typeof raw.shop_id !== 'number' || !Number.isFinite(raw.shop_id)) {
        return { ok: false, reason: 'recusado' };
      }
      const w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) return { ok: false, reason: 'rede', detail: 'sem janela' };
      const timeoutMs = (opts && opts.timeoutMs) || SHOW_TIMEOUT_MS;
      let d;
      try {
        d = await bridgeRoundTrip(w, { type: 'show', path: `/webapi/v1/session/${sessionId}/show`, body: { item: JSON.stringify(raw) } }, timeoutMs);
      } catch (e) {
        return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
      }
      return interpretWrite(d);
    } catch (e) {
      return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
    }
  }

  // Adiciona produtos à sacola (pela ponte, PUT add_items). entries: [{shopId, itemId}], 1 a 20, sem repetir.
  // Nunca lança nem rejeita. Resultados: {ok:true} | {ok:false, reason:'recusado'|'rede'|'http', detail}.
  // Atenção: 'rede' (inclusive por tempo esgotado) NÃO prova que nada foi adicionado: quem chama deve reler a sacola.
  async function addItems(sessionId, entries, win, opts) {
    try {
      const ok = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
      if (typeof sessionId !== 'string' || !/^\d+$/.test(sessionId)
        || !Array.isArray(entries) || entries.length < 1 || entries.length > ADD_MAX_ITEMS
        || !entries.every((e) => e && ok(e.shopId) && ok(e.itemId))
        || new Set(entries.map((e) => e.itemId)).size !== entries.length) {
        return { ok: false, reason: 'recusado' };
      }
      const w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) return { ok: false, reason: 'rede', detail: 'sem janela' };
      const timeoutMs = (opts && opts.timeoutMs) || SHOW_TIMEOUT_MS;
      const body = { items: entries.map((e) => ({ shop_id: e.shopId, item_id: e.itemId })) };
      let d;
      try {
        d = await bridgeRoundTrip(w, { type: 'add', path: `/webapi/v1/session/${sessionId}/add_items`, body }, timeoutMs);
      } catch (e) {
        return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
      }
      return interpretWrite(d);
    } catch (e) {
      return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
    }
  }

  // Fixa UM produto no topo da lista (pela ponte, POST items/pin). entry: {shopId, itemId}.
  // Nunca lança nem rejeita. Resultados: {ok:true} | {ok:false, reason:'recusado'|'rede'|'http', detail}.
  async function pinItem(sessionId, entry, win, opts) {
    try {
      const ok = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
      if (typeof sessionId !== 'string' || !/^\d+$/.test(sessionId)
        || !entry || typeof entry !== 'object' || Array.isArray(entry) || !ok(entry.shopId) || !ok(entry.itemId)) {
        return { ok: false, reason: 'recusado' };
      }
      const w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) return { ok: false, reason: 'rede', detail: 'sem janela' };
      const timeoutMs = (opts && opts.timeoutMs) || SHOW_TIMEOUT_MS;
      const body = { items: [{ item_id: entry.itemId, shop_id: entry.shopId }] };
      let d;
      try {
        d = await bridgeRoundTrip(w, { type: 'pin', path: `/webapi/v1/session/${sessionId}/items/pin`, body }, timeoutMs);
      } catch (e) {
        return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
      }
      return interpretWrite(d);
    } catch (e) {
      return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
    }
  }

  // Remove UM produto da sacola (pela ponte, DELETE items). itemId: inteiro positivo.
  // Nunca lança nem rejeita. Resultados: {ok:true} | {ok:false, reason:'recusado'|'rede'|'http', detail}.
  async function removeItem(sessionId, itemId, win, opts) {
    try {
      if (typeof sessionId !== 'string' || !/^\d+$/.test(sessionId)
        || typeof itemId !== 'number' || !Number.isSafeInteger(itemId) || itemId <= 0) {
        return { ok: false, reason: 'recusado' };
      }
      const w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) return { ok: false, reason: 'rede', detail: 'sem janela' };
      const timeoutMs = (opts && opts.timeoutMs) || SHOW_TIMEOUT_MS;
      let d;
      try {
        d = await bridgeRoundTrip(w, { type: 'remove', path: `/webapi/v1/session/${sessionId}/items`, body: { item_ids: [itemId] } }, timeoutMs);
      } catch (e) {
        return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
      }
      return interpretWrite(d);
    } catch (e) {
      return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
    }
  }

  // Lê a sacola inteira (com paginação de segurança). Nunca lança: devolve { ok:false, reason }.
  async function readBag(sessionId, fetchFn) {
    // Sem fetch injetado: usa a ponte da página (resolvida na hora da chamada).
    const doFetch = fetchFn
      || (typeof window !== 'undefined' ? makeBridgeFetch(window) : (typeof fetch === 'function' ? fetch : null));
    if (!doFetch) return { ok: false, reason: 'rede', detail: 'sem fetch' };
    const byN = new Map();
    let total = 0;
    let maxItems = 0;
    let offset = 0;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `/webapi/v1/session/${sessionId}/host/items?visible=true&offset=${offset}&limit=1000`;
        let res;
        try {
          res = await doFetch(url, { credentials: 'include' });
        } catch (e) {
          return { ok: false, reason: 'rede', detail: String((e && e.message) || e) };
        }
        if (!res.ok) return { ok: false, reason: 'http', detail: String(res.status) };
        let json;
        try {
          json = await res.json();
        } catch (e) {
          return { ok: false, reason: 'formato', detail: 'json' };
        }
        const r = normalizeBag(json);
        if (!r) return { ok: false, reason: 'formato' };
        for (const c of r.items) if (!byN.has(c.n)) byN.set(c.n, c);
        total = r.total;
        maxItems = r.maxItems;
        if (!r.hasMore || r.nextOffset <= offset) break;
        offset = r.nextOffset;
      }
      const items = [...byN.values()].sort((a, b) => a.n - b.n);
      return { ok: true, items, total: Math.max(total, items.length), maxItems };
    } catch (e) {
      return { ok: false, reason: 'formato', detail: String((e && e.message) || e) };
    }
  }

  SLA.bag = { IMG_BASE, imageUrl, sessionIdFromHref, formatPrice, normalizeBag, filterBag, readBag, makeBridgeFetch, showItem, addItems, pinItem, removeItem, ADD_MAX_ITEMS, SHOW_TIMEOUT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.bag;
})(typeof window !== 'undefined' ? window : globalThis);
