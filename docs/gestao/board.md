# Board — Webag

> Mantido pelo `project-manager`. Fonte única do status. Plano: `plano-execucao.md`. Escopo: `docs/produto/backlog.md`. Em caso de reinício do container, retomar pela primeira tarefa não `Aceito` da onda atual.

**Onda atual:** Onda 2 (em andamento: falta web do catálogo e fechamento) e preparação da Onda 3   **Meta:** loja cadastrada, aprovada, configurada e com catálogo publicável pelo web do lojista; depois, descoberta do cliente no app   **Atualizado:** 2026-11-18

Status possíveis: `A fazer` · `Em andamento` · `Em revisão` · `Em QA` · `Aceito` · `Bloqueado`. Estimativa em pontos: preenchida pelos devs na DoR (— = pendente).

## Resumo das ondas

| Onda | Escopo | Status | Evidência |
|---|---|---|---|
| 0 | Fundação técnica (T0-01 a T0-13) | Concluída | `review-onda0-api.md`; CI e compose; shells web e app |
| 1A | Admin e configuração (API + web admin) | Concluída | DEC-026; commits `eca7f84` a `b4bea28`, `de81b06` |
| 1B | Contas, consentimento, base de pagamento (API; app cadastro/login/endereço; web lojista cadastro) | Concluída | DEC-026, DEC-028; `PaymentProvider` simulado e webhook assinado |
| **Onda 1 (fechamento)** | Pareceres | **Concluída com ressalvas** | Security: APROVADO COM RESSALVAS, veto da DEC-029 retirado (`docs/seguranca/revisao-onda1.md`); tech-lead: B1 corrigido por desenho (`mfa_token`, `55fb0ac`) e lista "importante" I1-I8 endurecida (`ba4d5ee`, `ce9cc44`, `9a58f5d`). Ver ressalvas abaixo |
| 2A | Onboarding e aprovação de lojas | API e web entregues; revisões pendentes | `e7ac2a7`, `1d8a647`, `50dfc96`, `c68a9fb` (E2E cadastrar e aprovar loja) |
| 2B | Loja e catálogo | API entregue; web do catálogo a fazer | `f90a1a9`, `fcce55f` (API); `55643c6` (web configuração da loja C1-C5), `c68a9fb` (equipe L9) |
| Seed da Onda 2 | Lojas fictícias em Francisco Morato e Franco da Rocha, fotos geradas | Entregue na API | `d6cad83` (a validar no QA com `docker compose`, nunca testado no sandbox: DEC-026) |
| 3A | Local, navegação e perfil | A fazer (detalhado abaixo) | |
| 3B | Loja, produto, busca e sacola | A fazer (detalhado abaixo) | |

Pendência de registro: o parecer escrito do tech-lead que reverifica o B1 e confirma I1-I8 não está em `docs/arquitetura/reviews/` (o review da Onda 1 segue como REPROVADO no arquivo). Pedir ao tech-lead um adendo curto (ação A-08). Item da lista "importante" ainda aberto por leitura do código: I7 parte 2 (links de reativação antigos continuam válidos se o reset for repetido); o aviso aos demais super admins já existe. Confirmar no adendo.

## Onda 0 — tarefas (concluída)
T0-01 a T0-13 entregues (ver commits da fundação e `review-onda0-api.md`). Detalhe histórico no git; não reabrir sem decisão do CEO.

## Onda 2 — em andamento
Pasta de trabalho por dono em `plano-execucao.md` §2. Cada tarefa termina em commit e push.

