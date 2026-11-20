# Pendências de contrato: app do cliente (mobile)

Registro do `mobile-dev` (2026-11-18). O app contorna cada item com a hipótese descrita e some com o contorno quando o contrato mudar. Dono da mudança: `backend-dev` (via CEO), salvo indicação.

| # | Pedido | Hoje no app (hipótese) | Impacto | Onde |
|---|---|---|---|---|
| 1 | Consulta de CEP para o cliente: `GET /v1/cep/{cep}` é só papel lojista (60 por 10 min). Pedir versão pública (ou de conta do cliente) com rate limit por IP | App chama o ViaCEP direto (IP e CEP vão a terceiro). Aviso na tela do CEP: "Consultamos o CEP no ViaCEP". [SEC-123 segue aberto até a API expor; política de privacidade precisa citar o serviço, dono: PO] | Baixo (LGPD art. 9; disponibilidade) | `src/features/address/cep.ts` |
| 2 | `PublicCity` (`/v1/regions`) com `lat`/`lng` do centro | Tabela fixa de 5 cidades usada só quando o geocodificador do aparelho falha | Baixo | `src/features/address/city-centers.ts` |
| 3 | `StoreCard`/`Store` com `cover` (capa 16:9) | Card "Lojas novas" e capa da loja mostram o logo sobre fundo neutro | Médio (visual do início) | `StoreCoverCard.tsx` |
| 4 | Estoque por produto sem variação: `maxQuantity` no produto (hoje só nas variações) | Teto de 10 unidades no app para produto sem variação; o servidor ajusta (`QUANTITY_ADJUSTED`) | Baixo | `app/(customer)/product/[id].tsx` |
| 5 | Limite por pedido (`ABOVE_MAX_ORDER`): valor máximo no `Cart.checkout` (ex.: `maxOrder`) | Mensagem genérica "passou do limite por pedido da loja", sem o valor (spec S1/C6 fala em R$ 2.000,00; não hardcodar no app) | Baixo | `src/features/cart/state.ts` |
| 6 | `POST /v1/cart/acknowledge`: confirmar no contrato se também remove item `OUT_OF_STOCK`/`UNAVAILABLE` | App só oferece "Aceitar e continuar" para `PRICE_CHANGED` e `QUANTITY_EXCEEDS_STOCK`; esgotado pede "Remover" explícito | Baixo | `src/features/cart/state.ts` |
| 7 | Sacola de visitante sem servidor: não há cálculo de entrega/taxa antes do login | Mostra só o subtotal que o visitante viu e a nota "Entrega e taxas são calculadas depois que você entra"; ao entrar, `POST /v1/cart/merge` envia `variantId` + quantidade (o servidor decide preço) | Informativo | `src/features/cart/hooks.ts` |
| 8 | Checkout (`POST /v1/orders`, PIX) está `x-planned` | "Ir para o pagamento" com conta e sem bloqueios mostra aviso "O pagamento fica disponível na próxima etapa" | Bloqueia a Onda 4 | `app/(customer)/cart.tsx` |

## E2E (Maestro)
`apps/mobile/e2e/explorar-ate-sacola.yaml` (endereço por cidade/bairro, loja, produto, sacola, criar conta ao pagar) foi escrito sem emulador: [HIPÓTESE] não executado. IDs dinâmicos usam regex (`home.store-.*`); a primeira variação pode estar esgotada no seed, o que exigiria `tapOn` por id fixo. Validar no primeiro emulador Android disponível (QA).

## Onda 4 e 5 no app (2026-11-19)
| # | Pedido | Hoje no app (hipótese) | Dono |
|---|---|---|---|
| 8 | **Resolvida:** checkout (`POST /v1/orders`) está no contrato e no app (DEC-043 liberou produção) | n/a | n/a |
| 9 | Página de cartão do Mercado Pago (`/pagamento/cartao/[tentativa]` em `apps/web`, ADR-002 §4) para abrir em WebView com o token de uso único | Em `PAYMENT_MODE=mercadopago` o cartão fica indisponível ("O cartão não está disponível agora. Pague com PIX"); em dev e staging (`fake`) o cliente escolhe um cartão de teste e o app manda `fake_tok_*` | backend-dev (web) |
| 10 | `qrCodeBase64` do PIX pode vir `null` (provedor fake) | App mostra só o copia e cola; sem biblioteca de QR no app | backend-dev |
| 11 | Endpoint de "Pedir de novo": não existe | App devolve os itens do pedido à sacola um a um (`PUT /v1/cart/items`); item recusado entra na lista "faltam" | backend-dev (Should) |
| 12 | "Não recebi meu pedido" (`report_not_received` em `allowedActions`) sem operação no contrato | Ação não é exibida | backend-dev |
| 13 | `POST /v1/me/push-devices` exige o `projectId` do EAS para o token Expo: `extra.eas.projectId` (`EAS_PROJECT_ID`) | Sem projectId (dev local) o registro falha em silêncio e o pedido segue sem push | fundador (`eas init`) |
| 14 | Troca: `exchange-options` não traz preço das variações nem a diferença de preço, nem a taxa por região antes de pedir (só `pickupFee` por tipo) | App mostra "o valor fechado aparece quando a loja aprovar" e a taxa de `pickupFee`; não calcula diferença | backend-dev |
| 15 | Troca: sem operação para "levar à loja em vez da coleta" depois de aprovada, nem para "contestar recusa" (X3) | Botões não exibidos; recusada mostra motivo e "Falar com a loja" | backend-dev |
| 16 | Troca: pagamento da taxa só por PIX no app (`payExchange` aceita cartão) | Cartão da taxa fica para depois; PIX copia e cola com polling | mobile-dev |

