# Board — Webag

> Mantido pelo `project-manager`. Fonte única do status. Plano: `plano-execucao.md`. Escopo: `docs/produto/backlog.md`. Em caso de reinício do container, retomar pela primeira tarefa não `Aceito` da onda atual.

**Onda atual:** Onda 0 — Fundação técnica   **Meta:** `git clone` + `docker compose up` sobe a stack, CI verde, auth base e shells web/mobile funcionando   **Atualizado:** 2026-11-18

Status possíveis: `A fazer` · `Em andamento` · `Em revisão` · `Em QA` · `Aceito` · `Bloqueado`. Estimativa em pontos: preenchida pelos devs na DoR (— = pendente).

## Onda 0 — tarefas
Pasta de trabalho por dono (ver fronteiras em `plano-execucao.md` §2). Cada tarefa termina em commit e push.

| ID | Tarefa | Dono | Pts | Status | Critério de pronto / Observação |
|---|---|---|---|---|---|
| T0-01 | Auditar esqueleto do monorepo contra ADR-001 e registrar lacunas | tech-lead | — | A fazer | Lista de lacunas no board; ADRs pendentes identificados |
| T0-02 | ADRs pendentes: auth/sessão, storage (MinIO/S3), e-mail, tempo real, estratégia de testes | tech-lead | — | A fazer | ADRs em `docs/arquitetura/adr/` aceitos |
| T0-03 | `docker compose` (Postgres+PostGIS, Redis, MinIO, Mailpit, api, web) + `.env.example` | backend-dev | — | A fazer | `docker compose up` sobe tudo; sem segredo commitado |
| T0-04 | CI GitHub Actions: lint, typecheck, testes, build | backend-dev | — | A fazer | Verde no push |
| T0-05 | Migrações base + módulo de configuração + logs estruturados + `/health` + Sentry plugável | backend-dev | — | A fazer | `GET /health` ok; migração idempotente |
| T0-06 | Auth base: Argon2, JWT curto + refresh rotativo, RBAC por papel e por loja, rate limit | backend-dev | — | A fazer | Testes unitários e de integração; depende de threat model (T0-10) |
| T0-07 | OpenAPI + geração do cliente em `packages/shared` (1 comando) | backend-dev | — | A fazer | Cliente regenera e compila |
| T0-08 | Shell `apps/web` (rotas e permissões separadas lojista/admin) consumindo `packages/tokens` | mobile-dev | — | A fazer | Abre login placeholder; typecheck ok |
| T0-09 | Shell `apps/mobile` (Expo Router) com tokens, navegação base, estados padrão e abre no navegador | mobile-dev | — | A fazer | Abre no Expo Web; sem T0-07 pronto usa mock do contrato |
| T0-10 | Threat model de auth e pagamento: fechar e publicar | security-engineer | — | Em andamento | Documento em `docs/seguranca/`; em andamento desde a fundação |
| T0-11 | Specs de tela das ondas 1A, 1B e 2A (todos os estados) | product-designer | — | A fazer | Specs em `docs/design/`; uma onda à frente dos devs |
| T0-12 | Fundação de testes: runner da API, Playwright (web), Maestro/emulação (mobile) | qa-engineer | — | A fazer | Um teste de exemplo roda no CI |
| T0-13 | Revisão do PR de fundação e saída da onda | tech-lead | — | A fazer | Parecer escrito; CI verde no `main` |

Paralelismo: no máximo 3 agentes simultâneos. Sugestão de agrupamento: (backend-dev + mobile-dev + product-designer) em T0-03 a T0-11; tech-lead em T0-01/02 antes e T0-13 depois; qa-engineer e security-engineer revezam um slot.

## Ondas seguintes (nível de épico)
Detalhamento em tarefas só quando a onda anterior fechar (evita retrabalho e board gigante).