| ID | Tarefa | Dono | Pts | Status | Critério de pronto / Observação |
|---|---|---|---|---|---|
| T2-01 | API de lojas, documentos privados, conta de pagamento OAuth, equipe e fila de aprovação (WB-051-054, 218, 103, 104, 075) | backend-dev | — | Em revisão | Entregue `e7ac2a7`; falta parecer do TL e revisão do Security (upload e documentos) |
| T2-02 | Web lojista: onboarding passos 1-4, revisão, acompanhamento, upload com recorte e compressão; equipe (L9) | mobile-dev | — | Em revisão | `1d8a647`, `c68a9fb`; E2E cadastrar e aprovar loja passando |
| T2-03 | Web admin: fila de aprovação, caso com checklist e documentos protegidos, detalhe da loja com suspender/reativar (A1-A3) | mobile-dev | — | Em revisão | `50dfc96` |
| T2-04 | API de catálogo: produtos, variações, estoque, promoção, seções, imagens, importação CSV, ações em lote, moderação (WB-060-066, 107) | backend-dev | — | Em revisão | `f90a1a9`; limites registrados em DT-028 a DT-030 |
| T2-05 | API de configuração da loja: horários, feriados, pausa, entrega (PostGIS), retirada, política de troca (WB-055-059) | backend-dev | — | Em revisão | `fcce55f` (E2E) |
| T2-06 | Web lojista: configuração da loja (menu, perfil com logo e capa, horários e pausa, entrega e retirada, política de troca; C1-C5) | mobile-dev | — | Em revisão | `55643c6` |
| T2-07 | **Web lojista: catálogo** (lista, produto com variações, fotos, estoque, promoção, seções, importação CSV, moderação) | mobile-dev | — | A fazer | Consome o contrato de T2-04; telas e estados conforme spec; E2E Playwright de "publicar produto"; XLSX e URL de foto fora (DT-028) |
| T2-08 | Seed da Onda 2 (lojas e produtos) | backend-dev | — | Em revisão | `d6cad83`; idempotente; carga validada pelo QA |
| T2-09 | Revisão do TL das sub-ondas 2A e 2B (inclui DT-029/030/031) | tech-lead | — | A fazer | Parecer em `docs/arquitetura/reviews/` |
| T2-10 | Revisão do Security da 2A (upload, documentos privados, OAuth de pagamento) e do catálogo (upload de imagem) | security-engineer | — | A fazer | Sem Crítico/Alto aberto; DT-005 (antivírus) decidido |
| T2-11 | QA: E2E "cadastrar e aprovar loja", critérios de aceite 2A/2B, seed carrega | qa-engineer | — | A fazer | Relatório em `docs/qa/`; depende de T2-07 para o fluxo de produto |
| T2-12 | Specs de tela das Ondas 3A e 3B (uma onda à frente) e contrato da sacola | product-designer / backend-dev | — | A fazer | Ver A-02; spec com todos os estados |

Critério de saída da Onda 2: T2-07 a T2-11 aceitos; fila de aprovação ponta a ponta no Playwright; documentos protegidos e upload validados pelo Security; seed carrega. Marcar Onda 2 como concluída só depois disso.

## Onda 3 — Descoberta do cliente (detalhada; abre quando T2-07 e T2-09 fecharem, ou antes no que não depende do catálogo web)
Contexto de decisão: DEC-028 (sem mapa; endereço por CEP e localização; endereços na API), DEC-022 (sacola em 3B; bloqueio só no pagamento; WB-020/021/022 sobem para 3B). Dono do app: mobile-dev (sequencial com o web; nunca em paralelo consigo mesmo). Back-end publica o contrato antes do app consumir (plano §2).

