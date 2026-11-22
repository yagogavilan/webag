# Estimativas do backend-dev: v1.1 R1 (cadastro rápido, admin de lojas, coleta em staging)

Dono: backend-dev | Data: 2026-11-22 | Para: tech-lead (revisão do contrato e das estimativas), project-manager (DoR, R-40) | Contrato: `arquitetura/api/openapi.yaml` 0.4.0 e `arquitetura/adr/ADR-018-contrato-v1-1-r1.md`
Estimativa **independente do lado da API**. O mobile-dev estima o web e o app à parte (o PM coleta, `plano-v1-1.md` §4). Nenhuma implementação foi feita; esta é a estimativa para fazer.

## 1. Unidade e premissas
| Premissa | Detalhe |
|---|---|
| **UT** | A mesma do `plano-v1-1.md` §1: um marco fechado por um agente numa janela de uso, com testes, commit e push (`[HIPÓTESE]`, ainda não calibrada). Frações de UT porque várias histórias cabem em uma janela |
| Três pontos | O = tudo corre bem; M = mais provável; P = imprevistos prováveis (dependência, regra que muda, revisão que devolve). PERT = (O + 4M + P) / 6 |
| Inclui | TDD (teste vermelho antes), testes unitários e e2e da API, migração, OpenAPI e `generate:check` se mudar, lint e typecheck, commit e PR |
| **Não inclui** | Web e app (mobile-dev), **inclusive o parser local do texto colado em `packages/shared`** (ADR-018 D3; se o backend-dev o escrever, +0,4 UT e o PO me passa 10 colagens reais de lojistas); revisão do tech-lead, do Security e do QA (slots deles, plano §2 P3); aceite do PO; teste de 60 s com gente real (fundador); retrabalho depois de parecer (buffer do PM) |
| Ambiente | Esta sessão não tem Docker: nada de e2e com Testcontainers nem de migração contra PostgreSQL rodou. Todas as estimativas supõem uma sessão com Docker `[HIPÓTESE]` |
| Ordem | migrações (0058 a 0063) → WB-355 e WB-352 (piso) → 350, 351, 353, 354 → 370, 371, 372, 375 → 376, 377, 379 → coleta (361, 363, 369) em paralelo possível a partir das migrações |

