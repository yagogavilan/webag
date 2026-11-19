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
`identity` (auth, sessões, TOTP, convites) · `users` (termos, consentimentos) · `admin` (regiões, categorias, parâmetros, flags, termos, auditoria) · `payments` (PaymentProvider, fake, Mercado Pago, webhook, conciliação) · `finance` (comissão, ledger) · `orders` (pedido, estados, estoque) · `logistics` (tabela de taxa de entrega do admin, motoboys, corridas, WhatsApp, custo; DEC-036) · `exchanges` (regras puras de prazo e elegibilidade da troca; DEC-037). Um módulo só importa o `index.ts` do outro.

## Proxy e IP do cliente (SEC-114)

- `TRUST_PROXY` (obrigatório em produção): número de saltos (0 a 5) **ou** lista de IP/CIDR dos proxies (`127.0.0.1,10.0.0.0/8`). Prefira a lista: só quem está nela declara o IP via `X-Forwarded-For`. `0.0.0.0/0` e `/0` derrubam o boot. A porta da API não fica exposta fora da rede interna.
- `BFF_SHARED_SECRET` (opcional, mínimo 32 caracteres): o BFF do painel web manda o segredo em `X-Webag-Bff-Secret` e o IP do navegador (já resolvido por ele) em `X-Forwarded-For`; só com o segredo certo a API usa esse IP. Sem o segredo, o BFF é um cliente comum. O mesmo valor vai no `.env` do web.

## Seed da Onda 2 (lojas fictícias)

`pnpm --filter @webag/api db:seed` (depois do seed da Onda 1) cria 7 lojas fictícias em bairros reais de Francisco Morato e Franco da Rocha, com 6 produtos cada (variações, estoque, promoções, seções) e fotos geradas. Login dos donos: `lojista.<slug>@seed.webag.local`, senha `webag-seed-lojista-2026` (só desenvolvimento; use `SEED_MERCHANT_PASSWORD` para trocar). Em produção NÃO roda (DEC-030d): produção só recebe o seed base; não existe flag que libere. Fotos precisam do armazenamento local no ar (RustFS, `docker compose up`); sem ele as lojas nascem sem foto.

Fonte dos dados (detalhe no cabeçalho de `seed/onda2.ts`): nomes, donos, produtos, preços e endereços inventados; bairros reais com coordenadas aproximadas do bairro; CPFs fictícios com dígitos válidos; fotos geradas por código com `sharp` (gradiente e formas, sem terceiros, sem direito autoral); conta de recebimento do provedor `fake`.