### Sub-onda 3A — Local, navegação e perfil
| ID | Tarefa | Dono | Pts | Status | Critério de pronto / Observação |
|---|---|---|---|---|---|
| T3A-01 | API `/v1/me/addresses` (CRUD, endereço padrão, limite por conta, validação de CEP) + OpenAPI + cliente `shared` | backend-dev | — | A fazer | DEC-028 c; testes de integração; LGPD: dado pessoal com finalidade registrada |
| T3A-02 | API de regiões e cobertura (WB-001, 004): cidade/bairro atendidos, lista de espera (Should) | backend-dev | — | A fazer | Usa regiões da Onda 1A; WB-004 é Should |
| T3A-03 | API de banners e destaques para o app (WB-115, WB-011) | backend-dev | — | A fazer | Banner 2:1 (DEC-024 a); cache curto |
| T3A-04 | Web admin: banners e destaques (WB-115) | mobile-dev | — | A fazer | Tarefa web; sequencial ao app |
| T3A-05 | App: onde estou, CEP com autocompletar, endereços salvos migrados para a API com cache local (WB-001, 002, 003) | mobile-dev | — | A fazer | Fecha SEC-122: limpar endereços ao perder ou trocar sessão |
| T3A-06 | App: navegar sem login e estados globais sem conexão e erro (WB-005, 035) | mobile-dev | — | A fazer | Skeleton, vazio, erro e offline em todas as telas |
| T3A-07 | App: home com banners e categorias (WB-011) e perfil e dados pessoais (WB-032) | mobile-dev | — | A fazer | WB-032 respeita LGPD (minimização) |
| T3A-08 | Ressalvas do Security no app: SEC-121 (`mfaSetupRequired` como credencial errada e logout, `auth-api.ts:99`), SEC-122, SEC-126 (`+not-found.tsx` que volta à home), SEC-123 (ViaCEP: citar na política ou passar pela API; texto da política com o PO na Onda 6) | mobile-dev (+ PO no texto) | — | A fazer | Verificação do Security em `revisao-onda1.md` |
| T3A-09 | Revisão do Security de localização e CEP (TM da 3A) | security-engineer | — | A fazer | Antes de T3A-05 |

### Sub-onda 3B — Loja, produto, busca e sacola
| ID | Tarefa | Dono | Pts | Status | Critério de pronto / Observação |
|---|---|---|---|---|---|
| T3B-01 | Contrato OpenAPI de carrinho/sacola e pedido (A-02), com regra de uma loja só e aviso de troca | backend-dev | — | A fazer | Publicado antes de T3B-07; define se a sacola é local, na API ou híbrida (decisão do TL registrada em ADR) |
| T3B-02 | API de descoberta com PostGIS: lojas por raio de entrega e região, aberta/fechada, ordenação por distância, seções da home (WB-012, 036) | backend-dev | — | A fazer | Teste de raio correto (critério de saída da Onda 3); índice GiST; WB-036 é Should |
| T3B-03 | API de busca de produtos e lojas, filtros e ordenação (WB-013, 014); histórico de buscas (WB-015, Should) | backend-dev | — | A fazer | Paginação por cursor; busca sem login; limite de taxa |
| T3B-04 | API de página da loja e do produto (WB-016, 017) com avaliações em exibição vazia (WB-018, dados vêm na 5A) | backend-dev | — | A fazer | Loja fechada visível e navegável (DEC-022) |
| T3B-05 | App: home com seções de lojas e produtos (WB-012) | mobile-dev | — | A fazer | Depende de T3B-02 e T3A-07 |
| T3B-06 | App: busca, filtros e ordenação (WB-013, 014, 015) | mobile-dev | — | A fazer | Depende de T3B-03 |
| T3B-07 | App: página da loja e do produto, escolha de variação (WB-016, 017) | mobile-dev | — | A fazer | Depende de T3B-04 |
| T3B-08 | App: sacola (WB-020), aviso ao trocar de loja (WB-021), WB-022 (movida da 5A, DEC-022); bloqueio só no pagamento | mobile-dev | — | A fazer | Depende de T3B-01; verificar o escopo de WB-022 no PRD ao abrir |
| T3B-09 | Favoritos (WB-019, Should) e região não atendida com lista de espera (WB-004, Should) | backend-dev + mobile-dev | — | A fazer | Corte conforme backlog §5 se o limite de uso apertar |
| T3B-10 | QA: Maestro/emulação do fluxo "explorar até a sacola"; critérios de aceite 3A e 3B | qa-engineer | — | A fazer | Critério de saída da Onda 3 |
| T3B-11 | Revisão do TL das sub-ondas e fidelidade visual do DS | tech-lead / product-designer | — | A fazer | |

