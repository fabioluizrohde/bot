// Ponte com a página: roda no mundo da própria página da live (manifest "world": "MAIN").
// A Shopee recusa (403) pedidos feitos direto pela extensão; o fetch da própria página funciona.
// Esta ponte faz UM único pedido, só de leitura (GET): a lista da sacola. Não copia nem inventa
// cabeçalhos de segurança. Não depende de nenhum outro arquivo da extensão.
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

  bridge.isAllowedBridgePath = isAllowedBridgePath;
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
            if (!d || d.source !== 'sla-ext' || d.type !== 'fetch') return;
            // window.fetch é resolvido na hora do pedido: usa o fetch da própria página.
            handleBridgeRequest(d, (p, o) => window.fetch(p, o))
              .then((result) => window.postMessage(result, location.origin))
              .catch(() => { /* nunca lança */ });
          } catch (e) { /* nunca lança */ }
        });
      }
    } catch (e) { /* a ponte é opcional */ }
  }
})();
