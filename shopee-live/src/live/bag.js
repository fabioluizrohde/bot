// Sacola da live: cartões, busca e preço a partir da resposta da Shopee (funções puras, sem DOM).
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  // PROBE-PENDING: a resposta traz só o código da foto (ex.: "sg-11134201-..."); o endereço
  // da foto ainda não foi confirmado na página real.
  const IMG_BASE = 'https://down-br.img.susercontent.com/file/';

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
    };
  }

  function normalizeBag(json) {
    if (!json || json.err_code !== 0) return null;
    const data = json.data;
    if (!data || !Array.isArray(data.items)) return null;
    const items = data.items
      .filter((it) => it && typeof it === 'object')
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

  // Lê a sacola inteira (com paginação de segurança). Nunca lança: devolve { ok:false, reason }.
  async function readBag(sessionId, fetchFn) {
    const doFetch = fetchFn || (typeof fetch === 'function' ? fetch : null);
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

  SLA.bag = { IMG_BASE, imageUrl, sessionIdFromHref, formatPrice, normalizeBag, filterBag, readBag };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.bag;
})(typeof window !== 'undefined' ? window : globalThis);