Critério de saída da Onda 3 (plano §3): estados em todas as telas; busca por raio correta (PostGIS) com teste; Maestro/emulação do fluxo; ressalvas SEC-121/122/123/126 fechadas.

## Ressalvas carregadas (Onda 1 e Onda 2)
| Ressalva | Sev. | Destino | Dono | Status |
|---|---|---|---|---|
| SEC-129: `WEB_TRUSTED_PROXY_HOPS`/`WEB_CLIENT_IP_HEADER` e `BFF_SHARED_SECRET` obrigatórios em produção (hoje só aviso/opcional) | Média | Onda 8 (guia de deploy); obrigatório antes do G4. Sugestão: o boot de produção recusar sem elas | backend-dev, mobile-dev, tech-lead | Aberta |
| O-1: `correctEmail` grava o e-mail novo e só então responde 429 pelo intervalo de 60 s (`auth.service.ts:143-151`) | Bug baixo | Aproveitar a próxima passagem do backend na Onda 3A | backend-dev | Aberta |
| O-2: no host do lojista, reset de admin devolve o `resetTicket` no corpo (`route.ts:63`) | Baixa | Onda 3A (junto do web) | mobile-dev | Aberta |
| SEC-121 (app), SEC-122, SEC-123, SEC-126 | Baixa | Onda 3A (T3A-08) | mobile-dev, PO (texto SEC-123) | Aberta |
| Lista "importante" I1-I8 do tech-lead | Importante | I1-I8 atendidos no código; adendo do TL pendente (A-08); verificar I7 parte 2 | tech-lead | Parcial |
| DT-031 rotação do `BFF_SHARED_SECRET` | Dívida | Antes do G5 | backend-dev, tech-lead | Aberta |
| Playwright do login em 2 passos contra a API real (SEC-115) | Teste | Onda 8 | qa-engineer | Aberta |
| DT-021 (retenção, SEC-075), Sentry `beforeSend` (SEC-073), vetor oficial do MP (DT-023), `incidentes.md` | G4 | Onda 8 | conforme `revisao-onda1.md` | Aberta |
| DT-029/030 (pedido e notificação de estoque dependem das Ondas 4 e 4A) | Dívida | Onda 4 | backend-dev | Aberta |

Paralelismo: no máximo 3 agentes simultâneos. Sugestão agora: mobile-dev em T2-07; backend-dev em T3B-01 e depois T3A-01/T3B-02; security-engineer e tech-lead em T2-09/T2-10; product-designer em T2-12.

## Ondas seguintes (nível de épico)
Detalhamento em tarefas só quando a onda anterior fechar (evita retrabalho e board gigante). WB-022 saiu da 5A para a 3B (DEC-022).

| Onda | Épico | Histórias (backlog) | Agentes | Status |
|---|---|---|---|---|
| 4A | Pagamentos e ledger | WB-111, 105, 151, 152, 154, 156-158, 160 | BE, SEC, MB | A fazer |
| 4B | Checkout e pedido | WB-023-026, 190, 067, 216, 068, 069 | BE, MB | A fazer |
| 4C | Acompanhamento e alertas | WB-027-030, 070-072, 191, 192 | BE, MB, QA | A fazer |
| 5A | Avaliação e cupons | WB-031, 074, 073, 116, 033, 034 | BE, MB | A fazer |
| 5B | Trocas | WB-170-175, 177, 178, 193, 037 | BE, MB, SEC | A fazer |
| 5C | Financeiro e admin | WB-076-078, 108-110, 112, 113, 176, 102, 159 | BE, MB, SEC | A fazer |
| 6A | LGPD e requisitos de loja | WB-212-215, 217, 196, 038, 124 | BE, MB, SEC | A fazer |
| 6B | Gestão e Should/Could | WB-122, 114, 125, 065, 066, 121, 195, 197, 198, 199, 010, 079 | BE, MB, QA | A fazer |
| 7 | Seed completo, carga, docs técnicas | backlog §4 (seed) | BE, QA, TL | A fazer |
| 8 | Revisão final: funcional, Nielsen, usabilidade, segurança, capturas, deploy guide, README, G4, tag v1.0.0 | brief §7 e §8 | QA, DS, SEC, TL | A fazer |

