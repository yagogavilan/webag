# Plano de execução — Webag v1.1 (releases R1 a R5)

Dono: project-manager | Data: 2026-11-22 | Fontes: DEC-088 a DEC-103 (`decisoes.md`), PRDs `produto/prd/v1-1-*.md`, `produto/backlog.md` §10 (WB-340 a 399), `seguranca/threat-model-v1-1.md` §7, §9, §10, `design/telas/v1-1-indice.md`. Status vivo: `board.md` (seção v1.1). Visão do fundador: `../status.md`.
Sem datas de calendário. Progresso em **ondas** e critérios de saída. `[HIPÓTESE]` = não validado.

## 1. Premissas e unidade de estimativa

| Premissa | Consequência |
|---|---|
| **UT (unidade de trabalho)** = um marco de 1 a 3 histórias (ou 1 revisão, ou 1 relatório) fechado por **um** agente numa janela de uso, com testes, commit e push `[HIPÓTESE]`. Não é hora nem ponto | Faixa O / M / P por release; PERT = (O + 4M + P) / 6. Calibrar após a R1 (previsto x realizado) |
| Máx. 3 agentes ao mesmo tempo (DEC-010); revisor ocupa slot | Ondas abaixo já respeitam; throughput efetivo ~2 UT por janela de calendário `[HIPÓTESE]` (1 slot costuma estar em revisão ou espera) |
| Tudo roda na máquina do fundador (Windows, Docker Desktop, `pnpm iphone`) antes de produção | Cada release fecha como **RC local** (G4 local); o fundador faz 1 sessão de teste por release |
| Flags novas nascem **desligadas** (C-GEN-01); o que depende de J8, J22, J24, J26, J27 só liga com parecer | Construir e testar não esperam o jurídico. Teste e2e de "boot de produção: flags da v1.1 = false" é critério de saída de toda release |
| Sem custo novo | Protomaps/MapLibre, rota heurística, IA `fake`, APK direto, EAN base própria, cobrança manual do módulo |
| Fronteiras de arquivo do `plano-execucao.md` §2 valem. Contrato OpenAPI do backend-dev sai **antes** do consumidor; tech-lead revisa o contrato | `apps/courier` é diretório novo: único caso em que 2 instâncias do mobile-dev poderiam coexistir (decisão D-A abaixo) |
| Retomada após limite de uso ou disco: `git log -5` + primeira tarefa não `Aceito` desta seção do board | Marco pequeno, push imediato, migração idempotente (protocolo anti-reinício do plano §1) |

## 2. Resumo: ondas, esforço e o que trava

Esforço em UT (O / M / P / PERT). Premissas: P1 contrato e migrações = 15% do esforço; P2 mobile-dev concentra cerca de 45% (apps/web, apps/mobile e, na R4, apps/courier); P3 revisão TL + SEC + QA = 25%; P4 retrabalho já dentro de M (buffer de 15% fica **à parte**, no fim: ver §7).

| Release | Histórias (WB) | O / M / P | PERT | Depende do fundador / jurídico / aparelho real |
|---|---|---|---|---|
| **W0** Base limpa (antes de tudo) | bugs, revisão diferencial, DoR | 6 / 9 / 14 | 9,3 | Disco (I-05); autorizar cortes (D-A a D-C) |
| **R1** Cadastro rápido, admin de lojas, coleta em staging | 18: 350 a 355, 360, 361, 363, 369, 370 a 372, 374 a 377, 379 | **REESTIMADA 2026-11-22: ~40 a 44 UT total** (era 24 / 31 / 42); backend 16,5 a 19 (§10) | ~42 `[HIPÓTESE]` (era 31,7) | Fundador testa cadastro com cronômetro no próprio celular; 5 pessoas do perfil para a meta de 60 s; J27 (edição de preço pelo admin) e J24 (coleta) só para ligar |
| **R2** Cupons, painéis prontos, acessos | 16: 340 a 349, 356, 357, 362, 367, 373 | 28 / 36 / 50 (plano) | 37,0 plano; **REESTIMADA 2026-11-23: ~52,3 restantes + ~4,5 da R2.1 = ~56,8** (§12) | F2 (orçamento R$ 0), F4 (custo previsto do motoboy por faixa); J22, J23, J27 para ligar; 5 entrevistas de lojistas (porta falsa) |
| **R3** Rota, OK da loja, notificações, construtor | 9: 380 a 382, 390, 391, 396, 397, 358, 359 | 18 / 24 / 34 | 24,7 | Spike do extrato Protomaps (L5); Web Push só valida em aparelho real; F12 sem parecer: `saida_automatica` off |
| **R4** App do motoboy e rastreio | 13: 383 a 389, 392 a 395, 398, 399 | 30 / 40 / 58 | 41,3 | **Aparelho Android real** (GPS em 2º plano, bateria); J8 e J26 para ligar; SEC-193 e SEC-198 antes |
| **R5** Análises pagas e IA | 5: 364, 365, 366, 368, 378 | 8 / 12 / 18 | 12,3 | Preço e teste do módulo (F5/F6); 8 semanas de dado real (não existe local); J24, J25 |
| **Final** Revisão geral, bugs e relatório visual | todas as telas | 8 / 12 / 18 | 12,3 | Aparelho real do fundador para "visto em aparelho: sim/não" |
| **Total** | 61 histórias | 122 / 164 / 234 (R1 já reestimada em §10) | **168,3 original; ~177 a 181 com a R1 nova; ~196 a 200 com a R2 nova (§12.4)** | Em janelas de calendário: PERT / 2 ≈ **84** `[HIPÓTESE]` |

Conta de realismo: 168 UT com ~2 UT por janela são ~84 janelas de 5 h. É grande. O fundador pediu TUDO (DEC-102) e tudo cabe só se o limite de uso não for o gargalo; a ordem de corte já aprovada (DEC-100: R5, construtor, R4, 346/348/354/365, 380; piso nunca) é o que sai primeiro. Recomendação de cortes extras em §8.

## 3. Ondas e ordem de dependência

Regra de ordem em toda release: **contrato OpenAPI (backend-dev) → revisão do contrato (tech-lead) → migrações → backend → web/mobile → testes → segurança → QA → aceite do PO → G4 local.** Designer e Security trabalham uma onda à frente.

### W0: Base limpa (obrigatória antes da R1)

| Onda | Slot 1 | Slot 2 | Slot 3 | Saída |
|---|---|---|---|---|
| W0.1 | backend-dev: **commitar em marcos** o trabalho de desempenho pendente na árvore (20 arquivos, +480/-101, migração 0057, consulta única de autenticação, `Cache-Control` padrão `private, no-store`, cache local, latência, compose de produção) e corrigir BUG-029, BUG-030, SEC-186, SEC-189, SEC-195 (EXIF do original: a R1 é foto pela câmera) | product-owner: fechar pendências de DoR (§4) | product-designer: telas R3 (rota, mapa admin, OK da loja) e R4 (app motoboy, rastreio) | Árvore limpa; DoR de R1 e R2 sem pendência |
| W0.2 | tech-lead: **revisão de código do desempenho**; ADR do mapa/rota (spike L5) e do app do motoboy | security-engineer: **revisão diferencial** do mesmo conjunto (§5) | mobile-dev: BUG-031; BUG-032 (`alerts.spec.tsx` falha com data fixa: usar relógio simulado) | Pareceres TL e SEC escritos; merge só depois |
| W0.3 | qa-engineer: e2e 3x seguidos, k6 `equivalencia.mjs` antes/depois, regressão do G4 v1.0 | | | Base verde registrada em `qa/relatorios/` |

