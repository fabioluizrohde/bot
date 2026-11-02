// Catálogo da live: liga o código que o cliente digita no chat ao produto.
//
// Formato aceito (CSV colado no painel; separador ; , ou TAB):
//   codigo;nome;busca
//   1;Camiseta Dry Fit Preta;Camiseta Dry Fit
//   2;Caneca Térmica 500ml;7712345678
//
// "busca" é o texto digitado na pesquisa de "adicionar produto" da Shopee
// (nome ou ID do anúncio). Se ficar vazio, usa o nome.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  function splitLine(line, delim) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  function detectDelimiter(line) {
    const counts = [';', '\t', ','].map((d) => [d, line.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }

  function parseCatalog(text) {
    const canon = SLA.codes.canon;
    const lines = String(text || '')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    if (!lines.length) return [];
    const delim = detectDelimiter(lines[0]);
    const items = [];
    lines.forEach((line, idx) => {
      const [code, name = '', search = ''] = splitLine(line, delim);
      if (idx === 0 && /^(c[oó]d|code|sku|ref)/i.test(code)) return; // cabeçalho
      if (!code) return;
      items.push({ code: canon(code), name, search });
    });
    // último vence em caso de código repetido
    const byCode = new Map(items.map((i) => [i.code, i]));
    return [...byCode.values()];
  }

  function toCsv(items) {
    const q = (s) => (/[;"\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    return ['codigo;nome;busca', ...items.map((i) => [i.code, i.name, i.search].map((v) => q(v || '')).join(';'))].join(
      '\n'
    );
  }

  SLA.catalog = { parseCatalog, toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
