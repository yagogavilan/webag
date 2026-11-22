# Board — Webag

> Mantido pelo `project-manager`. Fonte única do status. Plano: `plano-execucao.md`. Visão para o fundador: `../status.md`. Escopo: `docs/produto/backlog.md`. Fila técnica detalhada: `fila-backend-dev.md`. Retomada após reinício/limite de uso: primeira tarefa não `Aceito` da onda atual.

**v1.1 em planejamento: ver seção "v1.1" abaixo (2026-11-22).** **Onda atual (v1.0):** Onda 8 (fechamento): código final congelado em `036e791` (DEC-083); só correção de bug achado por QA/Security entra depois   **Meta:** G4 aprovado com ressalvas por QA e Security (sem veto); falta o CEO registrar; G5 depende do fundador   **Atualizado:** 2026-11-20 (tip `3d40959`, só documentos)

**Bugs/SEC abertos (2026-11-20):** nenhum Crítico, Alto ou Médio aberto (QA e Security). Baixas: BUG-029 (flake de fixture), BUG-030 (e2e-real depende do pedido do seed), BUG-031 (app sem aviso "versão para revisão"), BUG-028b (Chromium); SEC-189, 186, 146, 149, 150, 161, 162, 163 (c/d), 174; SEC-169 aceito (DEC-067); BUG-010 fechado indicativo (capacidade só em staging). Fechados no tip: BUG-019, 026, 027, SEC-187, SEC-188. Checklist do brief §8: `checklist-dod.md`.

Status: `A fazer` · `Em andamento` · `Em revisão` · `Em QA` · `Aceito` · `Bloqueado`.

## Resumo das ondas

| Onda | Escopo | Status | Evidência |
|---|---|---|---|
| 0 | Fundação | Concluída | `review-onda0-api.md` |
| 1 | Identidade, config, base de pagamento | Concluída com ressalvas | `revisao-onda1.md`, DEC-029 |
| 2 | Lojista, aprovação, catálogo | Concluída com ressalvas | `qa/relatorios/onda-2.md`, `review-onda2-api.md` |
| 3 | Descoberta do cliente | Concluída com ressalvas | `qa/relatorios/onda-3-5.md` |
| 4 | Pagamento, ledger, checkout, pedido, tempo real | Concluída com ressalvas | DEC-043 (Security), DEC-047 (TL), DEC-048 (QA) |
| 5 | Logística da Webag, trocas, financeiro, painéis | Concluída com ressalvas | DEC-036/037/045; QA reprova G4 até BUG-016 |
| 6 | LGPD, marketing, relatórios, ajuda, denúncia, cartão seguro | Concluída; Security reverificou e o QA retestou (`0d902ab`, RC, `036e791`) | `seguranca/revisoes/onda-7-pos-dec-059.md` |
| 7 | Seed, carga, docs técnicas | Quase concluída: seed ok, k6 escrito, execução local indicativa; staging é do fundador | `qa/carga/README.md`, `qa/relatorios/setup-do-zero.md` |
| 8 | Fechamento: retestes, revisões, capturas, G4/G5, tag | Time: concluído salvo relatório final e SEC-186 (cerca de 16 de 18 do peso, estimativa); G5 e tag: fundador | G4 Security: APROVADO (adendo final, `036e791`); TL: com ressalvas (A-01/A-02 corrigidos); QA: APROVADO COM RESSALVAS em `036e791` (`g4-final-tip.md`); G5 com condições C1 a C9 e C10 reescrita |

Direção visual v3 (DEC-051/052) e entrega em até 2 h (DEC-053) cruzam as ondas 6 a 8.

## Onda 6 — tarefas

| ID | Tarefa | Dono | Status | Pronto quando |
|---|---|---|---|---|
| T6-01 | API: exportar dados, excluir conta, DSR, retenção (O6.1) | backend-dev | Em revisão | Entregue; Security reverifica |
| T6-02 | API: realtime por ticket, relatórios, push segmentado, cupons, ajuda, denúncia, cartão seguro (O6.2 a O6.5, B.1, B.2) | backend-dev | Em revisão | Entregue |
| T6-03 | Correções do TL R.1 a R.5 | backend-dev | Em revisão | Commits `98a2b14`, `c1064dc`, `bdafb19`, `8cd5202` |
| T6-04 | R.6: N+1 nas listas de pedidos; DT-053 a 058 | backend-dev | Em revisão (confirmar no reteste do QA) | Teste de consultas por requisição |
| T6-05 | Q.1 BUG-011: admin cancela pedido, estorno total cancela | backend-dev | Aceito | Fechado pelo QA com evidência (`onda-7-reverificacao.md` §4) |
| T6-06 | S6.1/S6.2: SEC-155 (G4), 152, 153, 154 (72 h), 156 a 160 e ataques A1 a A6 como e2e | backend-dev | Em revisão | `a7a4ce7`; Security reverifica |
| T6-07 | Q.2: BUG-016 (horário e pausa da logística), BUG-012 (cancelar corrida) | backend-dev | Aceito | BUG-012, 016 fechados pelo QA; BUG-021/022 corrigidos (`c35695e`, `aa41a2a`), reteste na T8-01 |
| T6-08 | Q.3: BUG-014 (retirada 48 h), BUG-015 (retestar), BUG-017 (parâmetros sem efeito), BUG-018, BUG-019 | backend-dev | Aceito (014 a 018); BUG-019/020/023/024/025 corrigidos, reteste na T8-01 | QA reteste |
| T6-09 | S6.3: SEC-161 a 165 e 167; DT-059 a 064 | backend-dev | Em andamento | DT-059 a 064 e SEC-167/177/180 feitos; Baixas restantes não bloqueiam G4 |
| T6-10 | Web: painéis da Onda 6 (ETA, lotes, contato, parâmetros, disputas, avaliações, ajuda, exportação/exclusão, marketing) e `/pagar/cartao` | mobile-dev | Em revisão | `f8c8bc5`, `c235edb`, `26b0e22` |
| T6-11 | App: excluir conta, exportar dados, consentimentos, ajuda, denúncia, push aberto (SEC-166) | mobile-dev | Em revisão | `a6eb5bb`; Security e QA validam |
| T6-12 | App: cartão pela página segura; PIX por relógio do servidor, socket único (I11) | mobile-dev | Em revisão | `972ca19`, `5f2f1b8` |
| T6-13 | Entrega em até 2 h: ETA, teto 120 min, alerta de atraso, lotes (E.1, E.2) | backend-dev + mobile-dev | Em revisão | API `a7a4ce7`, painéis `f8c8bc5`, app na Home/Loja/Sacola |
| T6-14 | Reverificação do Security da Onda 6 | security-engineer | Aceito | `onda-7-pos-dec-059.md`: G4 aprovado com ressalvas; sem Crítico/Alto |
| T6-15 | Reteste do QA: BUG-011, 012, 014 a 017 e SEC-166 no app | qa-engineer | Aceito (parcial) | Preliminar em `onda-7-reverificacao.md`; BUG-011 a 018 fechados; resto vai para T8-01 |