Caminho da W0: commit (W0.1) → revisões (W0.2) → QA (W0.3). A R1 não começa o código com a base suja (alvo móvel, lição da Onda 8).

**Estado em 2026-11-22: W0 CONCLUÍDA** (PR 1, `d0a25b1`, DEC-115 a DEC-117; pareceres em `arquitetura/reviews/`, `seguranca/revisoes/` e `qa/performance/` com data 2026-11-22). Resta de W0: reteste de BUG-031/032, BUG-033 (mobile-dev, em andamento), disco (I-05). **Caminho crítico atual:** liberar disco (I-05) + contrato OpenAPI da R1 e estimativas (backend-dev, em andamento) → revisão do contrato (TL) → R1.1. O contrato é o próximo marco; sem ele a R1 não inicia. O restante da R1 e as ondas seguintes não mudam. SEC-200 (R-38) não trava a construção, só o deploy; SEC-205 e DT-085 só com 2ª réplica. Os 168 UT não incluem DT-085/086 e BUG-034/035 (R-40): serão estimados em `estimativas-v1-1-r1.md` e saem do buffer de 25 UT.

### R1: Cadastro rápido, admin de lojas, coleta em staging (reestimada em 2026-11-22; conta em §10)

Contrato aprovado (DEC-123). Backend-dev é um slot só: **a cadeia serial do backend é o caminho crítico**; mobile-dev (web) e revisões correm em paralelo. UT = backend-dev, salvo indicação.

| Onda | Backend-dev (UT, piso a realista) | Paralelo | Saída | Corte (ordem §10) |
|---|---|---|---|---|
| **R1.0** Sessão com Docker (~0,3, sem feature) | base e2e 912 verde 3x (superusuário e `TEST_DB_AS_APP=1`), `db-roles.e2e-spec.ts` (`REQUIRE_DB_ROLES=1`), migrar do zero sem superusuário, `db:seed` como `webag_app`, `compose config`, ensaio da restauração 8.4 | Sem Docker, em paralelo: PR de remoção das 2 rotas legadas + WB-355; partes puras da WB-352; escrever migrações 0058 a 0060; regras puras de 351/353; parser local A6 (mobile-dev, +0,4) | Base verde; Security valida D-06. Nada da R1.1 é "pronto" antes | Piso (D-06) |
| **R1.1** Admin de lojas, piso (~6) | WB-355 0,5; WB-352 1,5 a 2,0 (VA-01 a VA-26, SEC-209 corrigida antes do merge); WB-350 0,5; WB-351 0,8; D-06 0,8 a 1,0; I4 (5 escritas) 0,25; GEN 0,3; migrações 0058 a 0060 | mobile-dev: web admin 350 a 355, "ver como" com tipos `...ViewAs`; Security revisa o PR da WB-352 na hora | AO-01..05, DB-01..05, VA verdes no CI com Docker; revisão diferencial do Security | Piso: não corta |
| **R1.2** Cadastro rápido (~3,4) | R6 resolvido antes; WB-370 (+I11 `quickPublishProduct`) 1,0; 371 0,6; 372 0,3; 374 0,2; 375 0,5; 379 0,4; migrações 0061 a 0063 | mobile-dev: cadastro rápido no web e app; fundador + 5 pessoas do perfil para o teste de 60 s | Teste de 60 s (R-36); SEC-195 | Piso; só sai o PUT de modelo da 375 (-0,2) |
| **R1.3** Catálogo pelo admin e massa (~5,5 a 6) | D18 (`runInTransaction`) 0,3 abre a onda; WB-377 (+B2) 1,0; WB-353 2,0; WB-354 ~0,3 (sem D-06); WB-376 (plano B CSV padrão) 1,1; I4 de `bulkProducts` 0,15; migração 0064 | mobile-dev: web da WB-377 com `Idempotency-Key` (R5: exigência liga junto), tabela de preços, massa do admin | BK-01..08 verdes; revisão diferencial da D18 | CSV/restaurar do WB-354 (-0,3), xlsx no servidor (-0,3), massa do admin (-0,5) |
| **R1.4** Coleta em staging (~2,8) | 360, 361, 363, 369, nginx e varredura de log (R7), migração 0065 | mobile-dev: aviso e opt-out (360) | Só staging; flags `false` | Inteira para a R2 (-2,8) |
| **Fecho** | tech-lead review final, Security (C-GEN, C-ANA em staging), QA regressão e G4 local; PO aceita | | SEC-206 e SEC-208 "Corrigido" (TM §15.7) | |

Caminho crítico R1: R1.0 (Docker) -> R1.1 (WB-352 e D-06) -> R1.2 -> teste dos 60 s (fundador) -> R1.3 -> G4 local. Admin de lojas deixa de ter "folga de 1 onda": o piso (352, 355, D-06) vem primeiro e o cadastro rápido vem logo depois. R1.3 e R1.4 podem trocar se o fundador quiser dado de coleta antes (TL); recomendação: manter R1.4 por último, porque é a primeira da fila de corte. Épicos: E-ADM (350 a 355), E-CAD (370 a 379), E-COL (360, 361, 363, 369).

### R2: Cupons, painéis prontos, acessos

| Onda | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| R2.1 | backend-dev: contrato R2 + migrações (campanha, orçamento, reserva, ledger, antifraude, painéis) | tech-lead: revisa o contrato; ADR do motor de cupom e das consultas de painel | security-engineer: revisão de SEC-194 (texto) e do desenho C-CUP |
| R2.2 | backend-dev: motor 340, 341, 342 (reserva atômica), 344 (HMAC, trava por identificador), 349 | mobile-dev: admin de campanhas (340, 342, 345, 349) | qa-engineer: testes de concorrência e invariantes do ledger |
| R2.3 | backend-dev: 343, 345, 346, 347, 348, catálogo de métricas (356) | mobile-dev: sacola e checkout do cliente (347, 348), adesão e cupom do lojista (343, 346), painéis (357, 362), porta falsa (367), código de barras (373) | security-engineer: C-CUP, C-DSH |
| R2.4 | tech-lead | security-engineer | qa-engineer: G4 local; PO aceita |

Caminho crítico R2: contrato → 341/342 (motor e reserva atômica) → 344 (antifraude) → 347 (composição ao cliente) → testes de concorrência (risco 9 do TM) → G4 local. DEC-088/F1: nenhum campo que majore preço, frete ou taxa por cupom (teste automatizado em 347).

### R3: Rota, OK da loja, notificações, construtor

Pré: ADR mapa/rota aceito (W0.2); SEC-196 corrigido antes de 396; telas R3 prontas (designer em andamento).

| Onda | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| R3.1 | backend-dev: contrato R3 + migração do estado `MOTOBOY_NA_LOJA` (reversível, atrás de flag; altera RN-07/18/19) | tech-lead: contrato e ADR | product-designer: telas R4 |
| R3.2 | backend-dev: 391 (máquina de estados), 390 (OK da loja), 381 (rota heurística) | mobile-dev: 380 (mapa MapLibre/Protomaps no admin), 382 (link Maps/Waze) | security-engineer: matriz de transições, C-MOT-13/14 |
| R3.3 | backend-dev: 396, 397 (Web Push, C-NOT-05 SSRF) | mobile-dev: 396 (app/painel), 358, 359 (construtor) | qa-engineer: e2e do despacho e usabilidade "despachar um pedido" |
| R3.4 | tech-lead | security-engineer | qa-engineer: G4 local; PO aceita |

