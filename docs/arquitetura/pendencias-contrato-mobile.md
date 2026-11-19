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
