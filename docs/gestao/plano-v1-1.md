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
| **R1** Cadastro rápido, admin de lojas, coleta em staging | 18: 350 a 355, 360, 361, 363, 369, 370 a 372, 374 a 377, 379 | 24 / 31 / 42 | 31,7 | Fundador testa cadastro com cronômetro no próprio celular; 5 pessoas do perfil para a meta de 60 s; J27 (edição de preço pelo admin) e J24 (coleta) só para ligar |
| **R2** Cupons, painéis prontos, acessos | 16: 340 a 349, 356, 357, 362, 367, 373 | 28 / 36 / 50 | 37,0 | F2 (orçamento R$ 0), F4 (custo previsto do motoboy por faixa); J22, J23, J27 para ligar; 5 entrevistas de lojistas (porta falsa) |
| **R3** Rota, OK da loja, notificações, construtor | 9: 380 a 382, 390, 391, 396, 397, 358, 359 | 18 / 24 / 34 | 24,7 | Spike do extrato Protomaps (L5); Web Push só valida em aparelho real; F12 sem parecer: `saida_automatica` off |
| **R4** App do motoboy e rastreio | 13: 383 a 389, 392 a 395, 398, 399 | 30 / 40 / 58 | 41,3 | **Aparelho Android real** (GPS em 2º plano, bateria); J8 e J26 para ligar; SEC-193 e SEC-198 antes |
| **R5** Análises pagas e IA | 5: 364, 365, 366, 368, 378 | 8 / 12 / 18 | 12,3 | Preço e teste do módulo (F5/F6); 8 semanas de dado real (não existe local); J24, J25 |
| **Final** Revisão geral, bugs e relatório visual | todas as telas | 8 / 12 / 18 | 12,3 | Aparelho real do fundador para "visto em aparelho: sim/não" |
| **Total** | 61 histórias | 122 / 164 / 234 | **168,3** | Em janelas de calendário: PERT / 2 ≈ **84** `[HIPÓTESE]` |

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

### R1: Cadastro rápido, admin de lojas, coleta em staging (G2 cobre: PRD, specs 1 a 4, TM)

| Onda | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| R1.1 | backend-dev: contrato OpenAPI R1 + migrações (rascunho, grade, modelos, auditoria de loja, eventos, agregados) | tech-lead: revisa o contrato; ADR de rascunho | product-designer: R3/R4 (continua) |
| R1.2 | backend-dev: admin de lojas (350, 351, 353, 355; piso 352/355 primeiro), depois cadastro (370 a 372, 374, 375) | mobile-dev: web admin (350 a 355) depois do contrato | security-engineer: C-ADM e C-CAD sobre o código entregue |
| R1.3 | backend-dev: coleta e agregação (361, 363, 369), colar/importar/massa (376, 377), tempos (379) | mobile-dev: cadastro rápido (370 a 372, 374 a 377, 379) e aviso/opt-out no app (360) | qa-engineer: testes e2e e Playwright dos fluxos |
| R1.4 | tech-lead: review final | security-engineer: parecer C-GEN, C-ANA em staging | qa-engineer: regressão, usabilidade, G4 local; PO aceita |

Caminho crítico R1: contrato → rascunho/mídia (SEC-195) → cadastro rápido no web → **teste dos 60 s** → G4 local. Admin de lojas corre em paralelo (folga: 1 onda). Épicos: E-ADM (350 a 355), E-CAD (370 a 379), E-COL (360, 361, 363, 369).

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

Buffer (fora das estimativas, no fim, com nome): **25 UT** (15% de 168) `[HIPÓTESE]`; só para imprevisto, nunca para escopo novo. Acrescento +10% por release com dependência externa na saída (R2, R4).

| # | Decisão | Dono | Recomendação |
|---|---|---|---|
| D-A | Permitir 2ª instância do mobile-dev em **diretórios disjuntos** (`apps/courier` x `apps/web`) na R4 | CEO | Sim: o mobile-dev concentra ~45% das UT e é o gargalo |
| D-B | Trocar a ordem R4/R5 (§8) | CEO, PO | Sim |
| D-C | Aceitar cortes extras de §8 | PO, CEO | WB-358/359, 373, 397, 368 |
| D-D | Liberar espaço em disco antes da W0 (I-05) | CEO, fundador | Já; sem isso nada commita |
| D-E | Backend-dev commita o desempenho pendente e a revisão diferencial é pré-requisito do merge | CEO | Sim |