Caminho crítico R3: 391 → 390 → 381 → 380. **391 também é pré-requisito da R4**: atrasar 391 desloca R3 e R4.

### R4: App do motoboy e rastreio (bloqueada por SEC-193 e SEC-198)

Pré (portão de entrada): SEC-193 corrigido e provado (50 requisições paralelas, 429 `DELIVERY_CODE_LOCKED`) e SEC-198 corrigido e provado (sala `track:{orderId}` só do dono; membro da loja não recebe posição). Sem isso, **nenhuma história da R4 entra na onda**.

| Onda | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| R4.0 | backend-dev: SEC-193, SEC-198 | tech-lead: ADR do app (`apps/courier`) e do gateway `track:` | security-engineer: reverifica as duas correções |
| R4.1 | backend-dev: contrato R4, 383 (convite, aparelho aprovado pela operação), 384, 386, 387, 389, 395 | mobile-dev: `apps/courier` (384, 386, 387, 385) | qa-engineer: testes de gateway e e2e |
| R4.2 | backend-dev: 392, 394, 399, 393, 398 | mobile-dev: rastreio no app cliente (392 a 394, 399) e admin (388) | security-engineer: C-MOT e C-RT |
| R4.3 | tech-lead | security-engineer: teste em aparelho real (revogação, perda de rede, GPS falso) | qa-engineer: G4 local; PO aceita |

Caminho crítico R4: R3 (391/390) → SEC-193 e SEC-198 → 383 → 384 → 387 (GPS) → 392 (rastreio) → teste em Android real. Folga: nenhuma na cadeia GPS. Sem Android real, a R4 sai "RC com ressalva: emulador" (R-34).

### R5: Análises pagas e IA

| Onda | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| R5.1 | backend-dev: contrato, 366 (ativar/testar/suspender, usa 350), 364, 365, 368 | mobile-dev: painel Análises do lojista | security-engineer: C-ANA-05 a 07 (mínimo 5, reidentificação) |
| R5.2 | backend-dev: 378 (`ProductVisionProvider` `fake`; real só com flag e autorização) | mobile-dev: IA no cadastro (consentimento na tela) | qa-engineer: G4 local; PO aceita |

Lançamento real do módulo (8 semanas de dado, 5 lojas com 100 visitas, DEC-093) **não é construível localmente**: a R5 fecha como "pronta, desligada e testada com seed".

## 4. Definition of Ready por release (G2 e G3)

G2 (solução) já cobre R1 e R2: PRD, specs de tela (`design/telas/v1-1-*.md`), threat model. R3 a R5 ainda precisam de telas (designer em andamento) e dos ADRs de mapa e app. **Hoje nenhuma história passa a DoR completa**: falta estimativa dos devs e contrato OpenAPI (a definir pelo backend-dev na onda x.1). Pendências que o PO/Security/designer devem fechar na W0.1:

| Pendência | Dono | Bloqueia |
|---|---|---|
| WB-344 C4 reescrito sem "celular confirmado" (DEC-103 D-01: teto por campanha, dia e cliente/aparelho) | product-owner | R2 |
| WB-060 C1 (descrição opcional na via rápida) refletido no backlog e no PRD | product-owner | R1 |
| SEC-194: texto "dados de uso não ligados à sua conta, guardados por até 90 dias"; WB-361 C4, WB-363, WB-369 C1 | product-owner | R1 (staging) e R2 |
| Perguntas do designer (índice §6): foto por cor, juntar linhas, vitrine de cupons, "Enviar cópia", limiares de baixa amostra, matriz métrica x dimensão | product-owner | R1, R2 |
| Perguntas ao Security: motivo por sessão, tempo do "Ver como", rascunho local sem login, mensagens neutras de fraude | security-engineer | R1, R2 |
| Custo previsto do motoboy por faixa (F4) e campos `n`, `atualizado_em`, `em_cache` nas consultas | backend-dev | R2 |
| Abrir o protótipo `design/prototipo/v1-1-lojista-e-admin.html` em celular e desktop (designer não conseguiu executar) | CEO/fundador | R1 |
| Estimativa independente (poker) de backend-dev e mobile-dev por release | PM coleta | cada release |

Checklist de entrada por release (`definicao-de-pronto`): R1 e R2 = G2 ok + pendências acima + contrato revisado. R3 = telas + ADR mapa + SEC-196. R4 = telas + ADR courier + SEC-193/198 + J8/J26 só para ligar (não para construir). R5 = R1 coleta rodando em seed + F5/F6 + J25 só para ligar.

## 5. Definition of Done por release e gates

| Item | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Critérios de aceite verificados pelo QA | sim | sim | sim | sim | sim |
| Contrato OpenAPI e `shared` regenerado; teste de contrato de papel (C-GEN-02) | sim | sim | sim | sim | sim |
| Flags da release nascem `false`; teste de boot de produção | sim | sim | sim | sim | sim |
| Sem Crítico/Alto/Médio abertos (QA e Security) | sim | sim | sim | sim | sim |
| Achados SEC que precisam estar fechados | SEC-195 (ou dono) | SEC-197 (D-01 registrada), SEC-194 | SEC-196 | **SEC-193 e SEC-198 (bloqueiam)** | SEC-194 |
| Regressão do G4 v1.0 (tip `036e791`) sem queda | sim | sim | sim (RN-07/18/19 mudam) | sim | sim |
| Inventário LGPD/Data Safety atualizado antes de ligar flag (C-GEN-03) | ao ligar `coleta_eventos` | n/a | ao ligar push novo | n/a (APK não vai à loja) | ao ligar módulo |
| Parecer TL, Security e QA escritos; PO aceita; CEO registra G4 local | sim | sim | sim | sim | sim |

**Gates:** G3 por onda (PM, DoR). **G4 local por release** (QA e Security com veto, como na v1.0). **G5 da v1.1** (produção): só o CEO com autorização do fundador, **flag a flag** conforme `threat-model-v1-1.md` §10: `campanhas_cupom` frete grátis exige J22 e J23 e F2 > R$ 0; parte da loja exige J27; `coleta_eventos` e `modulo_analises` exigem J24; `app_motoboy`, `rastreio_ao_vivo`, `saida_automatica` exigem J8 e J26 e C-MOT/C-RT em aparelho real; `ia_visao_real` exige J25 e F8; `web_push_lojista` exige teste em aparelho real. J22 vale também para o piloto do v1.0.

### Bugs a fechar antes da R1 (W0)

| Item | Sev. | Ação | Dono | Custo |
|---|---|---|---|---|
| `alerts.spec.tsx` instável por data fixa (registrar como BUG-032) | Baixa | Relógio simulado no teste | mobile-dev + QA registra | 0,5 UT |
| BUG-029 (flake de fixture), BUG-030 (e2e-real depende do pedido do seed) | Baixa | Fixtures únicos por arquivo; seed não consumível | backend-dev | 1 UT |
| BUG-031 (app sem aviso "Versão para revisão") | Baixa | Mostrar o aviso | mobile-dev | 0,5 UT |
| SEC-186 (conta com exclusão pendente) e SEC-189 (seed com CNPJ zerado) | Baixa | **Baratos: fazer** (SEC-186 era "antes do piloto") | backend-dev | 1,5 UT |
| SEC-195 (EXIF do original) | Baixa | Fazer agora: a R1 é foto por câmera e o PRD promete EXIF removido | backend-dev | 1 UT |
| SEC-146, 149, 150, 161 a 163, 174; BUG-028b | Baixa | Ficam no backlog com dono (parecer-final-rc) | Security / QA | 0 |

