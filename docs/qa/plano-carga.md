# Plano de teste de carga — Webag 1.0 (k6)

Dono: qa-engineer | Data: 2026-11-18 | Executa na Onda 7 (`plano-execucao.md`); gate: antes do G4 (ADR-006). Scripts em `tests/load/` (a criar). Relatório: `docs/qa/carga-<AAAA-MM-DD>.md`.
Marcação `[HIPÓTESE]` = número sem dado real de uso; revisar com a telemetria do piloto (HIP-043).

> **Atualização (Onda 7, 2026-11-19): existe um esboço k6 (S1) e uma carga curta INDICATIVA em sandbox, ver `docs/qa/carga/README.md`. A carga de verdade segue pendente (staging + k6 + S2 a S12).**
> **Estado em 2026-11-19 (conferido na Onda 7): o teste de carga NÃO foi executado.** Não existe `tests/load/` (nenhum script k6, nenhum `seed-large`). O contrato já tem todas as rotas dos cenários (use `docs/arquitetura/api/openapi.yaml`, não a frase "hoje só há `/health`" abaixo). Para rodar este plano falta: (1) escrever os scripts e o `seed-large` (hoje o seed de demonstração tem 12 lojas e 60 pedidos, pequeno demais para medir índice e N+1); (2) um ambiente com a CPU e a RAM do servidor-alvo (`staging`, `APP_ENV=staging`, mesma imagem de produção); (3) autorização de gasto se o servidor de ensaio for novo. Os itens da dívida técnica que esperam este teste (DT-017 sessão sem cache, DT-055 índices de `payment_attempts` e `orders`, DT-056 relatórios agregados em JavaScript, DT-036 paginação da busca) **continuam sem medição**. Para o piloto (≈ 33 pedidos por dia, HIP-043) o risco é baixo; o que importa medir antes do G4 é a rajada de webhooks (S5) e a disputa da última unidade (S4-B).

## 1. Objetivo e honestidade sobre a escala
| Ponto | Posição do QA |
|---|---|
| O piloto é pequeno: HIP-043 fala em 20 lojas e 1.000 pedidos/mês (≈ 33/dia) | Carga "do piloto" é trivial para um VPS. Este teste **não** prova escala; serve para (1) achar o ponto de quebra e o primeiro gargalo, (2) pegar consulta sem índice e N+1 antes que apareça com dado, (3) provar que **dinheiro e estoque continuam corretos sob concorrência**, (4) dar uma régua de regressão |
| A carga mais perigosa não é volume, é **rajada** | Reenvio em massa de webhooks pelo Mercado Pago, 50 clientes disputando a última unidade, abertura simultânea do painel quando chega a hora de abrir as lojas, campanha de push |
| Resultado válido só em ambiente igual ao de produção | Staging com a mesma CPU/RAM do VPS-alvo; teste em notebook de dev não vale como aprovação |

## 2. Modelo de carga nominal `[HIPÓTESE]`
Derivado do piloto com folga de 30x, para o teste ter margem: 50 lojas ativas, 5.000 clientes cadastrados, 10.000 produtos, 100.000 pedidos históricos.
| Perfil | Nominal (pico) | Como obtive |
|---|---|---|
| Navegação (home, loja, produto, busca) | 200 usuários simultâneos, pausa de 5 a 15 s entre ações (≈ 20 req/s) | 4% da base ativa ao mesmo tempo no horário de pico |
| Pedidos | 30 pedidos/min (0,5/s) | 15% dos pedidos do dia na hora mais cheia, com folga |
| Login/renovação | 5 logins/s e 20 renovações/s | Abertura do app em horário de pico |
| Webhooks de pagamento | 1 por pedido pago + reenvios: 2/s nominal, rajada de 50/s por 60 s | Reenvio do MP após indisponibilidade |
| Conexões em tempo real | 500 (clientes acompanhando + painéis de lojas abertos) | 1 painel por loja + 1 cliente por pedido em andamento |
Meta de folga: o sistema sustenta **2x nominal** sem violar limites e só quebra acima de **5x** `[HIPÓTESE]`.

