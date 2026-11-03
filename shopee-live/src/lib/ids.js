// Extrai IDs de produto (formato AAA-BBB-CCC) de mensagens do chat da live.
//
// Exemplos:
//   "Adiciona esse CLH-NZK-QPT"  -> ["CLH-NZK-QPT"]
//   "adiciona:clh-nzk-qpt!"      -> ["CLH-NZK-QPT"]
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const ID_RE = /(?<![A-Z0-9-])[A-Z]{3}-[A-Z]{3}-[A-Z]{3}(?![A-Z0-9-])/gi;

  // Devolve os IDs canônicos (maiúsculos), sem repetidos, na ordem em que aparecem.
  function extractIds(text) {
    const found = new Set();
    for (const m of String(text || '').matchAll(ID_RE)) found.add(m[0].toUpperCase());
    return [...found];
  }

  SLA.ids = { extractIds };
})(typeof window !== 'undefined' ? window : globalThis);