## Direção v3 no app (DEC-051/052)

| ID | Tarefa | Dono | Status |
|---|---|---|---|
| V3-01 | Base (tokens, fontes, ícones, kit, 12 objetos SVG, botão, selos, estados, movimento) | mobile-dev | Em revisão (`90e67d1`) |
| V3-02 | Home, Loja, Produto, Sacola | mobile-dev | Em revisão (`0d0acbf`, `225ec94`, `4c7fd23`) |
| V3-03 | Checkout, pagamento sem destaque ao PIX, acompanhamento, pedidos, trocas, avaliação, conta | mobile-dev | A fazer |
| V3-04 | Barra inferior do produto desalinhada (pendência conhecida) | mobile-dev | A fazer |
| V3-05 | Painéis web na linguagem v3 | mobile-dev | A fazer (só se sobrar capacidade) |
| V3-06 | Apresentações e protótipo v3 (PDFs, zip de demo) | product-designer | Entregue (`908e098`, `6ddaf7d`, `docs/entrega-demo`) |

## Onda 7 — tarefas

| ID | Tarefa | Dono | Status | Pronto quando |
|---|---|---|---|---|
| T7-01 | Seed completo (backlog §4: 4 cidades, 12+ lojas, pedidos em todos os estados, divergência de conciliação, credenciais demo) | backend-dev | Em andamento | Seeds por onda e de pedidos existem; validar com `docker compose` |
| T7-02 | Teste de carga (k6) e relatório | qa-engineer | Em revisão (script pronto; execução local indicativa; staging: fundador) | Executa `qa/plano-carga.md`; relatório em `docs/qa/` |
| T7-03 | Docs técnicas sem divergência (ADRs 011/012, modelo de dados, OpenAPI, DS v3) | tech-lead | A fazer | |
| T7-04 | Adendo do TL da Onda 1 (A-08) e revisão do TL das Ondas 6 e correções | tech-lead | A fazer | |

## Onda 8 — tarefas (fechamento)

| ID | Tarefa | Dono | Status | Depende de |
|---|---|---|---|---|
| T8-00 | Integrar contrato W/Y em app e web (F3, F4, F6, W.1 no `/excluir-conta`, M.6) e congelar o HEAD de teste | mobile-dev | Aceito | `0d902ab` (DEC-069); RC `f622bc9` (DEC-077) |
| T8-01 | Reteste completo do QA no HEAD congelado: suítes, BUG-010 e 019 a 025, SEC-166/176/180 no app; atualizar `qa/bugs/` | qa-engineer | Aceito | `g4-final.md` (`0d902ab`), `g4-rc.md` (RC), `g4-final-tip.md` (`036e791`: unit 335/335, e2e 873/874 com 1 flake BUG-029, web 684, app 439, Playwright 65+9). `qa/bugs/` atualizado até BUG-031 |
| T8-02 | Revisão funcional final | qa-engineer | Aceito | `qa/relatorios/revisao-funcional.md` (PO, 104/178 aceitas antes de B1 a B5, DEC-070); não refeita depois dos bloqueadores |
| T8-03 | Heurísticas de Nielsen (10, todas as telas v3) | product-designer | Aceito | `qa/relatorios/heuristica-nielsen.md` (6,5/10; H-01 corrigido); não repetido após correções |
| T8-04 | Usabilidade simulada, 4 tarefas (comprar, cadastrar loja, aprovar loja, pedir troca): toques, telas e palavras | qa-engineer + designer | Aceito | `qa/relatorios/usabilidade-4-tarefas.md` (`[HIPÓTESE]`, sem usuários reais) |
| T8-05 | Acessibilidade (rótulos, contraste, leitor de tela, fonte grande) e 3G simulado | qa-engineer | Em andamento | Só por código e heurística; aparelho real é do fundador |
| T8-06 | Capturas em `docs/telas/` (índice, uma por tela e estado: carregando, vazio, erro) | qa-engineer | Aceito | `docs/telas/README.md` (70 telas) e `qa/relatorios/revisao-visual-final.md`; V8.1 a V8.7 corrigidos (DEC-078) |
| T8-07 | Teste de carga k6: script pronto, execução em staging | fundador (execução), qa (análise) | Bloqueado | Staging, servidor; local indicativo em `g4-final.md` §8 |
| T8-08 | Correção de achados Crítico/Alto/Média viável e reteste | backend-dev + mobile-dev + QA | Aceito (salvo SEC-186) | Feitos e retestados: B1 a B5, A-01 a A-13, SEC-181 a 185, SEC-187, SEC-188, BUG-019, 026, 027, V8.x, Z5.m1. Aberto Baixa: SEC-186 (Z4.1, antes do piloto), SEC-189, BUG-029 a 031 |
| T8-09 | Parecer final do Security (SEC-180, 176, 178, 179, 129, dependências, segredos) | security-engineer | Aceito | `seguranca/revisoes/parecer-final-rc.md` com adendo final em `036e791`: G4 APROVADO; G5 com C1 a C9 e C10 reescrita; SEC-187/188 corrigidos; SEC-189 Baixa aberto |
| T8-10 | **G4 final**: parecer do QA | qa-engineer | Aceito | `qa/relatorios/g4-final-tip.md`: APROVADO COM RESSALVAS em `036e791`, sem veto; não é aprovação de G5. Fechamento formal: CEO |
| T8-11 | README e docs finais; guia de deploy e checklist das lojas com a v3 e a Onda 6; relatório final curto | tech-lead + PM | Em andamento | README, `deploy/guia-deploy.md` e `deploy/checklist-publicacao-lojas.md` existem; **relatório final curto não feito** (ação do time) |
| T8-12 | Decisão do G5 (checklist, pareceres, itens do fundador) | CEO | Bloqueado | G4 pronto; faltam itens 5 a 13 do `status.md`, jurídico e C7 no deploy real |
| T8-13 | Merge para `main` e tag `v1.0.0` | CEO | Bloqueado | Autorização do fundador (D-08); G4 |