### Revisão diferencial do desempenho do backend-dev (pré-merge)

Estado em 2026-11-22: 20 arquivos modificados e 6 novos **sem commit** na árvore (`apps/api`, `infra/`, `docs/deploy/`, `docs/qa/carga/`); o Security já revisou só o lado do app (`seguranca/revisoes/desempenho-app-2026-11-22.md`). Regra: nada disto vai ao `main` sem os dois pareceres.

| Mudança | Risco | Revisor | Prova exigida |
|---|---|---|---|
| `principal.service.ts`: sessão, usuário, perfil de admin e papéis em **uma consulta SQL crua** | Alto (autenticação em toda requisição; revogação precisa valer na hora, ADR-003; SQL cru) | SEC (diferencial) + TL | e2e de revogação, MFA, admin inativo, usuário suspenso, papéis vazios; mesma decisão que a versão anterior em tabela de equivalência |
| `app.setup.ts`: `Cache-Control: private, no-store` como padrão global; só rotas públicas sobrescrevem | Médio (vazar resposta pessoal em cache ou quebrar cache do catálogo) | SEC + TL | teste por rota: autenticada = `no-store`; pública = cabeçalho próprio; nenhuma rota `public` com coordenada ou dado pessoal (condição da revisão do app) |
| `cache.service.ts` + `local-cache.ts` | Médio (chave sem escopo de usuário, TTL) | TL + SEC | chave sem dado pessoal; invalidação; teste de unidade existente |
| `payments.service.ts`, `logistics-availability.service.ts` | Alto (dinheiro, ledger) | TL + SEC + QA | e2e de pagamento e ledger iguais; k6 `equivalencia.mjs` antes/depois |
| Migração `0057` (índice de avaliações) | Baixo | TL | idempotente, reversível, sem lock longo |
| `latency.ts` (log de latência por rota) | Baixo (LGPD: rota com id) | SEC | rota normalizada, sem id, IP ou query no log |
| `env.ts`, `docker-compose.prod.yml`, `env.prod.example`, `guia-deploy.md` | Médio (segredo, porta exposta, SEC-190/192) | SEC | sem segredo commitado; portas em loopback; boot de produção falha sem variável obrigatória |
| `database.module.ts` | Médio (pool, timeout) | TL | pool não excede o limite do Postgres do compose |

## 6. Matriz de testes por release

Legenda: **U** unitário (Vitest/Jest), **E** e2e da API, **P** Playwright, **K** k6 indicativo (local; staging é do fundador), **S** controles C-* do Security (`threat-model-v1-1.md` §9), **Uso** usabilidade simulada (`[HIPÓTESE]`, sem usuário real, exceto onde indicado).

| Release | U | E | P | K | S | Uso |
|---|---|---|---|---|---|---|
| W0 | alerts.spec estável; regressão total | 3 execuções seguidas; auth e pagamento iguais | 65+9 do G4 | `equivalencia.mjs` antes/depois | revisão diferencial (§5) | n/a |
| R1 | rascunho, grade, modelos, parser de colar, reajuste em massa, agregação mínimo 5 | admin: permissão por perfil, motivo, auditoria, concorrência; cadastro; coleta sem `user_id` | cadastro rápido, colar, massa, ficha 360, "Ver como" somente leitura | listas e consultas do admin | C-ADM-01..09, C-CAD-01/02/04..08/10, C-ANA-01..03/08, C-GEN-01/02 | **"cadastrar produto em <= 60 s"** (§6.1) |
| R2 | motor de desconto, tetos, "faltam R$ X", HMAC antifraude, "de/por" 30 dias | concorrência de orçamento (reserva atômica, duas campanhas), invariante do ledger, sem campo que majore preço (DEC-088) | cupom na sacola (9 respostas), campanha no admin, painéis e filtros | consulta de painel: 5 s, 30/min | C-CUP-01..13, C-DSH-01..05, C-ANA-04..06 | Criar campanha com simulação; aplicar cupom |
| R3 | heurística de rota (exata até 8 paradas), transições | matriz de estados (WB-391), timeouts 3/3/5/10 min, SSRF no endpoint de Web Push | mapa admin, atribuição, OK da loja | rota de 6 paradas <= 1 s | C-MOT-13/14, C-NOT-01..05, C-DSH-06/07 | **"despachar um pedido"** (§6.2) |
| R4 | cálculo de ETA, retenção 7 dias, intervalos de GPS | **SEC-193** (50 paralelas), **SEC-198** (sala), convite, aparelho aprovado, revogação | rastreio do cliente (mapa, sem sinal, 410) | 50 motoboys simulados no gateway `socketio-conexoes.mjs` | C-MOT-01..12, C-RT-01..08; **aparelho real** (revogação, rede, GPS falso, bateria <= 12%/h) | Corrida ponta a ponta no emulador; Android real quando houver |
| R5 | mínimo 5, k-anonimato, adaptador `fake` | módulo por loja (ativar, expirar, suspender), tetos da IA | painel Análises, consentimento da IA | n/a | C-ANA-05..07, C-CAD-09 | Lojista lê o painel sem ajuda |
| Final | tudo | tudo | tudo + capturas | k6 completo local | reverificação de todos os C-* e SEC | 4 tarefas da v1.0 + 2 novas |

### 6.1 Usabilidade "cadastrar produto em <= 60 s" (PRD cadastro-rápido, DEC-094)
Duas etapas. (a) **Simulada** (QA + designer, protótipo e depois o web real): toques, telas e palavras por caminho; caminho feliz 25 a 38 s e 45 a 60 s com 1 erro (índice de design §5). (b) **Real**: 5 pessoas do perfil (P2) cronometradas; mediana <= 60 s; **critério de morte do PRD** se passar de 60 s. Só o fundador consegue pessoas reais: é a única parte da R1 que depende de gente de fora. Sem (b), a hipótese continua `[HIPÓTESE]` no relatório.

### 6.2 Usabilidade "despachar um pedido" (PRD despacho)
Tarefa: da fila de pedidos prontos ao lote de 3 corridas enviado ao motoboy com rota. Meta do PRD: **<= 90 s** para montar e enviar o lote; atribuição até aceite com mediana <= 2 min. Simulada pelo QA (toques/telas/palavras, cronômetro no ambiente local com seed de 12 pedidos); real no piloto `[HIPÓTESE]`.

## 7. Relatório final do fundador: "revise, teste tudo, resolva todos os bugs e me passe um relatório simples de como está cada parte visual dos apps"

