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
    gridCardName: '[class*="name"]', // PROBE-PENDING: nome do produto no card da grade de favoritos
    gridCheckbox: 'input[type="checkbox"]', // PROBE-PENDING: checkbox do card (já na sacola vem marcado)
    shopeeSearchInput: 'input.shopee-searchbar-input__input', // PROBE-PENDING: busca da home da Shopee
    favoriteButton: 'Favoritar', // PROBE-PENDING: texto do botão sob as fotos ("Favoritar (N)")
    favoriteFilledMark: '[class*="filled"], svg[fill="currentColor"]', // PROBE-PENDING: coração cheio (já favoritado)
    captchaMarker: 'iframe[src*="verify"], [class*="captcha"], [class*="verify"]', // PROBE-PENDING: verificação/captcha
  };
})(typeof window !== 'undefined' ? window : globalThis);
