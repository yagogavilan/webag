# Capturas v3 (app do cliente e painel do lojista)

Capturas reais (a versão web do app e o painel `/lojista`) feitas em 2026-11-25 a 2x, JPG qualidade 82, 29 arquivos, nenhum acima de 205 KB. Dados fictícios de lojas de **moda, casa e presentes** (roupa, tênis, vaso, luminária), valores em reais inteiros, nenhum alimento, nenhum CPF, telefone, e-mail ou endereço de cliente. Rótulos "Exemplo" não existem na imagem: são telas de verdade.

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
| `painel-colar-lista` | `/lojista/produtos/adicionar-varios` | Passo 1 Colar: 6 linhas coladas ("Camiseta básica preta 60,00 - 10 un", vaso, calça, toalha, luminária, tênis), contador "6 linhas" |
| `painel-adicionar-varios` | idem | Passo 2 Revisar: "6 linhas lidas: 6 prontas", cartões com nome, tamanho, quantidade e preço; botão "Criar 6 rascunhos" (não clicado). Desktop rolado 130 px |
| `painel-precos-estoque` | `/lojista/produtos/precos` | Tabela de preços e estoque com "Você recebe". Desktop rolado 190 px |
| `painel-precos-reajuste-previa-desk` | `/lojista/produtos/precos` | 3 produtos selecionados, "Mudar preço" aumentar R$ 5 com prévia (R$ 40,00 para R$ 45,00 etc.). Só desktop; o reajuste é desfeito no fim |
| `painel-precos-reajuste-desfazer-desk` | idem | Depois de aplicar: "Preços reajustados em 3 produtos. Dá para desfazer por 9:59" com botão Desfazer |
| `painel-financeiro` | `/lojista/financeiro` (Hoje, aba Resumo) | Vendas R$ 1.350,00, ticket médio R$ 150,00, você recebe R$ 1.133,59, vendas por dia |
| `painel-extrato` | `/lojista/financeiro` (Hoje, aba Extrato) | Lista do extrato por pedido: vendas, comissão, líquido e situação |

## Correspondência com `docs/marketing/roteiro-apresentacoes-v3.md` §5

O roteiro ficou pronto depois da captura; o que coincide: **A1** `app-loja-vitrine` (6 produtos, preços redondos; sem faixa de tempo só se cortar o topo), **A3/A4** `app-pedido-separando` e `app-pedido-a-caminho` (mostram horário e número do pedido: o designer corta), **P3** `painel-cadastro-rapido-*` (sem a versão "sem Você recebe"), **P4** `painel-colar-lista-*`, **P5** `painel-adicionar-varios-*`, **P7** `painel-produtos-lista-mob` (sem produto pausado nem rascunho), **P8/P9** `painel-precos-reajuste-*-desk`, **P10** `painel-pedido-novo-mob` (card inteiro, com número do pedido: recortar), **P13/P14** `painel-financeiro-*`/`painel-extrato-*` (Hoje: R$ 1.350,00, 9 pedidos, não 5 x R$ 200).
**Não feito:** A2 (tamanhos esgotados), P1 (onboarding), P6 (passo Fotos), P11 e P12 (detalhe do pedido: traz telefone e endereço do cliente, ver abaixo), P15 (entrega). A loja se chama "Moda Express Franco", não "Loja Exemplo", e as fotos são ilustrações (o roteiro pede foto real).

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

## Rodada final (2026-11-25)

Capturas novas ou refeitas (geradores em `gerador/`): `app-produto-tenis.jpg` (A2: Tênis casual R$ 200,00, tamanhos 36 a 40, só o 38 esgotado; `tenis-tamanhos.mjs` ajusta as variações pela API do lojista e `app-tenis.mjs` captura), `painel-fotos-lista-mob.jpg` (P6, passo "Tirar as fotos", Moda Passo Firme; `fotos-lista.mjs`) e `painel-financeiro-desk.jpg` (P13 refeita: Moda Passo Firme, Hoje, **Vendas R$ 1.000,00 em 5 pedidos**, ticket R$ 200,00, você recebe R$ 839,81; pedidos criados por `vendas-redondas.mjs` pelo fluxo normal da API, nada gravado direto no ledger; `financeiro-g6.mjs` captura). O topo da loja com o nome (A1T no mapa de `v3.js`) reaproveita `app-loja.jpg`. A tabela acima mostra o estado da primeira rodada; a P13 de R$ 1.350,00 não existe mais. P11 e P12 seguem sem captura de propósito (dados do cliente).
