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
`pnpm --filter @webag/api test:unit` (sem infra) e `test:e2e` (Postgres e Redis reais: recria o banco `<db>_test` e usa o Redis lógico 15; nunca toca nos dados de dev). O e-mail nos testes é capturado em memória; em dev vai ao Mailpit.

## Simulação de pagamento (só fora de produção)
Com `PAYMENT_PROVIDER=fake` (padrão) existem rotas autenticadas que não fazem parte do contrato e não existem em produção (404):
- `POST /v1/dev/payments` `{amountCents, method: pix|card, storeId?, externalReference?, applicationFeeCents?, cardToken?, installments?}`
- `POST /v1/dev/payments/{id}/approve|decline|expire` (aprovação aceita `reportedAmountCents`, `reportedReference`, `reportedReceiverId`, `reportedFeeCents` para simular divergência) e `GET /v1/dev/payments/{id}`.
- Cartão de teste: `cardToken` terminado em `0000` aprova, `0001` recusa por saldo, `0002` pede 3DS, `0003` dá timeout; outro valor recusa.
- A aprovação passa pelo mesmo caminho do webhook real (`POST /v1/webhooks/fake`, assinado com `FAKE_PAYMENT_WEBHOOK_SECRET`).

## Módulos (ADR-007)
`identity` (auth, sessões, TOTP, convites) · `users` (termos, consentimentos) · `admin` (regiões, categorias, parâmetros, flags, termos, auditoria) · `payments` (PaymentProvider, fake, esqueleto Mercado Pago, webhook, conciliação). Um módulo só importa o `index.ts` do outro.
