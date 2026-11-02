# Assistente de Live Shopee (extensão de navegador)

Painel flutuante que aparece sobre a página da live na Shopee Brasil (`*.shopee.com.br`) e ajuda o apresentador a:

- **Ler o chat** e listar os códigos de produto que os clientes pedem ("#5", "quero o 12", "cod 3", "4"…), com contagem e nome de quem pediu.
- **Adicionar à sacola**: com um clique ou de forma **automática**, repetindo um caminho que você grava uma vez.
- **Destacar** o produto da vez com um clique, pelo código ou com os atalhos **Alt+↓ / Alt+↑** (próximo/anterior).

## Instalação (Chrome, Edge ou Brave)

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `shopee-live`.
4. Abra a página da sua live na Shopee. O painel laranja aparece no canto direito. **Alt+Shift+L** mostra e esconde o painel, e dá para arrastar pelo título.

## Configuração (uma vez só)

Como a Shopee muda o layout com frequência, a extensão não depende de nomes fixos da página: você ensina onde fica cada coisa, na aba **Config**.

1. **Chat**: clique em *Ensinar* e depois numa mensagem qualquer do chat. Precisa haver pelo menos 2 mensagens na tela. A bolinha verde no título indica que o chat está sendo lido.
2. **Lista da sacola**: clique em *Ensinar* e depois num produto da sacola. Precisa haver pelo menos 2 produtos.
3. **Botão destacar**: clique em *Ensinar* e depois no botão de destacar/fixar de um produto. Enquanto você ensina, o clique **não** chega na Shopee.
4. **Gravar "adicionar à sacola"**: escreva o nome de um produto de exemplo, clique em **● Gravar** e faça na página o caminho completo: abrir "adicionar produto", clicar na busca, digitar o nome, marcar o produto nos resultados e confirmar. Depois clique em **■ Parar**. O texto digitado vira a variável `{busca}`, e o clique no resultado passa a escolher a linha do produto pedido.
5. Em **Testar fluxo**, digite um código do catálogo para conferir se funciona.

Em *Backup da configuração* dá para exportar e importar tudo (seletores, fluxo e catálogo) para usar em outro computador.

## Catálogo da live

Na aba **Catálogo**, cole as linhas no formato `codigo;nome;busca` (também aceita `,` ou TAB):

```
codigo;nome;busca
1;Camiseta Dry Fit Preta;
2;Caneca Térmica 500ml;
5;Garrafa Squeeze 1L;23456789012
```

- **codigo**: o que o cliente digita no chat.
- **nome**: usado para achar o produto na sacola e nos resultados da busca.
- **busca** (opcional): o que digitar na pesquisa de "adicionar produto", como o ID do anúncio. Se ficar vazio, usa o nome.

Se a sacola já estiver montada, **Gerar da sacola** numera os produtos visíveis (1, 2, 3…).

## Durante a live

- Aba **Pedidos**: cada código aparece com o status *novo*, *na fila*, *adicionando…*, *na sacola*, *fora do catálogo* ou *erro*. Use **+ Sacola** para adicionar, **★** para destacar e **✕** para ignorar.
- **Adicionar automático**: quando ligado, todo código do catálogo que chegar no chat entra sozinho na fila. Em *Config* você define quantos pedidos são necessários antes de adicionar (padrão 1).
- Aba **Sacola**: lista os produtos visíveis, com destaque por clique, *Anterior/Próximo* e destaque por código.
- **Simular mensagem**: testa se uma frase seria reconhecida como pedido.

### O que é reconhecido como pedido

| Mensagem | Código |
|---|---|
| `#5`, `#3 e #5` | 5 / 3 e 5 |
| `quero o 12`, `quero o 3 e o 7`, `manda o 4`, `reserva o #10` | 12 / 3, 7 / 4 / 10 |
| `cod 45`, `código: A12`, `item 8`, `produto nº 9` | 45 / A12 / 8 / 9 |
| `4`, `1, 3 e 5` (mensagem só com números; dá para desligar) | 4 / 1, 3, 5 |

Números soltos no meio de frases ("frete de 22 reais", "tem no 42?") são ignorados. Em *Config* é possível ignorar códigos fora do catálogo e adicionar uma regex própria, em que o grupo 1 é o código.

## Limitações

- O fluxo gravado depende da tela da Shopee. Se ela mudar, grave de novo (leva menos de um minuto).
- A sacola precisa estar aberta e visível para o destaque e para conferir o que já foi adicionado.
- Se o chat ou a sacola da Shopee estiverem dentro de um *iframe*, a extensão não alcança. Nesse caso é preciso ajustar o `manifest.json` (`all_frames`).
- A extensão só age na aba aberta e no seu login. Não há servidor nem dados enviados a terceiros, e tudo fica salvo no `chrome.storage` do navegador.

## Desenvolvimento

```bash
cd shopee-live
npm test            # testes da leitura de códigos e do CSV
npm run test:e2e    # carrega a extensão num Chromium (Playwright) contra test/mock-live.html
```

`test/mock-live.html` imita a página da live (chat, sacola, modal de adicionar e botão destacar) para validar o ensino, a gravação, a adição automática e o destaque sem precisar de uma live real.
