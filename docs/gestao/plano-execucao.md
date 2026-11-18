# Plano de Execução — Webag 1.0

Dono: project-manager | Data: 2026-11-18 | Escopo: 134 histórias (DEC-013, sem corte para M1)
Fontes: `docs/produto/backlog.md` (ondas e dependências), `docs/00-visao/brief.md`, `docs/decisoes.md`. Status vivo: `board.md`.

## 1. Premissas e regras de operação

| Premissa | Consequência |
|---|---|
| O fundador não responde perguntas | Decisões ficam com o CEO e viram DEC; o que depende de terceiros (MP real, lojas, jurídico) entra como pendência no relatório final, nunca como bloqueio do código |
| No máximo 3 agentes em paralelo | Revisões (tech-lead, QA, security) ocupam um dos 3 slots |
| O container pode reiniciar a qualquer momento | Onda pequena (4 a 8 histórias), commit + push a cada marco (ver §2); o `board.md` é o ponto de retomada |
| Sem prazos em semanas | O plano mede progresso por ondas e critérios de saída, não por calendário. Estimativa em pontos é dos devs na DoR |
| Sem aparelho real e rede bloqueada para docs externas | Mobile validado em Expo Web/emulação e testes automatizados; fontes externas marcadas `[HIPÓTESE]`; validação em aparelho vira pendência para G4/G5 |
| Backlog tem 109 Must | Não corto (DEC-013). A ordem das ondas já põe o que é lei, dinheiro e loja de apps antes do acabamento. Se os limites de uso acabarem, cai primeiro o que está no §5 do backlog |

### Protocolo anti-reinício (vale para todo agente)
1. Antes de começar: ler `board.md` e `git log -5`; retomar a primeira tarefa não `Aceito` da onda atual.
2. Um branch por sub-onda: `feat/<onda>-descricao`. Commit pequeno por história (ou por bloco coeso de uma história) e `git push` imediatamente. Nunca acumular trabalho local.
3. Marco = história com testes passando, commit e push. O PM marca no board só depois do push.
4. Trabalho incompleto vai para o remoto como commit `wip:` no branch (não no `main`); o `main` só recebe sub-onda que cumpre o critério de saída.
5. Migrações e seed são idempotentes; retomar nunca exige apagar o banco.
6. Se o limite de uso apertar: terminar a história em curso, registrar no board o que sobrou e parar em ponto estável.

## 2. Fronteiras de arquivos (evita conflito entre agentes paralelos)

| Área | Dono (escreve) | Outros agentes |
|---|---|---|
| `apps/api/**` | backend-dev | Só leitura. Tech-lead/security/QA comentam no PR |
| `apps/web/**` (lojista + admin) | mobile-dev | Só leitura |
| `apps/mobile/**` (cliente) | mobile-dev | Só leitura |
| `packages/shared/**` (OpenAPI gerado, schemas Zod, cliente) | backend-dev (contrato); mobile-dev só consome | Mudança de contrato: backend-dev publica **antes** e o consumidor começa depois |
| `packages/tokens/**`, `docs/design/**` | product-designer | Só leitura |
| `docs/arquitetura/**` | tech-lead e backend-dev (ADR e modelo de dados) | |
| `docs/qa/**` | qa-engineer | |
| `docs/seguranca/**` | security-engineer | |
| `docs/gestao/**` | project-manager (único em `board.md`) | |
| `docker-compose*`, `.github/**`, `Dockerfile*`, `.env.example`, raiz do monorepo | backend-dev (infra) | mobile-dev pede por registro no board |
| `README.md`, `docs/telas/**`, guia de deploy | tech-lead coordena; capturas por qa-engineer | Só na Onda 8 |

Regras: (a) o contrato OpenAPI é a fronteira entre api e web/mobile; (b) mobile-dev nunca é escalado em paralelo consigo mesmo: `apps/web` e `apps/mobile` na mesma onda são sequenciais ou divididos entre sub-ondas diferentes; (c) lockfile (`pnpm-lock.yaml`) só muda por um agente por vez: quem adiciona dependência faz commit isolado e avisa no board; (d) seed: arquivos por domínio em `apps/api/seed/` (um arquivo por onda) para não colidir.

## 3. Ondas

Legenda de paralelismo: BE = backend-dev, MB = mobile-dev (web e app), DS = product-designer, TL = tech-lead, QA = qa-engineer, SEC = security-engineer. Os IDs referem-se a `backlog.md`; a "onda do backlog" é a numeração do PO. Cada onda termina com a verificação dos itens "Entregável".

