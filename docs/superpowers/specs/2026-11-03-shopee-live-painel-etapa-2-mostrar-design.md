# Assistente de Live Shopee — painel da sacola, etapa 2: trocar o produto no ar

Data: 2026-11-03 · Ramo: `feature/shopee-live-extension` · Pasta: `shopee-live/`
Continua o spec `2026-11-03-shopee-live-painel-da-sacola-design.md` (etapa 1, aba "Sacola" só de leitura, já implementada e testada na live real). Substitui, para a etapa 2, a abordagem "pela tela" por uma chamada pela ponte da página, por decisão do Fabio.

## Objetivo

Trocar o produto que está no ar com **um clique no cartão** da aba "Sacola", **sem** o clique em "Produtos" e sem abrir janelas da Shopee.

Decisões do Fabio (2026-11-03):
- Não quer o clique extra no bloco "Produtos" a cada troca.
- Aceita a chamada interna **só para "Mostrar"**, um pedido por clique seu, nunca automático. O risco foi explicado: área cinzenta nos termos da Shopee, conta pode em tese ser sinalizada por automação.
- Fora desta etapa: "Adicionar à sacola" pelo painel (precisa de observação própria depois).

## O que a observação na live real mostrou (2026-11-03)

- O "Mostrar" da Lista de produtos faz uma chamada XHR para `…/webapi/v1/session/<sessionId>/show` (resposta 200), seguida de uma releitura `…/items/<itemId>/detail`.
- O corpo do pedido é o **próprio objeto do produto**, igual ao item devolvido por `GET …/host/items` (campos como `item_id`, `shop_id`, `name`, `image`, `price`, `id`, `comm_rate`, `label`, `affiliate`, `status`…), sem campos extras conhecidos.
- Método e cabeçalhos não foram observados (a página captura o XHR cedo; ganchos não o pegam). Assume-se `POST` com JSON, porque há corpo.
- O `fetch` direto da extensão leva 403 em chamadas da página (assinatura antirrobô); por isso a leitura já usa a ponte (`pageBridge.js`, `world: "MAIN"`), que usa o `fetch` da própria página. Para o `show`, o pedido da página é XHR, então a ponte usará o `XMLHttpRequest` da página, resolvido na hora da chamada.
- O bloco "Produtos" só abre com clique real e a janelinha fecha sozinha quando a Lista abre; por isso a rota pela tela exigiria um clique real por troca.

## Desenho

1. **Cartão guarda o item original.** `normalizeBag` passa a guardar em cada `Card` o objeto original do item (`raw`), sem mudar o que já é exibido. O corpo do `show` é o `raw` do cartão, sem alterações.
2. **A ponte aprende a escrever, restrita ao `show`.** `pageBridge.js` ganha um segundo tipo de pedido, `{ source:'sla-ext', type:'show', id, path, body }`:
   - `path` precisa casar com `^/webapi/v1/session/\d+/show$` (nada de query, nada de outro caminho);
   - `body` precisa ser objeto simples com `item_id` e `shop_id` numéricos finitos e `JSON.stringify(body)` com no máximo 20 KB;
   - envia `POST` pelo `new XMLHttpRequest()` da página (resolvido na hora da chamada), com `Content-Type: application/json;charset=UTF-8` e `withCredentials: true`, e devolve `{ ok, status, text }`; qualquer erro vira `ok:false`;
   - o tipo `fetch` (leitura da sacola) continua exatamente como está; nenhum outro método ou caminho é aceito.
3. **Lado da extensão.** `SLA.bag.showItem(sessionId, card, win?)` valida (`card.raw` objeto com `item_id`/`shop_id`), monta o pedido e usa a mesma troca de mensagens da ponte (com tempo limite de 10 s); devolve `{ ok:true } | { ok:false, reason:'rede'|'http'|'formato'|'recusado', detail? }`. Sucesso = HTTP ok **e** `err_code === 0` na resposta.
4. **Botão "Mostrar" em cada cartão** (aba Sacola). Estados: normal, "Trocando…" (todos os botões desligados enquanto um pedido está em andamento), "No ar" (cartão do último produto enviado com sucesso). Sem botão (ou desligado) para produto esgotado ou removido.
5. **Travas de segurança:**
   - só o clique **real** do Fabio conta (`event.isTrusted`); clique simulado é ignorado;
   - um pedido por vez e intervalo mínimo de 1,5 s entre trocas;
   - sem nova tentativa automática em caso de erro; a mensagem mostra o código;
   - depois de **2 erros seguidos**, o "Mostrar" do painel é desligado naquela live ("use a tela da Shopee"); recarregar a página religa;
   - só envia o `raw` lido na própria aba Sacola (nunca monta item do zero) e só se o `sessionId` da URL for o da lista lida.
6. **"No ar".** Após sucesso, o cartão vira "No ar" e a lista é relida em seguida. A etiqueta reflete o último produto enviado **pelo painel**; se o Fabio trocar pela tela da Shopee, pode ficar desatualizada (aviso no README).
7. **Regra herdada do revisor da ponte:** a decisão de escrever nunca se baseia só em dados vindos da ponte sem o clique do Fabio; aqui o clique é a confirmação.

## Erros

| Situação | Comportamento |
|---|---|
| Pedido recusado pela ponte (caminho/corpo inválido) | Mensagem "pedido recusado" sem chamar a Shopee |
| Shopee responde erro HTTP ou `err_code` diferente de 0 | Mensagem com o código; nenhuma nova tentativa; conta como erro seguido |
| Ponte sem resposta em 10 s | "sem resposta da página"; conta como erro seguido |
| 2 erros seguidos | Botões "Mostrar" desligados nessa live, aviso "use a tela da Shopee" |
| Clique durante um pedido em andamento | Ignorado |
| Live encerrada / sacola vazia | Sem botões ativos |

## Testes

- Unidade: validação do caminho e do corpo na ponte (aceita só o `show` com item válido; recusa query, outros caminhos, corpo grande ou sem `item_id`/`shop_id`); tratamento do pedido na ponte com um `XMLHttpRequest` de mentira (POST, cabeçalho, corpo, resposta ok/erro/exceção); `showItem` com uma janela de mentira (sucesso, `err_code` diferente de 0, HTTP 403, tempo esgotado, `card.raw` ausente); regras do botão (um por vez, intervalo, `isTrusted`, 2 erros desligam, esgotado sem botão); `normalizeBag` guarda `raw` sem alterar os campos existentes.
- Na live real, com o Fabio: trocar de produto algumas vezes pelo cartão e conferir na tela da Shopee que o produto mudou. O primeiro teste confirma método e cabeçalhos assumidos.

## Riscos e pontos em aberto

- Método/cabeçalhos assumidos (`POST`, JSON): se a Shopee recusar, o painel mostra o erro e desliga o botão após 2 erros; nada mais é afetado.
- Escrita por chamada interna é zona cinzenta e pode levar a sinalização da conta; mitigado por um pedido por clique humano, mesmo caminho e assinaturas da página, nenhuma repetição automática.
- "No ar" pode divergir da realidade se o Fabio trocar pela tela.
- A Shopee pode mudar o `show` a qualquer momento; falha segura e visível.