| Item | Definição |
|---|---|
| Quando | Onda **Final**, depois do G4 local da R5 (ou da última release construída) e do congelamento do HEAD (como T8-00: QA não testa alvo móvel) |
| Escopo | App do cliente, painel do lojista, admin, site público, app do motoboy (se construído). Inventário base: `docs/telas/README.md` (70 telas da v1.0) mais as telas da v1.1 (`design/telas/v1-1-*.md`) |
| Capturas | qa-engineer, por tela e estado (carregando, vazio, erro, sucesso), em 2 viewports (Android 360x800, iPhone 390x844) e desktop para web. Saída: `docs/telas/v1-1/` (índice e PNG). App do motoboy: emulador; sem aparelho, marcar "NÃO CAPTURADO EM APARELHO" |
| Nota por tela | 1 a 5 pelo product-designer, mesmo critério de `qa/relatorios/heuristica-nielsen.md`: hierarquia, consistência com a direção v3, legibilidade e contraste, estados completos, clareza do texto. Semáforo funcional do QA (V/A/R) ao lado. Nota 1 a 2 = refazer; 3 = usável; 4 a 5 = bom |
| Bugs | Cada captura aponta para BUG-/SEC- com severidade. Meta: **0 Crítico, Alto e Médio abertos**. "Resolva todos" literal (zero Baixa) não é compromisso: Baixa cosmética pode ficar listada, com dono e motivo; cabe ao CEO aceitar |
| Entrega ao fundador | Uma página, `qa/relatorios/v1-1-visual-geral.md`: tabela **por parte** (cliente, lojista, admin, site, motoboy) com nota média, as 5 piores telas com a foto, bugs abertos por severidade, "visto em aparelho real: sim/não" (só o fundador muda para "sim"), o que mudou desde a v1.0 |
| Donos | QA captura e testa; designer nota; PM consolida e confere evidência; CEO resume ao fundador |
| Custo | 8 / 12 / 18 UT (linha Final da §2); cresce se o ciclo corrigir-e-retestar repetir mais de 1 vez `[HIPÓTESE]` |

## 8. Cortes sugeridos (decisão do PO/CEO; o PM só sinaliza)

Já aprovados na ordem DEC-100: R5, construtor (358/359), R4, 346/348/354/365, 380. Sugestões adicionais, com o porquê:

| Corte sugerido | Porquê | Economia (UT, M) |
|---|---|---|
| WB-358/359 construtor primeiro | RICE 0,3 (o menor) e já tem painéis prontos | ~5 |
| WB-373 EAN com câmera | L4 aberta: moda e calçado raramente têm EAN; base própria começa vazia | ~2 |
| WB-397 Web Push do lojista | só valida em aparelho real; o OK da loja funciona sem ele | ~2 |
| WB-368 origem por canal (Could) | não sustenta decisão alguma antes do módulo pago | ~1 |
| R4 inteira para depois de R5 | construída e testada mas **desligada** até J8/J26; sem Android real não passa em G4 sem ressalva; é a maior release (27% do esforço). Alternativa: manter e aceitar ressalva | ~41 |

Troca de ordem sugerida: **R5 pode ser feita antes da R4** (barata, 12 UT, depende só da R1 e da R2), deixando a R4, cara e dependente de aparelho, por último. Contradiz DEC-100 só na ordem R4/R5; o CEO decide.

## 9. Buffer, calibração e decisões pedidas

Buffer (fora das estimativas, no fim, com nome; **2026-11-23: recomendo 30 UT, §12.4**): **25 UT** (15% de 168) `[HIPÓTESE]`; só para imprevisto, nunca para escopo novo. Acrescento +10% por release com dependência externa na saída (R2, R4).

| # | Decisão | Dono | Recomendação |
|---|---|---|---|
| D-A | Permitir 2ª instância do mobile-dev em **diretórios disjuntos** (`apps/courier` x `apps/web`) na R4 | CEO | Sim: o mobile-dev concentra ~45% das UT e é o gargalo |
| D-B | Trocar a ordem R4/R5 (§8) | CEO, PO | Sim |
| D-C | Aceitar cortes extras de §8 | PO, CEO | WB-358/359, 373, 397, 368 |
| D-D | Liberar espaço em disco antes da W0 (I-05) | CEO, fundador | Já; sem isso nada commita |
| D-E | Backend-dev commita o desempenho pendente e a revisão diferencial é pré-requisito do merge | CEO | Sim |

## 10. Reestimativa da R1 após o contrato (2026-11-22; DEC-118 a DEC-123)

Fontes: `estimativas-v1-1-r1.md` (backend-dev, PERT 13,8, §7 com os deltas), apêndice de re-revisão em `arquitetura/reviews/contrato-v1-1-r1-2026-11-22.md` ("Estimativa revisada"), `seguranca/threat-model-v1-1.md` §14, §15.6 e §15.7. UT = a do §1 (`[HIPÓTESE]`, não calibrada).

### 10.1 A conta
| Linha | UT | Origem |
|---|---|---|
| Backend PERT original | 13,8 | backend-dev |
| Deltas do §7 (WB-352 +0,5, D-06 +0,8 a 1,0, WB-353 +0,4, I4 +0,4, I5 +0,15, B2 +0,2, I11 +0,3, I3 +0,1, I8 -0,4, I7 -0,5) | +2,05 | tech-lead conferiu: **15,85 = piso** |
| D18 (+0,3), D19(1) e `REVOKE` por migração (+0,1), D20(a) (+0,1), 24+ testes VA/AO/BK/DB dentro da WB-352 (+0,3 a 0,5) | +0,8 a 1,0 | tech-lead |
| **Backend realista** | **16,5 a 17** | TL |
| Com 15% de retrabalho (houve 1 rodada de correção do contrato) | **~19** | TL, `[HIPÓTESE]` |
| Plano original reservava ao backend | 9 a 10 | `[HIPÓTESE]` do backend-dev sobre o §2 |
| **Lacuna** | **7 a 9** | |
| Mobile-dev (web e app) | 14,3 no plano + 0,4 (parser A6) = **14,7 mínimo** | **Sem estimativa independente do mobile-dev até hoje** (R-46): "ver como" com tipos próprios, tabela de preços e massa com chave de idempotência ainda não foram estimados |
| Revisões TL + SEC + QA (25% no plano = 8) | ~9 a 10 `[HIPÓTESE]` | cresce com revisão diferencial da WB-352, D18 e D-06 |
| **R1 total** | **~40 a 44** (plano: 31,7) | **+8 a +12** |

Absorver +8 a +12 no buffer de 25 UT queimaria 1/3 a 1/2 dele antes de a R2 começar. **Recomendação: subir a linha de base da R1 e do total (168 para ~177 a 181) e deixar o buffer de 25 UT intacto**; DT-085, DT-086, BUG-034, BUG-035 (~1,4 a 2,0) continuam saindo do buffer (R-40).

### 10.2 Buffer, compromisso e o que cabe
- Buffer nomeado da R1: **15% = ~2,5 UT de backend**, no fim, já incluído na ponta alta (~19). Só para imprevisto; nunca para escopo novo.
- Compromisso firme (sem R1.4 e sem os itens 1 a 4 da ordem de corte): backend ~13,5 a 15 UT. Isso é o que cabe sem depender de sorte.
- Backend na cadeia: 0,3 + 6 + 3,4 + 5,75 + 2,8 = ~18,3 UT, consistente com a faixa 16,5 a 19.
- Throughput ~2 UT por janela de calendário `[HIPÓTESE]`: ~20 a 22 janelas para a R1 inteira; mas como o backend é um slot, o calendário mínimo é ~17 a 19 janelas de backend serial, mais a cauda de revisão e QA.