| Onda | Épico | Histórias (backlog) | Agentes | Status |
|---|---|---|---|---|
| 1A | Admin e configuração | WB-100, 123, 101, 119, 120, 118, 106, 117 | BE, MB, DS | A fazer |
| 1B | Contas, consentimento e base de pagamento | WB-194, 210, 211, 006-009, 050, 150, 155, 153 | BE, MB, SEC | A fazer |
| 2A | Onboarding e aprovação de lojas | WB-051-054, 218, 103, 104, 075 | BE, MB, SEC | A fazer |
| 2B | Loja e catálogo | WB-055-064, 107 | BE, MB, DS | A fazer |
| 3A | Local, navegação e perfil | WB-035, 001-003, 005, 115, 011, 032 | BE, MB, SEC | A fazer |
| 3B | Loja, produto, busca e carrinho | WB-012-021, 004, 036 | BE, MB, QA | A fazer |
| 4A | Pagamentos e ledger | WB-111, 105, 151, 152, 154, 156-158, 160 | BE, SEC, MB | A fazer |
| 4B | Checkout e pedido | WB-023-026, 190, 067, 216, 068, 069 | BE, MB | A fazer |
| 4C | Acompanhamento e alertas | WB-027-030, 070-072, 191, 192 | BE, MB, QA | A fazer |
| 5A | Avaliação e cupons | WB-031, 074, 073, 116, 022, 033, 034 | BE, MB | A fazer |
| 5B | Trocas | WB-170-175, 177, 178, 193, 037 | BE, MB, SEC | A fazer |
| 5C | Financeiro e admin | WB-076-078, 108-110, 112, 113, 176, 102, 159 | BE, MB, SEC | A fazer |
| 6A | LGPD e requisitos de loja | WB-212-215, 217, 196, 038, 124 | BE, MB, SEC | A fazer |
| 6B | Gestão e Should/Could | WB-122, 114, 125, 065, 066, 121, 195, 197, 198, 199, 010, 079 | BE, MB, QA | A fazer |
| 7 | Seed completo, carga, docs técnicas | backlog §4 (seed) | BE, QA, TL | A fazer |
| 8 | Revisão final: funcional, Nielsen, usabilidade, segurança, capturas, deploy guide, README, G4, tag v1.0.0 | brief §7 e §8 | QA, DS, SEC, TL | A fazer |

