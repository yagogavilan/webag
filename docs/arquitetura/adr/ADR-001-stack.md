# ADR-001: Stack de referência do Webag (versão final da 1.0)

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** backend-dev, mobile-dev, product-designer (estilo), security-engineer
- **Substitui:** a versão "Proposta" deste mesmo ADR (CEO, kickoff)

> Legenda de fontes (vale para todos os ADRs): **[V]** verificado ao vivo nesta sessão (registry npm, tarball oficial ou Docker Hub em 2026-11-18); **[N]** página oficial não acessível nesta sessão (o proxy bloqueia a web aberta) — URL de referência, conferir antes de implementar.

## Contexto
Brief §6 fixa a direção (monorepo pnpm + Turborepo, Expo, Next.js, NestJS, PostgreSQL/PostGIS, Redis, S3, Expo Push). DEC-004 manda começar do zero; DEC-005 junta lojista e admin em `apps/web`. Falta fechar versões, ORM, validação, pipeline de contrato, runner de teste e estilo, que as skills deixavam "proposta".

## Opções consideradas (pontos em aberto)
| Tema | Opção | Prós | Contras |
|---|---|---|---|
| ORM | **Drizzle 0.45** | SQL-first; tipo `geometry` PostGIS nativo e `.for('update')` para lock de estoque [V tarball]; migrações SQL revisáveis; sem binário | 1.0 ainda em RC (troca de API do relational query) |
| | Prisma 7 | DX madura, migrações boas | Colunas PostGIS só como `Unsupported` (toda consulta geo vira SQL cru); sem `SELECT ... FOR UPDATE` no client |
| | Kysely / TypeORM | Kysely: query builder excelente | Kysely sem schema/migração declarativa; TypeORM: histórico de bugs e tipos fracos |
| Validação | **Zod 4 + `StandardSchemaValidationPipe` do Nest 12** [V `@nestjs/common` 12.5.1] | Um schema serve API, formulários (RHF) e cliente gerado | — |
| | class-validator | Padrão antigo do Nest | Classes duplicam o schema; não roda no app |
| Contrato → cliente | **Orval 8** (tipos + Zod + hooks TanStack Query a partir do `openapi.yaml`) [V] | Contrato é a fonte (skill `contrato-api`); gera validação e hooks | Gerador a mais no build |
| | openapi-typescript + openapi-fetch | Leve | Só tipos; Zod escrito à mão diverge do contrato |
| | Code-first (`@nestjs/swagger` decorators) | Sem drift | Inverte o processo "contrato antes do código" |
| Teste API | **Vitest 4** | Padrão do template oficial do Nest 12 (ESM-only) [V `@nestjs/schematics` 12.0.13] | Mobile continua em Jest (jest-expo) |
| | Jest | Skill original | Nest 12 é ESM-only; Jest em ESM exige `--experimental-vm-modules` |
| HTTP adapter | **Express (`@nestjs/platform-express`)** | Ecossistema (helmet, cookies, Sentry), maduro | Não é o mais rápido |
| | `@nestjs/platform-node` / Fastify | Mais rápidos | Sem gargalo de CPU previsto na 1.0; menos exemplos |
| Estilo mobile | **StyleSheet + tema tipado gerado dos tokens** | Zero plugin de build; melhor em Android de 2–3 GB | Menos açúcar sintático |
| | NativeWind 4.2 (Tailwind 3) / 5.0 RC | Mesma linguagem do web | v4 preso ao Tailwind 3; v5 ainda RC [V] |
| | Unistyles 3.8 | Rápido, temas | Dependência nativa a mais |
| Estilo web | **Tailwind CSS 4 com variáveis CSS geradas dos tokens** | Produtivo para painéis | Mapeamento `@theme` → `--wb-*` a fazer pelo mobile-dev (esqueleto usa só as variáveis) |
| | CSS Modules + variáveis `--wb-*` puras | Zero dependência | Mais CSS manual em telas densas (tabelas, filtros) |
| Painéis web | **Um app `apps/web` com áreas `/lojista` e `/admin`** (DEC-005) | Um deploy, um design system web, uma sessão | Bundle de uma área não pode vazar dados da outra: guarda por área + autorização na API |
| | Dois apps (`apps/admin` + `apps/merchant`) | Isolamento total | Dobra build, deploy e configuração; rejeitado pelo fundador (DEC-005) |