Antes da Onda 4A começar o checkout: DT-004/DT-015/DT-022 (outbox, fila, e-mail em memória) e DT-023 conforme `divida-tecnica.md`.

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
| R-04 | Risco (materializado) | Limites de uso de 5 h dos agentes: 3 ocorrências em 2026-11-18 (06:50, 11:50 e 16:50 UTC) e 1 reinício de container; o trabalho commitado sobreviveu, o não commitado virou `chore: checkpoint` | Alta | Alta | PM / CEO | Marcos pequenos (uma tarefa Tnn por vez, 1 a 3 histórias); commit e push por marco; `wip:` no branch; tarefa em curso termina antes de parar; board como ponto de retomada; no retorno, retomar a primeira tarefa não Aceita; checkpoints só como rede de segurança, nunca como entrega | Aberto, mitigado por processo (2026-11-18) |
| R-05 | Risco | Container reinicia a qualquer momento e perde trabalho não enviado | Alta | Média | Todos os agentes / PM | Protocolo anti-reinício do plano §1: push imediato, `wip:` no remoto, migrações e seed idempotentes, retomada pelo board | Mitigado por processo (2026-11-18) |
| R-06 | Risco | Sem aparelho real: não há como validar push (FCM/APNs), câmera/upload, teclado, haptics, desempenho em 3G e celular fraco; fontes do design marcadas [M]/[S] | Alta | Média | qa-engineer / product-designer | Validar em Expo Web, emulação e testes automatizados; classificar o que só roda em aparelho; lista de verificação manual no checklist das lojas; pendência explícita ao fundador antes do G4/G5 | Aberto (2026-11-18) |
| R-07 | Risco | Colisão de arquivos entre agentes paralelos (lockfile, `shared`, `apps/web` com dois perfis) | Média | Média | PM / tech-lead | Fronteiras do plano §2; mudança de contrato publicada antes do consumidor; commits de dependência isolados | Aberto (2026-11-18) |
| R-08 | Risco | Aprovação das lojas (Apple/Google) pode recusar o app ou demorar; exige conteúdo de usuário moderado e exclusão de conta | Média | Alta | CEO / fundador | WB-038/124 e 213/214 antes do G5; checklist das lojas na Onda 8; tempo de revisão não verificado [HIPÓTESE] | Aberto (2026-11-18) |
| R-09 | Risco | Textos legais (termos, privacidade, troca) e encarregado de dados sem revisão jurídica | Média | Alta | CEO / fundador | Minuta do PO; revisão do fundador/jurídico antes do G5; registrar como pendência no relatório final | Aberto (2026-11-18) |
| R-10 | Risco | Teste de usabilidade sem usuários reais (meta "comprar em menos de 2 min") | Alta | Média | qa-engineer / product-designer | Roteiro com contagem de toques, telas e palavras como proxy; marcar `[HIPÓTESE]`; validação real no piloto | Aberto (2026-11-18) |
| R-11 | Risco | Tempo real, estoque e pagamento têm condições de corrida (pedido duplicado, estoque negativo, PIX tardio) | Média | Alta | backend-dev / tech-lead | Idempotência, transações e testes de concorrência na Onda 4; WB-158 e 157 | Aberto (2026-11-18) |
| R-12 | Risco | Teste de carga em ambiente local não representa produção | Média | Baixa | qa-engineer | Relatório informa o ambiente e os limites; recomendação de dimensionamento como estimativa | Aberto (2026-11-18) |
| R-13 | Risco | SEC-129: sem `WEB_TRUSTED_PROXY_HOPS`/`WEB_CLIENT_IP_HEADER` e `BFF_SHARED_SECRET` em produção, todos os usuários do painel compartilham o IP do BFF; um atacante tranca o login de lojistas (espera por conta+IP) e derruba o cadastro de lojas | Média | Média | backend-dev / mobile-dev / tech-lead | Onda 8: tornar obrigatório (boot recusa) e documentar no guia de deploy; bloqueia G4 | Aberto (2026-11-18) |
| R-14 | Risco | Seed e `docker compose` nunca executados com Docker (sandbox sem Docker, DEC-026): falha só aparece no ambiente do fundador | Média | Média | qa-engineer / backend-dev | Validar em CI com serviços; registrar em `pendencias-v1.md` o que só roda fora do sandbox | Aberto (2026-11-18) |
| I-02 | Problema | O-1: `correctEmail` responde 429 após gravar o e-mail novo | — | Baixa | backend-dev | Checar o limite antes de gravar (Onda 3A) | Aberto (2026-11-18) |
| I-03 | Problema | Parecer escrito do tech-lead que reverifica B1 e I1-I8 não está no repositório | — | Média | tech-lead | A-08: adendo em `review-onda1-api.md` | Aberto (2026-11-18) |
| I-01 | Problema | CLAUDE.md §1/§2 desatualizado: cita Cajamar (brief e DEC-009 trazem Campo Limpo Paulista) e app para lojista (é painel web, DEC-005) | — | Baixa | CEO | Atualizar CLAUDE.md; até lá vale o brief | Aberto (2026-11-18) |
| A-01 | Ação | Publicar threat models de auth e pagamento antes de T0-06 e da Onda 1B | — | Alta | security-engineer | Concluído; veto da Onda 1 retirado | Fechada (2026-11-18) |
| A-02 | Ação | Backend-dev entrega contrato OpenAPI de Pedido/Carrinho (T3B-01) antes de MB iniciar a sacola (T3B-08) e o checkout 4B | — | Alta (caminho crítico da 3B) | backend-dev | Publicar no início da 3B; TL registra se a sacola é local, na API ou híbrida | A fazer |
| A-03 | Ação | Fechar SEC-121 (app), 122, 123, 126 na Onda 3A (T3A-08) | — | Baixa | mobile-dev | Verificação do Security | A fazer |
| A-04 | Ação | Revisão do Security e do TL das sub-ondas 2A e 2B (T2-09, T2-10) | — | Alta | security-engineer / tech-lead | Antes de marcar a Onda 2 concluída | A fazer |
| A-05 | Ação | Specs de tela das Ondas 3A e 3B (T2-12) | — | Alta | product-designer | Uma onda à frente do mobile-dev | A fazer |
| A-06 | Ação | Endurecimento pré-4A (DT-004, DT-015, DT-022, DT-023) | — | Média | backend-dev / tech-lead | Antes do checkout da 4B | A fazer |
| A-07 | Ação | Atualizar CLAUDE.md/Resumo: status do `docs/status.md` ainda mostra a Onda 1 com veto | — | Baixa | CEO | Refletir DEC-029 fechada | A fazer |
| A-08 | Ação | Adendo do TL: reverificação do B1 e confirmação de I1-I8 (incl. I7 parte 2) | — | Média | tech-lead | Ver I-03 | A fazer |
| D-01 | Dependência | Credenciais Mercado Pago do fundador (teste real) | — | Média | Fundador | Pendência para o relatório final; dev usa simulado | Aberto |
| D-02 | Dependência | Contas Apple Developer e Google Play Console | — | Alta | Fundador | Necessárias só no G5 | Aberto |
| D-03 | Dependência | Domínio, servidor e e-mail transacional reais | — | Média | Fundador | Guia de deploy na Onda 8 | Aberto |
| D-04 | Dependência | Validar em aparelho real (push, desempenho) antes de publicar | — | Alta | Fundador | Lista no checklist das lojas | Aberto |
