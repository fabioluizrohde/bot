# Assistente de Live Shopee (extensão de navegador)

Versão 0.4.0. Ajuda quem apresenta lives da Shopee Brasil a transformar **IDs de produto pedidos no chat** (como `CLH-NZK-QPT`) em produtos na sacola da live, sem digitar nada, e a **colocar um produto no ar com um clique na foto dele**.

## O que ela faz hoje

### Pedidos por ID em lote

1. Você seleciona um trecho do chat da live e a extensão lista os IDs que achou.
2. Ela abre a Shopee e, a cada ID, cola o número na busca, abre o produto e o coloca nos seus Favoritos.
3. De volta à live, ela marca esses produtos na tela "Adicionar Produtos" (aba Meus Favoritos).
4. **A extensão adiciona à sacola** (veja o passo 5 mais abaixo).

### Sacola com fotos e Mostrar

A **sacola da live** aparece no painel como uma grade de fotos numeradas, e um clique numa foto coloca aquele produto no ar (modo Mostrar). Detalhes abaixo. A etiqueta **No ar** do produto atual vira **Mover p/ cima** ao passar o mouse (veja abaixo).

O Mostrar usa uma chamada interna da Shopee: leia o [aviso de risco](#aviso-de-risco) abaixo.

## O painel

- **Maior e ajustável:** abre com cerca de 440 px de largura e 85% da altura da janela. Arraste o **canto inferior direito** para mudar o tamanho e o **cabeçalho** (a barra laranja) para mover. A extensão lembra o tamanho e a posição (mesmo depois de recarregar a página).
- **Lote sempre à vista, no topo:** o botão **▾ / ▸** do cabeçalho recolhe o Lote (fica só um resumo, como "Lote: 3 IDs") e abre de novo. Recolhido, ele **abre sozinho apenas quando aparece um aviso novo ou uma pausa nova** (por exemplo o pedido de clique no bloco "Produtos" ou a verificação da Shopee). Se você recolher com o mesmo aviso na tela, ele continua recolhido.
- **Engrenagem (⚙):** abre a opção **Abrir a Shopee em: aba / janela**. Ela substitui a antiga aba "Config". A escolha fica salva.
- Não há mais abas "Lote", "Sacola" e "Config": o Lote fica no topo e a Sacola logo abaixo.

## Grade de fotos da Sacola

Mostra os produtos da sacola da live, **numerados**. No topo há um contador como **"34 de 100"**: quantos produtos estão na sacola e qual o limite (vem da sua conta na Shopee).

- **Cada foto** tem o **número no canto**. Ao passar o mouse, aparecem o **nome e o preço** (e o **preço antigo**, quando o produto tem).
- **"No ar":** a foto do último produto que o painel colocou no ar ganha a etiqueta **No ar**.
- **Esgotado ou removido:** a foto fica apagada e não responde ao clique.
- **Busca por número:** digite o número e aparece só o produto com aquele número exato (digitar 7 mostra o produto 7, não o 17 nem o 70).
- **Busca por nome:** digite parte do nome e aparecem os produtos que contêm o texto.
- **Atualizar:** o botão lê a sacola de novo na hora e retoma a atualização automática.
- **Atualização automática:** a cada 20 segundos, **só enquanto a página da live está visível** (com a página escondida, a extensão não consulta a Shopee).
- **Se a leitura falhar 3 vezes seguidas**, a atualização automática para. O botão **Atualizar** lê de novo e retoma o automático.
- **"Lista desatualizada"** quer dizer que a última leitura falhou e o que você vê é a última lista que deu certo. Ela some quando uma leitura nova funciona.
- Se a Shopee mudar algo, o painel mostra uma mensagem de erro (por exemplo "sem conexão (sem resposta da página)") e o resto da extensão continua funcionando.

## Modo Mostrar (colocar no ar pela foto)

Acima da grade há o seletor de modo (**Mostrar**).

**Mover p/ cima:** o produto marcado **No ar** tem uma etiqueta vermelha embaixo da foto. Ao passar o mouse, ela vira **Mover p/ cima**; um clique fixa o produto no topo da lista da live (é o mesmo pedido do botão nativo da Shopee, `POST items/pin`, um produto por vez). Só funciona com clique real, um pedido por vez, e 2 erros seguidos desligam o Mover até recarregar a página.

**Remover da sacola:** ao passar o mouse num card aparece um **✕** no canto superior direito. O 1º clique troca o ✕ por **Remover?** (some sozinho em 4 segundos); o 2º clique remove (`DELETE items`, um produto por vez). O produto que está **No ar** nunca tem o ✕. Produtos esgotados ou removidos também têm o ✕ (é justamente o que costuma precisar sair). Só com clique real, e 2 erros seguidos desligam o Remover até recarregar a página. Para desfazer, adicione o produto de novo pela tela da Shopee.

No modo Mostrar, **um clique numa foto coloca aquele produto no ar**. Regras de segurança:

- **Só o seu clique de verdade conta.** Cliques simulados por programa são ignorados.
- **Um pedido por vez:** enquanto uma troca está em andamento, novos cliques são ignorados.
- **Pelo menos 1,5 segundo entre uma troca e outra.** Cliques mais cedo são ignorados.
- **Sem nova tentativa automática** se der erro: o painel mostra o aviso (por exemplo "Não consegui trocar o produto (...)") e espera você clicar de novo.
- **Dois erros seguidos desligam o Mostrar nessa live.** O painel avisa "O Mostrar foi desligado nesta live após 2 erros. Use a tela da Shopee." Recarregar a página liga o Mostrar de novo.

### Aviso de risco

**O Mostrar usa uma chamada interna da página da Shopee, e isso é uma área cinzenta nos termos da Shopee.** A extensão envia **exatamente um pedido por clique seu**, nunca automático, mas a Shopee poderia, em teoria, marcar uma conta por automação. Use por sua conta e risco.

Também lembre: **"No ar" é só o último produto enviado pelo painel.** Se você trocar o produto pela tela da Shopee, a etiqueta pode ficar desatualizada até o painel enviar outra troca.

### A ponte com a página

A extensão fala com a Shopee por uma "ponte" que roda dentro da própria página da live, porque a Shopee recusa (erro 403) pedidos feitos direto por extensões. A ponte tem **dois pedidos restritos**: **ler a lista da sacola** e **o Mostrar** (colocar um produto no ar). Ela não aceita nenhum outro endereço e não envia nada para outro lugar.

## Conferências na live real

Em 2026-11-03 o fluxo do Lote foi testado numa live real e funcionou. Foram confirmados na página real (2026-11-03): a caixa de busca da página inicial da Shopee, o texto do botão Favoritar, a marca do coração cheio, o nome do produto no card da grade de Favoritos, o quadradinho (checkbox) do card e o endereço das fotos da Sacola.

O que ainda precisa de você numa live real (recarregue a extensão em `chrome://extensions` e dê F5 na live):

- [ ] **Adicionar sem clique (primeiro uso real):** comece com **1 ID** no chat. Confira que o produto entra na sacola sozinho (sem Produtos nem Confirmar), que o quadro mostra "1 adicionado" e que o Lote se limpa ao selecionar IDs novos. Depois teste com 3 IDs, e com um ID que já está na sacola (deve virar "já na sacola" sem duplicar).
- [ ] **Tamanho e posição lembrados:** mude o tamanho e a posição do painel, recarregue a página (F5) e confira que ele volta igual.
- [ ] **Cinco fotos por linha:** confira que a grade mostra cerca de cinco fotos por linha no tamanho inicial.
- [ ] **Lote visível durante um lote:** rode um lote e confira que o Lote continua à vista no topo, sem sumir atrás da Sacola.
- [ ] **Recolher e abrir o Lote:** recolha e abra pelo botão; confira que, recolhido, ele só abre sozinho com aviso novo ou pausa nova.
- [ ] **Trocar o produto pela foto (primeiro uso real do Mostrar):** clique numa foto e **confira na tela da Shopee se o produto no ar mudou**. O método usado agora é PUT com JSON (POST não funcionou: a Shopee respondia vazio).. Se a Shopee recusar, o painel mostra o erro e desliga o Mostrar após 2 erros.
- [ ] **O painel não cobre o que você precisa ver:** confira que ele não tapa o vídeo, o chat nem os botões da Shopee que você usa (mova ou diminua o painel se preciso).
- [ ] **Aviso de verificação (captcha):** confira que ele **não** faz a extensão pausar numa página normal da Shopee, e que **faz** pausar numa verificação de verdade. Se pausar pedindo "resolva e clique em Continuar" sem haver verificação na tela, o seletor está largo demais (ele pausaria todo ID): ajuste `captchaMarker` em `src/lib/selectors.js`. (Pendente de antes.)
- [ ] **Números e preços:** confira que os números e os preços das fotos batem com os da "Lista de produtos" da Shopee.
- [ ] **Busca da Sacola:** confira que digitar na busca não aciona atalhos de teclado da página da live.

## Instalação (Chrome, Edge ou Brave)

1. Abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `shopee-live` deste projeto.
4. Abra a página da sua live (`live.shopee.com.br/pc/live...`). O painel **Assistente de Live** aparece sobre a página e pode ser movido e redimensionado.

Depois de mudar qualquer arquivo da extensão, clique em **Recarregar** no card dela em `chrome://extensions` e recarregue a página da live.

## Como usar, passo a passo

1. Na live, **selecione com o mouse** o trecho do chat com os pedidos. Os IDs aparecem em "IDs encontrados no chat". Para tirar algum da lista, clique no ✕ ao lado dele.
2. Clique em **Processar lote**. A Shopee abre numa aba nova (ou numa janela, veja Configuração).
3. Na Shopee aparece um aviso "ID k de N: clique na busca". **Clique uma vez na caixa de busca da Shopee** para cada ID. A extensão cola o ID, abre o produto e favorita. O clique é seu de propósito: mantém um ritmo humano e reduz o risco de a Shopee pedir verificação.
4. Quando o último ID termina, a Shopee se fecha sozinha e você volta para a aba da live.
5. A extensão **adiciona sozinha à sacola**, sem nenhum clique: lê a sacola, tira o que já está nela e envia o resto numa chamada interna da própria página da live (`add_items`). Depois relê a sacola e só marca como "adicionado" o que realmente apareceu. Isso acontece **uma vez por lote**. Se der erro, ela não repete sozinha: o botão **Adicionar à sacola** aparece para você tentar de novo. Dois erros seguidos desligam o automático até recarregar a página.
6. **Confira a sacola.** Os itens do lote aparecem como "adicionado" (ou "já na sacola"). A tela Produtos e o Confirmar não são mais usados.

Se você fechar a aba da Shopee no meio, o lote fica guardado. Use o botão **Retomar** no painel (a aba antiga da Shopee, se ainda estiver aberta, é fechada e uma nova é aberta). Se a Shopee pedir verificação (captcha), resolva e clique em **Continuar** no aviso. Se um ID travar, use o botão **Pular este ID** no aviso da Shopee: ele fica como "não achei" e o lote segue (a extensão não clica em nada da página).

## Configuração

No **⚙** do cabeçalho do painel: **Abrir a Shopee em** aba (padrão) ou janela separada. A escolha fica salva.

## O que a extensão nunca faz sozinha

- **Sacola com menos vagas que o lote:** a extensão adiciona só o que cabe (na ordem do lote), deixa o resto no lote e mostra um aviso "Atenção: a sacola só tinha N vagas..." no painel (o Lote abre sozinho). Sem nenhuma vaga, nada é enviado e o aviso diz isso. Depois de abrir espaço (por exemplo removendo esgotados), clique em **Adicionar à sacola** para os que ficaram.
- Na tela da Shopee, nunca clica em **Remover** (o remover da extensão é só pela grade da Sacola, veja abaixo). A adição à sacola é feita só com os produtos do seu lote, por uma chamada interna restrita (`PUT add_items`, até 20 produtos por pedido); o Confirmar da Shopee deixou de ser necessário.
- Só coloca um produto no ar (**Mostrar**) quando **você clica numa foto**: um pedido por clique seu, nunca automático.
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

Quase todos os textos e seletores da página ficam **em um único arquivo**: `src/lib/selectors.js`. Se algum passo deixar de funcionar, ajuste o valor correspondente nesse arquivo (cada linha tem um comentário dizendo para que serve). Exceções:

- `src/live/pageBridge.js`: a ponte só aceita dois caminhos, `/webapi/v1/session/<número>/host/items` (ler a sacola) e `/webapi/v1/session/<número>/show` (Mostrar). Se a Shopee mudar esses endereços, ajuste os caminhos permitidos nesse arquivo e os endereços usados em `src/live/bag.js`.
- `src/live/bag.js`: o endereço das fotos da Sacola, `IMG_BASE`. Se as fotos pararem de aparecer, corrija só essa constante.
- `src/live/layout.js`: o tamanho padrão do painel (largura e proporção da altura).

Depois recarregue a extensão em `chrome://extensions` e recarregue a live. As classes da Shopee têm um sufixo que muda; por isso os seletores usam só o começo do nome, como `[class*="comment-container"]`.

## Desenvolvimento

Dentro da pasta `shopee-live`:

- `npm test`: testes rápidos (não precisam de navegador).
- `npm run test:e2e`: teste completo com páginas de mentira (`test/mock-live.html` e `test/mock-shopee.html`). Precisa do Playwright; indique onde ele está com a variável `PLAYWRIGHT_PATH`, por exemplo: `PLAYWRIGHT_PATH=C:\caminho\para\playwright npm run test:e2e`.

Pastas principais: `src/background` (guarda o lote e abre/fecha a Shopee), `src/live` (painel e marcação na live), `src/shopee` (a "mão" que age na Shopee), `src/lib` (funções comuns e seletores).
