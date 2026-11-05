// Produtos protegidos (🔒) e escolha dos "últimos N" para a remoção em lote. Funções puras, sem DOM nem chrome.*.
// Os produtos protegidos nunca saem da sacola por ação da extensão; o produto "No ar" também nunca sai.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const LIMITES = [5, 10, 15, 20];

  const idValido = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

  // itemIds de todos os itens da sacola (válidos, sem repetir): o que já estava na sacola ao abrir a live.
  function initialSnapshot(itens) {
    if (!Array.isArray(itens)) return [];
    const vistos = new Set();
    const out = [];
    for (const c of itens) {
      if (!c || !idValido(c.itemId) || vistos.has(c.itemId)) continue;
      vistos.add(c.itemId);
      out.push(c.itemId);
    }
    return out;
  }

  function isProtected(protegidos, itemId) {
    if (!Array.isArray(protegidos) || itemId == null) return false;
    const v = String(itemId);
    return protegidos.some((p) => String(p) === v);
  }

  // Liga/desliga a proteção de um produto. Devolve um array novo.
  function toggle(protegidos, itemId) {
    const lista = Array.isArray(protegidos) ? protegidos : [];
    if (isProtected(lista, itemId)) return lista.filter((p) => String(p) !== String(itemId));
    return [...lista, itemId];
  }

  // Itens que podem ser removidos: não protegidos e que não são o produto No ar. Esgotados e removidos entram.
  function removables(itens, protegidos, noAr) {
    if (!Array.isArray(itens)) return [];
    return itens.filter((c) => c && c.itemId != null
      && !isProtected(protegidos, c.itemId)
      && !(noAr != null && String(c.itemId) === String(noAr)));
  }

  // Os N últimos (de maior número na sacola) entre os removíveis, em ordem decrescente de número.
  function pickLast(itens, protegidos, noAr, n) {
    const alvo = Math.max(0, Number(n) || 0);
    const cards = removables(itens, protegidos, noAr)
      .slice()
      .sort((a, b) => b.n - a.n)
      .slice(0, alvo);
    return { ids: cards.map((c) => c.itemId), cards, faltam: Math.max(0, alvo - cards.length) };
  }

  SLA.protect = { LIMITES, initialSnapshot, isProtected, toggle, removables, pickLast };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.protect;
})(typeof window !== 'undefined' ? window : globalThis);
