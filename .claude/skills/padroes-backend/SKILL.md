---
name: padroes-backend
description: Regras de projeto do back-end Webag (stack real, pastas, comandos, dados, pedidos, auth). Ponto de entrada; o detalhe de cada tema está nas skills especializadas citadas.
---

# Stack real (ADR-001, ADR-007)
NestJS 12 (ESM, Express) + TypeScript strict + **Drizzle ORM** (`drizzle-kit`) + PostgreSQL 18/PostGIS + Redis + Socket.IO + **Vitest 4** + Zod 4 (validação). Não há Prisma nem Jest na API. Onde o código ainda difere do ADR, vale `docs/arquitetura/divida-tecnica.md`: fila de webhook em Postgres, não BullMQ (DT-079); Zod local, não os schemas gerados (DT-078); UUID v4 hoje (DT-016). Gerenciador: **pnpm** (workspaces + Turborepo).

# Pastas
```
apps/api/
  src/modules/<modulo>/   # controller -> service -> repository; db/schema.ts; index.ts (API pública)
  src/platform/           # config, database, http, auth, cache, redis, ratelimit, logging, observability, storage, mail
  drizzle/                # migrations SQL geradas (versionadas)
  seed/  test/            # seed dev/staging; testes e2e (*.e2e-spec.ts)
packages/shared/          # tipos, Zod e hooks gerados do OpenAPI (Orval); não editar a mão
docs/arquitetura/api/openapi.yaml   # contrato (fonte da verdade)
```

# Comandos (de `apps/api`, ou `pnpm --filter @webag/api <script>` da raiz)
| Tarefa | Comando |
|---|---|
| Infra local (Postgres, Redis, RustFS, Mailpit) | `pnpm infra:up` |
| Dev / build | `pnpm dev` / `pnpm build` |
| Migration: gerar / aplicar / seed | `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` |
| Testes unit / e2e / ambos | `pnpm test:unit` / `pnpm test:e2e` / `pnpm test` |
| Lint e tipos | `pnpm lint` / `pnpm typecheck` |
| Regenerar cliente após mudar o contrato | `pnpm generate` (raiz; CI roda `generate:check`) |

# Onde está o detalhe (não repetir aqui)
- Módulos, DI, guards, Zod pipe, transação por CLS, eventos: `nestjs-arquitetura-modular`.
- Índices, EXPLAIN, PostGIS, locks de estoque, migrations seguras: `postgres-postgis-performance`.
- Idempotência, filas, webhook do Mercado Pago, razão append-only: `idempotencia-filas-e-webhooks`.
- Logs, métricas, timeouts, retry, health: `observabilidade-e-resiliencia`.
- TDD, Testcontainers, depuração: `tdd-e-debug-sistematico`; pirâmide: `piramide-e-estrategia-de-testes`.
- Contrato, erros RFC 9457, checklist de endpoint: `contrato-api`.

# Regras de projeto (valem sempre)
- Dinheiro em **centavos (integer)**; datas `timestamptz` UTC, conversão para America/Sao_Paulo só na apresentação; IDs públicos UUID (alvo v7 via `uuidv7()` do PG 18, ADR-007; hoje v4, DT-016).
- Módulo só importa de outro via `<modulo>/index.ts`; nunca repositório ou tabela alheia (ADR-007; hoje checado no review, sem regra de lint: verificar).
- Máquina de estados do pedido validada no servidor; toda transição grava histórico (quem, quando, de/para).
- Autorização por recurso em todo endpoint; papéis `customer`, `merchant`, `admin`; sessão conforme ADR-003.
- Pagamento só via Mercado Pago (ADR-002); nunca tocar em dados de cartão; nunca logar token, senha, CPF completo ou payload de pagamento.
- Env validada por Zod no boot; segredos só em `.env` local (modelo `infra/env.example`), nunca commitados.
- CI (GitHub Actions): install, `generate:check`, lint, typecheck, test, build; bloqueia merge se falhar.
