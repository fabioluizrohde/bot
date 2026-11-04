# Assistente de Live Shopee — painel da sacola (fase 2, Recurso B)

Data: 2026-11-03 · Ramo: `feature/shopee-live-extension` · Pasta: `shopee-live/`
Continua o spec `2026-11-03-shopee-live-pedidos-por-id-e-painel-design.md` (Recurso A, já implementado e testado na live real).

## Objetivo

Durante a live, o apresentador (Fabio, afiliado; transmite pelo celular e usa a página `https://live.shopee.com.br/pc/live?session=<id>` no PC) precisa **trocar o produto que está no ar sem procurar numa lista**. O painel da extensão passa a mostrar toda a sacola, numerada, e a troca é um clique no cartão do produto. O lote de IDs do Recurso A ganha um botão **Adicionar à sacola** que substitui "clicar em Produtos + Confirmar".

Decisões do Fabio (2026-11-03):
- Trocar o produto por **clique no cartão** (botão Mostrar em cada cartão).
- Abordagem **2**: ler e agir pelas chamadas internas da página, com a tela (modais) como reserva.
- A sacola pode ter até **100 produtos** (o `max_items: 30` visto na API é o mínimo de afiliado novo): ler o limite da API, nunca fixar número.
- Nada muda na live sem um clique do Fabio.

Fora de escopo: roteiro/linha do tempo de destaque automático, cupons, respostas no chat, desfavoritar, qualquer ação sem clique.

## O que a sondagem da página real mostrou (2026-11-03)

- A página carrega a sacola por `GET /webapi/v1/session/<sessionId>/host/items` (fetch na mesma origem, com `credentials: 'include'`). Resposta: `{ err_code, err_msg, data: { items: [...], has_more, next_offset, total_count, max_items, max_id } }`.
- Cada item traz: `id` (numeração 1..N, igual ao ID da tabela da Lista de produtos), `item_id`, `shop_id`, `name`, `image`, `price`, `price_min`/`price_max` (+ `_before_discount`), `discount`, `comm_rate`, `sold`, `status`, `is_oos`, `is_del`, `is_unlisted`, `affiliate`. O item **não** diz se está no ar.
- Outros caminhos vistos: `/session/<n>/items/<itemId>/detail`, `/session/<n>/sp_items`, `/session/<n>/group/show`, `/session/<n>/voucher/resident`, `/session/<n>/activity_info`.
- Pela tela: "Mostrar" (colocar no ar) está em cada linha da Lista de produtos, que só abre com um **clique real** no bloco Produtos (clique simulado não abre); os botões seguintes aceitam clique simulado. O produto já na sacola aparece marcado **e desativado** na grade de "Adicionar Produtos".

**A descobrir** (precisa de uma live de teste no ar e do Fabio fazendo as ações à mão, com um observador de fetch/XHR que só anota método, caminho e chaves do corpo): chamada de **colocar no ar**, chamada de **adicionar à sacola**, e **como saber qual produto está no ar**.

## Arquitetura

Reaproveita as peças da fase 1 (painel em shadow DOM em `src/live/panel.js` com `registerTab`, coordenador em `src/background/`, `SLA.dom`, `SLA.selectors`). Peças novas em `shopee-live/src/live/`:

1. **`bag.js` — leitor da sacola.** `readBag(sessionId, fetchFn)` lê todas as páginas (`has_more`/`next_offset`) e devolve `{ items, maxItems, total }`. Função pura `normalizeBag(json)` transforma a resposta em cartões `{ n, itemId, shopId, name, image, price, priceBefore, outOfStock, removed }`. Erros viram um resultado `{ ok:false, reason }`, nunca exceção para a interface.
2. **`onair.js` — produto no ar.** Enquanto a regra da Shopee for desconhecida, marca o último produto que o Fabio colocou no ar **pelo painel**; quando a observação descobrir a fonte oficial, passa a usá-la. A interface do módulo (`getOnAir(): itemId | null`) não muda.
3. **`actions.js` — ações com dois caminhos.** `showItem(itemId)` e `addItems(items)` devolvem `{ ok, via: 'api' | 'tela', erro? }`. Caminho `api`: chamada interna (a descobrir). Caminho `tela`: o fluxo de modais já existente (`addProducts.js`; para "Mostrar", abrir a Lista de produtos pelo mesmo mecanismo, com o pedido de clique real em Produtos quando necessário). Função pura `chooseRoute({ apiAllowed, apiKnown })` decide o caminho.
4. **Aba "Sacola" no painel** (`registerTab`). Cartões em ordem da sacola: número grande, foto, nome, preço, etiqueta "No ar" e botão **Mostrar**. Campo de busca por número ou nome (filtro local, sem chamada). Contador "N de máx". Atualização automática só de leitura, espaçada, parada com a aba escondida, e logo depois de qualquer ação; botão "Atualizar".
5. **Aba "Lote"** ganha **Adicionar à sacola**: usa `addItems` com os produtos do lote já favoritados (substitui "Marcar na live" + Confirmar; o fluxo atual vira o caminho `tela`).

