# Relatório de QA: Ondas 3, 4 e 5 (descoberta; compra e pagamento; logística, trocas e painéis)

Data: 2026-11-19 | Autor: qa-engineer | Planos: `docs/qa/planos/onda-3.md`, `onda-4.md`, `onda-5.md` | Bugs: `docs/qa/bugs/BUG-011..019.md` | Base: commits `ae8060f` a `c63edaf` da branch `claude/admiring-lamport-62tq1a`
Não é parecer de G4 nem de G5. É parecer de qualidade por onda, contra a API real (Postgres e Redis reais, app Nest completo, provedor de pagamento `fake` pelo mesmo caminho do webhook) e contra o painel web real.

## 1. Pareceres

| Onda | Parecer | Resumo |
|---|---|---|
| 3 Descoberta | **APROVADO COM RESSALVAS** | Todos os P0 de API passaram. Ressalvas: BUG-018 (Média, "Mais vendidos" nunca aparece); localização por GPS, acessibilidade, desempenho e experiência offline não foram executados (aparelho). |
| 4 Compra e pagamento | **APROVADO COM RESSALVAS** (API e ledger); **REPROVADO para G4 enquanto o BUG-011 (Alta) estiver aberto** | Dinheiro sólido: 20.000 cenários de comissão contra oráculo independente, 12 pedidos reais aleatórios, ledger do banco inteiro soma zero, 8 corridas de concorrência sem inconsistência. Reprovação de G4 pelo BUG-011 (o admin não cancela pedido e o estorno total manual deixa o pedido ativo) e por BUG-014/015 (retirada 48 h e "não recebi" não existem). Sandbox do Mercado Pago e aparelho: bloqueados. |
| 5 Logística, trocas e painéis | **APROVADO COM RESSALVAS** (trocas e logística no que existe); **REPROVADO para G4 enquanto BUG-011 e BUG-016 (horário e pausa da logística) estiverem abertos** | Jornada completa PIX, aceite, pronto, motoboy, entrega com código, troca de tamanho, coleta, reentrega passou pela API e pelas telas reais. Taxa só após a aprovação, 1 troca por pedido, prazos legais fixos nos limites, aprovação automática em 24 h e WhatsApp sem dado proibido: todos passaram. |

Bugs abertos desta rodada: **1 Alta** (BUG-011), **6 Médias** (BUG-012, 014, 015, 016, 017, 018), **2 Baixas** (BUG-013 = SEC-148, BUG-019 testes frágeis). Nenhum Crítico. BUG-009 e BUG-010 (onda 2) não foram retestados. Alta bloqueia G4 (regra do CLAUDE.md); a decisão de aceitar é do fundador, registrada em `decisoes.md`.

Ressalvas e dono sugerido:

| # | Ressalva | Dono |
|---|---|---|
| R1 | BUG-011: rota de cancelamento do admin e "estorno que zera o pedido o encerra". Antes do G4 | backend-dev, PO |
| R2 | BUG-016: horário da logística e pausa (DEC-039c aprovou). Antes do piloto | backend-dev, PM |
| R3 | BUG-014 e BUG-015: retirada 48 h, "não recebi", "pedir cancelamento", WB-070 (item indisponível, Should, também ausente) | backend-dev, PO |
| R4 | BUG-017: 7 parâmetros do admin sem efeito (prazo de retirada, lembrete de aceite, alerta de cancelamento da loja etc.) | backend-dev |
| R5 | Mercado Pago real: `application_fee`, devolução proporcional, `x-signature`, 3DS, PIX com CPF. Nada disso foi exercitado fora do `fake` | fundador (credencial) |
| R6 | Aparelho (Android de entrada e iPhone): GPS, checkout, PIX, cartão e 3DS, troca em 4 toques, push, WhatsApp. Roteiro no §9 | fundador |
| R7 | Acessibilidade, desempenho em 3G, carga (k6) e exploratórios E5-1 a E5-4 não executados | QA, próxima rodada |
| R8 | Ambiente: Postgres 16 e Redis locais (o compose usa Postgres 18 + PostGIS); armazenamento e e-mail em memória | CI |
| R9 | Working tree compartilhado com o backend-dev (mudanças da Onda 6 em andamento durante as execuções); as contagens refletem o estado do momento | CEO |

