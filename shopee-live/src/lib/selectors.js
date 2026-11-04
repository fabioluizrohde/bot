// Seletores e textos da página da Shopee. Centralizados aqui para facilitar o ajuste
// quando a Shopee mudar o visual. As classes têm sufixo com hash: usar sempre PREFIXO ([class*="..."]).
// Valores sem marca vieram da página real (live.shopee.com.br/pc/live, conferido em 2026-11-03).
// Valores com "PROBE-PENDING" são palpites: confirmar na página real com o Fabio (Tarefa 10).
(function (root) {
  const SLA = (root.SLA = root.SLA || {});

  SLA.selectors = {
    // --- Página da live (conferido em 2026-11-03) ---
    liveHost: 'live.shopee.com.br',
    chatContent: 'comment-content', // prefixo de classe do contêiner da lista do chat
    toolsProducts: 'Produtos', // texto do bloco na coluna Ferramentas (abre/fecha o popover a cada clique)
    listButtonText: 'Lista de produtos',
    addRelatedText: 'Adicionar produtos relacionados',
    favoritesTabText: 'Meus Favoritos',
    modalRoot: '.shopee-react-modal',
    confirmText: 'Confirmar',

    // --- Palpites, a confirmar ---
    gridCardName: '[class*="productCardName"]', // conferido em 2026-11-03: nome do produto no card (div.productCardName_xxxxx)
    // conferido em 2026-11-03: o input fica dentro de label.eds-react-checkbox; produto já na sacola vem marcado E desativado
    gridCheckbox: 'input[type="checkbox"]',
    shopeeSearchInput: 'input.shopee-searchbar-input__input', // conferido na página real em 2026-11-03: acha 1 campo na home
    favoriteButton: 'Favoritar', // conferido em 2026-11-03: texto "Favoritar (N)" dentro de um button; o rótulo não muda ao favoritar
    // Coração cheio = path com fill vermelho; vazio = path com fill="none" (conferido na página real em 2026-11-03).
    // "[class*=filled]" fica só para os mocks de teste.
    favoriteFilledMark: 'svg path[fill="#FF424F"], [class*="filled"]',
    captchaMarker: 'iframe[src*="verify"], [class*="captcha"], [class*="verify"]', // PROBE-PENDING: verificação/captcha
  };
})(typeof window !== 'undefined' ? window : globalThis);