## 2. Por história (backend)
| História | O que o backend faz | O | M | P | PERT |
|---|---|---|---|---|---|
| M-R1 | Migrações 0058 a 0063 (SQL revisado, reversão, teste com dados) e parâmetros/flags novos | 0,50 | 0,80 | 1,20 | 0,82 |
| WB-350 | Ficha 360: `getAdminStoreOverview`, extensão da lista (filtros, indicadores 30 dias), origem da comissão | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-351 | Admin edita dados, horário, pausa: 4 rotas novas, catálogo de motivos, versão da loja, aviso imediato, flag J27, remover as 2 rotas antigas | 0,50 | 0,80 | 1,30 | 0,83 |
| WB-352 | Ver como: credencial opaca, guard global GET-only com `x-view-as`, auditoria de abertura/fim, máscara na resposta, expiração | 0,70 | 1,00 | 1,80 | 1,08 |
| WB-353 | Admin catálogo e preço: 10 rotas sobre os serviços do catálogo, regras de preço (motivos, 30%, 50%), massa 200/10 por hora, aviso agregado e resumo de 10 min, alerta de compra em 24 h | 1,00 | 1,60 | 2,50 | 1,65 |
| WB-354 | Histórico por loja, restaurar, CSV, papel de banco não dono do `audit_log` (infra, compose, guia) | 0,50 | 0,80 | 1,30 | 0,83 |
| WB-355 | Permissões: 4 chaves novas, `x-admin-permission` nas ~140 rotas antigas (script), teste de contrato 5 perfis x todas as rotas `/v1/admin/*` | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-370 | Foto primeiro: quick-start, `createProductDraft`, `DESCRIPTION_REQUIRED`, SEC-195 (original recodificado), upload pelo admin, categoria proibida | 0,50 | 0,70 | 1,10 | 0,73 |
| WB-371 | Rascunho: lista, teto de 100 (DEC-118, sob lock da loja), vencimento (sweep), `If-Match`/409, medição de retomada | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-372 | Duplicar produto (posse, sem foto/SKU/promoção, rascunho, histórico) | 0,20 | 0,30 | 0,50 | 0,32 |
| WB-374 | Grade: só ajustes de validação e testes (a tabela é do app); 409 por reserva já existe | 0,10 | 0,20 | 0,40 | 0,22 |
| WB-375 | Modelos por categoria: colunas, seed dos 8, rota pública, PUT do admin (Could), regra `descriptionRequired` | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-376 | Colar e planilha: lote de rascunhos, `.xlsx` + mapeamento + limites (lib a escolher), escape de CSV, C-CAD-04/05 | 0,60 | 1,00 | 1,80 | 1,07 |
| WB-377 | Edição em massa: tabela, prévia, confirmação, lote, desfazer 10 min, histórico | 0,50 | 0,80 | 1,30 | 0,83 |
| WB-379 | Medição do cadastro: tabela, gravação nos 3 pontos, `getProductCreationMetrics` | 0,30 | 0,40 | 0,70 | 0,43 |
| WB-360 | Flags `coleta_eventos` e `medicao_padrao_ligada` (a tela e o opt-out são do app) | 0,10 | 0,15 | 0,30 | 0,17 |
| WB-361 | Ingestão pública sem identidade, estrita, idempotente, limites por sessão e por IP (HMAC em Redis), `order_paid` na confirmação do pagamento, varredura de log | 0,70 | 1,00 | 1,70 | 1,07 |
| WB-363 | Job de agregação idempotente, supressão complementar, expurgo em lotes (sem partição, I8), `getAdminAnalyticsAccess` (a `...Coverage` saiu da R1, I7), alerta de falha | 0,70 | 1,10 | 1,90 | 1,17 |
| WB-369 | Nota no export de dados, teste de classificação de colunas, orientação de oposição | 0,10 | 0,20 | 0,30 | 0,20 |
| GEN | C-GEN-01/02: boot de produção com as flags da v1.1 em `false`, contrato de papel (motoboy fora; "ver como" e coleta dentro) | 0,20 | 0,30 | 0,50 | 0,32 |
| **Total backend R1** | | **8,40** | **13,15** | **21,80** | **13,80** |

Por grupo (M / PERT): base e migrações 1,1 / 1,1; admin de lojas (350 a 355) 5,2 / 5,4; cadastro (370 a 379) 4,4 / 4,6; coleta (360, 361, 363, 369) 2,5 / 2,6.

**Contra o plano (`plano-v1-1.md` §2):** a R1 do plano é 24 / 31 / 42 (PERT 31,7) para TODOS os papéis. O plano não separa o backend; somando a fatia de contrato e migrações (15%) à parte não alocada (15%), o backend ficaria perto de 30% de 31,7, ou 9 a 10 UT `[HIPÓTESE: leitura minha do §2 do plano]`. Minha estimativa é **13,8 UT de PERT**, cerca de 40% acima. Motivos: (a) o admin passou a escrever preço de terceiros, com motivo, versão, aviso e restaurar (o plano contava edição simples); (b) "ver como" mexe no pipeline de autenticação, que o desempenho (DEC-117) acabou de reescrever; (c) a coleta tem partição, job e supressão complementar. **Sugestão ao PM:** subir a linha backend da R1 em cerca de 4 UT, ou cortar (ver §4).

