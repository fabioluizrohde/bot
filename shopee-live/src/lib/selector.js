// Gera seletores CSS a partir de elementos clicados no modo "ensinar".
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const cssEscape = (s) => (root.CSS && root.CSS.escape ? root.CSS.escape(s) : String(s).replace(/([^\w-])/g, '\\$1'));

  function stableClasses(el) {
    return [...el.classList]
      .filter((c) => c && c.length < 40 && !/^sla-/.test(c) && !/(hover|active|focus|selected|pinned|highlight)/i.test(c))
      .slice(0, 3);
  }

  // tag + classes estáveis, sem posição. Ex.: "div.chat-item.row"
  function signature(el) {
    const cls = stableClasses(el).map((c) => '.' + cssEscape(c)).join('');
    return el.tagName.toLowerCase() + cls;
  }

  function stableId(el) {
    return el.id && el.id.length < 40 && !/\d{3,}/.test(el.id) && !/[:]/.test(el.id);
  }

  function step(el, withId) {
    if (withId && stableId(el)) return '#' + cssEscape(el.id);
    let s = signature(el);
    const parent = el.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.matches(s));
      if (same.length > 1) s += `:nth-child(${[...parent.children].indexOf(el) + 1})`;
    }
    return s;
  }

  // Caminho de "ancestor" (exclusivo) até "el". Sem ancestor: até o documento.
  function pathTo(el, ancestor) {
    if (!el || el === ancestor) return '';
    const parts = [];
    let cur = el;
    while (cur && cur !== ancestor && cur.nodeType === 1 && cur !== document.documentElement) {
      const s = step(cur, !ancestor);
      parts.unshift(s);
      if (!ancestor && s.startsWith('#')) break;
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  // Menor sufixo do caminho que ainda identifica unicamente o elemento.
  function uniquePath(el) {
    const parts = pathTo(el).split(' > ');
    for (let i = parts.length - 1; i >= 0; i--) {
      const cand = parts.slice(i).join(' > ');
      try {
        const found = document.querySelectorAll(cand);
        if (found.length === 1 && found[0] === el) return cand;
      } catch (_) {
        /* continua */
      }
    }
    return parts.join(' > ');
  }

  // Sobe a partir de "el" até achar o item de uma lista (elemento cujo pai tem
  // vários filhos com a mesma assinatura). Escolhe o nível com mais "irmãos";
  // no empate fica com o mais próximo do clique (evita pegar colunas do layout).
  function repeatingAncestor(el, maxDepth) {
    let best = null;
    let bestCount = 1;
    let cur = el;
    for (let d = 0; cur && cur.parentElement && d < (maxDepth || 12); d++, cur = cur.parentElement) {
      if (cur === document.body) break;
      const sig = signature(cur);
      const count = [...cur.parentElement.children].filter((c) => c.matches(sig)).length;
      if (count >= 2 && count > bestCount) {
        best = cur;
        bestCount = count;
      }
    }
    return best;
  }

  // Seletor que casa com todos os itens da mesma lista de "row".
  function listSelector(row) {
    return uniquePath(row.parentElement) + ' > ' + signature(row);
  }

  SLA.selector = { signature, pathTo, uniquePath, repeatingAncestor, listSelector };
})(typeof window !== 'undefined' ? window : globalThis);