## 2. Execução (evidência)

Ambiente: Node 22.23, Postgres 16 e Redis locais iniciados por mim; bancos `webag_qa35_test` (Redis 9), `webag_qa35b_test` (Redis 10) para a suíte e `webag_qa35e` (Redis 11) para a API real do Playwright; nada compartilhado com o backend-dev. Acesso a `.env` não foi necessário (padrões do `env.ts` e variáveis na linha de comando).

| Suíte | Resultado |
|---|---|
| API unit (`vitest run`) | 30 arquivos, 257 testes, todos OK |
| API `tsc --noEmit` e `eslint .` | OK (inclui os testes novos) |
| API e2e, linha de base (51 arquivos, antes dos meus) | 495 passaram, 1 falhou (`seed-onda3` banners: 2 em vez de 3; passa sozinho e em par com `banners`; BUG-019b), 1 ignorado, 204 s |
| API e2e completa com os meus 5 arquivos (execução final, 03:31 UTC, 62 arquivos) | 563 passaram, 8 "falham como esperado" (`it.fails` dos bugs abertos), 1 ignorado, **3 falhas fora das ondas 3 a 5**: `seed-orders` (BUG-019c, passa sozinho) e 2 em `marketing-push` (Onda 6 do backend em andamento: o working tree tem mudanças não commitadas dele e o teste commitado já não bate), 237 s. `logistics-report` passou depois das 03:30 UTC (confirma BUG-019a) |
| Web: vitest | 51 arquivos, 430 testes, OK |
| Web: Playwright com API falsa (`apps/web/e2e`, PW_CHANNEL=chrome) | 19 de 19 OK (49 s) |
| **Web: Playwright contra a API REAL (spec novo `e2e-real/04-pedido-entrega-troca`)** | **3 de 3 OK (45 s)**: lojista aceita e marca pronto na tela, operação atribui o motoboy na tela Logística e fecha a entrega com o código do cliente, loja aprova a troca |
| Maestro (`apps/mobile/e2e`: 6 fluxos) | não executável aqui (precisa de aparelho/emulador) |

### 2.1 Testes novos (todos em `apps/api/test`, mais 1 em `apps/web/e2e-real`)

| Arquivo | O que prova |
|---|---|
| `qa-onda3-5-ledger.e2e-spec.ts` (9 testes) | **Parte A**, função pura, 20.000 cenários com semente fixa contra um oráculo BigInt que não reaproveita o código: comissão = Σ half-up por item, `application_fee` >= 0, total = líquido do lojista + `application_fee`, desconto da plataforma limitado à parte da Webag, rateio do cupom da loja por maior resto, vendas e estornos que fecham, estornos em qualquer partição (6.000 cenários) são independentes do caminho e o total zera tudo (menos a tarifa), exemplo oficial da RN-10 (98,00 / 13,50 / 21,50 / 76,50 / 75,53). **Parte B**, 12 pedidos reais pela API com preços, categorias, comissões e cupons aleatórios e estornos parciais pelo admin: o que o provedor cobra e o ledger lança bate com o oráculo; **a soma de todo o ledger do banco é zero**, sem lançamento órfão nem valor <= 0 |
| `qa-onda3-5-jornada.e2e-spec.ts` (10 passos) | Jornada ponta a ponta: PIX, aprovação (webhook em dobro sem efeito), loja aceita e marca pronto (não marca "saiu"), motoboy atribuído, WhatsApp sem R$/e-mail/CPF/itens/código, código errado 422, entrega, custo lançado pela operação e quitado pelo financeiro (SEC-145), troca de tamanho (nada cobrado ao pedir, 2ª troca recusada), loja aprova (taxa R$ 2,50 = 50% da entrega, reserva do M), PIX da taxa na conta da Webag, coleta, a LOJA confere, só então a reentrega, conclusão; ledger fecha |
| `qa-onda3-5-concorrencia.e2e-spec.ts` (8 testes, 4 execuções seguidas sem falha) | 8 criações com a mesma chave = 1 pedido; 6 webhooks simultâneos = 1 venda e 1 baixa; cancelar x PIX caindo (6 rodadas) e aceitar x cancelar (6 rodadas): nunca pago sem estorno, nem estoque preso; cupom de 3 usos x 6 clientes = 3; última unidade do tamanho novo x 2 trocas = 1 vence (`EXCHANGE_NO_STOCK`); IDOR nas trocas, no pagamento da taxa e nas rotas de estorno e logística |
| `qa-onda3-5-regras.e2e-spec.ts` (5 testes) | Pedido > R$ 2.000 (`ABOVE_MAX_ORDER`); taxa de troca > R$ 30 recusada e R$ 30 exatos aceita; taxa zerada pela região; prazos legais nos limites (6 d 23 h ok, 7 d 1 h vencido, 89 d e 91 d no durável) contados da entrega; 4 aprovações simultâneas reservam uma vez |
| `qa-onda3-5-lacunas.e2e-spec.ts` (8 testes `it.fails`) | Um teste por lacuna confirmada (BUG-011, 011b, 012, 013, 014, 015, 016, 018): descreve o comportamento ESPECIFICADO; a suíte fica verde e o teste "falha por passar" quando o dev corrigir (trocar `it.fails` por `it`). Cada um foi rodado sem `.fails` para confirmar que falha no ponto certo |
| `apps/web/e2e-real/04-pedido-entrega-troca.e2e.ts` | A jornada pelas telas contra a API real (lojista, Logística do admin, trocas) |

