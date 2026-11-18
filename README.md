# Webag

Marketplace regional de bens de consumo para Francisco Morato e região (SP). Monorepo com API, painéis web (lojista e admin) e app do cliente.

> Estado: esqueleto técnico. Ainda não há regra de negócio implementada. Visão e escopo: `docs/00-visao/brief.md`. Decisões: `docs/decisoes.md` e `docs/arquitetura/adr/`.

## Estrutura

| Pasta | O que é | Porta local |
|---|---|---|
| `apps/api` | API NestJS: `/health`, `/health/ready`, contrato em `/docs` | 3000 |
| `apps/web` | Next.js: painel do lojista em `/lojista` e admin em `/admin` (DEC-005) | 3001 |
| `apps/mobile` | App do cliente (Expo + Expo Router) | 8081 (Metro) |
| `packages/shared` | Tipos, schemas Zod e cliente gerados do OpenAPI | — |
| `packages/tokens` | Design tokens (CSS para web, TS para o app) | — |
| `docs/arquitetura/api/openapi.yaml` | Contrato da API (fonte da verdade) | — |
| `docker-compose.yml` | PostgreSQL + PostGIS, Redis, S3 local (RustFS), Mailpit | 5432, 6379, 9000/9001, 8025 |

Stack e versões: `docs/arquitetura/adr/ADR-001-stack.md`.

## Pré-requisitos

- Node.js 24 (`.nvmrc`; mínimo 22.12) e pnpm 10.28 (`corepack enable` ou `npm i -g pnpm@10.28.0`)
- Docker com Compose (Docker Desktop no Windows/macOS; Docker Engine no Linux)
- App: Expo Go no celular ou emulador Android/iOS

## Primeira execução

```bash
pnpm install
pnpm run setup                     # .env a partir de infra/env.example, docker compose (Postgres, Redis, Mailpit, storage), migrações e seed
pnpm dev                           # API, web e Metro em paralelo
```

Use `pnpm run setup` (ou `pnpm bootstrap`): o `pnpm setup` sem `run` é um comando embutido do próprio pnpm e não faz isto. O script é idempotente e nunca sobrescreve um `.env` existente. Sem Docker: `SKIP_DOCKER=1 pnpm run setup` com Postgres 16+ (PostGIS) e Redis próprios. Manualmente: `cp infra/env.example .env` (Windows PowerShell: `Copy-Item infra/env.example .env`) e `docker compose up -d postgres redis`.

- API: http://localhost:3000/health e contrato em http://localhost:3000/docs
- Painéis: http://localhost:3001/lojista e http://localhost:3001/admin
- App: escaneie o QR do Metro com o Expo Go. No celular físico, troque `EXPO_PUBLIC_API_URL` no `.env` pelo IP da máquina na rede local.
- Apple Silicon: defina `POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine` no `.env` (a imagem oficial do PostGIS é só amd64).

API em container (como em produção): `docker compose --profile app up -d --build api`.

O modelo de variáveis está em `infra/env.example` (e não em `.env.example` na raiz; ver `docs/arquitetura/divida-tecnica.md` DT-008). Valores ali são só para desenvolvimento. Itens marcados `[fundador]` dependem de contas do fundador; sem eles o sistema roda em modo simulado.

## Comandos (raiz)

| Comando | Faz |
|---|---|
| `pnpm lint` | ESLint em todos os pacotes |
| `pnpm typecheck` | TypeScript strict em todos os pacotes |
| `pnpm test` | Testes unitários + E2E da API |
| `pnpm build` | Build da API, shared, web e bundle do app (`expo export`) |
| `pnpm generate` | Regera `packages/shared` a partir do `openapi.yaml` |
| `pnpm generate:check` | Falha se o código gerado estiver desatualizado |

Os testes E2E de readiness com banco real só rodam com `E2E_DEPS=1` e Postgres/Redis no ar (`docker compose up -d postgres redis`); o CI faz isso sempre.

## Como o time trabalha

Regras em `CLAUDE.md`. Contrato muda antes do código (`docs/arquitetura/api/openapi.yaml` → `pnpm generate`). Dívida técnica em `docs/arquitetura/divida-tecnica.md`. CI em `.github/workflows/ci.yml`.
