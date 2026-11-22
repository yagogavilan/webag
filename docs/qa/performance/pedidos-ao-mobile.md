# Pedidos do backend ao mobile-dev (desempenho)

Dono: backend-dev | Data: 2026-11-22 | Origem: `docs/qa/performance/api-2026-11-22.md` | Nada aqui muda o contrato: são formas de **usar** a API que reduzem requisição, bytes e CPU no servidor. Registre resposta/estado no fim de cada linha.

Não existia `docs/qa/performance/pedidos-ao-backend.md` (o mobile-dev não registrou pedidos ao backend até esta data); se registrar, o backend-dev responde em `api-<data>.md`.

| # | Pedido | Por quê (número medido) | Prioridade |
|---|---|---|---|
| M1 | **Não chame `GET /v1/cart` depois de `PUT/DELETE /v1/cart/items/...`, `PUT/DELETE /v1/cart/coupon` ou `POST /v1/cart/acknowledge`**: a resposta dessas rotas já é a sacola inteira (ADR-010, `contrato-api`). Use-a para atualizar o cache local. | `GET /v1/cart` faz ~22 consultas ao banco (~20 ms de ponta a ponta sem carga) e é, com o `PUT` do item, a rota mais cara da jornada. Cada `PUT` seguido de `GET` dobra o custo da sacola | Alta |
| M2 | **Imagens: peça o tamanho certo.** `image.urls` traz as variantes `160`, `400`, `800` e `1600` (WebP, `Cache-Control: public, max-age=31536000, immutable`). Cartão de lista: `160` (ou `400` em tela de 3x); grade/vitrine: `400`; herói da página do produto: `800`; zoom: `1600`. Escolha por `largura em dp x PixelRatio`, nunca a maior "por garantia". Use cache em disco do `expo-image` (as URLs são imutáveis: nunca revalida) | `[HIPÓTESE, tamanhos de arquivo não medidos aqui]` foto WebP de 800 px ~40 KB e de 160 px ~4 KB: uma home com 30 cartões baixando `800` custaria ~1,2 MB; com `160`, ~120 KB | Alta |
| M3 | **Habilite cache HTTP condicional** nas leituras públicas (`GET /v1/home`, `/v1/browse/*`, `/v1/search/*`, `/v1/categories`, `/v1/banners`...). A API manda `Cache-Control: public/private, max-age=30..60` e `ETag`; o cliente HTTP nativo repete com `If-None-Match` e recebe `304` sem corpo. Em React Native o `fetch` usa o cache nativo (iOS `NSURLCache`; Android precisa do cache do OkHttp ligado). Alinhe também `staleTime` do React Query a ~30 s para essas chaves | `home` pesa 29 KB (4,9 KB com gzip); `304` pesa ~300 B | Média |
| M4 | Confirme que o cliente envia `Accept-Encoding: gzip` (padrão em OkHttp e NSURLSession; o nginx comprime JSON > 1 KB) | gzip: home 29,4 KB -> 4,8 KB; busca de produtos 16,4 KB -> 2,0 KB; lista da loja 10,3 KB -> 1,7 KB | Média |
| M5 | **Busca**: `debounce` de 300 ms, mínimo de 2 caracteres, cancele (`AbortController`) a requisição anterior ao digitar, e não chame `search/suggestions` e `search/products` para o mesmo texto ao mesmo tempo (sugestão ao digitar, resultado ao confirmar) | Busca por texto é a consulta mais cara de leitura (~15 ms de banco cada) e o limite é 90/min por IP | Média |
| M6 | **Acompanhar pedido**: use o Socket.IO (`order.status_changed`) como fonte do aviso e faça `GET /v1/orders/{id}` só quando chegar o evento ou ao abrir a tela. Sem socket (rede bloqueou WebSocket): polling a cada **10 s no mínimo** (backoff até 30 s em tela em segundo plano), nunca abaixo de 5 s | `GET /v1/orders/{id}` custa ~10 consultas; 1.000 clientes em polling de 3 s seriam ~330 req/s só disso | Alta |
| M7 | **Home e posição**: chame `GET /v1/home` uma vez por (endereço, modo) e reaproveite por ~30 s (o servidor guarda 30 s e manda `max-age=30`); não rechame ao voltar de tela. `GET /v1/me/addresses` uma vez na abertura do app e quando editar endereço (não em cada tela) | Cada home com posição nova faz ~17 consultas; `me/addresses` é chamado em 30% das jornadas simuladas | Média |
| M8 | **Paginação**: `limit` 20 (padrão) nas vitrines; não peça `limit=50` por padrão. Carregue a 2ª página só ao rolar (`onEndReached`) | A lista da loja pesa ~10 KB por 20 itens | Baixa |
| M9 | Coordenadas: 6 casas decimais bastam (~0,1 m); não precisa arredondar, mas **não reenvie a posição do GPS a cada movimento**: use a do endereço salvo para a home | O cache da home é por posição exata (a borda do raio de entrega é exata, RN-04) | Baixa |
| M10 | Em 3G instável, reenvie `POST /v1/orders` **com a mesma `Idempotency-Key`** (já é regra): reenviar com chave nova cria pedido duplicado | Contrato | Já combinado |

## Ferramenta para validar do lado do app
`docs/qa/carga/carga-api.mjs` reproduz a jornada (home -> loja -> produto -> busca -> sacola -> pedido -> acompanhamento) e imprime bytes por rota (cru e gzip). Se o app abandonar o `GET /v1/cart` depois do `PUT` (M1), meça de novo com `docs/qa/carga/consultas-por-rota.mjs`.

## Estado
| # | Estado | Quem respondeu |
|---|---|---|
| M1 a M10 | Aberto, aguardando o mobile-dev | |