## 3. Onda 3: resultado por caso (`planos/onda-3.md`)

Legenda: OK = passou com evidência; FALHOU = bug aberto; PARC = parte coberta (o que falta entre parênteses); BLQ = bloqueado (aparelho, infraestrutura ou credencial); SEM = sem teste automatizado identificado (não afirmo que passa).
Arquivos: DIS discovery, BRW browse, SRC search, FAV favorites, ADR addresses, BAN banners, CRT cart, ORD orders, ORL order-limits (todos `apps/api/test/*.e2e-spec.ts`).

| IDs | Resultado | Evidência |
|---|---|---|
| O3-LOC-01, 02, 06, 07, 09, 10 | OK | DIS (raio global, visibilidade, região vazia), ADR (região inativa 422, limite de 8, IDOR), BRW (públicas sem login) |
| O3-LOC-04, 05, 08, 11 | OK na API; BLQ no app | ADR (CEP resolve coordenada, 422 sem coordenada, apagar o padrão promove outro), CRT (juntar sacola do visitante); autocompletar na tela, pino no mapa e fluxo do único endereço: aparelho |
| O3-LOC-03 | BLQ | GPS negado: aparelho |
| O3-HOM-01, 02, 03, 04, 06, 07, 08, 09 | OK | DIS (ordenação, raio, fronteira `[de, ate)`, ofertas, seção vazia, categorias, cache), BAN |
| O3-HOM-05 | **FALHOU em parte** | "Lojas novas" OK (DIS); "Mais vendidos" nunca aparece: **BUG-018** |
| O3-HOM-10 | BLQ | desempenho: carga é da onda 7 (`plano-carga.md`) |
| O3-BUS-01 a 07 | OK | SRC (acento, 1 erro de digitação, 1 letra 400, filtros em E, aceita troca, loja fechada com selo), DIS (estoque some da busca) |
| O3-BUS-08 | OK | SRC (`%`, `_`, `'; drop table`); 10.000 caracteres: PARC (limite de tamanho coberto na validação, sem teste de 10 mil) |
| O3-BUS-09 | OK na API; BLQ no app | FAV (histórico: 10 termos, limpar) |
| O3-LOJ-01 a 09, O3-FAV-01, 02 | OK | BRW (nota só com 3+, vitrine, fechada, fora do raio, 404 invisível, variações, produto pausado, avaliações e nome reduzido), CRT (preço que muda), FAV (idempotência, indisponível, IDOR) |
| O3-SAC-01 a 08 | OK | CRT (resumo em centavos, estoque, revalidação, loja única, pedido mínimo e frete grátis, validade, 20 requisições simultâneas, IDOR); QA reexecutou a sacola nos testes de pedido |
| O3-CUP-01 a 06 | OK | CRT (aplica, troca, remove, motivos, R$ 1,00, teto da comissão, autoconsumo, limite de tentativas), ORD, QL (propriedade do teto) |
| O3-CUP-07 | SEM | cupom da plataforma com e-mail não confirmado (WB-224 C2): não achei teste direto |
| O3-UX-05 | OK | `grep` nas strings do app: nenhuma mensagem regional (DEC-040) |
| O3-UX-01, 02, 03, 04 | BLQ | offline, acessibilidade 360x640 com fonte 200%, botões sempre ativos no app, 2 GB de RAM: aparelho (R6) |