## Comportamento e erros

| Situação | Comportamento |
|---|---|
| Leitura falha | "Não consegui ler a sacola" + Tentar de novo; a última lista fica na tela, marcada "desatualizada" |
| Trocar produto: chamada interna falha | Usa o caminho pela tela; se também falhar, avisa e não muda nada |
| Shopee diz ok mas a lista não mostra a mudança | "Confira na tela da Shopee"; nunca marca "No ar" às cegas |
| Produto fora de estoque ou removido | Cartão apagado, Mostrar desligado |
| Sacola cheia ao adicionar o lote | Avisa quantos cabem; não adiciona nada pela metade sem o Fabio ver |
| Produto do lote já na sacola | Conta como "já estava na sacola"; não adiciona de novo |
| Live encerrada ou caída | Para de atualizar; "live encerrada"; ações desligadas |
| Cliques rápidos em vários cartões | Só a última escolha vale; "trocando…" até confirmar |

## Regras de segurança

- A atualização automática só **lê**. Colocar no ar e adicionar só com clique do Fabio.
- Leitura espaçada (a própria página já lê a mesma lista) e parada com a aba escondida.
- Resposta inesperada de uma chamada interna → desliga o caminho `api` naquela live e usa só a tela (`apiAllowed = false` até recarregar).
- Cada ação registra o que fez num histórico visível no painel.
- A extensão não guarda nem envia dados para fora; tudo fica no navegador.

## Testes

- Unidade (`npm test`): `normalizeBag` (inclui 100 itens, várias páginas, item removido/sem estoque, resposta inválida), filtro de busca por número/nome, `chooseRoute` e o desligamento do caminho `api`, regra "última escolha vale" nos cliques rápidos.
- E2E (mocks no formato real): sacola de 100 cartões, busca, troca com sucesso e com falha da chamada (cai na tela), lote adicionado; não executado enquanto o Playwright não estiver instalado (decisão anterior).
- Observação na live de teste (obrigatória antes de escrever as ações pela chamada interna) e teste na live real, como na fase 1: lista curta, algumas trocas, lote pequeno, parando antes do que for irreversível.

## Ordem de entrega (cada etapa funciona sozinha)

1. Aba "Sacola" **só de leitura** (leitor, cartões, busca, contador, "No ar" pelo último escolhido). Não depende da observação.
2. **Trocar o produto no ar** (depende da observação para o caminho `api`; o caminho `tela` pode sair antes).
3. **Adicionar à sacola** no lote (idem).

## Riscos e pontos em aberto

- Chamadas internas podem mudar sem aviso; por isso o caminho `tela` fica sempre disponível e o `api` se desliga sozinho em caso de dúvida.
- Usar chamadas internas aumenta o risco para a conta em relação a clicar na tela: a primeira etapa só lê, e as ações só ligam depois de a observação mostrar como elas funcionam.
- A fonte de "qual está no ar" é desconhecida (ver "A descobrir"); até lá vale o último escolhido pelo painel, que pode divergir se o Fabio trocar pela tela da Shopee.
- O limite real da sacola (30 a 100) depende da conta; sempre lido de `max_items`.
- Se uma página da sacola vier maior que o esperado (muitas páginas), a leitura pode ficar lenta; a primeira etapa mede isso na live real.