Pré-requisito de toda onda: threat model feito para histórias marcadas TM (SEC, `docs/seguranca/`), spec de tela do DS e contrato OpenAPI do BE (DoR). Para manter o fluxo, **DS e SEC trabalham uma onda à frente** dos devs.

### Onda 0 — Fundação técnica (ATUAL)
| Item | Detalhe |
|---|---|
| Paralelo | BE + MB (esqueleto web/mobile) + DS (specs das ondas 1 e 2) |
| Escopo | Auditar esqueleto do monorepo (ADR-001); `docker compose` (Postgres+PostGIS, Redis, MinIO, Mailpit); `.env.example`; CI (lint, typecheck, teste, build); migrações base; módulo auth base (Argon2, JWT curto + refresh rotativo, RBAC); OpenAPI + `packages/shared` gerado; Sentry/health/logs; shells de `apps/web` e `apps/mobile` consumindo tokens; fundação de testes (Vitest/Jest, Playwright, Maestro em modo emulado) |
| Entregável verificável | `git clone` + `.env.example` + `docker compose up` sobe tudo; `GET /health` ok; CI verde no push; login técnico retorna JWT; web e mobile abrem tela inicial com tokens; cliente `shared` regenera por 1 comando |
| Critério de saída | CI verde no `main`; ADRs pendentes (stack, auth, storage, e-mail) aceitos pelo TL; threat model de auth (SEC) e de pagamento disponíveis |
| Revisão | TL (PR de fundação) |

### Onda 1 — Identidade, configuração e base de dinheiro (backlog onda 0)
Sub-onda 1A (admin e configuração): WB-100, 123, 101, 119, 120, 118, 106, 117. BE + MB(web admin) + DS(specs 1B/2A).
Sub-onda 1B (contas, consentimento, pagamento base): WB-194, 210, 211, 006, 007, 008, 009, 050, 150, 155, 153. BE + MB(mobile cadastro/login + web lojista cadastro) + SEC(revisão auth).
| Item | Detalhe |
|---|---|
| Dependência crítica | WB-155 (ADR split vs. centralizado) **antes** de WB-053, 151, 152 (ver RAID R-01). Recomendação do PO: split; implementar atrás de `PaymentProvider` para não travar |
| Entregável | Admin entra, cria região/categoria/parâmetro/flag/termo com auditoria; cliente se cadastra, confirma por código (Mailpit), entra, recupera senha; lojista cria conta; provedor simulado aprova/recusa e dispara webhook assinado |
| Critério de saída | Testes de auth, RBAC e auditoria verdes; SEC aprova auth (sem Crítico/Alto aberto); ADR-155 aceito |
| Revisão | TL ao fim de 1A e 1B; SEC em 1B; QA smoke |

### Onda 2 — Oferta: lojista, aprovação e catálogo (backlog onda 1)
Sub-onda 2A (onboarding e aprovação): WB-051, 052, 218, 053, 103, 054, 104, 075. BE + MB(web lojista e admin) + SEC(upload e documentos).
Sub-onda 2B (loja e catálogo): WB-055, 056, 057, 058, 059, 060, 061, 062, 064, 107, 063. BE + MB(web lojista) + DS(specs onda 3).
| Entregável | Lojista cadastra loja e documentos, admin aprova; lojista configura horários, raio, taxa, retirada, política de troca e publica produto com fotos, variações, estoque e promoção; moderação funciona |
| Critério de saída | Fila de aprovação ponta a ponta nos testes E2E (Playwright); documentos protegidos (WB-218) e upload validado (SEC); seed da onda 2 (lojas e produtos) carrega |
| Revisão | TL por sub-onda; SEC em 2A; QA E2E do fluxo "cadastrar e aprovar loja" |

### Onda 3 — Descoberta do cliente (backlog onda 2)
Sub-onda 3A (local e navegação): WB-035, 001, 002, 005, 003, 115, 011, 032. BE + MB(mobile; web admin para 115) + SEC(localização/CEP).
Sub-onda 3B (loja, produto, busca, carrinho): WB-016, 017, 012, 013, 014, 020, 021, 018, 015, 004, 019, 036. BE + MB(mobile) + QA.
| Entregável | No app: escolhe cidade/bairro, navega sem login, vê home, loja, produto, busca com filtros e monta carrinho de uma loja só com aviso de troca |
| Critério de saída | Estados (skeleton, vazio, erro, offline) em todas as telas; busca geográfica por raio correta (PostGIS) com teste; Maestro/emulação do fluxo "explorar até carrinho" |
| Revisão | TL; QA contra critérios de aceite; DS revisa fidelidade visual |