## 4. Onda 4: resultado por caso (`planos/onda-4.md`)

Arquivos novos: QL ledger, QJ jornada, QC concorrência, QR regras, QX lacunas. Existentes: PAY payments, PHD payments-hardening, ARF admin-refund, S141 sec141-142-refund, RQ refund-queue, INV inventory, SOR store-orders, SFN store-finance, FIN finance, PROD production-boot.

| IDs | Resultado | Evidência |
|---|---|---|
| O4-PED-01, 02, 04, 05, 07, 08, 09, 10 | OK | ORD (cria, reserva, mesma chave = mesmo pedido, `expectedTotalCents` obrigatório e 409, preço vem do servidor), CRT (loja fechada), ORL (loja nova, 3 pendentes = 429, 5 PIX/h, e-mail não confirmado) |
| O4-PED-03 | OK | QC (8 criações simultâneas com a mesma chave: 1 pedido, 1 reserva, nenhum 5xx) |
| O4-PED-06 | OK | QR (`ABOVE_MAX_ORDER`, sacola mantida) |
| O4-PED-11 | **FALHOU (Baixa)** | duas criações simultâneas com chaves diferentes geram 2 pedidos: **BUG-013 = SEC-148** (em sequência a 2ª é recusada) |
| O4-PED-12 | BLQ | checkout no app: aparelho |
| O4-PAG-01, 02, 03, 04, 05, 06 | OK | ORD, PAY (SEC-032/033/040/136), RQ (ID desconhecido adia), QC (6 webhooks simultâneos), QJ (J2) |
| O4-PAG-07, 08, 09, 10, 11, 12, 13, 14 | OK | ORL (SEC-133/134), ORD (recusa, 3DS, timeout, PIX vencido), PAY (SEC-044, SEC-035, conciliação, divergência), PHD |
| O4-PAG-15 | OK | QC: cancelar x PIX caindo, 6 rodadas: sempre ou `received` sem estorno ou cancelado com o dinheiro devolvido por inteiro (PIX tardio) e reserva zerada |
| O4-PAG-16 | PARC | PROD (boot recusa configuração insegura); mensagem com nomes sem valores: não verificada por mim |
| O4-PAG-17, 18 | BLQ | Mercado Pago sandbox (credencial do fundador) e app (aparelho) |
| O4-FIN-01 a 08 | **OK** | QL: exemplo da RN-10, 20.000 cenários, cupom limitado à parte da Webag, cupom da loja reduz a base, 12 pedidos reais contra o oráculo, soma do ledger do banco = 0; FIN (precedência, snapshot, SEC-041) |
| O4-FIN-09, 10, 11 | OK | CRT/DFE (frete grátis), ORD (tarifa lançada), SFN (extrato bate com o ledger) |
| O4-FIN-12 | BLQ | `application_fee` e estorno parcial no MP: sandbox |
| O4-EST-01 a 06 | OK | INV (30 pedidos x estoque 7 = 7), ORD (6 x 3 últimas), ORL (SEC-131), INV (nada pela metade, devolução) |
| O4-CUP-01 a 04 | OK | ORD, QC (3 usos x 6 clientes = 3; quem perde não é cobrado), CRT (SEC-061) |
| O4-STA-01 | OK | `state.spec` e ORD/SOR |
| O4-CAN-01, 02, 03, 05, 06, 07, 08, 13, 14 | OK | ORD (cancelar, 409 depois da separação), SOR (recusar, aceite x recusa, SEC-138), QC (aceitar x cancelar, 6 rodadas) |
| O4-CAN-04, 11 | **FALHOU** | pedir cancelamento em separação e "não recebi": ação anunciada sem operação, **BUG-015** |
| O4-CAN-09 | **FALHOU (Alta)** | **BUG-011**: sem rota de cancelamento do admin; estorno total deixa o pedido `received` e a loja aceita |
| O4-CAN-10 | BLQ | WB-070 (Should): sem rota, não implementado |
| O4-CAN-12 | **FALHOU** | retirada 48 h: **BUG-014** |
| O4-EXT-01 a 09 | OK | ARF, PAY, QL (partições, centavo para a loja, lojista >= 0), RQ (SEC-130: 5 min a 24 h), S141 (SEC-141/142), ORD (estorno que falha é concluído pela conciliação) |
| O4-EXT-10 | BLQ | textos do app: aparelho |