## 3. Fora da conta das histórias (R-40: cobrar do buffer, não da R1)
| Item | O / M / P | Nota |
|---|---|---|
| Contrato OpenAPI, ADR-018, modelo de dados, `contract-r1.spec.ts`, BUG-034 e BUG-035 (esta tarefa) | 1,0 gasto | Feito; BUG-035 já tem teste e correção no filtro; BUG-034 corrigido no guia (resta `pedidos-ao-mobile.md` M7, dono mobile-dev) |
| DT-085: refresh OAuth do Mercado Pago fora da transação | 0,4 / 0,6 / 1,0 | Só importa com 2 ou mais réplicas; fazer antes da 2ª réplica |
| DT-086 e SEC-200 (limites por IP atrás de CGNAT) | 0,6 / 1,0 / 1,6 | **Bloqueia qualquer deploy do desempenho** (DEC-115) até o G4 da v1.1 ou aceite do fundador. Não é da R1, mas vence antes do G4 |
| SEC-186, SEC-189, BUG-029, BUG-030 | `[A CONFIRMAR]` | O plano os põe na W0; não confirmei se já foram fechados |

## 4. Riscos (probabilidade x impacto; dono)
| # | Risco | P | I | Tratamento |
|---|---|---|---|---|
| E-1 | **FECHADO (DEC-118 item 1):** lote colado de até 100 linhas e teto de 100 rascunhos por loja. Resta o texto da tela "criar os N que cabem" (`slotsAvailable`) | Baixa | Baixa | PO confirma o texto na WB-376 |
| E-2 | **Leitura de `.xlsx` no servidor** exige biblioteca com limite de descompressão e sem CVE; a opção mais conhecida (SheetJS no npm) está parada e vulnerável | Média | Média | Escolher com o Security no PR; plano B: o navegador converte para CSV (sem dependência nova). Pior caso +0,5 UT |
| E-3 | **"Ver como" no pipeline de autenticação:** guard global novo na rota de toda requisição, logo depois da consulta única de sessão (DEC-117). Erro aqui é regressão de autenticação ou escrita indevida | Média | Alta | e2e de revogação, MFA e papel vazio iguais ao antes; teste de contrato percorre todas as rotas com a credencial; revisão diferencial do Security como na W0 |
| E-4 | **`version` mal propagada:** se reserva e venda de estoque subissem a versão do produto, todo lojista veria "alterado agora" a cada pedido | Média | Alta | `version` só sobe em edição de catálogo (lojista ou admin), nunca em reserva, venda ou devolução; teste e2e com venda concorrente a uma edição |
| E-5 | **Papéis de banco (D-06):** infra, não migração (B4). Escrito e revisável (`infra/postgres`, `app-grants.ts`, compose, env, guia, `db-roles.e2e-spec.ts`), mas NUNCA executado: só se prova num PostgreSQL de verdade | Média | Média | Primeira tarefa da sessão com Docker; ver "O que só se prova com Docker" no parecer do tech-lead |
| E-6 | **FECHADO (I8):** sem partição; tabela comum com expurgo diário em lotes. Funções `SECURITY DEFINER` para o job | Baixa | Baixa | Teste: linha de 91 dias some; gatilho para particionar: > 5 milhões de linhas |
| E-7 | **E-mail-resumo com 2 réplicas:** o sweep de 10 min duplicaria e-mail (DT-079, SEC-205) | Baixa hoje, Alta com 2 réplicas | Baixa | `FOR UPDATE SKIP LOCKED` nas linhas pendentes do resumo |
| E-8 | **Métrica de 60 s mal definida:** a mediana com rascunho esquecido por horas é lixo; o PO fixou a meta sem "cadastro contínuo" | Média | Média | Parâmetro `cadastro_sessao_max_min` (15 `[HIPÓTESE]`) e `interrupted` fora da mediana; o PO confirma (ADR-018, pergunta 4) |
| E-9 | **Ingestão pública sem identidade passa pelo log e pelo nginx** (C-ANA-01): um log de acesso com IP ou `session_id` liga navegação à pessoa | Média | Alta (LGPD) | Rota fora do middleware de log com `userId`; teste de varredura de log; nginx sem `$remote_addr` nessa `location` (infra); só em staging até o J24 |
| E-10 | **Contrato à frente do código:** 34 operações `x-planned` geram cliente Orval que 404 até a implementação; o mobile-dev pode codar contra rota inexistente | Média | Baixa | Marca `x-planned` visível; o web usa as rotas só depois do PR que remove a marca (teste de contrato obriga) |
| E-11 | **Sem Docker nesta sessão:** os e2e novos (e os 912 existentes) não foram rodados por mim; só `typecheck` e testes unitários | Certa | Média | A R1.2 abre com a base verde (e2e 3x) numa sessão com Docker |

