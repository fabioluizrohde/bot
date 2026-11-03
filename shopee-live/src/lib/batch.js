// Estado puro de um lote de IDs de produto da live. Sem chrome.* e sem DOM:
// toda função devolve um objeto novo e nunca altera o que recebeu.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const STATUS = {
    NA_FILA: 'na_fila',
    FAVORITADO: 'favoritado',
    JA_FAVORITADO: 'ja_favoritado',
    ADICIONADO: 'adicionado',
    JA_NA_SACOLA: 'ja_na_sacola',
    CONFERIR: 'conferir',
    NAO_ACHEI: 'nao_achei',
  };

  const MARCAVEIS = [STATUS.FAVORITADO, STATUS.JA_FAVORITADO];

  function createBatch(ids, opts) {
    const o = opts || {};
    const unicos = [...new Set(ids || [])];
    if (!unicos.length) throw new Error('lote vazio');
    const now = typeof o.now === 'number' ? o.now : Date.now();
    return {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      openIn: o.openIn || 'tab',
      createdAt: now,
      phase: 'resolving',
      paused: false,
      items: unicos.map((id) => ({ id, status: STATUS.NA_FILA })),
    };
  }

  function nextPending(b) {
    return b.items.find((i) => i.status === STATUS.NA_FILA) || null;
  }

  function setItem(b, id, patch) {
    return { ...b, items: b.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
  }

  function resolvedItems(b) {
    return b.items.filter((i) => MARCAVEIS.includes(i.status));
  }

  function advancePhase(b) {
    if (b.phase === 'resolving') {
      if (nextPending(b)) return { ...b };
      return { ...b, phase: resolvedItems(b).length ? 'adding' : 'done' };
    }
    if (b.phase === 'adding' && !resolvedItems(b).length) return { ...b, phase: 'done' };
    return { ...b };
  }

  function summarize(b) {
    const porStatus = {};
    for (const i of b.items) porStatus[i.status] = (porStatus[i.status] || 0) + 1;
    return { total: b.items.length, porStatus };
  }

  SLA.batch = { STATUS, createBatch, nextPending, setItem, resolvedItems, advancePhase, summarize };
})(typeof window !== 'undefined' ? window : globalThis);