## 5. Onda 5: resultado por caso (`planos/onda-5.md`)

Arquivos: OLG order-logistics, LOG logistics, LRP logistics-report, S143 sec143-145-logistics, DFE delivery-fees, EXC exchanges, EXR exchange-rules, DT49 dt049-ledger-exchange, DT50 dt050-exchange-sla-mediation, RT realtime, W-F Playwright com API falsa, W-R Playwright real.

| IDs | Resultado | Evidência |
|---|---|---|
| O5-PRO-01 a 05 | OK | OLG, QJ (J3), SOR (permissão "pedidos"), LOG |
| O5-FIL-01, 02, 03 | OK | LOG (fila, SLA, perfis), RT (`delivery_ready` só na sala `admin:ops`) |
| O5-FIL-04 | **FALHOU** | horário e pausa não existem: **BUG-016** |
| O5-MOT-01, 02 | OK | LOG |
| O5-ATR-01, 02, 03, 04, 06 | OK | LOG (primeiro operador vence, 2 corridas, mensagem sem dado proibido, endereço incompleto), QJ (J4), W-F e **W-R** (link `wa.me`, sem R$/e-mail/CPF, "Não cobrar") |
| O5-ATR-05 | OK | S143 (SEC-144) |
| O5-EST-01, 02, 03, 04, 05, 06, 08, 09 | OK | LOG, OLG (linha do tempo, código, só o primeiro nome do motoboy, devolvida só estorna depois da loja, `autoConcludeDue` 24 h), QJ, W-R (código errado 422, código certo conclui, o painel nunca mostra o código) |
| O5-EST-07 | **FALHOU** | cancelar a corrida deixa o pedido em "pronto para coleta": **BUG-012** |
| O5-EST-10 | SEM | notificação à loja em coletado e entregue |
| O5-TAB-01 a 06 | OK | DFE, DIS (fronteira), QR (teto R$ 30,00) |
| O5-CST-01, 02, 03 | OK | LOG, S143 (SEC-145), DT49, QJ (J5: operação lança, financeiro quita, 403 para a operação) |
| O5-REL-01, 02, 03 | OK | LRP, OLG/QJ (taxa de entrega = receita da Webag) |
| O5-TRO-01, 02, 04, 05, 06, 07, 08, 09 | OK | EXC, EXR (piso legal intocável até pelo super admin; "sem troca voluntária"), QJ |
| O5-TRO-03, 10 | OK | QR (89 d ok, 91 d vencido; 6 d 23 h ok, 7 d 1 h vencido) |
| O5-TRO-11 | OK | EXC (sem estoque vira reembolso) |
| O5-TRO-12, 13 | BLQ | rascunho offline e 4 toques: aparelho |
| O5-TAX-01 a 07 | OK | EXC, DT49, QJ (J6 a J8: nada cobrado ao pedir; taxa só após a aprovação; PIX na conta da Webag sem split; idempotente), QR (taxa zerada) |
| O5-RES-01, 02, 03 | OK | EXC/QJ, QC (última unidade), QR (4 aprovações = 1 reserva) |
| O5-SLA-01 a 05 | OK | EXC (aprovação automática em 24 h, sem estoque vira reembolso), DT50 (lembretes 12 h e 4 h, contestar, mediação) |
| O5-COL-01, 02, 03, O5-LOJ-01, 02, O5-IDOR-01 | OK | QJ (J9: o motoboy não conclui; só a loja), EXC, DT50, DT49, QC |
| O5-PNL-01, 02, 03, 04, 05, 06, 09 | OK | SOR, SFN, RT, W-F, **W-R** |
| O5-PNL-07 | PARC | CSV do extrato: pelo código só leva campos gerados pelo sistema (número com `cell()`, datas, valores), sem texto livre do usuário, logo sem vetor de injeção de fórmula; sem teste automatizado |
| O5-PNL-08 | PARC | testes do web; conferência numérica contra a comissão efetiva não repetida |
| O5-ADM-01 | OK | **W-R** (fila, atribuir, `wa.me`) |
| O5-ADM-02, 03, 04 | OK | ARF, S141, PAY (alertas), auditoria nos testes de logística e estorno |
| O5-ADM-05 | **FALHOU (Alta)** | BUG-011 |
| O5-ADM-06 | SEM | destaque "Atenção" |
| O5-JOR-01 | **OK** | QJ (10 passos, API real) |
| O5-JOR-02 | **OK** | W-R (3 testes, telas reais) |
| O5-JOR-03 | BLQ | Maestro `comprar-com-pix.yaml` e `pedir-troca.yaml`: aparelho |

