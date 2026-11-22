# Capturas em alta resolução (insumos de imagem)

App do cliente: 390x844 pontos a 3x = **1170x2532**, sem moldura. Cada tela existe em duas versões: `app-<tela>.png` (só o app) e `app-<tela>-statusbar.png` (tela cheia: o app respeita a área segura do topo, 47 pt, com barra de status limpa "9:41", sinal, wi-fi, bateria, e indicador de gestos embaixo). Painel do lojista: 1440x900 a 2x = **2880x1800**. Dados do seed, tudo fictício; sem código de entrega nem credencial visível.

| Arquivo | Mostra |
|---|---|
| `app-home*.png` | Início: busca, banner, categorias e início da lista de lojas |
| `app-home-lojas*.png` | Início rolado: cards das lojas (Moda Express Franco em primeiro) |
| `app-loja*.png` | Loja Moda Express Franco: capa, logo, nota, faixa de chegada, abas |
| `app-loja-produtos*.png` | Vitrine rolada: grade com 4 produtos e preços (sem "20% off") |
| `app-produto*.png` | Camiseta básica algodão, tamanho M escolhido, botão Adicionar |
| `app-sacola*.png` | Sacola com 2 itens, "Peça também" e total |
| `app-acompanhamento*.png` | Pedido "Saiu para entrega" (etapa 4 de 5), faixa de chegada e linha do tempo; código de entrega oculto |
| `painel-pedidos-novo.png` | Fila de pedidos com 1 pedido novo (card escuro com "Aceitar pedido") |
| `painel-pedido-novo-alerta.png` | O alerta "Pedido novo" (valor, itens, Aceitar) por cima da fila |
| `painel-pedido-aceitar.png` | Detalhe do pedido com Aceitar/Recusar (mostra nome, telefone e endereço fictícios) |
| `painel-pedido-pronto-coleta.png` | Detalhe de pedido "Pronto para coleta", aguardando a logística |
| `painel-financeiro.png` | Financeiro: vendas, ticket médio, "Você recebe", vendas por dia (30 dias) |

Limites: faixa de horário (ETA) aparece no app (as peças cobrem se precisar); o painel mostra ícone de produto genérico nos itens do pedido (é o desenho do painel); o gráfico do financeiro é esparso (seed concentra vendas nos últimos dias); imagens de produto e logo da loja são ilustrações geradas (estilo kit v3), não fotos.

## Como regerar (`gerador/`)

Banco, Redis, S3 e portas próprios, sem tocar nos de outros: PostgreSQL+PostGIS em 55432 (`webag_mkt`), Redis 16379, S3 mínimo em 19000 (`gerador/s3shim.mjs`, grava em disco), API em 3300, site/painel em 3301, app web exportado em 3302 (`gerador/appserve.mjs`). Variáveis em `gerador/env.sh`. Passos: `pnpm --filter @webag/api db:migrate` e `db:seed` com essas variáveis (seed padrão, 24 h); `expo export --platform web` com `EXPO_PUBLIC_API_URL=http://localhost:3300`; `node gerador/produtos.mjs` e `aplicar-arte.mjs` (ilustrações), `logo.mjs`, `cliente.mjs`/`cliente2.mjs` (clientes e endereço); a loja "Moda Express Franco" foi aproximada do ponto de entrega (lat/lng) e teve a promoção removida no banco `webag_mkt`. Depois `stills-app.mjs plain|sb`, `stills-painel.mjs` e `clip-*.mjs`. Os caminhos nos scripts são `/tmp/webag-mkt/...` e os scripts assumem a pasta de trabalho com `lib.mjs`; ajuste se mudar. O PIX do pedido é aprovado pela rota de simulação `/v1/dev/payments/:id/approve`; o avanço do pedido usa as rotas do lojista e da logística (admin com TOTP próprio do banco de marketing).