Fora da 1.0: WB-161 (Won't) e Fase 2 (WB-300 a 334).

## Definition of Ready (G3) por onda
Antes de abrir cada onda o PM confere, para as histórias dela: Gherkin e regras no PRD, spec de tela (DS), contrato OpenAPI ou "a definir pelo back-end", threat model se TM, dependências externas com data ou mocadas, estimativa dos devs. O que faltar volta ao dono. Nota: os PRDs já trazem Gherkin; spec de tela e contrato são as lacunas esperadas.

## RAID

Escala: Probabilidade/Impacto = Alta, Média, Baixa. Datas no formato AAAA-MM-DD.

| ID | Tipo | Descrição | Prob. | Impacto | Dono | Ação | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Risco | Split do Mercado Pago exige conta e KYC aprovado do lojista (OAuth); lojistas pequenos podem ser barrados ou desistir. Recebimento centralizado pode ser atividade regulada (backlog §7.2) | Alta | Alta | tech-lead (ADR) / CEO | WB-155: ADR antes de 1B fechar; implementar atrás de `PaymentProvider`; fluxo de lojista sem KYC aprovado fica "pendente de conta" e não vende; levar parecer jurídico como pendência ao fundador | Aberto (2026-11-18) |
| R-02 | Risco | 109 Must em 134 histórias; escopo grande para capacidade de agentes e limites de uso | Alta | Alta | PM / CEO | Ondas pequenas, Should/Could por último, corte só pela ordem do backlog §5, nunca LGPD, pagamento, arrependimento, auditoria, denúncia | Aberto (2026-11-18) |
| R-03 | Risco | Rede bloqueada para documentação externa (MP, Apple, Google, HIG, Material, WCAG): integrações e regras de loja baseadas em conhecimento prévio podem estar desatualizadas | Alta | Média | backend-dev / security-engineer | Marcar `[HIPÓTESE]`; isolar MP no adaptador; testes de contrato com mocks; listar itens a conferir contra a doc oficial em `docs/gestao/pendencias-v1.md` antes do G5 | Aberto (2026-11-18) |
| R-04 | Risco | Limites de uso dos agentes podem esgotar no meio de uma onda | Média | Alta | PM | Sub-ondas de 4 a 11 histórias; commit/push por marco; board como ponto de retomada; parar em ponto estável | Aberto (2026-11-18) |
| R-05 | Risco | Container reinicia a qualquer momento e perde trabalho não enviado | Alta | Média | Todos os agentes / PM | Protocolo anti-reinício do plano §1: push imediato, `wip:` no remoto, migrações e seed idempotentes, retomada pelo board | Mitigado por processo (2026-11-18) |
| R-06 | Risco | Sem aparelho real: não há como validar push (FCM/APNs), câmera/upload, teclado, haptics, desempenho em 3G e celular fraco; fontes do design marcadas [M]/[S] | Alta | Média | qa-engineer / product-designer | Validar em Expo Web, emulação e testes automatizados; classificar o que só roda em aparelho; lista de verificação manual no checklist das lojas; pendência explícita ao fundador antes do G4/G5 | Aberto (2026-11-18) |
| R-07 | Risco | Colisão de arquivos entre agentes paralelos (lockfile, `shared`, `apps/web` com dois perfis) | Média | Média | PM / tech-lead | Fronteiras do plano §2; mudança de contrato publicada antes do consumidor; commits de dependência isolados | Aberto (2026-11-18) |
| R-08 | Risco | Aprovação das lojas (Apple/Google) pode recusar o app ou demorar; exige conteúdo de usuário moderado e exclusão de conta | Média | Alta | CEO / fundador | WB-038/124 e 213/214 antes do G5; checklist das lojas na Onda 8; tempo de revisão não verificado [HIPÓTESE] | Aberto (2026-11-18) |
| R-09 | Risco | Textos legais (termos, privacidade, troca) e encarregado de dados sem revisão jurídica | Média | Alta | CEO / fundador | Minuta do PO; revisão do fundador/jurídico antes do G5; registrar como pendência no relatório final | Aberto (2026-11-18) |
| R-10 | Risco | Teste de usabilidade sem usuários reais (meta "comprar em menos de 2 min") | Alta | Média | qa-engineer / product-designer | Roteiro com contagem de toques, telas e palavras como proxy; marcar `[HIPÓTESE]`; validação real no piloto | Aberto (2026-11-18) |
| R-11 | Risco | Tempo real, estoque e pagamento têm condições de corrida (pedido duplicado, estoque negativo, PIX tardio) | Média | Alta | backend-dev / tech-lead | Idempotência, transações e testes de concorrência na Onda 4; WB-158 e 157 | Aberto (2026-11-18) |
| R-12 | Risco | Teste de carga em ambiente local não representa produção | Média | Baixa | qa-engineer | Relatório informa o ambiente e os limites; recomendação de dimensionamento como estimativa | Aberto (2026-11-18) |
| I-01 | Problema | CLAUDE.md §1/§2 desatualizado: cita Cajamar (brief e DEC-009 trazem Campo Limpo Paulista) e app para lojista (é painel web, DEC-005) | — | Baixa | CEO | Atualizar CLAUDE.md; até lá vale o brief | Aberto (2026-11-18) |
| A-01 | Ação | Publicar threat models de auth e pagamento antes de T0-06 e da Onda 1B | — | Alta | security-engineer | Concluir T0-10 | Em andamento |
| A-02 | Ação | Backend-dev entrega contrato OpenAPI de Pedido/Carrinho antes de MB iniciar 3B/4B | — | Média | backend-dev | Marco na Onda 1B/3B | A fazer |
| D-01 | Dependência | Credenciais Mercado Pago do fundador (teste real) | — | Média | Fundador | Pendência para o relatório final; dev usa simulado | Aberto |
| D-02 | Dependência | Contas Apple Developer e Google Play Console | — | Alta | Fundador | Necessárias só no G5 | Aberto |
| D-03 | Dependência | Domínio, servidor e e-mail transacional reais | — | Média | Fundador | Guia de deploy na Onda 8 | Aberto |
| D-04 | Dependência | Validar em aparelho real (push, desempenho) antes de publicar | — | Alta | Fundador | Lista no checklist das lojas | Aberto |