## Direção v3, Onda 6 e DEC-053 no app (2026-11-19)
| # | Pedido ou situação | Hoje no app | Dono |
|---|---|---|---|
| 9 | **Resolvida:** cartão pela página segura. O app pede `POST /v1/card-intents`, abre só `WEB_PUBLIC_URL/pagar/cartao?i=<token>` (origem e rota conferidas) e acompanha o servidor (`GET /v1/orders`). O formulário de cartões de teste e `PAYMENT_MODE` saíram do checkout | `EXPO_PUBLIC_WEB_URL` precisa existir nos perfis do EAS (`eas.json`) | fundador / mobile-dev |
| 12, 14, 15 | **Resolvidas:** "não recebi meu pedido", "levar à loja", "contestar recusa", diferença de preço e prazo "até DD/MM" | n/a | n/a |
| 17 | `eta` (EtaRange `fromAt`/`toAt`) é aditivo e está sendo entregue pelo back-end. O app usa `delivery.eta` quando vem e, sem ele, ancora `etaMinMinutes`/`etaMaxMinutes` no relógio (faixa de 5 em 5 min). `packages/shared` precisa ser regerado e commitado pelo back-end (`getBrowseProduct` ganhou `params` lat/lng; o app chama as duas assinaturas) | Faixa "Chega entre 15:40 e 16:40" em cartão de loja, loja, sacola, pedido confirmado e acompanhamento; loja fora do alcance mostra "Fora da área de entrega" | backend-dev |
| 18 | Cupons da loja (bilhetes na tela da loja) e `cover` da loja não existem em `BrowseStore`/`StoreCard` | A loja mostra "vantagens" derivadas de `freeAboveCents`, retirada e política de troca; capa = cor da loja (hash do id) com a arte da categoria | backend-dev |
| 19 | Ofertas do início ("Baixou o preço") vêm de `home.offers`; sem `cover`, o cartão de loja usa a arte do kit | n/a | n/a |
| 20 | Consentimentos: `waitlist` só aparece quando já está ligado (não há lista de bairros por usuário no contrato) | Interruptor "Avisar quando o Webag chegar na minha região" só com a lista de espera ativa | backend-dev |
| 21 | Campanhas: `POST /v1/me/push-campaigns/{id}/opened` é chamado ao tocar na notificação (`data.campaignId`, UUID validado) | Abre só `/order/<id>` e `/exchange/<id>` (UUID validado); URL em `data` nunca abre | n/a |
| 22 | Solar (Iconify, CC BY 4.0) e Tabler (logotipo do WhatsApp, MIT) exigem atribuição na tela "Sobre/licenças" da versão pública | Ainda não há tela de licenças | PO / mobile-dev |
| 23 | Pedido do cliente não traz o tipo de produto para "Como vestiu?" (usa o nome do atributo: tamanho, número) e só em pedido de 1 item | Avaliação por item em pedido com vários itens fica para a próxima rodada | PO |

### Textos para revisão jurídica (marcados `[validar com jurídico]` em `src/i18n/pt-BR.ts`)
CC3 exportar (prazo de 24 h e o que a cópia traz), CC4 excluir conta ("O que acontece", prazos de anonimização e retenção fiscal vêm do servidor, arrependimento em horas) e CC6 consentimento de marketing (até 2 por semana, 9h às 20h). O texto do Dialog "Excluir sua conta?" segue a identidade §8.

### Revisão do Security (SEC)
Mexe com auth, pagamento, armazenamento local e deep link: exclusão de conta (senha só em memória, `POST /v1/me/deletion` sem retry), exportação (link de uso único aberto no navegador; o app nunca guarda o arquivo), cartão pela página segura (URL validada contra `WEB_PUBLIC_URL`), push (só identificadores UUID viram rota), relógio do servidor para prazos (I11) e um único socket por aparelho.