## 5. Cortes que reduzem o backend da R1 (sugestões; quem decide é o PO e o CEO)
| Corte | Economia (M) | Custo do corte |
|---|---|---|
| WB-375 PUT do admin (Could) | ~0,2 | O seed dos 8 modelos basta; `descriptionRequired` só muda por migração |
| WB-363 `getAdminAnalyticsCoverage` e o relatório de acesso ficam para a R2 (a R1 só grava e agrega; o teste C3 usa o repositório) | ~0,5 | A regra de supressão (C-ANA-05) fica sem API para o QA na R1 |
| WB-354 CSV do histórico | ~0,2 | O WB-354 C3 sai da R1 (Should) |
| Plano B do xlsx (D4: converter no navegador) | ~0,3 | Menos código no servidor, mais no app |

Nada disto toca o piso (WB-352 e WB-355).

## 6. Premissas a validar (`[HIPÓTESE]`)
1. 1 UT = 1 janela de 5 h (plano §1). Calibrar com o realizado da R1.2.
2. O mobile-dev consome o contrato por Orval e só liga a rota depois de a marca `x-planned` sair.
3. A estimativa de armazenamento (ADR-018, D5 e D12) usa volume de piloto (5 a 30 lojas); não há dado real.
4. Os limites por hora (lote de rascunhos 10, histórico CSV 10, "ver como" 10) são chutes de partida; viram parâmetros.

## 7. Ajustes depois do parecer do tech-lead (2026-11-22; backend-dev, `[HIPÓTESE]`, o PM consolida)
Os acréscimos e cortes abaixo são os do parecer, aceitos como estão, mais o que as correções criaram. Não refiz a tabela do §2 (o PM a recalcula com as outras fatias).

| Item | Delta (M) | Origem |
|---|---|---|
| WB-352 sobe para M 1,5 (credencial, guard, auditoria, máscara em 13 rotas, e2e de revogação/MFA/papel vazio) | +0,5 | Parecer; depende do B3 |
| D-06 explícita (papéis, `app-grants.ts`, compose, env, guia, global-setup, `db-roles.e2e-spec.ts`): o escrito até agora não foi executado; falta rodar, corrigir e validar com o Security | +0,8 a +1,0, da qual ~0,4 já gasta nesta rodada | Parecer; sai da WB-354 |
| WB-353 sobe para M 2,0 | +0,4 | Parecer |
| I4: instrumentar as escritas do lojista no `audit_log` (`updateProduct`, `setProductVariants`, `adjustVariantStock`, `setProductImages`, `publishProduct`, `bulkProducts`) | +0,4 | PO confirma o escopo |
| I5: nginx e varredura de log da coleta | +0,15 | Parecer |
| B2: `Idempotency-Key` e versão por item nas ações em massa, 409 próprio, `alreadyUndone` | +0,2 | Esta rodada |
| I11: `quickPublishProduct` (uma transação) e medição com RTT de 400 ms | +0,3 | Esta rodada; mobile-dev integra |
| I3: lock da loja no teto de rascunhos + teste de concorrência | +0,1 | Parecer |
| I8: sem partição e sem `webag_worker` | -0,4 | Parecer |
| I7: `getAdminAnalyticsCoverage` fora da R1 até a decisão | -0,5 | Parecer; volta com a decisão |
| I12: remover as 2 rotas legadas já na R1.1 (continua 0,2, só antecipa) | 0 | CEO |
| Fora da conta | +0,4 (A6, parser local, mobile-dev) | Parecer |