Estado 2026-11-20: T8-00, 01, 02, 03, 04, 06, 08, 09, 10 aceitos; T8-05 e T8-11 em andamento (relatório final); T8-07, 12, 13 dependem do fundador. Ordem: T8-00 → T8-01 → (T8-02 a T8-06; máx. 3 agentes) → T8-08 → T8-09 → T8-10 → T8-11 → T8-12/T8-13. Congelar o HEAD antes do T8-01: o QA não pode testar alvo que muda (causa do preliminar reprovado).

Critério de saída: ver `plano-execucao.md` §3.

## Ressalvas carregadas

| Ressalva | Sev. | Destino | Status |
|---|---|---|---|
| SEC-129 (proxy/BFF obrigatórios em produção) | Média | T8-09; boot de produção testado (`production-boot`); Security confirma | Aberta |
| DT-021 (retenção), DT-031 (rotação BFF), DT-023 (vetor oficial do MP) | Dívida | Antes do G4/G5 | Aberta |
| BUG-010 (teto do sharp) | Média | T8-01 / T8-07 (precisa de carga) | Aberta |
| SEC-180 a 185, 176, 178, 179 | Média/Baixa | T8-09 | Fechados pelo Security no RC (`parecer-final-rc.md`) |
| SEC-187 (Média), SEC-188 | Média/Baixa | Corrigidos, provados pelo QA e confirmados pelo Security em `036e791` | Fechados |
| SEC-189, SEC-186 | Baixa | SEC-189: antes de `LEGAL_REVIEWED=true` (C10); SEC-186 (Z4.1): antes do piloto | Abertos |
| BUG-019, 026, 027 | Média/Baixa | T8-01 | Fechados pelo QA (`g4-final-tip.md`) |
| BUG-029, 030, 031, 028b | Baixa | Backlog | Abertos (teste/UX); BUG-031 antes de publicar os textos |
| BUG-020 a 025 | Baixa/Média | T8-01 | Fechados pelo QA em `0d902ab` |
| Playwright do login em 2 passos contra API real (SEC-115) | Teste | T8-01 | Coberto: 9 passam contra API real no tip (BUG-030 na 2ª execução) |
| O-1 (`correctEmail` grava e depois 429), O-2 (`resetTicket` no corpo) | Baixa | T6-09 | Aberta |
| Adendo do TL (A-08) | Média | T7-04 | Aberta |

Paralelismo: no máximo 3 agentes. Sequência: mobile-dev em T8-00 (e V3-03); o QA só inicia o T8-01 com o HEAD congelado.

