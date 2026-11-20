# ADR-006: Estratégia de testes

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** qa-engineer (dono da estratégia de QA), backend-dev, mobile-dev

Legenda de fontes: ver ADR-001.

## Contexto
Brief §7: cobertura alta em pedido, estoque, pagamento, comissão e trocas; E2E Playwright nos painéis; Maestro no app; teste de carga; CI a cada push. Nest 12 é ESM-only e o template oficial usa Vitest [V]. O QA define planos de teste e critérios de release; este ADR define **ferramentas, camadas e gates técnicos**.

## Opções consideradas
| Tema | Opção | Prós | Contras |
|---|---|---|---|
| Runner API/web/shared | **Vitest 4** | Nativo em ESM, rápido, padrão do Nest 12 | — |
| | Jest 30 | Skill original | ESM só com flag experimental |
| Runner mobile | **jest-expo + RNTL 14** | Caminho suportado pelo Expo | Dois runners no monorepo |
| | Vitest no RN | Um runner só | Sem suporte oficial do Expo |
| Banco em teste | **Testcontainers (mesma imagem PostGIS do compose)** | Banco real, isolado por suíte, igual ao dev | Precisa Docker (o runner do GitHub tem) |
| | Banco em memória / mocks de repositório | Rápido | Não testa SQL, PostGIS, locks nem migrações |
| E2E mobile | **Maestro** | YAML simples, Android/iOS | Emulador no CI é lento |
| | Detox | Maduro | Configuração nativa pesada |
| Carga | **k6** | Script JS, gratuito | Binário fora do npm |

## Decisão
| Camada | Onde | O quê | Gate |
|---|---|---|---|
| Unitário de domínio | `apps/api/src/**/*.spec.ts` | Máquina de estados do pedido, cálculo de preço/frete/cupom/comissão (centavos), estoque, regras de troca, horário da loja em `America/Sao_Paulo` com relógio injetado | Cobertura ≥ 90% de linhas nos módulos `orders`, `payments`, `finance`, `exchanges`, `catalog/stock` |
| Integração | `apps/api/test/integration` | Repositórios e consultas reais (PostGIS, `FOR UPDATE`, concorrência de estoque com 2 transações), migrações do zero, filas | Todo PR |
| E2E de API + contrato | `apps/api/test/e2e` (supertest) | Cada endpoint: sucesso, validação, 401/403/404 de recurso alheio, idempotência; **respostas validadas contra o `openapi.yaml`** | Todo PR |
| Pagamento | API | Provedor `fake` em todo o resto; adaptador MP testado com respostas gravadas (fixtures) e assinatura `x-signature` válida/inválida/repetida/fora de ordem | Todo PR |
| Web | `apps/web` | Vitest + Testing Library em componentes com regra; Playwright nos fluxos (aprovar loja, aceitar pedido, cadastrar produto) contra a stack do compose | PR para `main` |
| Mobile | `apps/mobile` | jest-expo + RNTL (comportamento, estados de tela); Maestro (`apps/mobile/e2e/`) em comprar com PIX, pedir troca, cadastro | Maestro: local e antes de release (G4) |
| Carga | `tests/load` | k6: busca por proximidade, home, criar pedido, webhook | Antes do G4; meta definida com o QA |

Regras: geral ≥ 70% de linhas na API; nada de teste que dependa da ordem de execução; dado de teste por *builders*, não por seed compartilhado; teste flaky vai para quarentena com issue e prazo; Sentry desligado em teste.

## Consequências
- Positivas: o que dá prejuízo (dinheiro, estoque, estado do pedido) é testado contra banco real; contrato vigiado automaticamente.
- Negativas / dívida: dois runners (Vitest e Jest); Maestro fora do CI de PR por custo/tempo de emulador (DT-006).
- Reavaliar se: Expo passar a suportar Vitest oficialmente; houver orçamento para Maestro Cloud ou runner com emulador.

## Fontes
- [V] npm 2026-11-18: `@nestjs/schematics` 12.0.13 (template ESM com Vitest 4 / Vite 8), `vitest` 4.1.12, `jest-expo` ~58.0.15, `@testing-library/react-native` 14.1.0, `testcontainers` 12.2.1, `@playwright/test` 1.65.1.
- [N] https://node.testcontainers.org/modules/postgresql/ ; https://docs.expo.dev/develop/unit-testing/ ; https://docs.maestro.dev ; https://grafana.com/docs/k6/latest/ ; https://playwright.dev/docs/ci-intro
