# apps/api — API do Webag (NestJS, monólito modular)

Contrato: `docs/arquitetura/api/openapi.yaml` (fonte da verdade; `/docs` serve o YAML). Modelo de dados: `docs/arquitetura/modelo-dados.md`. Decisões: ADR-003, ADR-007, ADR-009.

## Rodar
```bash
pnpm run setup     # na raiz: .env, docker compose (Postgres, Redis, Mailpit), migrações e seed (não confundir com o `pnpm setup` embutido do pnpm)
pnpm dev           # API em http://localhost:3000, e-mails em http://localhost:8025 (Mailpit)
```
Admin de desenvolvimento: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` do `.env` (o primeiro login exige configurar o TOTP: `POST /v1/admin/totp/setup` e `/confirm`).
Sem Docker: `SKIP_DOCKER=1 pnpm run setup` com Postgres 16+ e Redis próprios (`DATABASE_URL`, `REDIS_URL`).

## Banco
`pnpm --filter @webag/api db:generate` gera a migração a partir do schema (`src/modules/*/db/schema.ts`); `pnpm db:migrate` aplica; `pnpm db:seed` semeia (idempotente). Em container: `node dist/platform/database/migrate.js`.

## Testes
`pnpm --filter @webag/api test:unit` (sem infra) e `test:e2e` (Postgres e Redis reais: recria o banco `<db>_test` e usa um Redis lógico próprio; nunca toca nos dados de dev). O e-mail nos testes é capturado em memória; em dev vai ao Mailpit. **Execuções simultâneas (S9):** sem variáveis, cada execução cria o banco `<db>_<pid>_test` e usa um Redis lógico de 1 a 14 derivado do pid (apagado ao final); para fixar (ex.: inspecionar depois) use `TEST_DB_NAME=webag_minha_test TEST_REDIS_DB=8 pnpm --filter @webag/api test:e2e` (nome termina em `_test`; Redis de 0 a 15).

## Simulação de pagamento (só fora de produção)
Com `PAYMENT_PROVIDER=fake` (padrão) existem rotas autenticadas que não fazem parte do contrato e não existem em produção (404):
- `POST /v1/dev/payments` `{amountCents, method: pix|card, storeId?, externalReference?, applicationFeeCents?, cardToken?, installments?}`
- `POST /v1/dev/payments/{id}/approve|decline|expire` (aprovação aceita `reportedAmountCents`, `reportedReference`, `reportedReceiverId`, `reportedFeeCents` para simular divergência) e `GET /v1/dev/payments/{id}`.
- Cartão de teste: `cardToken` terminado em `0000` aprova, `0001` recusa por saldo, `0002` pede 3DS, `0003` dá timeout; outro valor recusa.
- A aprovação passa pelo mesmo caminho do webhook real (`POST /v1/webhooks/fake`, assinado com `FAKE_PAYMENT_WEBHOOK_SECRET`).

## Mercado Pago: de simulado para real só com o `.env` (WB-160)
O mesmo código roda nos dois modos (`PaymentProvider`). Trocar não exige deploy de código, só variáveis. Com `PAYMENT_PROVIDER=mercadopago` e qualquer chave faltando a API **não sobe** e a mensagem lista os nomes (nunca os valores).

| Variável | Onde pegar (painel do Mercado Pago) |
|---|---|
| `MP_CLIENT_ID`, `MP_CLIENT_SECRET` | mercadopago.com.br/developers > **Suas integrações** > aplicação da Webag > **Credenciais** (produção ou de teste). Aplicação do tipo marketplace, com OAuth habilitado |
| `MP_ACCESS_TOKEN` | mesma tela, "Access Token" (`APP_USR-...` em produção; `TEST-...` só fora de produção). A API recusa `TEST-` em produção |
| `MP_WEBHOOK_SECRET` | **Suas integrações** > aplicação > **Webhooks** > configurar notificações > "Revelar" a assinatura secreta. Um segredo por ambiente |
| `MP_OAUTH_REDIRECT_URI` | a página (HTTPS) que recebe `code` e `state` do retorno do OAuth e os envia a `POST /v1/stores/{storeId}/payment-account/callback`. Cadastrar a **mesma** URL em "URLs de redirecionamento" da aplicação |
| `MP_OAUTH_PKCE` | `true` (padrão): o OAuth do lojista usa PKCE (S256, SEC-140). Deixe ligado; só use `false` se o painel do Mercado Pago recusar os parâmetros `code_challenge` `[confirmar no painel]` |
| `MP_PAYER_DOCUMENT_REQUIRED` | `true` se o sandbox exigir CPF no PIX `[confirmar no sandbox]` |
| `PAYMENT_TOKEN_ENC_KEY` | chave AES-256 em base64 que a Webag gera (`openssl rand -base64 32`); cifra os tokens dos lojistas. Guardar fora do servidor |

**URL do webhook** (cadastrar em Webhooks, evento "Pagamentos"): `https://<API_PUBLIC_URL>/v1/webhooks/mercadopago`. A API valida `x-signature` (HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), responde 200 rápido e processa em fila durável; o estado vem sempre de uma re-consulta `GET /v1/payments/{id}` com o token do lojista. A conciliação (a cada 5 min, mais varredura de 48 h) cobre notificação perdida; o PIX vencido é expirado a cada ~20 s.

**Split (DEC-036):** cada lojista conecta a conta por OAuth; a cobrança sai com o token DELE e leva `application_fee` = comissão + **taxa de entrega** + taxa de serviço − desconto da plataforma. O lojista recebe só os itens menos a comissão; a entrega é receita da Webag (a logística é da Webag). `[confirmar no sandbox]` que o MP aceita esse valor e devolve a parte proporcional no estorno parcial.

**Estorno que o provedor recusa (SEC-130):** a tentativa guarda a conta que recebeu (`receiver_account_id`) e o estorno usa os tokens DELA, mesmo se a loja desconectou ou trocou de conta. Recusa (401/403/409/4xx) gera nova tentativa com espera de 5 min, 30 min, 2 h, 6 h e 24 h, alerta `refund_failed` ao financeiro e, na 6ª falha, `refund_exhausted` na fila `GET /v1/admin/payments/refund-queue`: o financeiro manda tentar de novo (`/retry`) ou o super admin aciona a cobertura da Webag (`/cover`, até `estorno_cobertura_teto_cents` por pedido, vira dívida do lojista no ledger). O pagamento ao cliente na cobertura é feito pelo financeiro fora do provedor (alerta `refund_covered_payout_pending`). O token é cifrado, renovado sozinho quando faltam menos de 30 dias e nunca vai a log. Loja sem conta ativa não cobra.

**Não validado em produção.** O adaptador foi escrito contra o SDK oficial (`mercadopago@3.6.2`) e a documentação, com testes de HTTP simulado. Pontos marcados `[confirmar no sandbox]` no código: onde o MP devolve a `application_fee` (fee_details), `capture:false` com split (captura no aceite, HIP-010), devolução da comissão no estorno parcial, CPF no PIX, comportamento de saldo insuficiente do lojista no estorno, campo `identification` do titular.

### Provedor simulado (`fake`) em desenvolvimento
- Cartão: `card.token` = `fake_tok_approved` (aprova), `fake_tok_insufficient` (recusa por saldo), `fake_tok_3ds` (fica pendente com URL de desafio), `fake_tok_timeout` (timeout do provedor). Também vale o sufixo `0000`/`0001`/`0002`/`0003`.
- PIX: o pedido nasce `awaiting_payment`; `POST /v1/dev/payments/{attemptId}/approve|decline|expire` (id em `GET /v1/orders/{id}/payment` não aparece: consulte `payment_attempts.external_reference = <orderId>`) dispara o MESMO caminho do webhook real. Tarifa simulada: PIX 0,99% e cartão 4,98%.

## Módulos (ADR-007)
`identity` (auth, sessões, TOTP, convites) · `users` (termos, consentimentos) · `admin` (regiões, categorias, parâmetros, flags, termos, auditoria) · `payments` (PaymentProvider, fake, Mercado Pago, webhook, conciliação) · `finance` (comissão, ledger) · `orders` (pedido, estados, estoque) · `logistics` (tabela de taxa de entrega do admin, motoboys, corridas, WhatsApp, custo; DEC-036) · `exchanges` (solicitações de troca, taxa após aprovação, reserva do tamanho novo, aprovação por SLA, relatório; DEC-037) · `realtime` (Socket.IO `/rt`, ADR-004) · `notifications` (push Expo e e-mail transacional). Um módulo só importa o `index.ts` do outro.

## Tempo real, push e e-mail transacional (ADR-004)
- **Socket.IO** em `/rt` (mesma porta da API). Handshake com `auth: { token: <access JWT> }`; sem token válido a conexão é recusada. As salas são decididas pelo servidor: `user:{id}`, `store:{id}` (membro com `orders`) e `admin:ops` (admin com MFA e `logistics:read`). `subscribe {orderId}` só aceita pedido do usuário ou da loja dele. Eventos: `order.status_changed`, `order.created` (loja), `delivery_ready` (operação), `exchange.status_changed`, `exchange.requested` (loja). O evento é só aviso: o estado sempre se recupera pelo REST. CORS pelo `CORS_ORIGINS`.
- **Push:** `PUT /v1/me/push-devices` registra o token do Expo; `PUSH_PROVIDER=log` (padrão) só registra, `expo` envia (exige FCM v1 e APNs no EAS, conta do fundador). Texto no catálogo `modules/notifications/domain/catalog.ts` (sem dado pessoal). E-mail transacional pelo mesmo SMTP do resto da API.
- **Taxa da troca:** cobrada na conta da Webag (sem split, `storeId` nulo no pagamento), só depois da aprovação da loja; o PIX da taxa usa o mesmo webhook (`external_reference = exchange:<id>`).

## Segurança do dinheiro e da logística (DEC-043)
- **Estorno e cobertura (SEC-141):** a chamada ao provedor usa um lease (`payment_refund_intents.in_flight_until`, 5 min); só uma conciliação/nova tentativa por vez e `cover` recusa (409) intenção em voo ou que não esteja `exhausted`. Se o provedor concluir depois da cobertura, o estorno é sempre registrado e abre o alerta `refund_double_paid` (o financeiro cancela o repasse por fora).
- **Limite do financeiro (SEC-142):** `estorno_super_admin_cents` vale pela SOMA dos estornos manuais do pedido, e `estorno_financeiro_dia_cents` (R$ 2.000 por padrão, editável) vale por operador em 24 h; conferidos sob lock ao gravar a intenção. Acima, só super admin (403 `SUPER_ADMIN_REQUIRED`).
- **Devolução à loja (SEC-143):** a operação declara `return_confirmed`, mas o pedido só é cancelado e estornado depois que a loja confirma (`POST /v1/stores/{storeId}/orders/{orderId}/return-received`) ou o admin registra por ela com motivo (`POST /v1/admin/orders/{orderId}/store-return`, outra pessoa que a operação que declarou). Alerta `return_awaiting_store` enquanto espera.
- **Contato do cliente na corrida (SEC-144):** WhatsApp e `contact` do detalhe só para `logistics:write`; financeiro e suporte usam `POST .../contact-reveal` (motivo + auditoria). Job horário (`clearContactDue`) apaga telefone e endereço `pii_corrida_retencao_dias` (7) depois que a corrida termina e preenche `pii_cleared_at`.
- **Custo do motoboy (SEC-145):** marcar como pago é `logistics:payout` (financeiro e super admin) e quem lançou o custo não paga (403 `SEGREGATION_OF_DUTIES`; super admin com `overrideReason`). Custo acima de 1,5x o previsto ou de `entrega_custo_alerta_cents` exige motivo e gera o alerta `delivery_cost_high`; acima de `entrega_custo_max_cents`, 422.
- **Total esperado (SEC-147):** `expectedTotalCents` é obrigatório em `POST /v1/orders`; frete ou cupom que mudou entre a cotação e o pedido dá 409 `CART_CHANGED`.

## Ledger da troca e da logística (DT-049)
O pagamento da taxa da troca (conta da Webag, sem split) lança `exchange_fee`: entra `taxa + diferença` no provedor, a taxa é receita (`exchange_fee_revenue`) e a diferença fica a favor da loja (`merchant_payable`); o estorno da taxa lança `exchange_fee_refund`. O custo da corrida lança `logistics_cost` (despesa de logística a pagar ao motoboy; correção lança só a diferença) e "marcar como pago" lança `courier_payout`. Tudo sob o pedido original (`order_id`), sem loja, e `verifyOrder` inclui a taxa de troca na conta do provedor. Relatórios de logística (WB-240): `GET /v1/admin/logistics/reports/summary` e `/payable` (CSV auditado).

## Trocas: SLA, contestação e mediação (DT-050)
A varredura da troca avisa a loja 12 h e 4 h antes de a troca ser aprovada sozinha (`remindStoreDeadlines`, uma vez cada, só push à loja). O cliente contesta a recusa da LOJA uma vez em até `contestacao_dias` (`POST /v1/exchanges/{id}/contest`); a fila do admin (`GET /v1/admin/exchanges/mediations`, atrasada após `mediacao_dias_uteis` dias úteis) e a decisão (`POST /v1/admin/exchanges/mediations/{id}/decision`, `customer` aprova e segue o fluxo, `store` recusa em definitivo) exigem `exchanges:mediate` (operação e super admin).

## Seed de demonstração
`pnpm db:seed` (fora de produção) cria lojas, clientes, avaliações, cupons, tabela de frete inicial (`seedLogistics`) e **pedidos `WB-DMxxx` em vários estados** (aguardando pagamento até entregue, cancelado e recusado, corridas na fila e uma troca pedida). Comissão padrão de 15% só no CLI do seed. Em produção só roda o seed base.

## Proxy e IP do cliente (SEC-114)

- `TRUST_PROXY` (obrigatório em produção): número de saltos (0 a 5) **ou** lista de IP/CIDR dos proxies (`127.0.0.1,10.0.0.0/8`). Prefira a lista: só quem está nela declara o IP via `X-Forwarded-For`. `0.0.0.0/0` e `/0` derrubam o boot. A porta da API não fica exposta fora da rede interna.
- `BFF_SHARED_SECRET` (opcional, mínimo 32 caracteres): o BFF do painel web manda o segredo em `X-Webag-Bff-Secret` e o IP do navegador (já resolvido por ele) em `X-Forwarded-For`; só com o segredo certo a API usa esse IP. Sem o segredo, o BFF é um cliente comum. O mesmo valor vai no `.env` do web.

## Seed da Onda 2 (lojas fictícias)

`pnpm --filter @webag/api db:seed` (depois do seed da Onda 1) cria 7 lojas fictícias em bairros reais de Francisco Morato e Franco da Rocha, com 6 produtos cada (variações, estoque, promoções, seções) e fotos geradas. Login dos donos: `lojista.<slug>@seed.webag.local`, senha `webag-seed-lojista-2026` (só desenvolvimento; use `SEED_MERCHANT_PASSWORD` para trocar). Em produção NÃO roda (DEC-030d): produção só recebe o seed base; não existe flag que libere. Fotos precisam do armazenamento local no ar (RustFS, `docker compose up`); sem ele as lojas nascem sem foto.

Fonte dos dados (detalhe no cabeçalho de `seed/onda2.ts`): nomes, donos, produtos, preços e endereços inventados; bairros reais com coordenadas aproximadas do bairro; CPFs fictícios com dígitos válidos; fotos geradas por código com `sharp` (gradiente e formas, sem terceiros, sem direito autoral); conta de recebimento do provedor `fake`.