### 10.3 Ordem de corte aprovada (DEC-123) e piso
Piso que **não corta**: WB-352, WB-355, D-06, R1.2. Se o realizado passar da faixa, corta nesta ordem (economia M, backend):
| # | Corte | UT | Custo do corte |
|---|---|---|---|
| 1 | CSV e "restaurar" do WB-354 | 0,2 a 0,4 | Histórico fica só para leitura |
| 2 | PUT de modelo pelo admin (WB-375, Could) | 0,2 | Modelos mudam só por migração |
| 3 | `.xlsx` no servidor (WB-376): só CSV no navegador | 0,3 | Menos código no servidor |
| 4 | Massa do admin (`bulkAdminStoreProducts`, WB-353) | 0,5 | Admin edita item a item; leva parte da D18 |
| 5 | R1.4 inteira (coleta) para a R2 | ~2,8 | Sem dado de uso antes da R2; só staging mesmo |
Soma 1 a 5: ~4,1 UT. Fecha só metade da lacuna: a outra metade é aceitar a R1 maior. **Não cortar** `price_adjust` do lojista pela metade: entra com D18 completo ou sai inteiro (TL).
**Gatilhos** (decididos pelo PM, relatados ao CEO no mesmo dia): fim da R1.1 acima de 7,5 UT (1,25x de 6) = cortes 1 a 3 na hora; acima de 9 = cortes 4 e 5 também; R1.0 sem base verde 3x = nada da R1.1 vira "pronto" e o status vai a VERMELHO.

### 10.4 Rodadas de agentes e sessão com Docker
- **Rodadas** (1 UT = 1 janela de um agente): R1 inteira ~40 a 44; só backend ~16,5 a 19; só até o piso e R1.2 (R1.0 a R1.2): backend ~9,7 e total ~22 a 24. Cada onda ainda gasta rodadas de revisão (TL, Security, QA), já contadas nas ~9 a 10.
- **Exige sessão com Docker** (a sandbox não tem; R-41): R1.0 inteira; toda migração (0058 a 0065) e e2e; VA, AO, BK e DB no CI "com Docker, não só local" (TM §15.7 item 2); concorrência de I2/I3 e D18; prova da D-06; ensaio de restauração. **Não exige Docker** (já pode rodar): remoção das 2 rotas legadas e WB-355 em PR rascunho, partes puras da WB-352, escrita (sem rodar) das migrações, regras puras da 351/353, parser A6. Disco: 683 MB livres de 252 GB em 2026-11-22 (I-05); imagens do compose não cabem, então a R1.0 depende de liberar disco ou de rodar na máquina do fundador.

### 10.5 Gates de segurança da R1 (G4 local)
SEC-206 (Alta, Ver como: desenho fechado, código pendente), SEC-207 (Média, máscara de cliente), SEC-208 (Média, idempotência na mesma transação da D18), SEC-209 (Média, `timeline` e "estrito" aninhado; devolvida ao backend-dev, bloqueia o **merge** da WB-352). Para fechar: VA-01..26, AO-01..05, BK-01..08, DB-01..05 verdes no CI com Docker, `x-view-as` no redact do pino e do Sentry, revisão diferencial da WB-352, D18 e D19 (TM §15.7). SEC-194 segue aberta até J24 e não bloqueia o G4 em staging.

## 11. Re-baseline (2026-11-23, após DEC-140): o que resta, caminho crítico e carga do fundador

**Estado:** R1.1 a R1.3 estão na `main` (PR 2 `b480b0c`, PR 3 `f74f258`; CI verde nos jobs `checks` e `e2e-web`; DT-095 fechada). R1.4 **adiada** (DEC-138), levando a WB-362b. R2.1 (contrato 0.5.0, ADR-019, migrações 0064/0065) **revisada** (DEC-139). R2.2 **em construção**: backend-dev na Fase A (correções) e depois na Fase B (motor); mobile-dev só começa admin de campanhas e sacola depois da Fase A. UT medidas: R1.1+R1.2 ~9,9 (faixa 8,4 a 11,4); R1.3 e R2.1 **indisponível** (só estimativa). Estado e condições: `board.md` (v1.1). Estimativa da R2: §12.

**Cor:** AMARELO na construção; VERMELHO no caminho de deploy/G5 (gatilho do re-baseline anterior disparou: R1.0 nunca executada com a R1.3 já mergeada; disco em 72 MB livres).

### 11.1 Caminho crítico (backend serial, 1 slot; UT do §12)

| Passo | UT | Depende de | Observação |
|---|---|---|---|
| 1. Fase A (B1, B2, R1 a R13, SEC-224 a 233; migração 0066) | 1,53 | nada (em andamento) | Árvore com 8 arquivos sem commit (R-53). ADR-019 só vira "Aceita" aqui |
| 2. Motor: WB-340, 341, 342, 349 | 8,76 | passo 1; BUG-049 corrigido antes de tocar `closeOrder`, webhook e estorno | B1: ordem global de travas e e2e de deadlock; integração com orders, payments e finance é o maior risco (TL) |
| 3. WB-344a (identificadores e travas) e 347 (composição ao cliente) | 3,13 | passo 2; SEC-225/226 | `payer_document_hash` com leitura dupla; sem campo que majore preço (DEC-088) |
| 4. k6 do `createOrder` e testes de deadlock | 0,62 | passo 3 | Gate: p95 do `createOrder` com 20 a 50 usuários na MESMA campanha (R5 do TL) |
| 5. R2.3 backend: 343, 345, 356, 357, 344b, 346, 348, 362a, 367, 373 | 13,22 | passo 2 (motor) e contrato dos painéis | Painéis (356/357, 6,1) são o maior bloco |
| 6. R2.4: QA 3,6 + TL e Security 4,1; PO aceita | 7,7 | passo 5; mobile entregue | G4 local; 3 execuções do e2e |

Backend: 27,3 UT em série, ~27 janelas a ~1 UT por janela `[HIPÓTESE]`, mais a cauda de revisão e QA. **Folga do backend: zero.** Mobile (17,3 UT) corre em paralelo atrás do contrato estável: admin de campanhas (3,6) depois da Fase A; sacola (3,1) depois do 341/347; painéis (3,3) depois do 356/357, que fecha a cauda. Se o backend entrega o 341/347 cedo, a sacola começa sem esperar o fim do passo 3. Dependências que só o fundador resolve **não travam a construção** (F2 e F4 têm default; J22/J23/J27 só ligam flags); travam o RC (aparelho) e o deploy.

### 11.2 Carga do fundador por rodada (horas `[HIPÓTESE]` mínimas; ele não confirmou disponibilidade)

