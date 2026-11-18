# ADR-007: Estrutura de módulos da API e pipeline do contrato

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** backend-dev, mobile-dev

Legenda de fontes: ver ADR-001.

## Contexto
Escopo da 1.0 (brief §3) cobre cliente, lojista e admin com pagamentos, trocas, financeiro e auditoria. Um dev back-end, um VPS. Precisamos de fronteiras claras sem custo operacional de microserviços, e de um contrato que gere tipos para app e painel.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| **Monólito modular** (um deploy, módulos com API pública e tabelas próprias) | Uma transação cobre pedido + estoque + pagamento; deploy simples; fronteiras explícitas | Exige disciplina (lint de fronteira) |
| Microserviços | Escala/deploy independentes | Transação distribuída, infra e observabilidade multiplicadas; injustificável com 1 dev |
| Monólito em camadas sem módulos | Rápido no começo | Vira acoplamento total |

## Decisão
**Monólito modular NestJS**, com processo `api` e processo `worker` saindo da mesma imagem (`APP_ROLE=api|worker`): HTTP/WebSocket num, filas BullMQ e agendamentos no outro, para job pesado (imagem, conciliação) não afetar latência.

### Módulos (`apps/api/src/modules/<modulo>`)
| Módulo | Responsabilidade |
|---|---|
| `identity` | Cadastro, login, sessões, códigos, papéis, `store_members` (ADR-003) |
| `users` | Perfil, endereços, consentimentos, exportar/excluir dados |
| `regions` | Cidades/bairros atendidos, CEP e geocodificação (ADR-008) |
| `stores` | Loja, onboarding, documentos, horários, entrega/retirada, aprovação |
| `catalog` | Categorias da plataforma, produtos, variações, estoque, seções, importação |
| `search` | Busca de lojas/produtos com filtros e proximidade (lê projeções de `stores`/`catalog`) |
| `checkout` | Cotação (`POST /v1/checkout/quote`) e criação do pedido; o carrinho vive no cliente |
| `orders` | Máquina de estados, histórico de transições, visão lojista/admin |
| `payments` | `PaymentProvider`, adaptadores `mercadopago` e `fake`, webhooks, conciliação, estornos (ADR-002) |
| `finance` | Regras de comissão/taxa, `ledger_entries`, extratos e relatórios |
| `exchanges` | Retira Troca: solicitação, fotos, aprovação, coleta |
| `reviews` | Avaliação de loja/produto e resposta do lojista |
| `marketing` | Cupons, banners, destaques, push segmentado |
| `notifications` | Push (Expo), e-mail, preferências |
| `media` | Uploads e variantes de imagem (ADR-005) |
| `realtime` | Gateway Socket.IO (ADR-004) |
| `admin` | Configurações, feature flags, modo manutenção, termos, relatórios, `audit_log` |

Infra transversal em `apps/api/src/platform/`: `config` (env validada por Zod no boot), `database` (Drizzle + transação por CLS), `http` (erros RFC 9457, `requestId`, idempotência), `auth` (guards), `queue`, `storage`, `mail`, `logger`, `health`.

### Regras de fronteira
1. Cada módulo: `*.controller.ts` (HTTP/DTO) → `*.service.ts` (regra) → `*.repository.ts` (Drizzle). Schema Drizzle do módulo em `<modulo>/db/schema.ts`.
2. Outro módulo só importa o que estiver em `<modulo>/index.ts` (serviços públicos e tipos). Proibido importar repositório ou tabela alheia — garantido por `no-restricted-imports` no ESLint e checado no review. FK entre tabelas de módulos diferentes é permitida (integridade), acesso não.
3. Transação: `@Transactional()` (`@nestjs-cls/transactional`) no service que orquestra; serviços chamados herdam a transação.
4. Efeitos colaterais (push, e-mail, socket, imagem) saem **depois do commit**: evento de domínio (`@nestjs/event-emitter`) → job BullMQ (retry exponencial, dead-letter). Estado financeiro e de pedido muda dentro da mesma transação; não há outbox na 1.0 (DT-004).
5. Idempotência: tabela `idempotency_keys (key, user_id, rota, hash do corpo, resposta, expira_em)` aplicada por interceptor em criar pedido, pagar, estornar e trocar.
6. IDs públicos UUID v7 (`uuidv7()` do PG 18); dinheiro em centavos (`integer`); datas `timestamptz` UTC.

### Pipeline do contrato
`docs/arquitetura/api/openapi.yaml` (fonte) → `pnpm --filter @webag/shared generate` (Orval) → `packages/shared/src/generated/` (tipos, schemas Zod, hooks TanStack Query) — **código gerado é versionado** e o CI falha se `generate` produzir diff. A API valida entrada com os schemas Zod gerados (`StandardSchemaValidationPipe`) e os testes E2E validam a resposta contra o YAML. `/docs` serve o próprio YAML (Swagger UI); a API não gera contrato a partir de decorators.

## Consequências
- Positivas: uma transação para o que precisa ser atômico; módulos extraíveis no futuro (fronteira já é a API pública do módulo); contrato único para app, painel e validação.
- Negativas / dívida: disciplina de fronteira depende de lint + review; `checkout` sem carrinho no servidor significa que o carrinho não sincroniza entre aparelhos (aceitável na 1.0 `[HIPÓTESE]`).
- Reavaliar se: um módulo precisar escalar sozinho (ex.: `search`) ou o time crescer para vários devs back-end.

## Fontes
- [V] npm 2026-11-18: `@nestjs/common` 12.5.1 (`StandardSchemaValidationPipe`), `nestjs-cls` 7.0.2, `@nestjs-cls/transactional` 4.0.2, `@nestjs-cls/transactional-adapter-drizzle-orm` 2.0.2, `@nestjs/bullmq` 12.0.2, `@nestjs/event-emitter` 12.0.3, `orval` 8.48.0 (`@orval/zod`), `dependency-cruiser` 18.8.0.
- [N] https://docs.nestjs.com/modules ; https://docs.nestjs.com/application/validation.md ; https://www.rfc-editor.org/rfc/rfc9457 ; https://orval.dev/guides/zod ; https://martinfowler.com/bliki/MonolithFirst.html