## 6. Bugs desta rodada

| ID | Sev. | Pri. | Resumo | Bloqueia G4 |
|---|---|---|---|---|
| BUG-011 | **Alta** | P1 | O admin não cancela pedido; estorno total manual deixa o pedido ativo e a loja ainda aceita (SEC-151 reclassificado) | Sim |
| BUG-012 | Média | P2 | Cancelar a corrida deixa o pedido em "pronto para coleta" sem corrida e sem estorno | Não |
| BUG-013 | Baixa | P3 | Duas criações simultâneas com chaves diferentes = 2 pedidos (SEC-148; QA delimitou: só em corrida real) | Não |
| BUG-014 | Média | P2 | Retirada não feita em 48 h não é cancelada nem estornada (WB-026 C3) | Se houver retirada no piloto |
| BUG-015 | Média | P2 | "Não recebi" (WB-037) e "pedir cancelamento" (WB-028 C2): ações anunciadas sem operação | Não |
| BUG-016 | Média | P2 | Horário da logística e "pausar entregas" não existem (DEC-039c) | Piloto |
| BUG-017 | Média | P2 | Parâmetros do admin que nenhum código lê | Não |
| BUG-018 | Média | P3 | "Mais vendidos" fixo em vazio | Não |
| BUG-019 | Baixa | P3 | Testes frágeis por horário e ordem (ver abaixo) | Não |

BUG-019 (`docs/qa/bugs/BUG-019.md`): (a) `logistics-report.e2e-spec.ts` falha nos primeiros 30 minutos depois da meia-noite de Brasília (cria a corrida "pronta há 30 min" e filtra pelo dia civil de hoje; reproduzido às 00:01 BRT, com 3 falhas; deve passar fora dessa janela); (b) `seed-onda3` conta TODOS os banners do banco compartilhado e falhou 1 de 2 execuções completas (passa sozinho): depende da ordem dos arquivos; (c) `seed-orders` casa `WB-DM%` e um pedido comum de número aleatório `WB-DM8RG` o derrubou (chance de ~1 em 4 por execução). Sugestão: relógio injetado e filtro por dados do próprio teste. Não é defeito de produto.

## 7. Verificação dos achados de segurança (SEC como critério)