## 3. Ambiente e dados
| Item | Regra |
|---|---|
| Alvo | Staging com o mesmo compose/VPS da produção (CPU, RAM, disco, versões); nunca produção; `PAYMENT_PROVIDER=fake`; Sentry desligado; e-mail em Mailpit/descartado |
| Gerador de carga | Máquina separada do alvo (o k6 consome CPU); mesma rede de baixa latência; se for local, registrar a limitação |
| Rate limit | **Ligado** nos cenários de segurança (S3-B). Nos demais, o gerador usa `X-Forwarded-For` distinto por VU (confiar no proxy de staging) ou uma lista de CIDR de teste na configuração; esse contorno **não pode existir em produção** (validar no boot como SEC-036). Pedir ao backend-dev |
| Dados | Script `tests/load/seed-large`: 4 cidades, 50 lojas, 10.000 produtos com variações, 5.000 clientes com endereços em coordenadas reais da região, 100.000 pedidos em todos os estados RN-07, 1.000.000 de linhas de auditoria e de ledger (para pegar índice ausente em filtros, paginação e relatórios) |
| Autenticação | `setup()` gera 5.000 tokens antes do teste (o login de 5.000 usuários não pode ser parte do tráfego de navegação); cenário próprio mede login |
| Medição no servidor | CPU, RAM e rede (node_exporter ou `docker stats`); `pg_stat_statements` (top 10 consultas por tempo total), conexões ativas e espera no pool; Redis (comandos/s, memória); fila BullMQ (profundidade, latência até o início do job); logs de erro |
| Isolamento | Teste com banco restaurado do mesmo dump; após cada rodada, restaurar |

## 4. Endpoints e cenários
As rotas abaixo são as operações previstas pelas ADRs; **confirmar nome e parâmetros no `openapi.yaml`** quando existirem (hoje só há `/health`). Cada cenário tem scripts `tests/load/<cenário>.js` e limites (`thresholds`) no próprio script, para falhar o comando quando violar.

| Cenário | Operações (rota a confirmar) | Perfil | Origem do requisito |
|---|---|---|---|
| S1 Navegação | home do endereço (seções RN-03), página da loja, página do produto, categorias, banners | rampa 0 a 200 VUs em 5 min, platô 10 min, 3 min de descida | WB-011, 012, 016, 017 |
| S2 Busca e proximidade | busca de produtos e lojas por termo + endereço, com filtros (distância, entrega grátis, nota) e ordenação; "lojas perto de mim" (PostGIS) | 50 VUs, termos com e sem acento, erro de digitação, 1.000 coordenadas diferentes | WB-013, 014, ADR-008 |
| S3-A Autenticação | login, renovação (refresh), logout | 5 logins/s e 20 renovações/s por 10 min; 20% das renovações **duplicadas** em paralelo (janela de 30 s) | WB-008, 220, SEC-011 |
| S3-B Abuso de login | tentativas erradas contra 100 contas, rajada de reenvio de código, consulta de e-mail | 200 req/s, com rate limit ligado | SEC-003, 004, 005; valida que o limite protege e não derruba o servidor |
| S4 Checkout e pedido | cotação, criar pedido (com `Idempotency-Key`), criar PIX, aprovar no `fake` (endpoint de dev), consultar pedido, aceitar na loja | rampa até 30 pedidos/min; 10% das criações **repetidas** com a mesma chave | WB-023, 024, 067, 068, SEC-031 |
| S4-B Disputa de estoque | 100 VUs criando pedido do mesmo produto com estoque 10 | rajada simultânea | RN-06, WB-061 |
| S5 Rajada de webhooks | `POST` assinado (HMAC com `k6/crypto`) de pagamento aprovado, estornado e duplicado | 2/s por 5 min, depois 50/s por 60 s; 20% duplicados, 5% com assinatura inválida, 5% fora de ordem | WB-153, SEC-032, 033, 034 |
| S6 Tempo real | conectar Socket.IO autenticado como painel de loja e como cliente; mudar status do pedido pela API; medir o evento recebido | 500 conexões por 15 min com 1 mudança de status/min cada | ADR-004, WB-027, 067, SEC-024 |
| S7 Painel do lojista | listar pedidos do dia, histórico paginado, lista de produtos (100 itens), ajuste de estoque | 50 VUs de lojistas | WB-067, 072, 064 |
| S8 Admin e relatórios | fila de aprovação, lista de pedidos com filtros, relatórios operacionais e financeiros (WB-122, 114), consulta de auditoria | 10 VUs, consultas sobre 100 mil pedidos e 1 milhão de linhas | WB-108, 113, 122, 123 |
| S9 Imagens | pedir URL de upload, enviar imagem de 300 KB, `complete`, ler variante | 10 uploads/s por 3 min; **a latência da API de navegação (S1) rodando junto não pode degradar** (worker separado, ADR-007) | ADR-005, SEC-050 |
| S10 Pico (spike) | S1 + S2 | de 20 para 400 VUs em 30 s, 3 min de platô, volta | push de campanha (WB-197) |
| S11 Estresse | S1 + S2 + S4 | rampa em degraus de +100 VUs a cada 3 min até quebrar (erro > 5% ou p95 > 5 s) | acha o primeiro gargalo e o ponto de quebra |
| S12 Resistência (soak) | mistura nominal S1+S2+S3-A+S4+S6 | 2 h em carga nominal | vazamento de memória, de conexão, de arquivo, crescimento de fila e de Redis |