| Etapa | Falta (UT, PERT) | Depende de | Carga do fundador | Corte / observação |
|---|---|---|---|---|
| **R1.0** com Docker | 0,5 (era 0,3; soma 0064/0065 up/down e e2e de schema da R2) | D-16, disco (I-05) | 1 a 2 h: sessão em máquina com Docker | Sem ela D-06, PG 18 e as migrações 0058 a 0065 seguem "não provadas"; bloqueia deploy, não a construção |
| **Aparelho + 60 s** (R1.2/R1.3) | n/a | C-07, D-14 | **4 a 5 h:** roteiro §12.11 (~1,5 h) + roteiro de celular do §9 do relatório da R1.3 (~0,5 h) + 5 pessoas do perfil cronometradas (~3 h, com recrutamento) | Sem isso a meta de 60 s e HIP-Q2 seguem `[HIPÓTESE]` |
| **R2.2** (Fase A e B) | 14,0 backend + 3,6 mobile | Fase A; BUG-049 | ~1 h: F2 e F4 (sem resposta: R$ 0 e custo provisório), decidir SEC-200 | Nada da Webag ativa em produção sem F2 > R$ 0 |
| **R2.3** | 13,2 backend + 13,7 mobile | R2.2-B | **~4 a 4,5 h:** 5 entrevistas da porta falsa (WB-367) e 3 lojistas para validar os números de SEC-232/233 (R$ 150 por mês, 50%, 30 dias, 50% dos pedidos), **com as mesmas pessoas do recrutamento dos 60 s quando possível** | Cortes: 373, 348, 346 (§12.5) |
| **J22, J23, J27** ao advogado | n/a | R-32 | ~1 h, assíncrono, em lote; só para ligar flags | Antes do RC da R2 |
| **R2.4** G4 local (+ R1.5 unificada) | 7,7 | R2.3 | ~1,5 h: um só RC local (`pnpm iphone`, Docker Desktop) para R1 e R2 | Proposta: unir R1.5 e R2.4 (economiza ~1,5 h do fundador e ~1,5 UT; risco: defeito da R1 aparece tarde, mitigado por regressão do QA da R1 antes) |
| **R1.4 + 362b** | ~3,5 (2,8 + ~0,7 `[HIPÓTESE]`) | R2 | ~0 (só staging, flags `false`) | Adiada; tem de rodar antes da R5 e do painel de funil. Renumerar a migração 0065 |
| **R5** | 12,3 | R1.4, R2 | ~1,5 h: F5/F6 e RC | "Pronta, desligada e testada com seed" |
| **R3** | 24,7 | ADR mapa, SEC-196, **DT-102** | ~2 h | Construtor 358/359 e 380 antes |
| **R4** | 41,3 | R3, SEC-193/198, ADR courier | ~4 h: Android real | Candidata a sair |
| **Onda final** | 12,3 | HEAD congelado | ~2,5 h | "Visto em aparelho" só o fundador muda |

Soma de horas do fundador (mínimo): ~26 a 29 h em ~9 janelas (R2 passou de ~6 h para ~8 h; a unificação do RC devolve 1,5 h). Caminho crítico até o RC da R2: Fase A -> motor -> 344a/347 -> R2.3 -> QA/G4 local. Fora dele, e pedidas já: disco, Docker (R1.0) e aparelho + 60 s.

### 11.3 Janelas pedidas ao fundador (agrupadas; pedido em 2026-11-23)

| Janela | Conteúdo | Duração | Prazo sugerido `[HIPÓTESE]` |
|---|---|---|---|
| **A (agora)** | Liberar disco (72 MB livres de 252 GB; commit e `pnpm` falham); marcar `e2e-web` e `checks` como obrigatórios no `main`; F2 (R$ 0 se calar), F4, aceitar ou corrigir SEC-200 | ~30 min | Resposta até 2026-11-27 |
| **B (sessão única, 2 blocos)** | Bloco 1: Docker (R1.0: base e2e 3x, `db-roles`, migrar sem superusuário, `compose config`, restauração, PG 18, 0064/0065 up/down). Bloco 2: aparelho real + 60 s + 5 entrevistas + 3 lojistas dos números de SEC-232/233 | 6 a 7 h | Executar até 2026-12-02, antes do pico de mobile da R2.3 |
| **C (assíncrona)** | J22, J23, J27 ao advogado, em lote | ~1 h do fundador | Até 2026-12-06, antes do RC da R2 |

## 12. Estimativa da R2 pós-revisão (2026-11-23; DEC-137 a DEC-140)

Fontes: `arquitetura/reviews/r2-1-contrato-2026-11-23.md` (Estimativa (8)), `ADR-019` (Estimativa de esforço restante), `produto/backlog.md` §10.8.1, `seguranca/threat-model-v1-1.md` §20, `estimativas-v1-1-r1-front.md` (âncora do mobile). UT do §1, `[HIPÓTESE]`, não calibrada. PERT = (O + 4M + P) / 6.

### 12.1 Como foi o poker (limites)
- **Backend:** há dois votos independentes: backend-dev 18,5 a 22 (ADR-019, antes da revisão) e tech-lead 22 a 27 (M ~25). A diferença (+4 a +5 UT) vem de premissas escritas pelo TL: WB-340 e WB-347 sem linha própria (+2,5 a 3), painéis 6 a 7 e não 4,5 a 5,5 (+1,5), WB-344 (+0,5 a 1), deadlock e k6 (+0,5), funil sai (-0,5). Não fiz média: adotei as premissas do TL linha a linha; sem a Fase A e o k6, meu PERT é 25,1, igual à mediana do TL. O backend-dev confirma ou contesta cada linha na planning; diferença de 50% ou mais numa linha: reestimar com premissa.
- **Mobile:** **não há voto independente do mobile-dev para a R2** (só para a R1). Os três pontos são do PM, ancorados nas linhas da R1 (WB-350 e 351: 1,03; WB-352: 2,07; BASE: 0,52). O mobile-dev confirma antes do G3 da R2.3; até lá `[HIPÓTESE]` (R-46).
- **QA e revisões:** PM, por analogia com a R1.3 (QA 2 h 23; TL e Security em paralelo, 11 min de relógio).

### 12.2 Backend (UT)

| Item | O | M | P | PERT | Premissa |
|---|---|---|---|---|---|
| Fase A (B1, B2, R1 a R13, SEC-224 a 233; 0066) | 1,0 | 1,5 | 2,2 | 1,53 | Só correção de desenho, contrato e migração; sem o motor |
| WB-340 campanhas (18 rotas, simulação, 15 blockers, 2º fator, auditoria) | 1,5 | 2,0 | 2,8 | 2,05 | Sem linha própria no ADR; 403 `REAUTH_REQUIRED` |
| WB-341 aplicar cupom (função pura D5, "Faltam R$ X", R10 a R12) | 2,0 | 2,5 | 3,5 | 2,58 | Tetos recalculados dentro da trava (R11) |
| WB-342 reserva atômica e orçamento (B1, integração em `closeOrder`, webhook e estorno) | 2,5 | 3,2 | 4,5 | 3,30 | P: o ciclo de travas obriga a reescrever passos da criação; BUG-049 esconde regressão |
| WB-349 pausar, encerrar, duplicar, alertas | 0,6 | 0,8 | 1,2 | 0,83 | Reconferência sob trava; 409 e não "pedido sem cupom" |
| **WB-344a** identificadores e travas (HMAC com rotação, SEC-225/226/228, `payer_document_hash` com leitura dupla, expurgo) | 1,6 | 2,0 | 3,0 | 2,10 | Divisão da DEC-140 (5): C1 a C5, C10, C11, C14 a C19 |
| **WB-344b** painel "Suspeitos" e alertas | 0,6 | 0,8 | 1,2 | 0,83 | C6 a C9, C12, C13; sem "Revelar" |
| WB-343 adesão da loja (SEC-227, SEC-232) | 0,8 | 1,0 | 1,5 | 1,05 | Convite, aceite, saída; teto e aviso ao dono |
| WB-346 cupom próprio da loja (R6, R8, SEC-233) | 0,8 | 1,1 | 1,6 | 1,13 | Should; `maxUses` opcional, CHECK relaxado só para `owner = store` |
| WB-345 relatório e conciliação (B2b: vive em `dashboards`) | 1,3 | 1,7 | 2,4 | 1,75 | Confere com o ledger sem lançamento próprio |
| WB-347 composição ao cliente (linhas, vitrine com "Faltam") | 0,7 | 1,0 | 1,5 | 1,03 | Sem linha própria no ADR; teste de "nenhum campo majora preço" |
| WB-348 selo "de/por" | 0,7 | 1,0 | 1,4 | 1,02 | Should; DT-103: sem passado nos primeiros 30 dias |
| WB-356 catálogo de métricas, consulta e pipeline (26 métricas com oráculo no seed) | 2,5 | 3,2 | 4,2 | 3,25 | TL: 6 a 7 UT para 356+357 |
| WB-357 5 painéis prontos | 2,0 | 2,8 | 3,8 | 2,83 | Should; depende da 356 |
| **WB-362a** acessos (só seed) | 0,2 | 0,3 | 0,5 | 0,32 | 362b fica com a R1.4 |
| WB-367 porta falsa | 0,2 | 0,3 | 0,5 | 0,32 | Não coleta dado pessoal |
| WB-373 código de barras (S4) | 0,5 | 0,7 | 1,0 | 0,72 | Should; base própria nasce vazia |
| k6 do `createOrder` e testes de deadlock (DT-100, B1, R5) | 0,4 | 0,6 | 0,9 | 0,62 | Gate por `createOrder`, não por aplicar cupom |
| **Backend total** | **19,9** | **26,5** | **37,7** | **27,3** | ±3,0 |

