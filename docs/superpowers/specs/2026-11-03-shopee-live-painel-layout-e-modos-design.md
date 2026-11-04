# Assistente de Live Shopee — painel maior, Lote sempre visível, grade de fotos e modos

Data: 2026-11-03 · Ramo: `feature/shopee-live-extension` · Pasta: `shopee-live/`
Reúne os pedidos novos do Fabio sobre o layout e **complementa** o spec `2026-11-03-shopee-live-painel-etapa-2-mostrar-design.md` (trocar o produto no ar pelo `show`, ponte, travas de segurança), que continua valendo para tudo o que é "Mostrar". Onde este documento e o da etapa 2 falam do cartão ou do botão "Mostrar", vale este: o cartão agora é a **foto da grade**.

## Objetivo

Um painel **maior**, em que se veja muito mais produtos sem rolar, com o **Lote sempre visível** (não mais uma aba) e a Sacola como uma **grade de fotos** (como a ferramenta que o Fabio mostrou numa imagem): clicar na foto coloca o produto no ar.

Decisões do Fabio (2026-11-03):
- Painel empilhado, **tamanho ajustável** (arrasta o canto; a extensão lembra tamanho e posição).
- Lote vira um **quadro fixo** em cima; a Sacola ocupa o resto.
- Sacola em **grade de fotos**, com o número no canto, ~5 por linha, nome e preço ao passar o mouse.
- Dois modos, escolhidos por um seletor acima da grade: **MOSTRAR** (padrão) e **MOVER P/ CIMA**. Os modos FIXAR e INTOCÁVEL da ferramenta mostrada ficam **fora**.
- Entrega em duas partes: **(1) layout + MOSTRAR**; **(2) MOVER P/ CIMA** depois de observar a chamada e de o Fabio decidir o risco dessa segunda escrita.

## Desenho

### Painel
- Começa com largura para 5 fotos por linha (~440 px) e ~85% da altura da janela; limites mínimo (~300 px × 280 px) e máximo (a janela). Canto inferior direito arrastável para redimensionar; o cabeçalho continua arrastável. Tamanho e posição ficam salvos em `chrome.storage.local` (chaves `panelSize`, `panelPos`) e são validados ao ler (valores fora da janela voltam ao padrão).
- Estrutura vertical: cabeçalho (título, botão recolher/expandir do Lote, engrenagem ⚙) → **quadro Lote** → **área Sacola** (cresce) → o canto de redimensionar.
- ⚙ abre um menu pequeno com "Abrir a Shopee em: aba / janela" (o que hoje está na aba Config). A aba Config deixa de existir.

### Quadro Lote (sempre visível)
- Conteúdo igual ao da aba atual: IDs encontrados no chat (com ✕), "Processar lote", status de cada ID, "Retomar", "Marcar na live", "Limpar lote", avisos. A lógica de lote (captura da seleção, coordenador, marcação) **não muda**.
- Altura máxima ~35% do painel, rola por dentro se passar; botão recolher deixa só a linha de resumo ("Lote: 3 IDs").
- Quando chega `batch:resolved`, o quadro Lote já está visível; não há mais troca de aba (some a regra "mudar para a aba Lote" da fase anterior).

### Sacola em grade
- Topo: contador `N de máx`, campo de busca (número exato ou nome), botão "Atualizar", seletor de modo `[MOSTRAR | MOVER P/ CIMA]`.
- Grade CSS com colunas `repeat(auto-fill, minmax(72px, 1fr))` (≈ 5 colunas no tamanho padrão), tiles quadrados com a foto (`object-fit: cover`) e o **número** em destaque no canto; `title` com nome e preço (e preço antigo); sem texto fixo nos tiles. Foto indisponível: tile com o número e fundo neutro.
- Estados do tile: normal; "No ar" (borda destacada + etiqueta); apagado (esgotado/removido, sem ação); "trocando…" (enquanto há um pedido em andamento, todos os tiles ficam desligados).
- A grade rola dentro da área Sacola; a busca filtra a grade (some o que não casa).
- A leitura continua pela ponte, só com a aba visível (agora "a Sacola está visível" = a página visível e o painel não recolhido), a cada 20 s, parando após 3 falhas; botão "Atualizar" retoma. As regras de foto (`cf.shopee.com.br/file/<código>`, `crossorigin="anonymous"`, ouvinte de erro que esconde foto quebrada) continuam.

### Modo MOSTRAR (parte 1)
- Clique **real** no tile envia o `show` como no spec da etapa 2 (ponte, corpo = `raw` do item, travas: um pedido por vez, intervalo mínimo de 1,5 s, sem nova tentativa, 2 erros seguidos desligam o modo nessa live, `isTrusted`).
- Sucesso (`err_code === 0`): tile vira "No ar" e a lista é relida.

### Modo MOVER P/ CIMA (parte 2, a descobrir)
- Só aparece/liga depois da parte 2. Clique no tile leva o produto para a primeira posição (as posições dos demais descem; os números mudam, então a lista é relida e a grade se reordena).
- A grade fica com cor/borda diferente nesse modo e com aviso "clique move o produto para o 1º lugar", para não mover sem querer.
- **A descobrir:** chamada, método e corpo (observação com o Fabio, como foi feita com o `show`; histórico de rede do navegador + Payload no DevTools) e a decisão dele sobre o risco. Até lá o seletor mostra o modo desligado ("em breve").

## Erros e segurança
Valem as tabelas e travas do spec da etapa 2 (leitura e `show`). Adições: se o tamanho/posição salvos forem inválidos, usa o padrão; recolher o quadro Lote nunca esconde avisos urgentes (aviso "Clique no bloco Produtos" ou erro de marcação abre o quadro).

## Testes
- Unidade: validação do tamanho/posição salvos (limites, janela pequena); `gridColumns`/classes dos tiles por estado (normal, no ar, apagado, trocando); renderização da grade (escape de nomes, `title`, 100 itens, sem foto, número no tile); seletor de modo (parte 2 desligada até estar liberada); lógica "no ar" e filtro de busca na grade; menu ⚙ (opção aba/janela salva e lida); regras do `show` do spec da etapa 2.
- Na live real, com o Fabio: tamanho e posição lembrados após recarregar; 5 por linha; Lote visível durante um lote; trocar de produto pelo tile; conferir no ar na tela da Shopee.

## Riscos e pontos em aberto
- Foto quebrada vira tile só com número (a leitura continua útil).
- Painel grande cobre mais a página da live: o Fabio pode recolher o Lote, redimensionar e arrastar; o tamanho padrão pode precisar de ajuste depois da primeira live.
- `title` (tooltip) depende do mouse; em tela sensível ao toque não aparece (não é o caso de uso).
- MOVER P/ CIMA depende de observação e decisão de risco; não faz parte da parte 1.
- O "No ar" continua sendo o último produto enviado pelo painel (aviso no README).
