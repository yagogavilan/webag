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
`pnpm --filter @webag/api test:unit` (sem infra) e `test:e2e` (Postgres e Redis reais: recria o banco `<db>_test` e usa o Redis lógico 15; nunca toca nos dados de dev). O e-mail nos testes é capturado em memória; em dev vai ao Mailpit. **Duas execuções ao mesmo tempo na mesma máquina** (duas sessões, dois worktrees) precisam de banco e Redis próprios, senão uma derruba a outra (`database "webag_test" does not exist`, cache zerado no meio do teste): `TEST_DB_NAME=webag_minha_test TEST_REDIS_DB=8 pnpm --filter @webag/api test:e2e` (nome termina em `_test`; Redis de 0 a 15).

## Simulação de pagamento (só fora de produção)
Com `PAYMENT_PROVIDER=fake` (padrão) existem rotas autenticadas que não fazem parte do contrato e não existem em produção (404):
- `POST /v1/dev/payments` `{amountCents, method: pix|card, storeId?, externalReference?, applicationFeeCents?, cardToken?, installments?}`
- `POST /v1/dev/payments/{id}/approve|decline|expire` (aprovação aceita `reportedAmountCents`, `reportedReference`, `reportedReceiverId`, `reportedFeeCents` para simular divergência) e `GET /v1/dev/payments/{id}`.
- Cartão de teste: `cardToken` terminado em `0000` aprova, `0001` recusa por saldo, `0002` pede 3DS, `0003` dá timeout; outro valor recusa.
- A aprovação passa pelo mesmo caminho do webhook real (`POST /v1/webhooks/fake`, assinado com `FAKE_PAYMENT_WEBHOOK_SECRET`).

## Módulos (ADR-007)
`identity` (auth, sessões, TOTP, convites) · `users` (termos, consentimentos) · `admin` (regiões, categorias, parâmetros, flags, termos, auditoria) · `payments` (PaymentProvider, fake, esqueleto Mercado Pago, webhook, conciliação). Um módulo só importa o `index.ts` do outro.

## Proxy e IP do cliente (SEC-114)

- `TRUST_PROXY` (obrigatório em produção): número de saltos (0 a 5) **ou** lista de IP/CIDR dos proxies (`127.0.0.1,10.0.0.0/8`). Prefira a lista: só quem está nela declara o IP via `X-Forwarded-For`. `0.0.0.0/0` e `/0` derrubam o boot. A porta da API não fica exposta fora da rede interna.
- `BFF_SHARED_SECRET` (opcional, mínimo 32 caracteres): o BFF do painel web manda o segredo em `X-Webag-Bff-Secret` e o IP do navegador (já resolvido por ele) em `X-Forwarded-For`; só com o segredo certo a API usa esse IP. Sem o segredo, o BFF é um cliente comum. O mesmo valor vai no `.env` do web.

## Seed da Onda 2 (lojas fictícias)

`pnpm --filter @webag/api db:seed` (depois do seed da Onda 1) cria 7 lojas fictícias em bairros reais de Francisco Morato e Franco da Rocha, com 6 produtos cada (variações, estoque, promoções, seções) e fotos geradas. Login dos donos: `lojista.<slug>@seed.webag.local`, senha `webag-seed-lojista-2026` (só desenvolvimento; use `SEED_MERCHANT_PASSWORD` para trocar). Em produção só roda com `SEED_ONDA2=true` e `SEED_MERCHANT_PASSWORD`. Fotos precisam do armazenamento local no ar (RustFS, `docker compose up`); sem ele as lojas nascem sem foto.

Fonte dos dados (detalhe no cabeçalho de `seed/onda2.ts`): nomes, donos, produtos, preços e endereços inventados; bairros reais com coordenadas aproximadas do bairro; CPFs fictícios com dígitos válidos; fotos geradas por código com `sharp` (gradiente e formas, sem terceiros, sem direito autoral); conta de recebimento do provedor `fake`.