## Decisão
| Camada | Escolha (versão fixada) |
|---|---|
| Runtime | Node.js 24 LTS no CI e produção (`.nvmrc`); `engines >=22.12` |
| Monorepo | pnpm 10.28 (workspaces) + Turborepo 2.11 |
| Linguagem | TypeScript **6.0** strict em tudo (TS 7.0 já saiu, mas `typescript-eslint` 8.73 só aceita `<6.1` [V]) |
| Lint/format | ESLint **9.39** flat config + typescript-eslint 8.73; Prettier 3.10 (ESLint 10 ainda sem suporte em `eslint-plugin-react` [V]) |
| API | NestJS 12.5 (ESM, Express), `@nestjs/config` com env validada por Zod, `@nestjs/swagger` só para servir o contrato em `/docs`, `@nestjs/terminus`, `nestjs-pino`, `@nestjs/throttler`, `@nestjs/bullmq`, `@nestjs/event-emitter`, `@nestjs/websockets` + Socket.IO 4.8 |
| Dados | PostgreSQL **18** + PostGIS 3.6 (`uuidv7()` nativo no PG 18), Drizzle ORM 0.45 + drizzle-kit, `pg` 8; transação por request via `nestjs-cls` + `@nestjs-cls/transactional` (adapter Drizzle) |
| Cache/filas | Redis 8 (BullMQ 6, ioredis 5, adapter Socket.IO, rate limit). Valkey 8 é substituto drop-in se a licença AGPL do Redis 8 virar problema |
| Objetos | API S3 (AWS SDK v3). Local: **RustFS** (ver ADR-005: imagem do MinIO não está mais disponível) |
| E-mail | SMTP via nodemailer; Mailpit no dev |
| Web | Next.js **16.4** (App Router), React **19.3.0**, Tailwind 4 |
| Mobile | Expo **SDK 58** (React Native 0.88.1, React 19.3.0), Expo Router 58, TanStack Query, Zustand, React Hook Form + Zod, expo-image, FlashList 2, expo-secure-store |
| Contrato | `docs/arquitetura/api/openapi.yaml` (OpenAPI 3.1) → Orval gera em `packages/shared` |
| Testes | Vitest 4 (api, web, shared), jest-expo + RNTL 14 (mobile), Testcontainers, Playwright, Maestro, k6 (ADR-006) |
| Observabilidade | pino (JSON, `requestId`), Sentry plugável por DSN (`@sentry/nestjs`, `@sentry/nextjs`, `@sentry/react-native`) |
| Infra | Docker Compose no dev; imagens de produção por app; GitHub Actions |

### Estrutura do monorepo (DEC-005)
| Pasta | Conteúdo | Observação |
|---|---|---|
| `apps/api` | NestJS (REST `/v1`, `/health`, `/docs`, WebSocket) | Módulos em ADR-007 |
| `apps/web` | Next.js com **duas áreas separadas no mesmo app**: `/lojista/*` (painel da loja) e `/admin/*` (plataforma) | Substitui o `apps/admin` do `CLAUDE.md` §3. Cada área tem layout, navegação e guarda de acesso próprios (papel `merchant` + vínculo com a loja; papel `admin` + perfil). A autorização real é sempre na API (ADR-003); a guarda do web só evita renderizar a área errada. Hospeda também a página do Card Payment Brick (ADR-002) |
| `apps/mobile` | Expo Router, **só o app do cliente** (lojista e admin são web, DEC-005) | Grupos `(auth)` e `(customer)` |
| `packages/shared` | Tipos, Zod e cliente gerados do OpenAPI (Orval) | Fonte: `docs/arquitetura/api/openapi.yaml` |
| `packages/tokens` | Design tokens (dono: product-designer) | Web: CSS vars `--wb-*`; mobile: `@webag/tokens/native` |

Regra: **uma única versão de React no monorepo** (a fixada pelo Expo SDK, 19.3.0); Next.js se alinha a ela.

## O que NÃO adotamos e por quê
- Pacotes first-party novos do Nest (`@nestjs/drizzle` 0.0.2, `@nestjs/authentication` 0.1.6, `@nestjs/idempotency` 0.0.4, `@nestjs/outbox` 0.1.4, `@nestjs/storage` 0.0.5) [V]: pré-1.0, não entram em caminho crítico (auth, pagamento). Reavaliar quando chegarem a 1.0.
- "NestJS Observe" (SaaS sugerido pelo template do Nest): custo e dado fora do nosso controle; usamos Sentry.

## Consequências
- Positivas: tipos e validação de ponta a ponta saindo do contrato; consultas geográficas e locks em SQL tipado; sem dependência pré-1.0 em auth/pagamento.
- Negativas / dívida: Drizzle 0.45 → 1.0 exigirá migração do relational query (DT-001); TS 7 adiado até o typescript-eslint suportar (DT-002); skills `padroes-backend` (Prisma, Jest) e `padroes-mobile` (NativeWind) ficam desatualizadas — **o CEO precisa atualizá-las** (o tech-lead não altera configuração do time).
- Reavaliar se: Drizzle 1.0 GA; typescript-eslint suportar TS 7; requisito nativo pesado no app (rastreamento em segundo plano na fase 2).

## Fontes
- [V] Registry npm, 2026-11-18: versões e peer deps de `@nestjs/*` 12.5.1, `@nestjs/schematics` 12.0.13 (template ESM + Vitest + AGENTS.md), `expo` 58.0.26 (`bundledNativeModules.json`: react 19.3.0, react-native 0.88.1), `next` 16.4.6, `typescript-eslint` 8.73.0 (peer `typescript <6.1.0`), `drizzle-orm` 0.45.4 (`pg-core/columns/postgis_extension/geometry`, `for(strength)`), `@prisma/client` 7.10.1, `nativewind` 4.2.7 / 5.0.0-rc.1, `eslint-plugin-react` 7.37.5 (peer eslint ≤9.7).
- [N] https://docs.nestjs.com/llms.txt ; https://orm.drizzle.team/docs/extensions/pg#postgis ; https://www.prisma.io/docs/orm/prisma-schema/data-model/unsupported-database-features ; https://www.postgresql.org/docs/18/functions-uuid.html ; https://orval.dev ; https://docs.expo.dev/guides/monorepos/
