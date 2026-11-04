// Marca na live (modal "Adicionar produtos relacionados" > "Meus Favoritos") os produtos do lote.
// NUNCA clica em "Confirmar" nem "Cancelar": só nas caixinhas dos cards; quem confirma é o Fabio.
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  const WAIT_TILE_MS = 2500; // espera pela janelinha depois do clique simulado no bloco "Produtos"
  const WAIT_USER_MS = 120000; // espera pelo clique do apresentador no bloco "Produtos"
  const MSG_CLIQUE_PRODUTOS = 'Clique no bloco "Produtos" (coluna da esquerda): eu continuo sozinha.';

  // ---------- Funções puras (testadas) ----------

  // cards: [{name, checked, ...}]. Devolve {status, card}: ambíguo ou nenhum -> 'conferir'.
  function decide(pageName, cards, nameMatches) {
    const match = nameMatches || (SLA.match && SLA.match.nameMatches);
    const achados = (cards || []).filter((c) => match(pageName, c.name));
    if (achados.length !== 1) return { status: 'conferir', card: null };
    const card = achados[0];
    return { status: card.checked ? 'ja_na_sacola' : 'marcado', card };
  }

  // Mesmo nome de produto (sem acento/caixa/reticências)?
  function sameName(a, b) {
    const n = SLA.match.normalizeName;
    const x = n(a);
    return !!x && x === n(b);
  }

  // Dois registros são o MESMO card? Pela posição na grade (estável ao rolar); sem posição, pelo nó.
  // null = identidade desconhecida.
  function samePlace(e, c) {
    if (e.pos && c.pos) return Math.abs(e.pos.x - c.pos.x) <= 3 && Math.abs(e.pos.y - c.pos.y) <= 3;
    if (e.node !== undefined && c.node !== undefined) return e.node === c.node;
    return null;
  }

  // Junta o que foi visto agora (snapshot) ao já coletado. Mesmo nome + mesma posição = o mesmo card
  // revisto; mesmo nome em outra posição (mesmo em outra janela de rolagem) = outro card, que conta
  // (assim a ambiguidade é detectada). Sem identidade conhecida, vale a contagem por snapshot.
  function mergeCards(coletados, snapshot) {
    const out = coletados.slice();
    const usados = new Set();
    for (const c of snapshot) {
      const k = SLA.match.normalizeName(c.name);
      const achou = out.find(
        (e) => !usados.has(e) && SLA.match.normalizeName(e.name) === k && samePlace(e, c) !== false
      );
      if (achou) usados.add(achou);
      else { out.push(c); usados.add(c); }
    }
    return out;
  }

  // O texto do botão clicado é exatamente o do "Confirmar"?
  function isConfirmText(txt, confirmText) {
    return String(txt == null ? '' : txt).trim().toLowerCase() === String(confirmText).trim().toLowerCase();
  }

  // ---------- Comportamento no navegador (sem teste automático) ----------

  const D = () => SLA.dom;
  const S = () => SLA.selectors;

  function openModals() {
    return [...document.querySelectorAll(S().modalRoot)].filter((m) => D().visible(m));
  }

  function modalWith(label) {
    return openModals().find((m) => D().findClickableByText(m, label)) || null;
  }

  function isDisabled(el) {
    return !!(el && el.closest('[disabled], [aria-disabled="true"], [class*="disabled"]'));
  }

  // Posição do card no conteúdo rolável (não muda ao rolar).
  function posOf(el, scroller) {
    if (!scroller) return null;
    const r = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return { x: Math.round(r.left - sr.left + scroller.scrollLeft), y: Math.round(r.top - sr.top + scroller.scrollTop) };
  }

  // Cards da grade: sobe de cada checkbox até o maior ancestral que só tem esse checkbox.
  function collectCards(modal, scroller) {
    if (!modal) return [];
    const s = S();
    const out = [];
    for (const cb of modal.querySelectorAll(s.gridCheckbox)) {
      let el = cb;
      while (el.parentElement && el.parentElement !== modal && el.parentElement.querySelectorAll(s.gridCheckbox).length === 1) {
        el = el.parentElement;
      }
      const nomes = [...el.querySelectorAll(s.gridCardName)].map((n) => D().text(n)).filter(Boolean);
      if (!nomes.length) continue;
      out.push({ name: nomes[0], checkbox: cb, node: cb, pos: posOf(el, scroller), el, get checked() { return !!cb.checked; } });
    }
    return out;
  }

  // Abre Produtos > Lista de produtos > Adicionar produtos relacionados > Meus Favoritos.
  // Reconhece passos já abertos (o popover Produtos alterna a cada clique).
  // opts.onWaitUser(texto): chamado quando a página não aceita o clique simulado no bloco "Produtos"
  // (conferido em 2026-11-03: só abre com clique real); o apresentador clica e a extensão continua.
  async function openFavorites(opts) {
    const d = D();
    const s = S();
    const o = opts || {};
    const fav = () => modalWith(s.favoritesTabText);
    const related = () => modalWith(s.addRelatedText);

    if (!fav()) {
      if (!related()) {
        const listBtn = () => d.findClickableByText(document, s.listButtonText);
        if (!listBtn()) {
          const tile = d.findClickableByText(document, s.toolsProducts);
          if (!tile) throw new Error('Não consegui abrir Produtos: bloco não encontrado na página');
          if (isDisabled(tile)) throw new Error('A live parece encerrada (o bloco Produtos está desativado)');
          d.realClick(tile); // tentativa simulada (a página costuma exigir clique real)
        }
        let lb = await d.waitFor(listBtn, WAIT_TILE_MS);
        if (!lb) {
          if (typeof o.onWaitUser === 'function') o.onWaitUser(MSG_CLIQUE_PRODUTOS);
          lb = await d.waitFor(listBtn, WAIT_USER_MS);
        }
        if (!lb) throw new Error('Não consegui abrir a Lista de produtos: clique no bloco "Produtos" e tente de novo');
        d.realClick(lb);
        if (!(await d.waitFor(related, 6000))) throw new Error('Não consegui abrir a lista de produtos da live');
      }
      const addBtn = d.findClickableByText(related(), s.addRelatedText);
      if (!addBtn) throw new Error('Não consegui abrir "' + s.addRelatedText + '"');
      d.realClick(addBtn);
      if (!(await d.waitFor(fav, 8000))) throw new Error('Não consegui abrir "' + s.addRelatedText + '"');
    }
    const tab = d.findClickableByText(fav(), s.favoritesTabText);
    if (tab) d.realClick(tab);
    const ok = await d.waitFor(() => collectCards(fav()).length > 0, 8000);
    if (!ok) throw new Error('Não consegui abrir a aba "' + s.favoritesTabText + '"');
    return fav();
  }

  function findScroller(modal) {
    const cb = modal.querySelector(S().gridCheckbox);
    for (let el = cb && cb.parentElement; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    }
    return modal;
  }

  async function markFavorites(items, opts) {
    const d = D();
    const modal = await openFavorites(opts);
    const scroller = findScroller(modal);

    // Uma passada pela grade inteira, juntando os cards por NOME (nó do DOM pode ser reciclado).
    scroller.scrollTop = 0;
    let todos = [];
    const coleta = () => {
      todos = mergeCards(todos, collectCards(modal, scroller));
      return false; // continua rolando até o fim
    };
    coleta();
    await d.scrollUntil(scroller, coleta);
    coleta();

    // Nome ATUAL do card daquele checkbox (null se o nó saiu da grade).
    const atual = (cb) => collectCards(modal).find((c) => c.checkbox === cb) || null;

    // Espera a caixinha ficar marcada por até ~1,5 s.
    const marcou = async (cb) => !!(await d.waitFor(() => cb.checked, 1500, 100));

    const results = [];
    for (const it of items) {
      const { status, card } = decide(it.name, todos);
      if (status === 'conferir') { results.push({ id: it.id, status }); continue; }
      // Só age num card cujo nome ATUAL foi reconfirmado (lista virtual pode reciclar os nós).
      let cur = atual(card.checkbox);
      if (!(cur && sameName(cur.name, card.name))) {
        scroller.scrollTop = 0;
        const achados = () => collectCards(modal).filter((c) => sameName(c.name, card.name));
        if (!(await d.scrollUntil(scroller, () => achados().length > 0)) || achados().length !== 1) {
          results.push({ id: it.id, status: 'conferir' });
          continue;
        }
        cur = achados()[0];
      }
      const cb = cur.checkbox;
      if (cb.checked) { results.push({ id: it.id, status: 'ja_na_sacola' }); continue; }
      d.realClick(cb);
      let ok = await marcou(cb);
      if (!ok) { // às vezes só o rótulo responde: tenta UMA vez, só no label do próprio checkbox
        const label = cb.closest('label');
        const agora = atual(cb);
        if (label && !(agora && sameName(agora.name, card.name))) {
          results.push({ id: it.id, status: 'conferir' }); // o card mudou: para de clicar
          continue;
        }
        if (label) {
          d.realClick(label);
          ok = await marcou(cb);
        }
      }
      results.push({ id: it.id, status: ok ? 'marcado' : 'conferir' });
    }
    return results;
  }

  // Só ESCUTA o clique do usuário no "Confirmar" do modal (nunca clica). Devolve a função de cancelar.
  // Cancela sozinho quando a tela de Adicionar Produtos (aba Meus Favoritos) fecha e então chama onStop.
  function watchConfirm(onConfirm, onStop) {
    const s = S();
    let ativo = true;
    let timer = null;
    function parar() {
      if (!ativo) return;
      ativo = false;
      document.removeEventListener('click', onClick, true);
      if (timer) clearInterval(timer);
    }
    function onClick(e) {
      const t = e.target;
      if (!t || typeof t.closest !== 'function' || !t.closest(s.modalRoot)) return;
      const btn = t.closest(SLA.dom.CLICKABLE) || t;
      if (!isConfirmText(SLA.dom.text(btn), s.confirmText)) return;
      try { onConfirm(); } catch (_) { /* ignora */ }
    }
    document.addEventListener('click', onClick, true);
    timer = setInterval(() => {
      if (modalWith(s.favoritesTabText)) return;
      parar();
      if (typeof onStop === 'function') {
        try { onStop(); } catch (_) { /* ignora */ }
      }
    }, 500);
    return parar;
  }

  SLA.addProducts = { decide, sameName, mergeCards, isConfirmText, markFavorites, watchConfirm };
  if (typeof module !== 'undefined' && module.exports) module.exports = SLA.addProducts;
})(typeof window !== 'undefined' ? window : globalThis);
