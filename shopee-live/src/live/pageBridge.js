// Ponte com a página: roda no mundo da própria página da live (manifest "world": "MAIN").
// A Shopee recusa (403) pedidos feitos direto pela extensão; o fetch da própria página funciona.
// Esta ponte faz só DOIS tipos de pedido, ambos restritos:
//  - leitura (GET, fetch da página): a lista da sacola;
//  - escrita (POST, XMLHttpRequest da página): "Mostrar" um item, em /session/<n>/show, com o
//    corpo validado (o item exatamente como veio da lista da sacola).
// Não copia nem inventa cabeçalhos de segurança (só Content-Type). Não depende de nenhum outro
// arquivo da extensão.
(function () {
  const bridge = {};

  // Só este caminho relativo (sem endereço, sem "//", sem "..", sem outros caracteres).
  const PATH_RE = /^\/webapi\/v1\/session\/\d+\/host\/items(\?[A-Za-z0-9_=&.-]*)?$/;

  function isAllowedBridgePath(path) {
    return typeof path === 'string' && PATH_RE.test(path);
  }

  function reply(id, extra) {
    return { source: 'sla-bridge', id, ok: false, status: 0, text: '', ...extra };
  }

  async function handleBridgeRequest(data, fetchFn) {
    if (!data || typeof data !== 'object' || data.source !== 'sla-ext' || data.type !== 'fetch') {
      return reply(data && typeof data === 'object' ? data.id : undefined, { error: 'pedido invalido' });
    }
    if (!isAllowedBridgePath(data.path)) return reply(data.id, { error: 'caminho nao permitido' });
    try {
      const res = await fetchFn(data.path, { credentials: 'include' });
      const text = await res.text();
      return { source: 'sla-bridge', id: data.id, ok: !!res.ok, status: Number(res.status) || 0, text };
    } catch (e) {
      return reply(data.id, { error: String((e && e.message) || e) });
    }
  }

  // ---- Escrita restrita: "Mostrar" o item (POST) ----
  const SHOW_RE = /^\/webapi\/v1\/session\/\d+\/show$/;
  const SHOW_MAX = 20000;

  function isAllowedShowPath(path) {
    return typeof path === 'string' && SHOW_RE.test(path);
  }

  function validateShowBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    if (!Number.isFinite(body.item_id) || !Number.isFinite(body.shop_id)) return false;
    try {
      const s = JSON.stringify(body);
      return typeof s === 'string' && s.length <= SHOW_MAX;
    } catch (e) {
      return false;
    }
  }

  function handleShowRequest(data, getXhr) {
    if (!data || typeof data !== 'object' || data.source !== 'sla-ext' || data.type !== 'show') {
      return Promise.resolve(reply(data && typeof data === 'object' ? data.id : undefined, { error: 'pedido invalido' }));
    }
    if (!isAllowedShowPath(data.path) || !validateShowBody(data.body)) {
      return Promise.resolve(reply(data.id, { error: 'pedido recusado' }));
    }
    return new Promise((resolve) => {
      let feito = false;
      const fim = (r) => { if (!feito) { feito = true; resolve(r); } };
      try {
        const x = new (getXhr())();
        x.onloadend = () => {
          const status = Number(x.status) || 0;
          fim({ source: 'sla-bridge', id: data.id, ok: status >= 200 && status <= 299, status, text: String(x.responseText || '') });
        };
        x.onerror = () => fim(reply(data.id, { error: 'erro de rede' }));
        x.ontimeout = () => fim(reply(data.id, { error: 'tempo esgotado' }));
        x.onabort = () => fim(reply(data.id, { error: 'cancelado' }));
        x.open('POST', data.path, true);
        x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        x.withCredentials = true;
        x.timeout = 15000;
        x.send(JSON.stringify(data.body));
      } catch (e) {
        fim(reply(data.id, { error: String((e && e.message) || e) }));
      }
    });
  }

  bridge.isAllowedBridgePath = isAllowedBridgePath;
  bridge.isAllowedShowPath = isAllowedShowPath;
  bridge.validateShowBody = validateShowBody;
  bridge.handleShowRequest = handleShowRequest;
  bridge.handleBridgeRequest = handleBridgeRequest;

  if (typeof module !== 'undefined' && module.exports) module.exports = bridge;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const FLAG = '__slaPageBridgeInstalled';
      if (!window[FLAG]) {
        window[FLAG] = true;
        window.addEventListener('message', (ev) => {
          try {
            const d = ev && ev.data;
            if (ev.source !== window || ev.origin !== location.origin) return;
            if (!d || d.source !== 'sla-ext') return;
            if (d.type === 'fetch') {
              // window.fetch é resolvido na hora do pedido: usa o fetch da própria página.
              handleBridgeRequest(d, (p, o) => window.fetch(p, o))
                .then((result) => window.postMessage(result, location.origin))
                .catch(() => { /* nunca lança */ });
            } else if (d.type === 'show') {
              // XMLHttpRequest da página (o único cliente que a Shopee aceita), resolvido na hora.
              handleShowRequest(d, () => window.XMLHttpRequest)
                .then((result) => window.postMessage(result, location.origin))
                .catch(() => { /* nunca lança */ });
            }
          } catch (e) { /* nunca lança */ }
        });
      }
    } catch (e) { /* a ponte é opcional */ }
  }
})();