## 5. Metas (limites no script)
`[HIPÓTESE]` salvo onde há origem no PRD. Medidas no k6 (tempo de resposta do servidor visto do gerador) em carga nominal.

| Operação | p95 | p99 | Erros | Origem |
|---|---|---|---|---|
| Home, loja, produto (leitura) | ≤ 500 ms | ≤ 1,2 s | < 0,5% | HIP |
| Busca e "perto de mim" | ≤ 1 s | ≤ 2 s | < 0,5% | **WB-013 C2** (p95 ≤ 1 s) |
| Login | ≤ 1,5 s | ≤ 3 s | < 0,5% (429 esperado fora da conta) | Argon2id é caro por desenho (SEC-001) |
| Renovação de sessão | ≤ 300 ms | ≤ 800 ms | < 0,1% | WB-220 |
| Cotação do checkout | ≤ 700 ms | ≤ 1,5 s | < 0,5% | HIP |
| Criar pedido + PIX | ≤ 1,5 s | ≤ 3 s | < 0,5% | HIP |
| Webhook: resposta 2xx | ≤ 500 ms | ≤ 2 s | 0% de perda | **SEC-032, pagamentos NFR** (2xx em ≤ 2 s) |
| PIX aprovado até pedido RECEBIDO | ≤ 5 s | ≤ 10 s | 0% | **PRD pagamentos** (≤ 5 s p95) |
| Evento de mudança de status (API até o socket) | ≤ 3 s | ≤ 5 s | 0% de perda | **PRD lojista** (painel ≤ 3 s) |
| Painel do lojista (listas) | ≤ 800 ms | ≤ 2 s | < 0,5% | HIP |
| Relatórios do admin | ≤ 3 s (ou assíncrono) | ≤ 8 s | < 1% | WB-122 (> 10 mil linhas assíncrono) |
| Fila (job até início) | ≤ 5 s | ≤ 15 s | — | ADR-007 |
| Notificação de status ao cliente (evento até push) | ≤ 10 s | — | — | **PRD notificações** (p95 ≤ 10 s; provedor excluído) |

**Recursos no servidor em nominal:** CPU média < 60% e pico < 85%; memória estável (crescimento < 10% entre 30 min e 2 h no soak); conexões do pool < 80% do máximo; nenhuma consulta > 1 s no `pg_stat_statements` nos endpoints de leitura.

## 6. Verificações de correção durante e depois da carga (as que valem mais)
A carga é reprovada se qualquer consulta abaixo retornar linha, mesmo com latência perfeita.
| # | Invariante (SQL ou script pós-teste) | Cenário | Origem |
|---|---|---|---|
| I1 | Estoque `disponível < 0` em qualquer variação | S4-B, S4 | RN-06 |
| I2 | Pedidos criados com o mesmo produto > estoque inicial (venda duplicada: com estoque 10 e 100 disputantes, exatamente 10 pedidos) | S4-B | RN-06, HIP-007 |
| I3 | Duas cobranças ou dois pedidos para a mesma `Idempotency-Key` | S4 | SEC-031 |
| I4 | Mais de um efeito (aprovação ou estorno) por `x-request-id` ou por `(provider, provider_payment_id)` | S5 | SEC-033 |
| I5 | Pedido RECEBIDO sem pagamento APROVADO; pagamento APROVADO sem pedido RECEBIDO após a fila esvaziar | S4, S5 | SEC-034 |
| I6 | Soma de estornos > valor pago; ledger com soma diferente de zero | S5 | SEC-039, 041 |
| I7 | Webhook de assinatura inválida que gerou job ou efeito | S5 | SEC-032 |
| I8 | Notificação de webhook perdida (recebida com 2xx e sem registro de processamento) | S5, S11 | WB-153 |
| I9 | Sessão revogada ainda aceita; refresh dentro da janela devolvendo pares diferentes | S3-A | SEC-011 |
| I10 | Eventos de socket entregues a quem não é dono do pedido/loja | S6 | SEC-024 |
| I11 | Erros 5xx fora do ponto de quebra declarado (S11) | todos | — |
| I12 | Fila com mais de 100 jobs em espera 5 min após o fim da carga (não drena) | S5, S9 | ADR-007 |