## 8. UT gastas na R1.1 + R1.2 e no back-end da R1.3 (backend-dev, 2026-11-22, `[HIPÓTESE]`)
**Método (não há medição):** o PM declarou as UT realizadas como "não medidas" (`plano-v1-1.md` §11) e nenhuma ferramenta daqui mede uso de janela. Contei **marcos fechados** (entrega com testes, commit e retorno ao CEO), que é a definição de UT do §1, a partir do histórico do git de 2026-11-22 (commits de `apps/api` entre `12:27` e `16:21`) e das minhas rodadas. Erro esperado: **±1,5 UT**. Os commits são de uma só pessoa/agente por vez; o relógio do git NÃO serve como UT (vários marcos cabem em uma hora quando o agente tem o contrato pronto).

| Bloco | Marcos | UT | Evidência |
|---|---|---|---|
| Contrato, ADR-018, estimativas e 1ª correção do contrato (fora da conta do plano, R-40) | 2 | (1,0, não contada) | `83369df`, `e238a68`, `395f34c`, `e8b6624` |
| R1.1: remoção das 2 rotas, WB-355 (142 rotas), WB-352 "Ver como" (VA-01..26) | 3 | 3,0 | `c206744`, `a161333`, `dc6b3fa` |
| R1.1: WB-350 ficha 360, WB-351 edição pelo admin, D-06 boot e AO-01..05 | 2 | 2,0 | `7e4cfe6`, `553b533` |
| R1.1: correções do review (I1, I3 `down`, I4, I5, SEC-210, SEC-212) | 1 | 0,8 | `87e4a5d`, `a176b5d`, `3b610df`, `6aa708d` |
| R1.2: versão, I4, D18 `runInTransaction`, rascunhos, duplicar, lote, `quickPublish`, medição, SEC-195 | 2 | 2,0 | `9c2fd36` |
| R1.2: modelos, F8/F9, caminhos sem 2ª conexão (DT-094) | 1 | 0,7 | `c88bd08` |
| R1.2: lote do threat model §17 (SEC-213/214/215/218, `limitPct`, DT-094 lint) | 1 | 0,5 | `642c58d`, `5bd50a2` |
| Itens que entraram depois (GET da configuração do admin, SEC-221) | 1 | 0,3 | `c50ac7a`, `b39a878` |
| QA: BUG-036 a 040, 042, 044, 047 | 1 | 0,6 | `5f9bd7a` a `6ef6655`, `0261d30` |
| **Total R1.1 + R1.2 (back-end)** | | **~9,9** (faixa 8,4 a 11,4) | |

**Gatilho de 9,4 UT (plano §11): não dá para afirmar nem negar.** A faixa cobre os dois lados (a estimativa pontual, 9,9, passa por 0,5). Por precaução, a recomendação é tratar como **ultrapassado**. Como a ordem de corte do §10.3 já está resolvida assim: o item 1 (CSV e "restaurar" do WB-354) e o item 3 (`.xlsx` no servidor, WB-376) **não foram feitos** (não estavam na minha entrega); o item 2 (PUT de modelo) já estava feito na R1.2; o item 4 (massa do admin) foi construído nesta rodada (~0,6 UT) e o item 5 (R1.4) não foi tocado. Se o CEO quiser honrar o corte à risca, **a massa do admin é a única coisa já gasta que ele pode mandar não mergear** (reversível: uma rota e um serviço).

**R1.3 back-end (esta rodada):** DT-088 (API pública de `orders` e `catalog`) 0,2; contrato 0,2; lotes, `batchId`, `undoBulkBatch`, `listBulkBatches` e migração 0063 (consumidores do D18, BK-01, BK-08) 0,6; `adjustVariantStock` com `productVersion` 0,1; `bulkAdminStoreProducts` 0,6; documentos e regressão 0,2 = **~1,9 UT** (planejado para este recorte: 0,15 + 0,3 + 1,0 + 0,5 + 0,2 = ~2,2). Faltam da R1.3 (back-end): WB-353 (9 rotas de produto do admin, ~1,5), WB-354 (restaurar e CSV, 0,3), WB-376 (lote já existe; `.xlsx` e mapeamento, ~0,6 a 1,1), aviso C15 da WB-352 (`store_change_digest`, ~0,2) e A3/A9 do review R1.1 (~0,2).
