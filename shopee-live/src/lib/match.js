// Casamento de nomes de produto: o nome do card na grade "Adicionar Produtos"
// vem truncado pela página (com "…" ou "..."), então basta ser prefixo do título.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  // Minúsculas, sem acentos, espaços únicos, sem reticências no final.
  function normalizeName(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*(…|\.{3})$/, '')
      .trim();
  }

  // Verdadeiro se o nome do card (possivelmente truncado) for prefixo do nome da página.
  function nameMatches(pageName, cardName) {
    const card = normalizeName(cardName);
    const page = normalizeName(pageName);
    if (!card || !page) return false;
    return page.startsWith(card);
  }

  SLA.match = { normalizeName, nameMatches };
})(typeof window !== 'undefined' ? window : globalThis);