### Onda 4 — Transação (backlog onda 3)
Sub-onda 4A (dinheiro): WB-111, 105, 151, 152, 154, 156, 158, 157, 160. BE (+ SEC em revisão contínua) + MB(web admin comissões) .
Sub-onda 4B (checkout e pedido): WB-023, 024, 025, 026, 190, 067, 216, 068, 069. BE + MB(mobile checkout; web lojista painel).
Sub-onda 4C (acompanhamento e alertas): WB-027, 191, 192, 028, 029, 030, 070, 071, 072. BE + MB + QA.
| Dependência crítica | 4B só começa após 4A ter `PaymentProvider` simulado, PIX e cartão com webhooks verdes; tempo real (Socket.IO) com auth por pedido |
| Entregável | Cliente paga por PIX ou cartão (simulado), lojista recebe alerta em tempo real, aceita, muda status, cliente acompanha e recebe push; cancelamento e estorno corretos; ledger fecha a conta (soma = zero) |
| Critério de saída | Testes de integração de pedido/estoque/pagamento/comissão/estorno verdes; idempotência de webhook provada; SEC aprova pagamento (veto); `.env` alterna simulado/real documentado (WB-160) |
| Revisão | TL em cada sub-onda; SEC em 4A e 4B; QA regressão total das ondas 1 a 4 |

### Onda 5 — Pós-venda, dinheiro do lojista e gestão (backlog onda 4)
Sub-onda 5A (avaliação e cupons): WB-031, 074, 073, 116, 022, 033, 034. BE + MB.
Sub-onda 5B (trocas "Retira Troca"): WB-170, 171, 172, 173, 174, 175, 178, 177, 193, 037. BE + MB + SEC(TM de trocas).
Sub-onda 5C (financeiro e admin): WB-076, 077, 078, 108, 109, 110, 176, 112, 113, 102, 159. BE + MB(web) + SEC(repasses).
| Entregável | Fluxo completo de troca com prazos automáticos e piso legal (DEC-011); admin intervém e media; repasses e conciliação com divergência detectada; lojista vê financeiro |
| Critério de saída | Prazos automáticos testados com relógio simulado; regra CDC arrependimento (WB-178) verificada pelo QA; repasse e conciliação sem inconsistência; SEC aprova 5B e 5C |
| Revisão | TL, SEC, QA por sub-onda |

### Onda 6 — Conformidade e acabamento (backlog onda 5)
Sub-onda 6A (LGPD e lojas de apps, bloqueiam G5): WB-212, 213, 214, 215, 217, 196, 038, 124. BE + MB + SEC.
Sub-onda 6B (gestão e Should/Could): WB-122, 114, 125, 065, 066, 121, 195, 197, 198, 199, 010, 079. BE + MB + QA. Ordem de corte: backlog §5.
| Entregável | Exportar dados, excluir conta (app e web), retenção/anonimização, denúncia e moderação, relatórios, itens Should entregues conforme folga |
| Critério de saída | 6A completa (não negociável); 6B: o que não couber vai para `docs/gestao/pendencias-v1.md` com motivo (decisão do CEO) |
| Revisão | SEC (veto) em 6A; TL; QA |

### Onda 7 — Seed completo, carga e documentação técnica
Paralelo: BE (seed completo, scripts) + QA (carga) + TL (docs de arquitetura).
| Entregável | Seed conforme `backlog.md` §4 (4 cidades, 12+ lojas de 6+ categorias, pedidos em todos os estados RN-07, trocas RN-11, 1 divergência de conciliação, credenciais demo por perfil); teste de carga da API (k6 ou similar) com relatório e gargalos corrigidos; ADRs, modelo de dados, OpenAPI e design system atualizados |
| Critério de saída | `docker compose up` com seed abre todos os fluxos; relatório de carga em `docs/qa/`; docs sem divergência do código |

