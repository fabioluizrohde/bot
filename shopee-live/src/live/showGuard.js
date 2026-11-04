// Travas do modo Mostrar (funções puras, sem DOM): só clique real, um pedido por vez,
// intervalo mínimo entre trocas e desliga após erros seguidos.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const MIN_INTERVAL_MS = 1500;
  const MAX_ERROS = 2;

  function initialGuard() {
    return { emAndamento: false, ultimoEm: -Infinity, errosSeguidos: 0, desligado: false };
  }

  // Ordem das checagens: desligado, simulado, em_andamento, cedo.
  function canShow(g, now, ev) {
    if (g.desligado) return { ok: false, motivo: 'desligado' };
    if (!ev || ev.isTrusted !== true) return { ok: false, motivo: 'simulado' };
    if (g.emAndamento) return { ok: false, motivo: 'em_andamento' };
    if (!(now - g.ultimoEm >= MIN_INTERVAL_MS)) return { ok: false, motivo: 'cedo' };
    return { ok: true };
  }

  function startShow(g, now) {
    return { ...g, emAndamento: true, ultimoEm: now };
  }

  function finishShow(g, resultado) {
    if (resultado && resultado.ok === true) return { ...g, emAndamento: false, errosSeguidos: 0 };
    const errosSeguidos = (g.errosSeguidos || 0) + 1;
    return { ...g, emAndamento: false, errosSeguidos, desligado: g.desligado || errosSeguidos >= MAX_ERROS };
  }

  SLA.showGuard = { MIN_INTERVAL_MS, MAX_ERROS, initialGuard, canShow, startShow, finishShow };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.showGuard;
})(typeof window !== 'undefined' ? window : globalThis);