Fora da 1.0: WB-161 (Won't) e Fase 2 (WB-300 a 334).

## v1.1 (R1 a R5): execução com agentes

Plano, ondas, estimativa e DoR/DoD: `plano-v1-1.md`. Escopo: WB-340 a 399 (61 histórias, `backlog.md` §10). Tudo roda local; o que depende de parecer fica atrás de flag desligada (DEC-102). Retomada: primeira tarefa não `Aceito` abaixo. Atualizado: 2026-11-22 (após o merge do desempenho da API no `main`, PR 1, `d0a25b1`, DEC-117). Cor da v1.1: **AMARELO** (2026-11-22, após DEC-123: contrato R1 aprovado e R1.1 liberada, sem veto; mas disco a 99% (683 MB) e sem Docker bloqueiam a R1.0, R1 estimada ~40 a 44 UT contra 31,7 do plano, SEC-206 a 209 abertos e SEC-200 bloqueia deploy). Sobe a VERMELHO se a R1.0 não tiver máquina com Docker e disco até o fim da próxima sessão.

| ID | Tarefa | Dono | Status | Depende de / pronto quando |
|---|---|---|---|---|
| V0-01 | Liberar disco (I-05): 719 MB livres de 252 GB em 2026-11-22 (medido de novo; não melhorou) | CEO / fundador | Bloqueado | Sem isso commit e `pnpm` falham; bloqueia o início da R1 |
| V0-02 | Commitar o desempenho da API e BUG-029, 030, SEC-186, 189, 195 | backend-dev | Aceito | Commitado e mergeado no `main` (PR 1, `d0a25b1`, DEC-117). BUG-030 segue ABERTO como teste não repetível (Baixa) |
| V0-03 | Revisão de código do desempenho do backend | tech-lead | Aceito | APROVADO COM RESSALVAS: `arquitetura/reviews/desempenho-api-2026-11-22.md` |
| V0-04 | Revisão diferencial de segurança do mesmo conjunto | security-engineer | Aceito | Veto da DEC-105 levantado (DEC-115): `seguranca/revisoes/desempenho-api-2026-11-22.md`; SEC-199, 201, 202, 203, 204 corrigidos |
| V0-05 | BUG-031 e BUG-032 (`alerts.spec.tsx` com data fixa) | mobile-dev | Em revisão | CORRIGIDOS em 2026-11-22; faltam o reteste do QA (V0-09) |
| V0-06 | Pendências de DoR do PO (WB-344 C4, WB-060 C1, SEC-194, perguntas do designer) | product-owner | A fazer | `plano-v1-1.md` §4 |
| V0-07 | Telas R3 e R4 (rota, mapa, OK da loja, app do motoboy, rastreio) | product-designer | Em andamento | Uma onda à frente dos devs |
| V0-08 | ADR do mapa/rota (spike L5, extrato Protomaps) e ADR do app courier | tech-lead | A fazer | G2 de R3 e R4 |
| V0-09 | Base verde: e2e 3x, k6, regressão | qa-engineer | Aceito (com ressalvas) | `qa/performance/api-2026-11-22.md`: e2e 3x verde, 912 testes, 609 de 609 URLs idênticas, 1.000 usuários 0% de erro. Falta reteste de BUG-031/032 e a regressão do G4 v1.0 completa `[a confirmar com o QA]` |
| V0-10 | BUG-033: `staleTime` de até 5 s em loja, produto e vitrine da loja no app (DEC-117); busca segue 30 s | mobile-dev | Em andamento | Teste que prova a revalidação; QA retesta |
| V0-11 | Contrato OpenAPI da R1 e estimativas (`estimativas-v1-1-r1.md`, três pontos, com premissas) | backend-dev | Aceito | G2 R1 aprovado (DEC-123; TL aprovado com ressalvas R1 a R9; Security conferiu). Próximo item do caminho crítico: R1.0 |
| V0-12 | DT-085 (refresh OAuth fora da transação), DT-086, SEC-205 (antes da 2ª réplica), BUG-034, BUG-035 | backend-dev / tech-lead | A fazer | DT-085 e SEC-204 entram na onda (DEC-115); SEC-205 só com 2 ou mais réplicas; BUG-034/035 Baixa, próxima sprint |
| V0-13 | Validar em staging: PostgreSQL 18, `docker compose config`, disco real, 2 réplicas `[HIPÓTESE]` | backend-dev / QA / fundador | A fazer | Condição de deploy da DEC-117; precisa de servidor (D-03, D-10) |
| R1.0 | Sessão com Docker: base e2e verde 3x (superusuário e `TEST_DB_AS_APP=1`), `db-roles.e2e-spec.ts`, migrar sem superusuário, `db:seed` como `webag_app`, `compose config`, ensaio da restauração 8.4. **0,3 UT** | backend-dev + SEC (valida D-06) | Bloqueado | D-16 (máquina com Docker) e I-05 (disco). Nada da R1.1 é "pronto" antes |
| R1.1-a | Remover `editAdminStore` e `editAdminStoreSettings` (1º PR da R1.1, DEC-122) + **WB-355** permissões (4 chaves, matriz 5 perfis). **0,5 + 0,2 UT** | backend-dev | A fazer (PR rascunho, sem Docker) | DoR ok (DEC-123); fecha na R1.0. PISO |
| R1.1-b | **WB-352** "Ver como" (DEC-119/120/121; VA-01..26, SEC-209 corrigida antes do merge). **1,5 piso a 2,0 UT** (era 1,08) | backend-dev (+ mobile-dev: tipos `...ViewAs`) | A fazer | SEC-206/207/209; revisão do Security no PR. PISO |
| R1.1-c | **D-06** (papéis `webag_migrator`/`webag_app`, `app-grants.ts`, boot recusa superusuário, DB-01..05). **0,8 a 1,0 UT** (~0,4 já gasta) | backend-dev + SEC | A fazer | R1.0. PISO |
| R1.1-d | WB-350 ficha 360 (0,5), WB-351 admin edita loja (0,8), GEN (0,3), I4 5 escritas (0,25), migrações 0058 a 0060 (0,4). **~2,3 UT**; R1.1 total **~6 UT** | backend-dev + mobile-dev (web admin) | A fazer | R1.1-a; AO-01..05 |
| R1.2 | Cadastro rápido: WB-370 (+I11) 1,0, 371 0,6, 372 0,3, 374 0,2, 375 0,5, 379 0,4, migrações 0061 a 0063. **~3,4 UT**; web/app do mobile-dev **sem estimativa (R-46)** | backend-dev + mobile-dev | A fazer | R6 resolvido; teste de 60 s com 5 pessoas (D-14). PISO |
| R1.3 | D18 0,3 (abre), WB-377 1,0 (+B2), WB-353 2,0, WB-354 ~0,3, WB-376 1,1, I4 bulk 0,15, migração 0064. **~5,5 a 6 UT** | backend-dev + mobile-dev | A fazer | R1.1 (D18 depende de `products.version`); BK-01..08; exigência de `Idempotency-Key` liga junto com o web (R5) |
| R1.4 | Coleta em staging: 360, 361, 363, 369, nginx/log (R7), migração 0065. **~2,8 UT** | backend-dev (+ mobile-dev opt-out) | A fazer | Só staging, flags `false`. Primeiro candidato a corte |
| R1.5 | Fecho da R1: revisão final TL, parecer Security (TM §15.7), QA regressão, G4 local, aceite do PO | TL, SEC, QA, PO | A fazer | SEC-206 e SEC-208 "Corrigido" |
| R1-TOT | **Reestimativa R1 (2026-11-22):** backend 16,5 a 19 UT (piso 15,85), total ~40 a 44 (plano 31,7), lacuna +8 a +12. Corte: CSV/restaurar WB-354, PUT de modelo, xlsx servidor, massa do admin, R1.4 (~4,1 UT). Piso: 352, 355, D-06, R1.2. Conta em `plano-v1-1.md` §10 | PM | Decisão do CEO | Ver pedidos do CEO no status |
| R2.1 a R2.4 | R2: motor de cupom, painéis prontos, acessos, G4 local | idem | A fazer | R1.4 ou contrato R2 (paralelo possível ao fim da R1.3); 37,0 UT |
| R3.1 a R3.4 | R3: estados da entrega, OK da loja, rota, mapa, notificações, construtor | idem | A fazer | V0-08, SEC-196; 24,7 UT |
| R4.0 | **SEC-193 e SEC-198** (bloqueantes da R4) | backend-dev + SEC | A fazer | R3.2 (391) |
| R4.1 a R4.3 | R4: app do motoboy (`apps/courier`) e rastreio, G4 local | idem | A fazer | R4.0, ADR courier; Android real para fechar sem ressalva; 41,3 UT |
| R5.1, R5.2 | R5: Análises pagas e IA `fake` | idem | A fazer | R1 (coleta) e R2; 12,3 UT |
| VF-01 | Onda Final: congelar HEAD, reteste total, capturas, notas, relatório visual (`plano-v1-1.md` §7) | QA, designer, PM | A fazer | G4 local da última release; 12,3 UT |

Flags desligadas em produção até parecer: `campanhas_cupom` (J22, J23, J27), `coleta_eventos` e `modulo_analises` (J24), `app_motoboy`, `rastreio_ao_vivo`, `saida_automatica` (J8, J26), `ia_visao_real` (J25, F8), `web_push_lojista`, `ean_base_externa`.

## RAID

Escala: Probabilidade/Impacto = Alta, Média, Baixa. Datas no formato AAAA-MM-DD.

| ID | Tipo | Descrição | Prob. | Impacto | Dono | Ação | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Risco | Split do Mercado Pago exige conta e KYC aprovado do lojista (OAuth); lojistas pequenos podem ser barrados ou desistir. Recebimento centralizado pode ser atividade regulada (backlog §7.2) | Alta | Alta | tech-lead (ADR) / CEO | WB-155: ADR antes de 1B fechar; implementar atrás de `PaymentProvider`; fluxo de lojista sem KYC aprovado fica "pendente de conta" e não vende; levar parecer jurídico como pendência ao fundador | Aberto (2026-11-18) |
| R-02 | Risco | 109 Must em 134 histórias; escopo grande para capacidade de agentes e limites de uso | Alta | Alta | PM / CEO | Ondas pequenas, Should/Could por último, corte só pela ordem do backlog §5, nunca LGPD, pagamento, arrependimento, auditoria, denúncia | Aberto (2026-11-18) |
| R-03 | Risco | Rede bloqueada para documentação externa (MP, Apple, Google, HIG, Material, WCAG): integrações e regras de loja baseadas em conhecimento prévio podem estar desatualizadas | Alta | Média | backend-dev / security-engineer | Marcar `[HIPÓTESE]`; isolar MP no adaptador; testes de contrato com mocks; listar itens a conferir contra a doc oficial em `docs/gestao/pendencias-v1.md` antes do G5 | Aberto (2026-11-18) |
| R-04 | Risco (materializado) | Limites de uso de 5 h dos agentes: 4 ocorrências em 2026-11-18 (06:50, 11:50, 16:50 e 18:10 UTC), novas em 2026-11-19 (checkpoints `d4145d9`, `6739d33`) e 1 reinício de container; o trabalho commitado sobreviveu, o não commitado virou `chore: checkpoint` | Alta | Alta | PM / CEO | Marcos pequenos (uma tarefa Tnn por vez, 1 a 3 histórias); commit e push por marco; `wip:` no branch; tarefa em curso termina antes de parar; board como ponto de retomada; no retorno, retomar a primeira tarefa não Aceita; checkpoints só como rede de segurança, nunca como entrega | Aberto, mitigado por processo (2026-11-18) |
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
| R-15 | Risco (materializado) | Sem fotos reais e sem ilustrador: a v3 usa 12 objetos SVG; não atinge o nível 3D do iFood (DEC-051); lojas com foto gerada parecem app vazio | Alta | Média | Fundador / product-designer | Fundador contrata ilustrador e lojistas enviam fotos reais; até lá, kit SVG; não prometer o nível iFood | Aberto (2026-11-19) |
| R-16 | Risco | Mercado Pago sandbox sem credencial: PIX, cartão, split e webhook nunca rodaram contra o MP real; só provedor simulado e testes de contrato (DT-023) | Alta | Alta | Fundador / backend-dev | Fundador entrega credenciais de sandbox; teste real antes do G4; split e KYC (R-01) só no piloto | Aberto (2026-11-19) |
| R-17 | Risco | Merge para `main` e tag `v1.0.0` exigem autorização do fundador; todo o trabalho está só no branch `claude/admiring-lamport-62tq1a` | Média | Alta | CEO / Fundador | Pedir autorização com o parecer G4; se houver perda do branch, perde-se a entrega | Aberto (2026-11-19) |
| R-18 | Risco | Entrega em até 2 h (DEC-053) obriga a operação manual de despacho: sem alguém na fila de Logística no horário, o alerta de atraso dispara em todos os pedidos e a promessa quebra | Alta | Alta | Fundador / PM | Definir quem despacha e o horário (`logistica_horario`); começar com poucas lojas e raio pequeno; teto 120 min é parâmetro | Aberto (2026-11-19) |
| R-19 | Risco (encerrado) | Verificação atrasada: correções entram sem reteste | Baixa | Baixa | PM / QA / Security | QA retestou `0d902ab`, RC e `036e791`; Security confirmou `036e791`. Código congelado (DEC-083) | Fechado (2026-11-20) |
| R-20 | Risco | Motoboys sem parecer jurídico (vínculo, Lei 12.009, seguro): operar a entrega da Webag antes é risco legal | Média | Alta | Fundador | Parecer (J8) antes de contratar ou pagar qualquer motoboy | Aberto (2026-11-19) |
| R-21 | Risco | Direção v3 só cobre Home, Loja, Produto e Sacola; checkout, pedidos e conta ficam em v2: app inconsistente se o G4 chegar antes | Média | Média | mobile-dev / PM | V3-03 antes de T8-02 e T8-06; se faltar tempo, cortar painéis v3 (V3-05) primeiro | Aberto (2026-11-19) |
| R-22 | Risco (reduzido) | CI estável: e2e foi instável (BUG-019/024); no tip o QA mediu 873/874 em 1 execução (1 flake de fixture, BUG-029); 3 execuções seguidas só no RC, auto-relato do backend; GitHub Actions nunca rodou de verdade | Baixa | Média | QA / backend-dev | Corrigir BUG-029; rodar o CI real quando o repositório tiver o Actions ligado | Aberto, reduzido (2026-11-20) |
| R-23 | Risco (encerrado) | Alvo móvel | Baixa | Baixa | PM | Congelado em `036e791` (DEC-083); só correção de bug achado por QA/Security | Fechado (2026-11-20) |
| R-24 | Risco | Login e envio de código sem WAF/CAPTCHA: SEC-180 mitigado no código, abuso distribuído segue possível | Média | Média | Fundador / Security | Decisão do fundador (status item 12); `privacy:cancel-deletion` e alerta já existem | Aberto (2026-11-19) |
| R-25 | Risco | Aparelho real, MP sandbox e carga em staging só o fundador faz; sem eles G4 fica "com ressalvas" e o G5 não é recomendável | Alta | Alta | Fundador | Pedir no parecer G4; agrupar os 3 numa única sessão do fundador | Aberto (2026-11-19) |
| I-04 | Problema | Arquivos `qa/bugs/BUG-0xx.md` podem mostrar ABERTO para itens fechados | — | Baixa | qa-engineer | QA atualizou BUG-026 a 031 no tip; conferir BUG-019 a 025 | A verificar (2026-11-20) |
| I-02 | Problema | O-1: `correctEmail` responde 429 após gravar o e-mail novo | — | Baixa | backend-dev | Checar o limite antes de gravar (Onda 3A) | Aberto (2026-11-18) |
| I-03 | Problema | Parecer escrito do tech-lead que reverifica B1 e I1-I8 não está no repositório | — | Média | tech-lead | A-08: adendo em `review-onda1-api.md` | Aberto (2026-11-18) |
| I-01 | Problema | CLAUDE.md §1/§2 desatualizado: cita Cajamar (brief e DEC-009 trazem Campo Limpo Paulista) e app para lojista (é painel web, DEC-005) | — | Baixa | CEO | Atualizar CLAUDE.md; até lá vale o brief | Aberto (2026-11-18) |
| A-01 | Ação | Publicar threat models de auth e pagamento antes de T0-06 e da Onda 1B | — | Alta | security-engineer | Concluído; veto da Onda 1 retirado | Fechada (2026-11-18) |
| A-02 | Ação | Contrato de Pedido/Carrinho | — | Alta | backend-dev | Entregue na Onda 3/4 | Fechada (2026-11-19) |
| A-03 | Ação | Fechar SEC-121 (app), 122, 123, 126 | — | Baixa | mobile-dev | Conferir na reverificação do Security (T6-14); estado não verificado | A verificar |
| A-04 | Ação | Revisão do Security e do TL das sub-ondas 2A e 2B | — | Alta | security-engineer / tech-lead | Feita (DEC-030, `review-onda2-api.md`) | Fechada (2026-11-19) |
| A-05 | Ação | Specs de tela das Ondas 3A e 3B (T2-12) | — | Alta | product-designer | Uma onda à frente do mobile-dev | A fazer |
| A-06 | Ação | Endurecimento pré-4A (DT-004, DT-015, DT-022, DT-023) | — | Média | backend-dev / tech-lead | Checkout já existe; reavaliar na T8-03 | A verificar |
| A-07 | Ação | Atualizar CLAUDE.md/Resumo: status do `docs/status.md` ainda mostra a Onda 1 com veto | — | Baixa | CEO | Refletir DEC-029 fechada | A fazer |
| A-08 | Ação | Adendo do TL: reverificação do B1 e confirmação de I1-I8 (incl. I7 parte 2) | — | Média | tech-lead | Ver I-03 | A fazer |
| D-01 | Dependência | Credenciais Mercado Pago do fundador (sandbox e produção) | — | Alta | Fundador | Pendência para o relatório final; dev usa simulado | Aberto |
| D-02 | Dependência | Contas Apple Developer e Google Play Console | — | Alta | Fundador | Necessárias só no G5 | Aberto |
| D-03 | Dependência | Domínio, servidor e e-mail transacional reais | — | Média | Fundador | Guia de deploy na Onda 8 | Aberto |
| D-04 | Dependência | Validar em aparelho real (push, desempenho) antes de publicar | — | Alta | Fundador | Lista no checklist das lojas | Aberto |
| D-05 | Dependência | Credenciais FCM/APNs e EAS | — | Média | Fundador | Push real e builds | Aberto |
| D-06 | Dependência | Textos jurídicos (`produto/legal/`, proposta DEC-080), parecer de motoboys, arrependimento, NFS-e, ECA Digital (J17), encarregado (J18) | — | Alta | Fundador / jurídico | `decisoes.md` J1 a J21 | Aberto (2026-11-20) |
| D-07 | Dependência | Ilustrador, fotos reais, WhatsApp de suporte, cotação de motoboys | — | Média | Fundador | Ver R-15 | Aberto |
| D-08 | Dependência | Autorização do merge para `main` e da tag v1.0.0 | — | Alta | Fundador | Ver R-17 | Aberto |
| D-09 | Dependência | Razão social, CNPJ, endereço, encarregado, WhatsApp de suporte, horário real da logística (HIP-E08), WAF/CAPTCHA, Sentry, geocodificador (opcional) | — | Média | Fundador | `status.md` itens 8, 9, 13 a 17 | Aberto (2026-11-19) |
| D-10 | Dependência | Execução do k6 em staging e do roteiro em aparelho real | — | Alta | Fundador | T8-07, R-25 | Aberto (2026-11-19) |
| R-26 | Risco (encerrado) | G4 do QA valia só para `0d902ab` | Baixa | Baixa | QA / CEO | `g4-rc.md` e `g4-final-tip.md` existem; G4 APROVADO COM RESSALVAS em `036e791`; falta o CEO registrar o fechamento | Fechado (2026-11-20) |
| R-27 | Risco | Textos legais são proposta (DEC-080/082): sem aprovação do jurídico (J1 a J21, ECA Digital J17) o G5 e o piloto com lojistas não têm base contratual; J17 pode exigir mudança de produto; SEC-187 (C10) exige texto com fatos escritos antes de `LEGAL_REVIEWED=true` | Média | Alta | Fundador / PO | Levar J1 a J21 ao advogado já; nenhuma mudança no app antes do parecer (DEC-081) | Aberto (2026-11-20) |
| R-28 | Risco | Relatório final curto (brief §8 item 7) não feito: DoD do brief incompleto na entrega | Média | Média | tech-lead / PM | T8-11; ver `checklist-dod.md` | Aberto (2026-11-20) |
| A-09 | Ação | Reverificar SEC-187, SEC-188 e commits pós-RC; QA: reteste do RC e do tip | — | Alta | security-engineer / qa-engineer | Feito: `parecer-final-rc.md` (adendo em `036e791`) e `g4-final-tip.md` | Fechada (2026-11-20) |
| A-10 | Ação | Fechar SEC-186 (Z4.1), SEC-189, BUG-031 e o relatório final | — | Média | backend-dev / mobile-dev / tech-lead | Z5.m1 feito. Relatório final antes da entrega; SEC-186 antes do piloto; SEC-189 antes de `LEGAL_REVIEWED=true` | A fazer (2026-11-20) |
| I-05 | Problema | **Disco do ambiente a 99%** (683 MB livres de 252 GB em 2026-11-22, piorou; Docker não cabe; `node_modules` 1,8 GB, `.git` 252 MB): commit, `pnpm` e Docker podem falhar e perder trabalho não commitado | — | Alta | CEO / fundador | Ação: investigar o que ocupa (`du`), `pnpm store prune`, apagar exports e capturas fora do git | Gatilho: ENOSPC ou menos de 1 GB livre | Plano B: PMTiles, capturas e dumps nunca no git; mover para o armazenamento do projeto | Dono: CEO | Revisar em: 2026-11-23 | Aberto (2026-11-22) |
| R-29 | Risco (encerrado) | Trabalho de desempenho do backend-dev (20 arquivos, +480/-101) **sem commit e sem revisão**, incluindo autenticação por SQL cru e `Cache-Control` global | Alta | Alta | backend-dev / tech-lead / security-engineer | Ação: commit em marcos, revisão diferencial (`plano-v1-1.md` §5) | Gatilho: arquivo ainda modificado ao iniciar a R1 | Plano B: branch `wip:` e reverter `principal.service.ts` e cabeçalhos globais se o parecer reprovar | Dono: backend-dev | Revisar em: 2026-11-23 | Fechado (2026-11-22): commit, pareceres TL/SEC/QA e merge no `main` (DEC-117); materializou-se só como veto B1/SEC-199, corrigido |
| R-30 | Risco | Limite de uso e interrupções: 168 UT (faixa 122 a 234) sem data; R-04 agravado pelo tamanho | Alta | Alta | PM / CEO | Ação: marco de 1 UT, push imediato, redispatch pelo `git log` e pelo board | Gatilho: 2 interrupções na mesma onda ou onda com mais de 1,5x o previsto | Plano B: cortes de `plano-v1-1.md` §8 | Dono: PM | Revisar em: fim da W0 | Aberto (2026-11-22) |
| R-31 | Risco | mobile-dev é gargalo único (cerca de 45% das UT: web, app e courier) | Alta | Média | CEO / PM | Ação: decisão D-A (2ª instância só em diretórios disjuntos) | Gatilho: fila do mobile-dev com mais de 2 ondas de atraso sobre o backend | Plano B: cortar na ordem DEC-100 | Dono: CEO | Revisar em: fim da R1.2 | Aberto (2026-11-22) |
| R-32 | Risco | Parecer jurídico atrasado (J8, J22, J23, J24, J25, J26, J27): não impede construir, impede ligar; J22 também trava o piloto do v1.0 | Alta | Alta | Fundador | Ação: levar J22 a J27 em lote ao advogado (DEC-101) | Gatilho: release pronta sem parecer | Plano B: flag fica desligada; subir só o que não depende (cadastro rápido, admin de lojas, painéis); sem frete grátis nem coleta | Dono: fundador | Revisar em: 2026-11-29 | Aberto (2026-11-22) |
| R-33 | Risco | Mapa sem rota real: heurística erra o ETA (gatilho DEC-096: erro > 10 min); tamanho do extrato Protomaps da Grande SP desconhecido (L5) | Média | Média | tech-lead / backend-dev | Ação: spike de 1 UT antes da R3; "abrir no Maps/Waze" já é a rota real | Gatilho: erro do ETA > 10 min, 3 ou mais motoboys ou 15 entregas por hora | Plano B: reduzir a área do extrato; linha reta marcada "aproximada"; pedir autorização para OSRM | Dono: tech-lead | Revisar em: antes da R3.1 | Aberto (2026-11-22) |
| R-34 | Risco | GPS em segundo plano só se prova em **Android real**; o fundador testa em iPhone (`pnpm iphone`) e PWA foi descartado (DEC-097); build de APK exige Android SDK ou EAS na máquina `[HIPÓTESE]` | Alta | Alta | Fundador / mobile-dev | Ação: confirmar se há Android e como gerar o APK local | Gatilho: sem aparelho Android ao fim da R4.2 | Plano B: G4 da R4 "com ressalva: emulador"; concierge por WhatsApp na semana 0 do piloto; R4 desligada | Dono: fundador | Revisar em: antes da R4.1 | Aberto (2026-11-22) |
| R-35 | Risco | Escopo: 61 histórias, 17 decisões F1 a F17, fundador pediu TUDO; pesquisa e PRD já geraram 6 PRDs | Alta | Alta | PO / CEO | Ação: histórias novas só com corte indicado; cortes sugeridos em `plano-v1-1.md` §8 | Gatilho: história nova depois da planning da release | Plano B: ordem de corte DEC-100 (piso nunca) | Dono: PO | Revisar em: fim de cada release | Aberto (2026-11-22) |
| R-36 | Risco | Meta de cadastro em <= 60 s sem folga e sem usuário real (R-10 estendido): 25 a 38 s no feliz, 45 a 60 s com erro | Média | Alta | PO / fundador | Ação: teste com 5 pessoas do perfil; cronômetro do protótipo antes de codar | Gatilho: mediana > 60 s | Plano B: critério de morte do PRD (reduzir campos ou aceitar meta maior) | Dono: PO | Revisar em: fim da R1.3 | Aberto (2026-11-22) |
| R-37 | Risco | Regressão do v1.0 congelado (`036e791`): a v1.1 altera RN-07/18/19 (`MOTOBOY_NA_LOJA`), WB-060 C1 e `Cache-Control`/auth da API | Média | Alta | QA / tech-lead | Ação: regressão do G4 v1.0 em toda release; migrações reversíveis atrás de flag | Gatilho: queda no e2e de regressão | Plano B: reverter a migração e manter flag desligada | Dono: QA | Revisar em: fim da R1.4 | Aberto (2026-11-22) |
| R-38 | Risco | SEC-200 (CGNAT, Média, pré-existente): limite por IP pode bloquear usuários legítimos atrás do mesmo IP; **bloqueia qualquer deploy do desempenho (inclusive patch do v1.0) até G4 do v1.1 ou aceite do fundador** (DEC-115, DEC-117) | Média | Alta | backend-dev / Security / fundador | Ação: corrigir na R1 ou o fundador aceitar o risco em `decisoes.md` | Gatilho: pedido de deploy antes do G4 | Plano B: aceite do fundador com 429 contado por rota no piloto | Dono: backend-dev | Revisar em: fim da R1.2 | Aberto (2026-11-22) |
| R-39 | Risco | Desempenho validado só local `[HIPÓTESE]` para produção: PostgreSQL 18, `docker compose config`, disco real e 2 réplicas nunca rodaram em staging; SEC-205 e DT-085 só importam com 2 réplicas | Média | Média | QA / backend-dev / fundador | Ação: checklist de staging (V0-13) | Gatilho: servidor disponível ou 2ª réplica planejada | Plano B: 1 réplica e k6 local até haver staging | Dono: QA | Revisar em: antes do deploy | Aberto (2026-11-22) |
| R-40 | Risco | Dívidas e bugs herdados do desempenho (DT-085, DT-086, BUG-034, BUG-035) viram escopo escondido na R1 e consomem UT | Média | Baixa | PM / tech-lead | Ação: estimar em `estimativas-v1-1-r1.md` e cobrar dentro do buffer, não da R1 | Gatilho: item sem estimativa ao iniciar a R1.1 | Plano B: adiar BUG-034/035 (Baixa) | Dono: PM | Revisar em: início da R1.1 | Aberto (2026-11-22) |
| R-41 | Risco | **Ambiente sem Docker** (e disco a 99%): e2e (912), migrações 0058 a 0065, D-06, VA/AO/BK/DB e concorrência de D18 nunca rodaram; tudo escrito é "não provado". D-06 só se prova em PostgreSQL real | Alta | Alta | CEO / fundador / backend-dev | Ação: R1.0 em máquina com Docker (D-16) como 1ª tarefa; PRs sem banco ficam em rascunho | Gatilho: R1.1 sem base verde 3x | Plano B: rodar a R1.0 na máquina do fundador (Docker Desktop, plano §1) e CI com serviços | Dono: CEO | Revisar em: 2026-11-23 | Aberto (2026-11-22) |
| R-42 | Risco (gate G4) | **SEC-206 (Alta)** "Ver como" no pipeline de autenticação (ramificação no `checkStore`): desenho fechado (§14), código pendente; **bloqueia o G4 da R1** até VA-01..26 verdes e revisão diferencial | Média | Alta | backend-dev / security-engineer | Ação: WB-352 pela §14; Security revisa o PR na hora | Gatilho: VA vermelho ou regressão de auth no e2e | Plano B: WB-352 volta para a §14 sem ramificação nova (perde "ver como", piso em risco: decisão do CEO) | Dono: backend-dev | Revisar em: fim da R1.1 | Aberto (2026-11-22) |
| R-43 | Risco (gate) | **SEC-207 (Média)** dado de cliente sem máscara em pedido ativo e **SEC-209 (Média)** `timeline[].reason` vaza texto do cliente: SEC-209 bloqueia o **merge** da WB-352; SEC-207 resolvido pelo desenho (DEC-120), código pendente (VA-12, VA-25) | Média | Média | backend-dev / PO | Ação: corrigir os 2 `timeline` e o "estrito" aninhado antes do PR | Gatilho: PR da WB-352 sem a correção | Plano B: não mergear | Dono: backend-dev | Revisar em: PR da WB-352 | Aberto (2026-11-22) |
| R-44 | Risco (gate) | **SEC-208 (Média, sobe a Alta)** resposta de idempotência gravada fora da transação: `price_adjust` em massa poderia aplicar 2x; D18 só existe com `products.version` (R1.2) e o 1º consumidor (R1.3). Exigir `Idempotency-Key` antes do web da WB-377 quebra o `bulk-bar.tsx` do piloto (R5 do TL) | Média | Alta | backend-dev / mobile-dev | Ação: `runInTransaction` no início da R1.3; exigência e web no mesmo release; BK-01..08 | Gatilho: massa sem D18 pronta | Plano B: sai o `price_adjust` inteiro (nunca pela metade) | Dono: backend-dev | Revisar em: início da R1.3 | Aberto (2026-11-22) |
| R-45 | Risco | **Estouro da R1**: backend 16,5 a 19 UT contra 9 a 10 do plano (+7 a +9) e R1 total ~40 a 44 contra 31,7; UT não calibrada | Alta | Alta | PM / CEO | Ação: subir a linha de base (não gastar o buffer de 25 UT) e ordem de corte DEC-123 com gatilhos (`plano-v1-1.md` §10.3); recalibrar ao fim da R1.1 | Gatilho: R1.1 acima de 7,5 UT | Plano B: cortes 1 a 3; acima de 9 UT, 4 e 5 | Dono: PM | Revisar em: fim da R1.1 | Aberto (2026-11-22) |
| R-46 | Risco | **Sem estimativa independente do mobile-dev** para a R1 (web admin, "ver como" com tipos `...ViewAs`, tabela de preços, massa, cadastro rápido, parser A6 +0,4); R-31 (gargalo único) ainda vale | Alta | Média | PM / mobile-dev | Ação: poker do mobile-dev antes da planning da R1.2 | Gatilho: R1.2 sem estimativa | Plano B: usar o piso de 14,7 UT e marcar `[HIPÓTESE]` | Dono: PM | Revisar em: antes da R1.2 | Aberto (2026-11-22) |
| I-06 | Problema | BUG-033 (Média): tela do app ainda pode mostrar loja/produto defasado até 60 s; a invalidação de 5 s só valia na API | — | Média | mobile-dev | Decidido na DEC-117; V0-10 | Fechado quando o QA retestar | Aberto (2026-11-22) |
| D-16 | Dependência | **Máquina com Docker e disco livre** para a R1.0 (a sandbox não tem Docker; 683 MB livres) | — | Alta | CEO / fundador | Ver R-41 e I-05 | Aberto (2026-11-22) |
| D-15 | Dependência | Repositório público: tornar **privado**; tag `v1.0.0` (estende D-08/R-17) | — | Alta | Fundador | Ação irreversível/exposição: só o fundador; o merge de 2026-11-22 ao `main` já aconteceu para o desempenho | Aberto (2026-11-22) |
| D-11 | Dependência | Aparelho **Android** real e forma de gerar o APK (SDK local ou EAS) para a R4 | — | Alta | Fundador | Ver R-34 | Aberto (2026-11-22) |
| D-12 | Dependência | Pareceres J8, J22 a J27 (estende D-06): só para ligar flags | — | Alta | Fundador / advogado | Ver R-32 | Aberto (2026-11-22) |
| D-13 | Dependência | Decisões F2 (orçamento de cupom), F4, F8, F10/F16 e cotação de motoboys (custo previsto), F5 (preço do módulo) | — | Média | Fundador | R2 usa orçamento R$ 0 por padrão (DEC-102) | Aberto (2026-11-22) |
| D-14 | Dependência | 1 sessão do fundador por release (`pnpm iphone`, Docker Desktop) e 5 pessoas do perfil para o teste de 60 s; 5 lojistas para a porta falsa | — | Alta | Fundador | Agrupar numa janela por RC local | Aberto (2026-11-22) |
| A-11 | Ação | Liberar disco (V0-01): ainda 99% em 2026-11-22, agora bloqueia a R1 | — | Alta | CEO / fundador | Ver I-05 | A fazer (2026-11-22) |
| A-14 | Ação | Decisões do CEO sobre a reestimativa da R1 (nova linha de base, gatilhos, estimativa do mobile-dev, Docker): `docs/status.md` v1.1 | — | Alta | CEO | Retorno do PM de 2026-11-22 | A fazer (2026-11-22) |
| A-12 | Ação | Registrar BUG-032 em `qa/bugs/` | — | Baixa | qa-engineer | Registrado e corrigido; reteste pendente | Fechada (2026-11-22) |
| A-13 | Ação | Decisões D-A a D-E de `plano-v1-1.md` §9 | — | Alta | CEO | Retorno do PM | A fazer (2026-11-22) |
