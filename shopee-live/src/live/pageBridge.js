// Ponte com a página: roda no mundo da própria página da live (manifest "world": "MAIN").
// A Shopee recusa (403) pedidos feitos direto pela extensão; o fetch da própria página funciona.
// Esta ponte faz só QUATRO tipos de pedido, todos restritos:
//  - leitura (GET, fetch da página): a lista da sacola;
//  - escrita (PUT, XMLHttpRequest da página): "Mostrar" um item, em /session/<n>/show, com o
//    corpo validado ({item: "<o item da lista da sacola, convertido em texto JSON>"});
//  - escrita (PUT, XMLHttpRequest da página): adicionar à sacola, em /session/<n>/add_items, só com
//    {items:[{shop_id,item_id}]} (até 20, inteiros positivos);
//  - escrita (POST, XMLHttpRequest da página): fixar UM item no topo, em /session/<n>/items/pin, só com
//    {items:[{item_id,shop_id}]} (exatamente 1, inteiros positivos).
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

  // ---- Escrita restrita: "Mostrar" o item (PUT) ----
  const SHOW_RE = /^\/webapi\/v1\/session\/\d+\/show$/;
  const SHOW_MAX = 20000;

  function isAllowedShowPath(path) {
    return typeof path === 'string' && SHOW_RE.test(path);
  }

  // Formato real do Mostrar (conferido na live em 2026-11-04): {"item": "<produto convertido em texto JSON>"}.
  // O texto precisa ser o JSON de um objeto com item_id e shop_id numéricos, até 20000 caracteres, e nada mais no corpo.
  function validateShowBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    if (Object.keys(body).join() !== 'item') return false;
    const t = body.item;
    if (typeof t !== 'string' || t.length === 0 || t.length > SHOW_MAX) return false;
    let it;
    try {
      it = JSON.parse(t);
    } catch (e) {
      return false;
    }
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
    return Number.isFinite(it.item_id) && Number.isFinite(it.shop_id);
  }

  // Pedido de escrita pela XMLHttpRequest da página, com método e corpo já validados por quem chama.
  function xhrWrite(method, data, getXhr) {
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
        x.open(method, data.path, true);
        x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        x.withCredentials = true;
        x.timeout = 15000;
        x.send(JSON.stringify(data.body));
      } catch (e) {
        fim(reply(data.id, { error: String((e && e.message) || e) }));
      }
    });
  }

  function handleShowRequest(data, getXhr) {
    if (!data || typeof data !== 'object' || data.source !== 'sla-ext' || data.type !== 'show') {
      return Promise.resolve(reply(data && typeof data === 'object' ? data.id : undefined, { error: 'pedido invalido' }));
    }
    if (!isAllowedShowPath(data.path) || !validateShowBody(data.body)) {
      return Promise.resolve(reply(data.id, { error: 'pedido recusado' }));
    }
    return xhrWrite('POST', data, getXhr); // PUT deu 404 na live real (2026-11-04): a rota do show é POST
  }

  // ---- Escrita restrita: adicionar à sacola (PUT add_items) ----
  // Conferido na live real em 2026-11-04: PUT /webapi/v1/session/<n>/add_items, corpo
  // {items:[{shop_id, item_id}]}, resposta {"err_code":0,"err_msg":"sucesso","data":null}.
  const ADD_RE = /^\/webapi\/v1\/session\/\d+\/add_items$/;
  const ADD_MAX_ITEMS = 20;

  function isAllowedAddPath(path) {
    return typeof path === 'string' && ADD_RE.test(path);
  }

  const idOk = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

  // O corpo só pode ter "items" (1 a 20), cada um só com shop_id e item_id inteiros positivos, sem repetir item_id.
  function validateAddBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    if (Object.keys(body).join() !== 'items') return false;
    const items = body.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > ADD_MAX_ITEMS) return false;
    const vistos = new Set();
    for (const it of items) {
      if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
      if (Object.keys(it).sort().join() !== 'item_id,shop_id') return false;
      if (!idOk(it.item_id) || !idOk(it.shop_id)) return false;
      if (vistos.has(it.item_id)) return false;
      vistos.add(it.item_id);
    }
    return true;
  }

  function handleAddRequest(data, getXhr) {
    if (!data || typeof data !== 'object' || data.source !== 'sla-ext' || data.type !== 'add') {
      return Promise.resolve(reply(data && typeof data === 'object' ? data.id : undefined, { error: 'pedido invalido' }));
    }
    if (!isAllowedAddPath(data.path) || !validateAddBody(data.body)) {
      return Promise.resolve(reply(data.id, { error: 'pedido recusado' }));
    }
    return xhrWrite('PUT', data, getXhr);
  }

  // ---- Escrita restrita: fixar no topo (POST items/pin) ----
  // Conferido na live real em 2026-11-04: é o que o botão nativo "mover para cima" da Shopee envia.
  const PIN_RE = /^\/webapi\/v1\/session\/\d+\/items\/pin$/;

  function isAllowedPinPath(path) {
    return typeof path === 'string' && PIN_RE.test(path);
  }

  // O corpo só pode ter "items" com EXATAMENTE 1 item, só item_id e shop_id inteiros positivos.
  function validatePinBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    if (Object.keys(body).join() !== 'items') return false;
    const items = body.items;
    if (!Array.isArray(items) || items.length !== 1) return false;
    const it = items[0];
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
    if (Object.keys(it).sort().join() !== 'item_id,shop_id') return false;
    return idOk(it.item_id) && idOk(it.shop_id);
  }

  function handlePinRequest(data, getXhr) {
    if (!data || typeof data !== 'object' || data.source !== 'sla-ext' || data.type !== 'pin') {
      return Promise.resolve(reply(data && typeof data === 'object' ? data.id : undefined, { error: 'pedido invalido' }));
    }
    if (!isAllowedPinPath(data.path) || !validatePinBody(data.body)) {
      return Promise.resolve(reply(data.id, { error: 'pedido recusado' }));
    }
    return xhrWrite('POST', data, getXhr);
  }

  bridge.isAllowedPinPath = isAllowedPinPath;
  bridge.validatePinBody = validatePinBody;
  bridge.handlePinRequest = handlePinRequest;
  bridge.isAllowedBridgePath = isAllowedBridgePath;
  bridge.isAllowedShowPath = isAllowedShowPath;
  bridge.validateShowBody = validateShowBody;
  bridge.handleShowRequest = handleShowRequest;
  bridge.isAllowedAddPath = isAllowedAddPath;
  bridge.validateAddBody = validateAddBody;
  bridge.handleAddRequest = handleAddRequest;
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
            } else if (d.type === 'add') {
              handleAddRequest(d, () => window.XMLHttpRequest)
                .then((result) => window.postMessage(result, location.origin))
                .catch(() => { /* nunca lança */ });
            } else if (d.type === 'pin') {
              handlePinRequest(d, () => window.XMLHttpRequest)
                .then((result) => window.postMessage(result, location.origin))
                .catch(() => { /* nunca lança */ });
            }
          } catch (e) { /* nunca lança */ }
        });
      }
    } catch (e) { /* a ponte é opcional */ }
  }
})();
