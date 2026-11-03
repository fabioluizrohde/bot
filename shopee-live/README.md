# Assistente de Live Shopee (extensão de navegador)

Versão 0.3.0. Ajuda quem apresenta lives da Shopee Brasil a transformar **IDs de produto pedidos no chat** (como `CLH-NZK-QPT`) em produtos na sacola da live, sem digitar nada.

## O que ela faz hoje: Pedidos por ID em lote

1. Você seleciona um trecho do chat da live e a extensão lista os IDs que achou.
2. Ela abre a Shopee e, a cada ID, cola o número na busca, abre o produto e o coloca nos seus Favoritos.
3. De volta à live, ela marca esses produtos na tela "Adicionar Produtos" (aba Meus Favoritos).
4. **Você confere e clica em Confirmar.** A extensão não faz essa parte.

A **lista numerada da sacola** já está incluída (aba **Sacola**, só leitura; veja abaixo). **Trocar o produto no ar** e **adicionar o lote pelo painel** ficam para a próxima etapa.

## Aba Sacola

Mostra todos os produtos da sacola da live, **numerados**, cada um com foto, nome e preço. No topo há um contador como **"34 de 100"**: quantos produtos estão na sacola e qual o limite (esse limite vem da sua conta na Shopee).

- **Busca por número:** digite o número e aparece só o produto com aquele número exato (digitar 7 mostra o produto 7, não o 17 nem o 70).
- **Busca por nome:** digite parte do nome e aparecem os produtos que contêm o texto.
- **Atualização automática:** a cada 20 segundos, mas **só enquanto a aba Sacola está aberta e a página da live está visível**. Com outra aba do painel ativa, ou com a página escondida, a extensão não consulta a Shopee.
- **Se a leitura falhar 3 vezes seguidas**, a atualização automática para. O botão **Atualizar** lê de novo e retoma o automático.
- **"Lista desatualizada"** quer dizer que a última leitura falhou e o que você vê é a última lista que deu certo. Ela some quando uma leitura nova funciona.
- **Nesta versão a aba só lê e não altera nada** na sua live. A etiqueta **"No ar"** (qual produto está sendo mostrado) e o botão **Mostrar** vêm na próxima etapa.

## Conferências na live real

Em 2026-11-03 o fluxo do Lote foi testado numa live real e funcionou. Foram confirmados na página real (2026-11-03): a caixa de busca da página inicial da Shopee, o texto do botão Favoritar, a marca do coração cheio, o nome do produto no card da grade de Favoritos e o quadradinho (checkbox) do card.

Ainda faltam estas conferências (itens marcados com `PROBE-PENDING` ou palpites):

1. **Aviso de verificação (captcha):** confira que ele **não** faz a extensão pausar numa página normal da Shopee, e que **faz** pausar numa verificação de verdade. Se pausar pedindo "resolva e clique em Continuar" sem haver verificação na tela, o seletor está largo demais (ele pausaria todo ID): ajuste `captchaMarker` em `src/lib/selectors.js`.
2. **Fotos da aba Sacola:** o endereço das fotos (`IMG_BASE` em `src/live/bag.js`) é um palpite. Se as fotos não aparecerem na aba Sacola, corrija só essa constante, olhando o endereço de uma foto na página.
3. **Números da aba Sacola:** confira que os números dos cards batem com os da "Lista de produtos" da Shopee.
4. **Aba Lote ativa:** confira que, com a aba Lote (e não a Sacola) ativa, a extensão não faz nenhuma chamada nova.

## Instalação (Chrome, Edge ou Brave)

1. Abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `shopee-live` deste projeto.
4. Abra a página da sua live (`live.shopee.com.br/pc/live...`). O painel **Assistente de Live** aparece sobre a página e pode ser arrastado.

Depois de mudar qualquer arquivo da extensão, clique em **Recarregar** no card dela em `chrome://extensions` e recarregue a página da live.

## Como usar, passo a passo

