# Assistente de Live Shopee — pedidos por ID e painel da sacola

Data: 2026-11-03 · Ramo: `feature/shopee-live-extension` · Pasta: `shopee-live/`

## Objetivo

O Fabio apresenta lives da Shopee como afiliado: os produtos são de terceiros e não há roteiro prévio. Clientes aleatórios pedem, no chat, o **ID do produto** (formato `CLH-NZK-QPT`, obtido no botão Compartilhar do anúncio no app) para um moderador adicionar à sacola. O apresentador transmite pelo celular e usa a página `https://live.shopee.com.br/pc/live?session=<id>` no PC para acompanhar chat e sacola.

Dois recursos, entregues nesta ordem, cada um com seu plano:

- **A. Pedidos por ID em lote**: transformar IDs do chat em produtos na sacola, com o apresentador conduzindo.
- **B. Painel da sacola**: sacola numerada e troca rápida do produto no ar.

Fora de escopo: respostas automáticas no chat, cupons, linha do tempo/roteiro, bot de afiliados e WhatsApp.

## O que a sondagem da página real mostrou (2026-11-03)

- A página é React, sem shadow DOM; o único iframe é vazio. O content script alcança tudo.
- Classes têm sufixo hash (`comment-container_7ca29`, `message-content_3bb92`). Seletores devem usar prefixo: `[class*="comment-container"]`.
- Chat: `ReactVirtualized__List`; só as linhas visíveis existem no DOM.
- Ferramentas → Produtos mostra "N Mostrando" e o botão "Lista de produtos". O modal (`.shopee-react-modal`) tem a tabela `tr.shopee-react-table__row` com ID sequencial (1..N), nome, preço e ações **Remover**, **Mover para cima**, **Mostrar** (destacar). O produto no ar tem a tag "Mostrando" e não tem "Mostrar". A lista **rola** até o fim.
- "Adicionar produtos relacionados" abre o modal "Adicionar Produtos" (abas Meus Favoritos, Minha Loja, Recente, Conjunto, Importar via URL; busca por nome; grade com checkbox; Confirmar).
- A busca por nome desse modal **não** acha o ID. Já a caixa de busca da home de `shopee.com.br` **redireciona** o ID para `shopee.com.br/affiliation-i.<shopId>.<itemId>`; a busca por URL (`/search?keyword=`) não resolve o ID.
- O botão Favoritar (coração, abaixo das fotos) é um **toggle**. Favoritos novos aparecem no topo de Meus Favoritos; produtos já favoritados não sobem.
- Produtos já na sacola vêm pré-marcados no modal.
- O formato do ID é `AAA-BBB-CCC` (3 letras, hífen, 3, hífen, 3). Só foram vistos dois exemplos; maiúsculas e minúsculas são aceitas.

## Arquitetura (abordagem aprovada)

Três peças em MV3, comunicando por mensagens e `chrome.storage.session`:

1. **Painel da live** (content script em `live.shopee.com.br`): painel flutuante e arrastável, leitura da seleção do chat, lista do lote e seus status, leitura/ação nos modais da live (sacola e Adicionar Produtos).
2. **Mão da Shopee** (content script em `shopee.com.br`, fora de `live.`): cola o próximo ID quando o apresentador clica na busca, confere se o produto abriu, lê o estado do coração, favorita se necessário e registra o nome do produto.
3. **Coordenador** (service worker): guarda o lote e o status de cada ID, abre a Shopee (aba nova ou janela separada, configurável; padrão aba nova), traz a aba da live de volta ao fim e fecha a da Shopee. O lote sobrevive a recarregar qualquer página.

Módulos novos/alterados em `shopee-live/src/`:

- `lib/codes.js`: passa a extrair IDs `AAA-BBB-CCC` (com testes); mantém `normalize` e `canon`.
- `lib/ids.js` (ou dentro de `codes.js`): `extractIds(text)` com deduplicação.
- `background.js`: coordenador.
- `shopee/hand.js`: mão da Shopee.
- `live/panel.js`, `live/bag.js`, `live/addProducts.js`: painel, leitura da sacola, adição de produtos.
- `lib/dom.js`: busca por prefixo de classe, espera de elemento, ocultar modal durante a leitura.
- `manifest.json`: `background.service_worker`, permissões `storage` e `tabs`, e dois `content_scripts` (live e Shopee).

Sai o "ensinar seletores" e "gravar fluxo" do `content.js` atual e o catálogo `codigo;nome;busca`. A página real é conhecida, então os seletores são fixos, por prefixo de classe, e ficam concentrados num único arquivo para ajuste rápido.

