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
| WB-371 | Rascunho: lista, limite de 50, vencimento (sweep), `If-Match`/409, medição de retomada | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-372 | Duplicar produto (posse, sem foto/SKU/promoção, rascunho, histórico) | 0,20 | 0,30 | 0,50 | 0,32 |
| WB-374 | Grade: só ajustes de validação e testes (a tabela é do app); 409 por reserva já existe | 0,10 | 0,20 | 0,40 | 0,22 |
| WB-375 | Modelos por categoria: colunas, seed dos 8, rota pública, PUT do admin (Could), regra `descriptionRequired` | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-376 | Colar e planilha: lote de rascunhos, `.xlsx` + mapeamento + limites (lib a escolher), escape de CSV, C-CAD-04/05 | 0,60 | 1,00 | 1,80 | 1,07 |
| WB-377 | Edição em massa: tabela, prévia, confirmação, lote, desfazer 10 min, histórico | 0,50 | 0,80 | 1,30 | 0,83 |
| WB-379 | Medição do cadastro: tabela, gravação nos 3 pontos, `getProductCreationMetrics` | 0,30 | 0,40 | 0,70 | 0,43 |
| WB-360 | Flags `coleta_eventos` e `medicao_padrao_ligada` (a tela e o opt-out são do app) | 0,10 | 0,15 | 0,30 | 0,17 |
| WB-361 | Ingestão pública sem identidade, estrita, idempotente, limites por sessão e por IP (HMAC em Redis), `order_paid` na confirmação do pagamento, varredura de log | 0,70 | 1,00 | 1,70 | 1,07 |
| WB-363 | Job de agregação idempotente, supressão complementar, expurgo por partição, `getAdminAnalyticsAccess` e `...Coverage`, alerta de falha | 0,70 | 1,10 | 1,90 | 1,17 |
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
| E-1 | **Regra do PRD em conflito:** o lote colado vai até 100 linhas e a loja tem no máximo 50 rascunhos (RN-Q2). Hoje o contrato recusa o lote acima do limite | Alta | Média | PO decide antes da R1.3 (ADR-018, pergunta 1). Sem decisão, WB-376 C4 não fecha |
| E-2 | **Leitura de `.xlsx` no servidor** exige biblioteca com limite de descompressão e sem CVE; a opção mais conhecida (SheetJS no npm) está parada e vulnerável | Média | Média | Escolher com o Security no PR; plano B: o navegador converte para CSV (sem dependência nova). Pior caso +0,5 UT |
| E-3 | **"Ver como" no pipeline de autenticação:** guard global novo na rota de toda requisição, logo depois da consulta única de sessão (DEC-117). Erro aqui é regressão de autenticação ou escrita indevida | Média | Alta | e2e de revogação, MFA e papel vazio iguais ao antes; teste de contrato percorre todas as rotas com a credencial; revisão diferencial do Security como na W0 |
| E-4 | **`version` mal propagada:** se reserva e venda de estoque subissem a versão do produto, todo lojista veria "alterado agora" a cada pedido | Média | Alta | `version` só sobe em edição de catálogo (lojista ou admin), nunca em reserva, venda ou devolução; teste e2e com venda concorrente a uma edição |
| E-5 | **Papel de banco que não é dono do `audit_log` (D-06):** muda compose de produção, env e guia; só se prova num PostgreSQL de verdade | Média | Média | Fazer cedo na R1.2 (migração 0059), com teste que tenta `DISABLE TRIGGER`; não dá para provar sem Docker |
| E-6 | **Tabela particionada com o Drizzle:** o `drizzle-kit` não modela partição; a migração é SQL à mão e as consultas do job vão por `sql` tipado | Média | Baixa | Isolar no módulo `analytics`; teste com partição de 91 dias |
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