1. Na live, **selecione com o mouse** o trecho do chat com os pedidos. Os IDs aparecem em "IDs encontrados no chat". Para tirar algum da lista, clique no ✕ ao lado dele.
2. Clique em **Processar lote**. A Shopee abre numa aba nova (ou numa janela, veja Configuração).
3. Na Shopee aparece um aviso "ID k de N: clique na busca". **Clique uma vez na caixa de busca da Shopee** para cada ID. A extensão cola o ID, abre o produto e favorita. O clique é seu de propósito: mantém um ritmo humano e reduz o risco de a Shopee pedir verificação.
4. Quando o último ID termina, a Shopee se fecha sozinha e você volta para a aba da live.
5. A extensão **marca sozinha**: abre a tela de Adicionar Produtos, vai em Meus Favoritos e marca cada produto do lote pelo nome. O painel mostra "Aguardando seu Confirmar…". A Shopee só deixa o bloco "Produtos" abrir com um clique de mouse de verdade; por isso, se o painel mostrar **"Clique no bloco "Produtos" (coluna da esquerda): eu continuo sozinha."**, clique uma vez nesse bloco e a extensão continua. O botão **Marcar na live** só aparece se for preciso tentar de novo (por exemplo, se você fechou a tela de Adicionar Produtos sem confirmar).
6. **Confira os produtos marcados e clique você mesmo em Confirmar**, na tela da Shopee. Até lá os itens aparecem como "favoritado" ou "já estava favoritado"; depois do Confirmar ficam como "adicionado".

Se você fechar a aba da Shopee no meio, o lote fica guardado. Use o botão **Retomar** no painel (a aba antiga da Shopee, se ainda estiver aberta, é fechada e uma nova é aberta). Se a Shopee pedir verificação (captcha), resolva e clique em **Continuar** no aviso. Se um ID travar, use o botão **Pular este ID** no aviso da Shopee: ele fica como "não achei" e o lote segue (a extensão não clica em nada da página).

## Configuração

Na aba **Config** do painel: **Abrir a Shopee em** aba (padrão) ou janela separada. A escolha fica salva.

## O que a extensão nunca faz sozinha

- Nunca clica em **Confirmar**, **Remover** nem **Mostrar**. Essas decisões são sempre suas.
- Não responde no chat e não mexe em cupons.
- Não desfavorita produtos de lotes antigos.

## O que cada status quer dizer

| Status | Significado |
|---|---|
| na fila | O ID ainda não foi processado. |
| favoritado | O produto foi achado e colocado nos seus Favoritos. |
| já estava favoritado | O produto já era favorito; a extensão não mexeu. |
| não achei | O ID não abriu nenhum produto na Shopee. |
| já estava na sacola | O produto já estava na sacola da live; não foi mexido. |
| conferir à mão | A extensão não encontrou o produto na tela de Adicionar Produtos (talvez o nome tenha mudado). Procure e marque você mesmo. Os demais continuam marcados. |
| adicionado | Você confirmou e o produto entrou na sacola. |

## Limitações

- A página da live precisa estar aberta; a extensão lê o chat e a tela dessa página.
- No chat, só as linhas visíveis na tela podem ser selecionadas.
- Se a Shopee mudar o layout, os seletores podem parar de funcionar (veja abaixo).
- O teste automático completo (e2e) precisa do Playwright e não roda por padrão.

## Se a Shopee mudar o layout

Todos os textos e seletores da página ficam **em um único arquivo**: `src/lib/selectors.js`. Se algum passo deixar de funcionar, ajuste o valor correspondente nesse arquivo (cada linha tem um comentário dizendo para que serve). A única exceção é o endereço das fotos da aba Sacola, `IMG_BASE`, em `src/live/bag.js`. Depois recarregue a extensão em `chrome://extensions` e recarregue a live. As classes da Shopee têm um sufixo que muda; por isso os seletores usam só o começo do nome, como `[class*="comment-container"]`.

## Desenvolvimento

Dentro da pasta `shopee-live`:

- `npm test`: testes rápidos (não precisam de navegador).
- `npm run test:e2e`: teste completo com páginas de mentira (`test/mock-live.html` e `test/mock-shopee.html`). Precisa do Playwright; indique onde ele está com a variável `PLAYWRIGHT_PATH`, por exemplo: `PLAYWRIGHT_PATH=C:\caminho\para\playwright npm run test:e2e`.

Pastas principais: `src/background` (guarda o lote e abre/fecha a Shopee), `src/live` (painel e marcação na live), `src/shopee` (a "mão" que age na Shopee), `src/lib` (funções comuns e seletores).