### Onda 8 — Revisão final e entrega (etapas finais)
Sequência (as marcadas "||" rodam em paralelo, máx. 3):
| # | Etapa | Agentes | Saída |
|---|---|---|---|
| 8.1 | Teste funcional de todos os fluxos + regressão | QA | `docs/qa/relatorio-funcional.md`; bugs Crítico/Alto corrigidos (BE/MB) |
| 8.2 || | Revisão heurística de Nielsen (10 heurísticas, todas as telas) | DS | `docs/design/revisao-nielsen.md` com achados e severidade |
| 8.3 || | Revisão de segurança final (ASVS/MASVS, dependências, segredos, LGPD) | SEC | parecer G4 em `docs/seguranca/` |
| 8.4 | Teste de usabilidade com tarefas reais (comprar em menos de 2 min, cadastrar loja, aprovar loja, pedir troca), contando toques, telas e palavras | QA + DS | `docs/qa/usabilidade.md` (simulado por roteiro, pois sem usuários reais: marcar `[HIPÓTESE]`) |
| 8.5 | Correção de tudo que for Crítico/Alto/Média viável; reteste | BE + MB + QA | bugs fechados ou aceitos pelo CEO |
| 8.6 | Capturas de todas as telas | QA (+ MB) | `docs/telas/` indexado |
| 8.7 | Guia de deploy (VPS com Docker + opção gerenciada), Dockerfiles de produção, backup do banco, checklist das lojas | TL + BE | `docs/arquitetura/deploy.md`, `docs/gestao/checklist-lojas.md` |
| 8.8 | README (Windows, macOS, Linux; credenciais demo; onde pegar chaves MP e webhook) | TL | `README.md` |
| 8.9 | **G4**: QA e Security aprovam | QA, SEC | pareceres escritos |
| 8.10 | Histórico limpo, tag `v1.0.0` no `main` | PM/CEO | tag criada. **G5 (publicação nas lojas) não é automático:** exige autorização do fundador (CLAUDE.md §7) |

## 4. Pontos de revisão (resumo)

| Quando | Quem | O que |
|---|---|---|
| Fim de cada sub-onda | TL | Code review do PR, coerência com ADR, dívida técnica |
| Antes de codar histórias TM | SEC | Threat model (ondas 1, 2, 3A, 4, 5B, 6A) |
| Fim das ondas 1B, 2A, 4, 5, 6A | SEC | Revisão de código sensível; veto se houver Crítico/Alto |
| Fim das ondas 2, 3, 4, 5, 6 | QA | Critérios de aceite + regressão acumulada |
| Fim da Onda 8 | QA + SEC | G4 |
| Cada onda | PM | Atualiza board, RAID e `status.md` do CEO (resumo) |

## 5. Caminho crítico

`Onda 0` → `1B (WB-155 ADR + PaymentProvider)` → `4A (PIX/cartão/estorno/ledger)` → `4B (checkout/pedido)` → `5B/5C (trocas, repasses)` → `6A (LGPD, bloqueia G5)` → `8`. A oferta (ondas 2 e 3) corre em paralelo ao dinheiro (4A) assim que 1B fechar: BE faz 4A enquanto MB faz 3A/3B, desde que o contrato de `Pedido`/`Carrinho` esteja publicado. Esse é o único paralelismo BE/MB de duas frentes distintas previsto; fora dele, BE entrega o contrato primeiro e MB segue.

Folga: não calculável em datas (sem prazos). Medida em ondas: qualquer atraso em 1B, 4A ou 6A atrasa o `v1.0.0` na mesma proporção.

## 6. Dependências externas (não bloqueiam o código; bloqueiam G5)

| Dependência | Quem | Quando necessário | Observação |
|---|---|---|---|
| Conta e credenciais Mercado Pago (token, public key, Client ID/Secret, segredo do webhook) | Fundador | Teste real e G5 | Dev usa provedor simulado |
| Aprovação KYC dos lojistas no MP (split) | Lojista/MP | Piloto real | Ver R-01 |
| Apple Developer e Google Play Console | Fundador | G5 | Revisão de loja leva dias e pode recusar [HIPÓTESE, sem fonte verificada] |
| Revisão jurídica de termos, privacidade e troca; encarregado de dados | Fundador/jurídico | G5 | Minuta técnica do PO |
| Domínio, servidor, e-mail transacional real | Fundador | Deploy | Guia de deploy descreve |
| Fotos e conteúdo reais das lojas | Fundador/lojistas | Piloto | Seed usa fotos livres |

## 7. Escopo e mudanças
Escopo congelado em `backlog.md` v1 (134 histórias). Qualquer história nova entra só com decisão do CEO e indicação do que sai. Corte, se necessário: `backlog.md` §5 (Could, depois Should), nunca LGPD, pagamentos, arrependimento, auditoria, denúncia.