## 7. Execução e relatório
| Etapa | Detalhe |
|---|---|
| 1. Preparação | Restaurar dump; `seed-large`; checar saúde (`/health/ready`); registrar versões (commit, imagem, k6) |
| 2. Fumaça | 1 VU por 30 s em cada cenário, para validar scripts e limites |
| 3. Rodadas | S1, S2, S3-A, S4, S4-B, S5, S6, S7, S8, S9 individuais; depois mistura nominal; depois S10, S11 e S12. Um cenário por vez no primeiro ciclo, para atribuir gargalo |
| 4. Invariantes | Rodar I1 a I12 depois de cada rodada; qualquer violação interrompe e abre BUG Crítico |
| 5. Diagnóstico | Para cada meta estourada: `EXPLAIN (ANALYZE, BUFFERS)` das 5 consultas mais lentas, perfil de CPU, fila e pool; correção pelo backend-dev; nova rodada do mesmo cenário |
| 6. Relatório | `docs/qa/carga-<data>.md`: ambiente, versão, tabela meta x medido por operação (p50/p95/p99, erros, req/s), gráfico ou tabela por degrau do estresse, ponto de quebra e primeiro gargalo, resultado dos invariantes, consultas lentas e índices criados, riscos e decisão (APROVADO, COM RESSALVAS, REPROVADO) |
| 7. Reteste | Depois de cada correção de desempenho: repetir o cenário e a regressão funcional dos módulos tocados |

Regra de veto (G4): carga não executada, ou qualquer invariante da §6 violada, ou meta de p95 do PRD (busca ≤ 1 s, 2xx do webhook ≤ 2 s, PIX → RECEBIDO ≤ 5 s, painel ≤ 3 s) não cumprida em carga nominal. Meta marcada `[HIPÓTESE]` não cumprida gera Média/Alta conforme o impacto, com decisão do PM/CEO; não reprova sozinha.

## 8. Antecipar para não descobrir tarde
| Quando | O quê | Por quê |
|---|---|---|
| Fim da Onda 3 | Fumaça k6 de S1 e S2 com `seed-large` | Achar índice PostGIS e N+1 da home/busca antes de a tela depender |
| Fim da Onda 4A | S5 e S4-B com o `fake` | Idempotência e estoque sob concorrência são o maior risco de dinheiro; teste cedo |
| Cada PR em `main` (opcional, recomendação) | k6 de 1 VU por 30 s em 3 endpoints com limites largos | Pega regressão grosseira de latência a custo quase zero [HIPÓTESE sobre o custo de CI] |
| Onda 7 | Todos os cenários e o relatório | Gate do G4 |

## 9. Pendências e riscos do teste
| Item | Dono | Observação |
|---|---|---|
| Contorno do rate limit só para staging | backend-dev | Sem ele, o gerador é bloqueado (SEC-066: 120 req/min por IP) |
| Staging com as mesmas CPU/RAM da produção | backend-dev/fundador | VPS ainda não definido (guia de deploy, Onda 8); sem ele, o resultado é indicativo |
| Provedor real do MP e do e-mail | — | Fora do teste; o `fake` mede o nosso código, não a latência do MP |
| Latência de rede móvel | QA | O k6 mede o servidor; o 3G é simulado em E2E (`estrategia.md` §6), não aqui |
| Socket.IO no k6 | QA | Usar cliente WebSocket do k6 com o protocolo do Socket.IO (ou script Node auxiliar) se o módulo experimental não cobrir; decidir ao escrever S6 |
| Número de usuários simultâneos, pico e base são `[HIPÓTESE]` | PO/PM | Revisar com os dados reais do piloto antes de qualquer decisão de infraestrutura |
