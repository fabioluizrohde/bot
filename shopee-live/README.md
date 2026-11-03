# Assistente de Live Shopee (extensão de navegador)

Versão 0.2.0. Ajuda quem apresenta lives da Shopee Brasil a transformar **IDs de produto pedidos no chat** (como `CLH-NZK-QPT`) em produtos na sacola da live, sem digitar nada.

## O que ela faz hoje: Pedidos por ID em lote

1. Você seleciona um trecho do chat da live e a extensão lista os IDs que achou.
2. Ela abre a Shopee e, a cada ID, cola o número na busca, abre o produto e o coloca nos seus Favoritos.
3. De volta à live, ela marca esses produtos na tela "Adicionar Produtos" (aba Meus Favoritos).
4. **Você confere e clica em Confirmar.** A extensão não faz essa parte.

O **painel da sacola** (lista numerada dos produtos e troca rápida do produto no ar) **ainda não está incluído**. É o próximo recurso.

## Primeiro teste na live real (obrigatório antes de usar)

Alguns textos e seletores da página da Shopee foram escolhidos por palpite e precisam ser confirmados uma vez na página real. Eles estão marcados com `PROBE-PENDING` em `src/lib/selectors.js` (seis no total):

- a caixa de busca da página inicial da Shopee;
- o botão Favoritar (texto sob as fotos do produto);
- a marca do coração cheio (produto já favoritado);
- o nome do produto no card da grade de Favoritos;
- o quadradinho (checkbox) do card;
- o aviso de verificação/captcha.

Roteiro, com uma live de teste:

1. **Teste primeiro com um produto que JÁ está favoritado.** Se a extensão errar o coração cheio, ela poderia desfavoritar sem você esperar. Com um produto já favoritado, o erro aparece sem estrago.
2. Monte um lote de 3 IDs: um que não existe, um já favoritado e um novo. Clique em **Processar lote** e siga a Shopee uma vez por ID.
3. De volta à live, a extensão **marca sozinha** os produtos na tela de Adicionar Produtos (não precisa clicar em nada). **PARE antes de apertar Confirmar.** Confira se os produtos certos foram marcados e se os status fazem sentido: inexistente = "não achei", já favoritado = "já estava favoritado", novo = "favoritado". Nessa hora os produtos marcados continuam como "favoritado" ou "já estava favoritado" (e não "já estava na sacola"), e o painel mostra "Aguardando seu Confirmar…".
4. Confira que o aviso de verificação (captcha) **não** aparece numa página normal da Shopee. Se a extensão pausar pedindo "resolva e clique em Continuar" sem haver verificação na tela, o seletor do captcha está largo demais (ele pausaria todo ID): ajuste `captchaMarker` em `src/lib/selectors.js`.
5. Confirme que o painel aparece em `live.shopee.com.br/pc/live`, inclusive depois de navegar dentro do site (por exemplo, sair da live e voltar). Se ele sumir, recarregue a página e anote o que fez antes.
6. Se algo divergir, ajuste o seletor (veja "Se a Shopee mudar o layout") e repita o teste.

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
5. A extensão **marca sozinha**: abre a tela de Adicionar Produtos, vai em Meus Favoritos e marca cada produto do lote pelo nome. O painel mostra "Aguardando seu Confirmar…". O botão **Marcar na live** só aparece se for preciso tentar de novo (por exemplo, se você fechou a tela de Adicionar Produtos sem confirmar).
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

Todos os textos e seletores da página ficam **em um único arquivo**: `src/lib/selectors.js`. Se algum passo deixar de funcionar, ajuste o valor correspondente nesse arquivo (cada linha tem um comentário dizendo para que serve), recarregue a extensão em `chrome://extensions` e recarregue a live. As classes da Shopee têm um sufixo que muda; por isso os seletores usam só o começo do nome, como `[class*="comment-container"]`.

## Desenvolvimento

Dentro da pasta `shopee-live`:

- `npm test`: testes rápidos (não precisam de navegador).
- `npm run test:e2e`: teste completo com páginas de mentira (`test/mock-live.html` e `test/mock-shopee.html`). Precisa do Playwright; indique onde ele está com a variável `PLAYWRIGHT_PATH`, por exemplo: `PLAYWRIGHT_PATH=C:\caminho\para\playwright npm run test:e2e`.

Pastas principais: `src/background` (guarda o lote e abre/fecha a Shopee), `src/live` (painel e marcação na live), `src/shopee` (a "mão" que age na Shopee), `src/lib` (funções comuns e seletores).
