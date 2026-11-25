# Capturas v3 (app do cliente e painel do lojista)

Capturas reais (a versão web do app e o painel `/lojista`) feitas em 2026-11-25 a 2x, JPG qualidade 82, nenhuma acima de 200 KB. Dados fictícios de lojas de **moda, casa e presentes** (roupa, tênis, vaso, luminária), valores em reais inteiros, nenhum alimento, nenhum CPF, telefone, e-mail ou endereço de cliente. Rótulos "Exemplo" não existem na imagem: são telas de verdade.

Tamanhos: **app** 390x844 pt (780x1688 px); **painel desktop** 1440x900 (2880x1800 px); **painel celular** 390x844 pt (780x1688 px). Só viewport, sem rolagem de página inteira (a rolagem usada está na coluna Estado).

## App do cliente (cliente "Marina", Francisco Morato)

| Arquivo | Rota | Estado |
|---|---|---|
| `app-inicio.jpg` | `/` | Início, topo: busca, Entrega/Retirada, banner, categorias Casa e Moda |
| `app-inicio-lojas.jpg` | `/` rolado 560 px | Lista "Lojas perto de você": Moda Express Franco, Moda Passo Firme, Casa & Presentes |
| `app-loja.jpg` | `/store/<Moda Express Franco>` | Topo da loja: capa, logo, nota 4,0, faixa de chegada, abas Camisetas/Bermudas/Vestidos |
| `app-loja-vitrine.jpg` | idem, rolado 520 px | Vitrine em grade: camiseta R$ 60, bermuda R$ 80, vestido R$ 120, tênis R$ 200 |
| `app-produto.jpg` | `/product/<camiseta>` | Camiseta básica R$ 60,00, tamanho M e cor Preta escolhidos, botão Adicionar habilitado |
| `app-sacola.jpg` | `/cart` | Sacola com camiseta R$ 60 e tênis R$ 200, "Peça também", total R$ 266,00 |
| `app-pedido-separando.jpg` | `/order/<id>` | Etapa 3 de 5, "Em separação" |
| `app-pedido-a-caminho.jpg` | `/order/<id>` | Etapa 4 de 5, "Saiu para entrega" (J8: depende do parecer sobre motoboys, ver `pendencias.md`) |
| `app-pedido-entregue.jpg` | `/order/<id>` | Etapa 5 de 5, "Entregue", com Avaliar e Pedir troca |

## Painel do lojista (loja "Moda Express Franco", responsável "Camila"), sufixo `-desk` (1440x900) e `-mob` (390x844)

| Arquivo base | Rota | Estado |
|---|---|---|
| `painel-pedido-novo` | `/lojista/pedidos` | Fila com o pedido novo (card escuro, R$ 146,00, contagem para responder, Aceitar/Recusar), em separação e prontos. No celular, aba "Novos" |
| `painel-pronto-coleta` | `/lojista/pedidos` | Pedido "Pronto para coleta" (R$ 156,00) e o que está com o entregador. Desktop: página rolada 260 px; celular: aba "Prontos" |
| `painel-produtos-lista` | `/lojista/produtos` | Lista com foto, preço e estoque; Vendendo/Pausado. Desktop rolado 190 px |
| `painel-cadastro-rapido` | `/lojista/produtos/novo/<id>` | Cadastro rápido com foto enviada, nome "Moletom cinza", preço R$ 100,00, "Você recebe cerca de R$ 80,02" e categoria Roupas (rascunho, não publicado) |
| `painel-adicionar-varios` | `/lojista/produtos/adicionar-varios` | Lista colada já lida: "5 linhas lidas: 5 prontas", cartões com nome, tamanho, quantidade e preço; botão "Criar 5 rascunhos" (não clicado) |
| `painel-precos-estoque` | `/lojista/produtos/precos` | Tabela de preços e estoque com "Você recebe". Desktop rolado 190 px |
| `painel-financeiro` | `/lojista/financeiro` (Hoje, aba Resumo) | Vendas R$ 1.350,00, ticket médio R$ 150,00, você recebe R$ 1.133,59, vendas por dia |
| `painel-extrato` | `/lojista/financeiro` (Hoje, aba Extrato) | Lista do extrato por pedido: vendas, comissão, líquido e situação |

## Limites que o designer deve saber

- **Horário:** o relógio é o da máquina de captura: os horários saem entre 11:36 e 12:35 (comercial), não 14:00. O app mostra faixa de chegada ("Chega entre ..."), que a revisão jurídica já tratou como possível promessa (K4 em `pendencias.md`).
- **Fotos de produto são ilustrações** do kit v3 (cor chapada), não fotografias. O "Moletom cinza" do cadastro também.
- **Códigos de pedido** (WB-XXXXX) aparecem nos cartões e na tela de acompanhamento. Telefone e endereço do cliente só existem no detalhe do pedido, que **não foi capturado de propósito**.
- O painel mostra "Som desligado" na fila (o navegador de captura não liga o som). O alerta modal "Pedido novo" foi ocultado para mostrar a fila.
- "Você recebe" usa comissão de 15% e tarifa de até 4,98% do ambiente (HIP-C01/C02): R$ 80,02 sobre R$ 100,00. Não é promessa.
- Texto "Lojas perto de você", "Aguardando motoboy" e "Saiu para entrega" são o texto atual do app.
- Não capturado: detalhe do pedido (dados do cliente), o alerta modal, tela do PIX.

## Como regerar

Ambiente local de marketing (banco, Redis, S3 mínimo em `/tmp/webag-mkt`, API 3300, painel 3301, app web 3302). Passos e variáveis: `../capturas/gerador/env.sh`. Resumo:

1. Subir Postgres (porta 55432), Redis (16379), `gerador/s3shim.mjs` (esta pasta, aceita upload por POST), API (`node dist/main.js` com `env.sh`), `next start --port 3301` com `STORAGE_ORIGIN=http://127.0.0.1:19000` e `API_URL=http://localhost:3300`, e `../capturas/gerador/appserve.mjs`. O app web vem de `expo export --platform web` com `EXPO_PUBLIC_API_URL=http://localhost:3300`.
2. `node gerador/preparar-dados.mjs` (lojas de moda/casa, preços redondos, artes) e `node gerador/pedidos.mjs` (pedidos de hoje).
3. `node gerador/app.mjs` e `node gerador/painel.mjs [desk|mob]`. Salvam aqui em JPG.

Teste do pipeline de render: `CHROMIUM_PATH=<chrome> pnpm marketing cliente --pasta teste-render --saida <dir>` usa `../teste-render/apresentacao-cliente.html` (2 slides com estas capturas, PDF 16:9).
