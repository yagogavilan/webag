# Revisão do código da API da Onda 0 (tech-lead) — feita pelo backend-dev

- **Data:** 2026-11-18 | **Revisor:** backend-dev | **Escopo:** `apps/api` como entregue na Onda 0 (bootstrap, env, banco, Redis, health, `/docs`, Dockerfile, CI, testes), lido ao construir a Onda 1 em cima dele.
- **Fora de escopo:** `apps/web`, `apps/mobile`, `packages/tokens`.
- **Parecer: APROVADO COM RESSALVAS.** A base é boa e permitiu construir identidade e pagamentos sem retrabalho estrutural. Três defeitos reais apareceram só quando o código passou a ser usado de verdade (itens 1 a 3); os dois primeiros e o terceiro já foram corrigidos nesta entrega. Restam itens de CI e de exposição de informação.

## O que está bem (e deve ser mantido)
| Ponto | Por quê |
|---|---|
| `validateEnv` com Zod, mensagem sem valores | O boot falha sem vazar segredo; foi fácil estender com as regras de produção (SEC-080) e testar |
| `requestId` aceito só se casar com regex, devolvido no header | Evita injeção de log e dá rastreio ponta a ponta; reaproveitado na auditoria |
| `configureApp` compartilhado entre `main.ts` e testes | Os testes sobem o app como em produção; a Onda 1 herdou isso sem esforço |
| Contrato servido como arquivo (`/docs`), sem decorators gerando documento | Contract-first de verdade; permitiu o teste de deriva `test/contract.e2e-spec.ts` |
| Health com timeout de 2 s por dependência e teste com dependências fora do ar | Cobre o caso que importa (readiness 503) |
| Shutdown gracioso do pool e do Redis; CORS fechado por padrão | Certo desde o início |

## Achados
| # | Sev. | Achado | Evidência | Status |
|---|---|---|---|---|
| 1 | Alta | **Redis `lazyConnect` + `enableOfflineQueue: false` e nada conecta no boot.** Só o health check conectava. Qualquer uso real (rate limit, antirreplay de webhook, depois BullMQ) falharia com "Stream isn't writeable" até alguém bater em `/health/ready` | Teste de boot em produção devolveu 503 em rota pública de webhook (`test/production-boot.e2e-spec.ts`) | **Corrigido:** `RedisLifecycle.onModuleInit` conecta (aviso, não erro, se o Redis estiver fora; o ioredis retenta) e `RateLimitService` conecta sob demanda |
| 2 | Alta | **Imagem da API não leva as migrações.** O `package.json` tem `"files": ["dist"]`, e o Dockerfile usa `pnpm deploy --prod`, que só empacota isso; sem os `.sql` não há como migrar dentro do container | Leitura do Dockerfile e do `files` | **Corrigido:** `files` inclui `drizzle`; script `db:migrate:prod` (`node dist/platform/database/migrate.js`), verificado contra o build. O seed não vai na imagem (só tsx); fica para o guia de deploy (Onda 8) |
| 3 | Média | **Sem filtro global de exceções, sem pipe de validação, sem `trust proxy`, sem headers de segurança.** O app respondia o JSON padrão do Nest (sem `code`), o `req.ip` seria o do proxy (rate limit e auditoria inúteis atrás do nginx) e não havia `nosniff`/HSTS (SEC-081) | Skill `contrato-api` exige RFC 9457; `app.setup.ts` | **Corrigido:** `ProblemFilter` (RFC 9457, sem stack; `/health` mantém o formato do Terminus), `ZodPipe` estrito, `TRUST_PROXY`, headers em `configureApp` |
| 4 | Média | **Rotas sem decorator eram públicas.** Nenhum guard global existia, então o `HealthController` e qualquer rota nova nasciam abertas (viola SEC-021) | O health passou a dar 401 quando o guard global entrou | **Corrigido:** guard global nega por padrão; `HealthController` marcado `@Public()`; teste lista as rotas públicas exatas (`test/rbac.e2e-spec.ts`) |
| 5 | Média | **CI sem `pnpm audit` nem varredura de segredos** (SEC-085, G4 = Sim). Actions por tag (DT-013) | `.github/workflows/ci.yml` | **Aberto** (dono: tech-lead + security). Sugestão: passo `pnpm audit --audit-level high` e `gitleaks` antes do build |
| 6 | Baixa | **`/health/ready` devolve a mensagem crua do driver** (`connect ECONNREFUSED host:porta`) em endpoint sem autenticação: vaza endereço interno | Exemplo do próprio contrato (`openapi.yaml`, 503) | **Aberto** (recomendação): fora de `development`, responder só `status: down` e logar o detalhe |
| 7 | Baixa | **`pnpm test` na API exige Postgres e Redis** (o global setup recria o banco `<db>_test`). Antes só o suíte de health pedia `E2E_DEPS=1` | `vitest.config.e2e.ts` | **Registrado** no README da API; CI já tem os serviços. `test:unit` roda sem infra |
| 8 | Baixa | **Perfil `app` do compose** usa `NODE_ENV=production` com segredos de dev: agora o boot recusa (SEC-080, correto), então o perfil deixou de subir localmente | `docker-compose.yml` | **Aberto** (DT-020, guia de deploy) |
| 9 | Info | `no-restricted-imports` por módulo (ADR-007 §2) ainda não está no ESLint; a fronteira depende de review | `eslint.config.mjs` | **Aberto.** A Onda 1 seguiu a regra (só `index.ts`), exceto `db/schema.ts` entre módulos para FK, permitido pelo ADR |

## Decisões que o tech-lead precisa validar
1. ADR-009 (fila de webhook em Postgres, refresh derivado por HMAC, sessão lida do banco, Zod local na API).
2. Dívidas DT-014 a DT-020 (custo e gatilho em `divida-tecnica.md`).
3. Item 6 e item 5 acima, que são de CI e infraestrutura.

## Como reproduzir os achados 1 a 4
`pnpm --filter @webag/api test:e2e` (os testes `production-boot`, `rbac` e `health` cobrem os quatro).
