# Proteger produtos e remover em lote — especificação

Data: 2026-11-04. Entrega 1 de 5 (as outras: fixar vários, banco de produtos, métricas, contador).

## Objetivo

Quem apresenta a live precisa liberar vagas na sacola rápido, sem apagar de novo, por engano, os produtos que quer manter. Esta entrega faz duas coisas ligadas:

1. **Proteger** produtos (🔒): ficam a salvo de qualquer remoção feita pela extensão.
2. **Remover em lote**: tirar da sacola os **últimos 5, 10, 15 ou 20** produtos de uma vez, com prévia e confirmação.

## O que o apresentador vê

### Proteger (🔒)
- **Automático:** na **primeira leitura da sacola de cada live**, tudo o que já está nela fica protegido. Isso cobre os produtos escolhidos antes de iniciar a live. A leitura acontece ao abrir o painel, mesmo que a aba Sacola não esteja à vista, e também logo antes da primeira adição do lote (o que já estava na sacola antes do lote fica protegido, o que o lote adiciona não).
- **Manual:** o seletor de modo ganha **Proteger** (ao lado de Mostrar). Nesse modo, clicar num card liga ou desliga o 🔒 dele. É só da extensão; nenhum pedido vai à Shopee.
- **Aparência:** card protegido mostra um 🔒 sempre visível (canto inferior esquerdo).
- **Protegido não tem ✕:** o ✕ de remover um produto some dos cards protegidos. Para remover, desproteja antes.
- **Escopo:** a proteção vale por live e fica guardada no navegador (sobrevive a recarregar a página). Outra live começa do zero (e protege o que já estiver nela).

### Remover em lote
- Na aba Sacola, um botão **Limpar** abre as opções **5, 10, 15 ou 20**.
- Ao escolher um número, a grade mostra a **prévia**: os cards que seriam removidos ficam destacados em vermelho. Os protegidos e o produto **No ar** são sempre pulados.
- Quais são "os últimos N": os de **maior número na sacola** (os que entraram por último), entre os que podem ser removidos. Se houver menos removíveis que N, a prévia usa só os que existem e avisa ("só há 7 produtos que podem ser removidos").
- A prévia tem **Confirmar remoção de N** e **Cancelar**. Nada é enviado antes do Confirmar. A prévia some sozinha se a sacola mudar (a lista é relida) ou depois de 15 segundos.
- Depois de confirmar: a extensão remove, relê a sacola, avisa o resultado ("12 removidos") e informa se algum falhou.

## Como funciona por baixo

### Proteção (guardada no navegador)
- `chrome.storage.local`, chave por live: `{ iniciado: true, protegidos: [itemId, ...] }`.
- Módulo novo `src/live/protect.js` (funções puras, sem DOM): `initialSnapshot(itens)`, `toggle(set, itemId)`, `isProtected(set, itemId)`, `removables(itens, set, noAr)`.
- **Lê/grava só no content script do painel** (como o resto do estado local). Gravação a cada mudança.

### Seleção dos "últimos N"
- Função pura `pickLast(itens, protegidos, noAr, n)` em `protect.js`: filtra os removíveis (não protegidos, não No ar), ordena por número `n` decrescente e pega até N. Esgotados e removidos entram normalmente (são justamente os que se quer tirar).
- A ordem "mais recente = maior número" é uma suposição a conferir na próxima live (ver Pontos a conferir).

### Remoção
- A chamada nativa é `DELETE /webapi/v1/session/<n>/items` com corpo `{"item_ids":[id]}` (1 produto, conferida na live real).
- A ponte (`pageBridge.js`) hoje só aceita 1 item. Passa a aceitar **de 1 a 20 itens**, inteiros positivos, sem repetir.
- **Plano A (se a Shopee aceitar vários ids no mesmo pedido):** um pedido com todos os N.
- **Plano B (se não aceitar):** N pedidos de 1 item, em sequência, com pausa de 300 ms entre eles, parando no primeiro erro.
- `bag.removeItems(sessionId, itemIds, win, opts)` (nova; substitui o uso de `removeItem` no lote; o ✕ individual segue usando `removeItem`).

### Travas de segurança
- Nunca remove produto protegido nem o No ar (conferido de novo na hora de enviar, não só na prévia).
- Só clique real do usuário no **Confirmar**; um Confirmar = um lote. Sem repetir sozinho.
- Os ids enviados são os da prévia que o apresentador viu; se a sacola mudou entre a prévia e o Confirmar, a prévia é invalidada e nada é enviado.
- Lote só na live da página atual, com a lista na tela dessa mesma live.
- 2 erros seguidos desligam o Remover (individual e em lote) até recarregar a página, como já ocorre hoje.
- Resposta da Shopee: sucesso só com HTTP 2xx e `err_code` 0; depois relê a sacola e só conta como removido o que realmente saiu.

## Fora desta entrega
Fixar vários, banco de produtos, métricas e contador. Remoção automática (sozinha) também fica de fora: tudo é decidido por clique.

## Pontos a conferir numa live real antes/durante a implementação
1. O `DELETE` aceita vários `item_ids` num pedido? (decide Plano A ou B)
2. A resposta da lista da sacola tem campo de data/ordem de entrada? Se tiver, "últimos" passa a usar esse campo; se não, vale o número do card.
3. Que número mostra a Shopee depois de remover (a numeração dos cards muda, "recompacta")? Isso afeta a prévia.

## Testes (antes do código)
- `protect.test.cjs`: snapshot inicial, alternar proteção, `pickLast` (pula protegidos e No ar, ordem, menos removíveis que N, esgotado entra).
- `pageBridge.test.cjs`: corpo de remoção com 1 a 20 ids válidos; recusa vazio, 21, repetido, não inteiro, campos extras.
- `bag.test.cjs`: `removeItems` (Plano A e B, parar no primeiro erro, relatório do que falhou).
- `bagTab.test.cjs`: 🔒 no card protegido, sem ✕ em protegido, prévia em vermelho, botões Confirmar/Cancelar, nada enviado sem Confirmar.
