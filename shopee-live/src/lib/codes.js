// Extrai códigos de produto de mensagens do chat da live.
//
// Exemplos reconhecidos (com as opções padrão):
//   "#5"                     -> 5
//   "quero o 12"             -> 12
//   "quero o 3 e o 7"        -> 3, 7
//   "cod 45" / "código: A12" -> 45 / A12
//   "item 8", "produto 9"    -> 8 / 9
//   "4"  (mensagem só com o número, se allowBare = true)
//   "1, 3 e 5" (só números, se allowBare = true) -> 1, 3, 5
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Forma canônica de um código: maiúsculo e, se for só dígitos, sem zeros à esquerda.
  function canon(code) {
    const c = String(code || '').trim().toUpperCase();
    if (/^\d+$/.test(c)) return String(parseInt(c, 10));
    return c;
  }

  const HASH_RE = /#\s?([a-z0-9][a-z0-9-]{0,19})/g;
  // Obs.: "numero"/"no" sozinhos ficam de fora de propósito ("tem no 42?" costuma ser tamanho).
  const KEYWORD_RE =
    /(?:\b(?:cod|codigo|item|produto|prod|ref|referencia)\s*(?:numero|n[º°.]|no)?|(?:^|\s)n[º°])\s*[.:\-º°#]?\s*([a-z0-9]*\d[a-z0-9-]*)/g;
  const WANT_RE =
    /\b(?:quero|qro|qero|kero|manda|separa|reserva|reservar|me ve|me da|pega|add|adiciona)\s+(?:o|a|os|as|um|uma|esse|essa|do|da|no|na)?\s*#?\s*(\d{1,6}(?:\s*(?:,|e|\+|\/)\s*(?:o|a)?\s*#?\s*\d{1,6})*)\b/g;
  const BARE_LIST_RE = /^\s*#?\d{1,6}(?:\s*(?:,|e|\+|\/|\s)\s*#?\d{1,6})*\s*[!.?]*\s*$/;

  // opts:
  //   allowBare     aceita mensagem que é só número ("5" ou "1, 3 e 5")
  //   onlyCatalog   descarta códigos que não estão em catalogCodes
  //   catalogCodes  Set de códigos canônicos do catálogo
  //   customRegex   regex extra (string) cujo grupo 1 é o código
  function parseCodes(text, opts) {
    const o = opts || {};
    const t = normalize(text);
    const found = [];
    const push = (c) => {
      const k = canon(c);
      if (k && !found.includes(k)) found.push(k);
    };

    if (!t) return found;

    for (const m of t.matchAll(HASH_RE)) push(m[1]);
    for (const m of t.matchAll(KEYWORD_RE)) push(m[1]);
    for (const m of t.matchAll(WANT_RE)) {
      for (const n of m[1].match(/\d{1,6}/g) || []) push(n);
    }
    if (o.allowBare && BARE_LIST_RE.test(t)) {
      for (const n of t.match(/\d{1,6}/g) || []) push(n);
    }
    if (o.customRegex) {
      try {
        const re = new RegExp(o.customRegex, 'gi');
        for (const m of t.matchAll(re)) if (m[1]) push(m[1]);
      } catch (_) {
        /* regex inválida: ignora */
      }
    }

    if (o.onlyCatalog && o.catalogCodes) {
      return found.filter((c) => o.catalogCodes.has(c));
    }
    return found;
  }

  // Separa autor e texto de uma mensagem do chat a partir do texto visível.
  function splitAuthor(rawText) {
    const lines = String(rawText || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2 && lines[0].length <= 40) {
      return { author: lines[0].replace(/:$/, ''), body: lines.slice(1).join(' ') };
    }
    const one = lines.join(' ');
    const m = one.match(/^([^:]{1,40}):\s*(.+)$/);
    if (m) return { author: m[1].trim(), body: m[2].trim() };
    return { author: '', body: one };
  }

  SLA.codes = { normalize, canon, parseCodes, splitAuthor };
})(typeof window !== 'undefined' ? window : globalThis);