### 12.3 Mobile, QA e revisões (UT)

| Item | O | M | P | PERT | Premissa |
|---|---|---|---|---|---|
| BASE (fake-api, wrappers, regenerar `shared`) | 0,3 | 0,5 | 0,8 | 0,52 | Igual à R1 |
| Admin de campanhas (340, 349, alertas; web) | 2,2 | 3,0 | 4,2 | 3,07 | Criar com simulação, 15 blockers, pausar, encerrar, duplicar; 4 estados |
| Relatório da campanha (345; web) | 0,7 | 1,0 | 1,5 | 1,03 | CSV e "conferido" |
| Sacola e checkout do cliente (341, 347, 349 C5; app) | 2,0 | 3,0 | 4,5 | 3,08 | Tabela única "Mensagens ao cliente" (DEC-137); 9 respostas; 409 pede confirmar o novo total |
| Selo "de/por" (348; app e lojista) | 0,5 | 0,8 | 1,2 | 0,82 | Should |
| Adesão do lojista (343; web) | 1,0 | 1,4 | 2,0 | 1,43 | Convite, aceite, saída; aviso do funcionário |
| Cupom próprio do lojista (346; web) | 0,8 | 1,2 | 1,8 | 1,23 | Should; teto mensal obrigatório |
| "Suspeitos" do admin (344b; web) | 0,5 | 0,8 | 1,2 | 0,82 | Ficha do pedido mascarada |
| Painéis (356/357; web) | 2,2 | 3,2 | 4,8 | 3,30 | 5 painéis, filtros, baixa amostra, `blocked`; 26 métricas |
| Acessos (362a) | 0,2 | 0,3 | 0,5 | 0,32 | Só seed |
| Porta falsa (367) | 0,3 | 0,4 | 0,7 | 0,43 | Texto e dono definidos no PRD |
| Código de barras (373; web e app) | 0,8 | 1,2 | 2,0 | 1,27 | P inclui o spike do leitor no Safari (L4) |
| **Mobile total** | **11,5** | **16,8** | **25,2** | **17,3** | ±2,3; sem aparelho real |
| QA (concorrência, oráculo das 26 métricas, regressão G4, exploratório, reteste) | 2,5 | 3,5 | 5,0 | 3,58 | 3 execuções do e2e |
| TL + Security (revisão de código das 2 ondas, C-CUP, C-DSH) | 3,0 | 4,0 | 5,5 | 4,08 | Tudo "a fazer", pós-código |

### 12.4 Total, buffer e efeito no total do projeto

| Linha | O | M | P | PERT |
|---|---|---|---|---|
| **R2 restante** (backend + mobile + QA + revisões) | 36,9 | 50,8 | 73,4 | **52,3** (±6,1) |
| R2.1 já gasta (~3 do ADR + ~1,5 de revisão `[HIPÓTESE]`) | | | | ~4,5 |
| **R2 inteira** | | | | **~56,8** (plano: 37,0; **+19,8, +54%**) |
| Total do projeto | | | | ~198 (faixa 196 a 200); era ~178 com a R1 nova e 168,3 no início |

Por que: o plano de 37 UT deu ao mobile 45% (16,6; a conta nova dá 17,3, bate) e pouco ao backend (~11 `[HIPÓTESE]`, sem linha para WB-340, WB-347 e a integração em `closeOrder`); quase todo o delta está no backend (27,3 mais ~3 já gastas). É o mesmo padrão da R1 (backend 9 a 10 no plano contra 16,5 a 19).

**Buffer** (no fim, com nome, só para imprevisto): o de 25 UT (15% de 168) passa a 12,6% do novo total, abaixo da regra de 15%. Recomendo **30 UT (15% de ~198)**, mais 10% da R2 (5,2) e 10% da R4 (4,1) pelo §9: **~39 UT nomeados**. O delta de +19,8 **não** é pago pelo buffer: sobe a linha de base, como na R1 (§10.1). Prazo-alvo da R2 = 52,3 + 15% (7,8) = ~60 UT restantes.

### 12.5 Ordem de corte da R2 e o efeito da R1.4 adiada

Piso (não corta): WB-340, 341, 342, 344a, 347, 349, 345, 356, 343. WB-362a e 367 ficam: são baratas (0,3 + 0,3 backend) e validam hipótese.

| # | Corte (DEC-100) | Economia (backend + mobile) | Custo do corte |
|---|---|---|---|
| 1 | WB-373 código de barras | 0,72 + 1,27 = **2,0** | Sem EAN; o L4 já dizia que moda e calçado raramente têm código |
| 2 | WB-348 selo "de/por" | 1,02 + 0,82 = **1,8** | Sem selo; J23 não existe e o histórico de preço só comprova 30 dias depois (DT-103), então o valor inicial é baixo |
| 3 | WB-346 cupom próprio da loja | 1,13 + 1,23 = **2,4** | Só campanha da Webag e "Loja paga" pelo admin; tira R-56 do RC |
| 4 | WB-357 reduzida de 5 para 2 painéis | ~**2,0** `[HIPÓTESE]` | Menos painéis prontos; a 356 (consulta e catálogo) fica |
| **1 a 3** | | **6,2** | R2 firme em 46,1 UT (PERT), com buffer de 15%: ~53 |
| **1 a 4** | | **~8,2** | R2 firme em ~44 UT |

**R1.4 adiada:** a ordem de corte da R1 (plano §10.3) já gastou o corte nº 5 (R1.4, ~2,8 UT). A R1.4 e a WB-362b (~0,7 UT) formam um bloco de ~3,5 UT que **sai da R2 sem ser cortado**: tem de rodar antes da R5 (que depende da coleta) e do painel de funil. Se for cortada de vez, a R5 fica só com seed (já era "pronta, desligada e testada com seed") e o painel "Acessos" fica sem dado real até a coleta. Não está nos 52,3.

**Gatilhos (PM, relato ao CEO no mesmo dia):** Fase A acima de 2,2 UT; fim da Fase B (motor, 344a e 347: 12,5 UT) acima de **15,6** (1,25x) = cortes 1 a 3 na hora; acima de **18,8** (1,5x) = corte 4 e revisão do piso; qualquer `40P01` no e2e = R-52; BUG-049 sem correção ao iniciar a Fase B = a Fase B não toca em estorno.