| SEC | Resultado nesta rodada |
|---|---|
| 130 (estorno recusado), 141 (cobertura com estorno em voo), 142 (fracionar o limite) | Passaram (RQ, S141, ARF, mais a soma do ledger = 0) |
| 131 (teto de pendentes), 132 (loja nova), 133, 134, 136 | Passaram (ORL, PAY, RQ) |
| 143 (devolvida só com a loja), 144 (contato do cliente), 145 (segregação do custo) | Passaram (S143, QJ J5, W-R) |
| 147 (`expectedTotalCents` obrigatório) | Passou (ORD) |
| 148 | Confirmado aberto, delimitado e mantido Baixa (BUG-013) |
| 151 | Confirmado aberto; **reclassifiquei para Alta (BUG-011)**: no uso normal do financeiro, sem atacante, o estorno total deixa o pedido vivo e não existe rota de cancelamento do admin |
| 146, 149, 150 | Não retestados |

## 8. Observações que não são bug (decisão de produto ou documentação)

1. **Tarifa do provedor após estorno total**: sobra no ledger como saldo negativo do lojista (ex.: R$ 2,79 num pedido de R$ 280). É a regra HIP-016 ("não volta"), mas atinge a loja também quando ELA recusou o pedido ou deixou o tempo estourar (RN-08). Confirmar com o fundador se a Webag absorve nesses casos. [HIPÓTESE de impacto, não verificado no MP]
2. **Estorno parcial e taxa de entrega**: o ledger devolve a taxa de entrega proporcionalmente em qualquer estorno parcial; a RN-10 diz que só volta "se a entrega não foi realizada ou em arrependimento". É o comportamento que o provedor teria no split; a RN deveria dizer isso.
3. `comissao_padrao_pct` da API é 10 (definição) e o seed do CLI usa 15; a RN-02 e a DEC-039f dizem 15. Um ambiente sem o seed cobra 10%.
4. `troca_resposta_h` aceita mínimo de 4 h na API (teste `exchange-rules`); a RN-02 diz faixa 6 a 72.
5. `raio_padrao_km` ainda está definido como parâmetro; a DEC-036b diz que deixou de existir.
6. Dados de demonstração: `seed` não tem Mercado Pago; todo valor financeiro desta rodada vem do provedor `fake` (tarifa simulada 0,99% e 4,98%).

## 9. O que o fundador precisa testar no celular (roteiro curto, ~20 min)

Aparelho Android de entrada (2 GB) e um iPhone, app de staging com `PAYMENT_PROVIDER=fake` (ou sandbox do Mercado Pago se a credencial existir):
1. Abrir sem login, negar o GPS, escolher a cidade: aparecem lojas? Ligar o modo avião na home e na sacola: aparece o último estado com "Atualizado há X min"?
2. Comprar com PIX: criar o pedido, fechar o app no QR, reabrir: o PIX pendente continua em "Meus pedidos" com o tempo restante? Pagar (fake) e ver o pedido virar "Recebido" sozinho.
3. Cartão `...0001` (recusa), `...0002` (3DS abre dentro do app e volta ao pedido).
4. Com o painel da loja e a Logística abertos em outro aparelho: aceitar, marcar pronto, atribuir motoboy, "saiu", ler o código de entrega no app e conferir que o painel nunca o mostra; abrir o link do WhatsApp e ler a mensagem (sem valor, CPF ou e-mail).
5. Pedido entregue: pedir troca de tamanho em até 4 toques (nada é cobrado ao pedir), a loja aprova, o app mostra a taxa e o PIX dela.
6. Contar quantos toques e quanto tempo leva; anotar qualquer tela que pareça travar em rede lenta.

## 10. Como repetir

`TEST_DB_NAME=webag_x_test TEST_REDIS_DB=9 pnpm --filter @webag/api test:e2e` (arquivos `qa-onda3-5-*`). Web real: ver o cabeçalho de `apps/web/e2e-real/04-pedido-entrega-troca.e2e.ts` (banco novo, seed com admin, `nest build`, `node dist/main.js`, `PW_CHANNEL=chrome pnpm exec playwright test -c playwright.real.config.ts`).