## Recurso A — Pedidos por ID em lote

Caminho normal:

1. O apresentador seleciona um trecho do chat. A extensão captura a seleção e mostra "N IDs: …", com remoção individual, e o botão **Processar lote**.
2. O coordenador cria o lote (IDs com status `na_fila`) e abre a Shopee (aba ou janela, conforme a configuração).
3. Na Shopee, um aviso flutuante diz "ID k de N: clique na busca". No clique do apresentador, a mão cola o ID, envia a busca, espera o produto abrir, favorita (se ainda não favoritado) e registra o nome. O aviso passa ao ID seguinte.
4. Ao terminar o último, o coordenador fecha a Shopee e volta à aba da live.
5. O painel abre Produtos → Lista de produtos → Adicionar produtos relacionados → Meus Favoritos e marca cada produto do lote **pelo nome** (nunca pela posição), rolando a grade se preciso. Para antes de confirmar e mostra "N marcados, confira e confirme".
6. O apresentador clica em Confirmar (o da Shopee). O painel atualiza os status para `adicionado`.

Status por ID: `na_fila`, `favoritado`, `ja_favoritado`, `nao_achei`, `ja_na_sacola`, `conferir`, `adicionado`.

Tratamento de erros:

| Situação | Comportamento |
|---|---|
| ID não abre produto (URL não vira `/affiliation-i.` nem `/product/`) | `nao_achei`, segue e lista no fim |
| Produto já favoritado (coração cheio) | não clica; `ja_favoritado` |
| Produto já na sacola (vem marcado no modal) | não mexe; `ja_na_sacola` |
| Verificação/captcha da Shopee | pausa e pede "resolva e clique em Continuar" |
| Apresentador fecha a aba da Shopee no meio | lote salvo; painel oferece "Retomar" |
| Produto não encontrado no modal (nome mudou) | `conferir`; os demais ficam marcados |
| Live encerrada ou caída | não tenta adicionar; avisa |

Regra de segurança: nesta versão a extensão **nunca** clica em Confirmar, Remover ou Mostrar sozinha. O clique do apresentador na busca, a cada ID, é intencional (ritmo humano, menos risco de captcha). Um modo automático fica como melhoria futura, atrás de uma chave.

## Recurso B — Painel da sacola

- O painel aparece sozinho ao detectar uma live (`live.shopee.com.br/pc/live`); é uma aba do mesmo painel do Recurso A.
- Cartões, na ordem da sacola: número grande (o ID 1..N da Shopee), miniatura, nome, preço; o produto no ar tem a etiqueta "No ar". Botão **Mostrar** em cada cartão. Campo de busca por número ou nome.
- Atalhos: digitar o número + Enter; Alt+↓ / Alt+↑ para próximo/anterior (já existem hoje).
- Leitura: a extensão abre o modal "Lista de produtos" escondido (sem piscar na tela), rola a lista até o fim, lê as linhas e fecha. Repete após adicionar um lote e no botão "Atualizar".
- Trocar o produto no ar: abre o modal do mesmo jeito e clica em "Mostrar" na linha do número escolhido. **Sempre um clique do apresentador.**

## Testes

- Unidade (`npm test`): extração de IDs (maiúsculas/minúsculas, vários por mensagem, ruído, repetidos, formato inválido); máquina de estados do lote; casamento de produto pelo nome (nomes truncados, acentos).
- E2E (`npm run test:e2e`): atualizar `test/mock-live.html` para o formato real (chat virtualizado, modal da lista, modal de Adicionar Produtos com Favoritos) e adicionar um mock de `shopee.com.br` (busca que redireciona, página de produto com coração).
- Verificação manual numa live real de teste: um lote de 2 a 3 IDs, incluindo um inexistente, um já favoritado e um já na sacola, parando antes do Confirmar.

## Riscos e pontos em aberto

- A Shopee pode mudar classes e telas; os seletores ficam num só arquivo, por prefixo de classe.
- Automação sobre a conta do Fabio: o clique humano por ID e a regra de não confirmar sozinho reduzem o risco de bloqueio ou captcha. Um modo automático exigiria nova avaliação.
- Desfavoritar produtos de lotes antigos não faz parte desta versão.
- A leitura escondida do modal precisa ser validada numa sacola grande (a lista rola).
- Resolver o ID por chamada direta, sem abrir a Shopee, fica como melhoria futura (a API não foi confirmada).
