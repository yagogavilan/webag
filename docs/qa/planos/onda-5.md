# Plano de teste: Onda 5 (logística da Webag, trocas "Retira Troca" e painéis do lojista e do admin)

Dono: qa-engineer | Data: 2026-11-19 | Estratégia: `docs/qa/estrategia.md` | Fontes: `prd/logistica.md` (WB-229 a 242), `prd/trocas.md` (WB-170 a 178, 243 a 248), `prd/lojista.md` (WB-067 a 078), `prd/admin.md` (WB-108 a 114), `regras-de-negocio.md` (RN-07, RN-08, RN-10, RN-11, RN-13, RN-14, RN-18), DEC-036, DEC-037, DEC-038, DEC-039, `seguranca/revisao-logistica.md` (SEC-141 a 151)
Legenda: igual à `onda-4.md` (UNIT, API, CONC, PROP, E2E-W Playwright, E2E-M aparelho). Resultado por caso: `relatorios/onda-3-5.md` §6.
Prazos legais são FIXOS e testados como tal: arrependimento 7 dias corridos, defeito 30 dias (90 em durável), contados da ENTREGA confirmada, nunca editáveis (nem pelo super admin). Prazos de SLA (24 h da loja, 48 h da taxa, 7 dias do item) usam relógio injetado (`sweep(agora)`, `answerDeadlineAt`).

## 1. Pré-condições
- Ondas 1 a 4 verdes. Provedor `fake`. Tabela de frete do teste: 1 faixa de R$ 5,00 com troca R$ 2,50 (50%, DEC-039a) até 15 km; testes de tabela gravam a própria versão.
- Admins por perfil criados pela API com TOTP (`createAdmin`): super_admin, operations, finance, support.
- Motoboy real, WhatsApp real (`wa.me`) e push do Expo: **bloqueado** (conta do fundador, aparelho). O texto da mensagem e o link são verificados; o envio, não.

## 2. Casos

### 2.1 Loja marca "pronto", fila e atribuição (WB-229, WB-230, WB-231, WB-232)
| ID | Origem | Caso (Dado/Quando/Então) | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-PRO-01 | WB-229 C1/C2 | Dado pedido de entrega aceito, quando a loja marca pronto (volumes, observação <= 100), então o pedido vira `ready_for_collection`, nasce UMA corrida `ready_for_collection` e o cliente e o admin são avisados | API | P0 | |
| O5-PRO-02 | WB-229 C4 | Dado toque duplo, então 1 corrida (idempotente) | API/CONC | P0 | |
| O5-PRO-03 | WB-229 C3, RN-07 | Dado entrega Webag, então a loja NÃO consegue marcar "saiu" nem "entregue" (409) | API | P0 | |
| O5-PRO-04 | WB-229 C6 | Dado corrida sem motoboy, então a loja volta para separação; com motoboy só o admin (`DELIVERY_ALREADY_ASSIGNED`); marcar pronto de novo reaproveita a MESMA corrida | API | P1 | |
| O5-PRO-05 | WB-229 C7, RN-13 | Dado funcionário sem a permissão "pedidos", então 403 no servidor | API | P0 | |
| O5-FIL-01 | WB-230 C2/C3 | Dado a fila, então a corrida mais antiga primeiro, com SLA amarelo (10 min) e vermelho (20 min) com texto, filtros e paginação | API | P1 | |
| O5-FIL-02 | WB-230 C1/C10, RN-13 | Dado perfis, então operação e super agem; financeiro e suporte só leem; sem login 401; sem rota de exclusão | API | P0 | |
| O5-FIL-03 | WB-230 C4 | Dado nova corrida, então a operação recebe alerta durável e evento em tempo real (`delivery_ready`) só na sala `admin:ops` | API | P1 | |
| O5-FIL-04 | WB-230 C6, DEC-039c | Dado "Pausar entregas" ou fora de `logistica_horario`, então o checkout não oferece entrega Webag ("Entrega volta às HH:MM"); corridas existentes seguem | API | P0 | |
| O5-MOT-01 | WB-231 C1 | Dado cadastro de motoboy, então nome <= 60, telefone com validação, aceite "documentos conferidos"; telefone duplicado entre ativos 409 | API | P1 | |
| O5-MOT-02 | WB-231 C3/C4 | Dado inativar, então sai da atribuição; com corrida ativa pede reatribuir (409); não existe exclusão; auditoria com antes e depois | API | P1 | |
| O5-ATR-01 | WB-232 C1/C8, CONC | Dado 6 operadores atribuindo a mesma corrida ao mesmo tempo, então vale o primeiro e os outros veem 409 com o motoboy | CONC | P0 | |
| O5-ATR-02 | WB-232 C7 | Dado motoboy com 2 corridas, então permitido com aviso "já tem 2 corridas ativas" | API | P2 | |
| O5-ATR-03 | WB-232 C2/C5, RN-18 | Dado a mensagem de WhatsApp, então só loja, endereços, 1º nome e telefone do cliente, volumes, observação e "Pago no app. Não cobrar"; NUNCA CPF, e-mail, itens, valores nem o código de entrega; link `wa.me`; envio registrado | API | P0 | SEC-146 |
| O5-ATR-04 | WB-232 C6 | Dado endereço incompleto, então exige "já confirmei" antes de enviar | API | P1 | |
| O5-ATR-05 | SEC-144 | Dado financeiro e suporte, então o detalhe vem sem contato e a mensagem do WhatsApp é só da operação (403); "Revelar contato" é auditado; o contato é apagado após o prazo da corrida terminada, nunca em corrida ativa | API | P0 | SEC-144 |
| O5-ATR-06 | | Dado a corrida atribuída 6 vezes em paralelo, então um só motoboy fica | CONC | P0 | |

### 2.2 Estados da entrega, código, falha e auto-conclusão (WB-233, WB-234, WB-235, RN-18)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-EST-01 | WB-233 C1/C2 | Dado atribuir, confirmar, coletar e entregar, então o pedido acompanha (`ready_for_collection`, `out_for_delivery`, `delivered`), cada passo grava ator e hora, transição inválida é 409 (`INVALID_DELIVERY_TRANSITION`) | API | P0 | |
| O5-EST-02 | WB-233 C3, WB-226 | Dado código de entrega ligado, então só conclui com o código do cliente; errado 422; 5 erros bloqueiam (429); só o super admin conclui sem código, com motivo e auditoria; o painel e a mensagem nunca mostram o código | API | P0 | |
| O5-EST-03 | WB-235 C3 | Dado o cliente, então vê só o PRIMEIRO nome do motoboy, nunca telefone nem sobrenome; código só a partir de "saiu para entrega" | API | P0 | |
| O5-EST-04 | WB-235 C2 | Dado cada mudança, então 1 aviso ao cliente (atribuído, a caminho, saiu, entregue); push só em saiu, entregue e falha | API | P1 | |
| O5-EST-05 | WB-234 C1/C2 | Dado não entregue (motivo obrigatório), então o cliente é avisado; 1 reentrega sem custo (`entrega_reentrega_max`); depois só devolução | API | P0 | |
| O5-EST-06 | WB-234 C3/C4, SEC-143 | Dado devolvida à loja, então o pedido só é cancelado COM estorno total (inclui a taxa de entrega) depois que a LOJA confirma o recebimento; a operação sozinha não estorna; o admin pode confirmar com motivo e auditoria | API | P0 | SEC-143 |
| O5-EST-07 | WB-233 C6 | Dado cancelar corrida (motivo), então a corrida cancela e o pedido acompanha (cancelado ou volta à separação), nunca parado em "pronto" | API | P0 | |
| O5-EST-08 | WB-233 C7, RN-07 | Dado corrida em `out_for_delivery` há 24 h (relógio injetado), então o sistema conclui como "fechado pelo sistema"; antes de 24 h nada acontece; "não recebi" do cliente impede | API | P0 | |
| O5-EST-09 | WB-233 | Dado o histórico da corrida, então é append-only no banco | API | P1 | |
| O5-EST-10 | WB-233 C5 | Dado transição, então a loja é notificada em coletado e entregue | API | P2 | |

### 2.3 Taxa de entrega, custo e relatórios (WB-236 a 240)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-TAB-01 | WB-236 C1/C3 | Dado tabela com até 6 faixas contíguas sem lacuna, então válida; 2,00 km cai na faixa 2-5; a última inclui o raio; taxa R$ 0 a R$ 50 | API | P0 | |
| O5-TAB-02 | WB-236 C2 | Dado bairro > cidade > padrão, então vale o escopo do ENDEREÇO DE DESTINO; a prévia do admin é igual ao carrinho | API | P0 | |
| O5-TAB-03 | WB-236 C5 | Dado salvar, então motivo obrigatório, não retroativo (422 `FEE_TABLE_RETROACTIVE`), edição concorrente 409; pedido já feito mantém o snapshot | API | P0 | |
| O5-TAB-04 | WB-236 C8, `taxa_coleta_max_cents` | Dado taxa de troca acima de R$ 30,00, então 422 com o teto | API | P0 | |
| O5-TAB-05 | WB-236 C9 | Dado perfis, então só super admin e financeiro gravam; operação e suporte leem | API | P0 | |
| O5-TAB-06 | WB-236 C4, RN-04 | Dado frete grátis <= pedido mínimo, então 422; 0 desliga | API | P1 | |
| O5-CST-01 | WB-239 C1/C3 | Dado corrida terminada, então a operação registra o custo (sugestão = custo previsto); correção exige motivo e guarda o valor anterior; só com corrida terminada | API | P0 | |
| O5-CST-02 | SEC-145 | Dado segregação, então quem lançou o custo não marca como pago; operação não paga (403); super admin só com `overrideReason` auditado; custo muito acima do previsto exige motivo e alerta | API | P0 | SEC-145 |
| O5-CST-03 | WB-238 C4, DT-049 | Dado custo lançado, então vira despesa de logística a pagar ao motoboy (ledger), corrige só a diferença, e quitar lança o pagamento fora do app; o ledger do pedido segue fechando | API | P0 | |
| O5-REL-01 | WB-240 C1/C4 | Dado período, então totais (entregas, taxa, custo, margem só das com custo, subsídio do frete grátis, falhas por motivo) conferem com as linhas; período sem dados devolve zeros | API | P1 | |
| O5-REL-02 | WB-240 C2 | Dado "a pagar por motoboy", então só custo lançado e não pago, mostra quem lançou, quitar tira do relatório, CSV auditado | API | P1 | |
| O5-REL-03 | WB-238 C2, RN-10 | Dado entrega paga pelo cliente, então a taxa é receita da Webag (`delivery_fee_revenue`) e não aparece como receita do lojista | API | P0 | |

### 2.4 Trocas: elegibilidade, tipos e prazos legais (WB-170, WB-178, WB-244, RN-11)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-TRO-01 | WB-170 C1, RN-11 | Dado pedido entregue, então as opções mostram o prazo "até DD/MM" por motivo, contado da ENTREGA; pedido não entregue é `EXCHANGE_ORDER_NOT_DELIVERED`; fora do prazo `EXCHANGE_WINDOW_EXPIRED` (arrependimento 7 e tamanho vencidos; defeito segue) | API | P0 | |
| O5-TRO-02 | RN-11, DEC-011 | Dado os pisos legais (7, 30, 90 dias), então NÃO são editáveis por nenhum perfil, nem super admin; só o prazo voluntário e o SLA são parâmetros dentro de faixa | API | P0 | |
| O5-TRO-03 | RN-11 | Dado categoria durável, então defeito vale 90 dias; não durável 30 | UNIT/API | P0 | |
| O5-TRO-04 | WB-170 C3 | Dado defeito sem foto, então 400; com 1 a 5 fotos ok | API | P0 | |
| O5-TRO-05 | WB-170 C6, HIP-T02 | Dado 1 troca voluntária por pedido, então a 2ª é recusada (`EXCHANGE_VOLUNTARY_LIMIT`); arrependimento e defeito não contam; recusada pela loja devolve o direito; 1 solicitação aberta por item (`EXCHANGE_ALREADY_OPEN`) | API | P0 | |
| O5-TRO-06 | WB-170 C7 | Dado a mesma `Idempotency-Key`, então a MESMA troca (200); sem chave 400 | API | P0 | |
| O5-TRO-07 | WB-244 | Dado produto ou categoria "sem troca voluntária", então tamanho e cor ficam inertes com o motivo; arrependimento e defeito seguem | API | P0 | |
| O5-TRO-08 | WB-178 C1/C2 | Dado arrependimento, então nasce APROVADA na hora, a loja não recusa (`EXCHANGE_CANNOT_REJECT`) e a coleta em casa é grátis | API | P0 | |
| O5-TRO-09 | WB-178 C3, WB-174 C2 | Dado ITEM_RECEBIDO em arrependimento, então o reembolso do item sai primeiro; a taxa de entrega só volta junto do ÚLTIMO item do pedido; soma nunca passa do pago | API | P0 | |
| O5-TRO-10 | WB-178 C5 | Dado o 8º dia, então a opção de arrependimento some | API | P0 | |
| O5-TRO-11 | WB-170 C4, WB-174 C2 | Dado tamanho sem estoque na variação nova, então vira reembolso do item sem devolver a taxa de entrega original | API | P1 | |
| O5-TRO-12 | WB-170 C8 | Dado sem conexão, então rascunho no aparelho e envio depois | E2E-M | P2 | |
| O5-TRO-13 | WB-170 C10 | Dado o caso simples, então a troca leva 4 toques a partir de "Meus pedidos" | E2E-M | P1 | |

### 2.5 Trocas: taxa só após a aprovação, estoque, SLA 24 h, coleta e reentrega (WB-172 a 177, WB-175, WB-243, WB-245)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-TAX-01 | WB-175 C1, HIP-D09 | Dado tamanho com coleta em casa, quando o cliente solicita, então NADA é cobrado e a variação nova NÃO é reservada; a loja aprova: `awaiting_fee` com o valor da tabela, e só então o pagamento é aceito (antes: `EXCHANGE_NOT_AWAITING_FEE`) | API | P0 | |
| O5-TAX-02 | WB-175 C3 | Dado recusa da loja, então nenhuma cobrança; cancelar depois de pagar e antes da coleta estorna a taxa integralmente | API | P0 | |
| O5-TAX-03 | WB-175 C4/WB-243 C3 | Dado defeito, arrependimento ou "levar à loja", então a taxa é R$ 0 e nunca entra em "taxa pendente"; taxa zerada pela região em coleta em casa vira aprovada direto com corrida | API | P0 | |
| O5-TAX-04 | WB-175 C5, DT-049 | Dado a taxa paga (PIX, conta da Webag, SEM split, `storeId` nulo), então é receita da Webag (`exchange_fee_revenue`), pagamento repetido ou webhook em dobro não duplica, a diferença de preço fica a favor da loja, o ledger fecha | API | P0 | |
| O5-TAX-05 | WB-175 C6 | Dado taxa não paga em `troca_taxa_pagamento_h` (48 h), então CANCELADA sem cobrança e a reserva é liberada | API | P0 | |
| O5-TAX-06 | WB-175 C2 | Dado a taxa da troca, então vem da tabela do admin (50% da entrega por padrão), congelada no pedido, <= `taxa_coleta_max_cents` | API | P0 | |
| O5-TAX-07 | WB-245 | Dado preço da variação nova maior, então a diferença entra no mesmo pagamento da taxa; menor, então estorno parcial ao receber o item; igual, R$ 0 | API | P1 | |
| O5-RES-01 | WB-174 C1, RN-06 | Dado aprovar, então a variação nova é reservada na aprovação (quantidade da linha) e a baixa definitiva só na conclusão; a peça original volta ao estoque ao ser recebida | API | P0 | |
| O5-RES-02 | CONC | Dado a última unidade do tamanho novo e 2 trocas aprovadas ao mesmo tempo, então uma aprova e a outra recebe 409 `EXCHANGE_NO_STOCK`; reserva nunca passa do estoque | CONC | P0 | |
| O5-RES-03 | WB-172 | Dado 4 aprovações simultâneas pela mesma loja da mesma troca, então a reserva é feita UMA vez; recusar depois de aprovar é 409 | CONC | P0 | |
| O5-SLA-01 | WB-177 C1, HIP-T03 | Dado SOLICITADA sem resposta da loja em 24 h, então aprovação automática (ator `system`) com reserva e taxa; dentro do prazo nada acontece; sem estoque no momento vira reembolso e não prende a troca | API | P0 | |
| O5-SLA-02 | WB-177 C2 | Dado 12 h e 4 h antes do fim, então lembrete à loja uma vez cada; 2 varreduras simultâneas não duplicam | API/CONC | P1 | |
| O5-SLA-03 | WB-177 C3 | Dado APROVADA sem item entregue em 7 dias, então EXPIRADA e a reserva é liberada | API | P1 | |
| O5-SLA-04 | WB-176 | Dado recusa, então o cliente contesta uma vez em até 7 dias; vai à mediação; só o dono; texto 10 a 500 | API | P1 | |
| O5-SLA-05 | WB-110 | Dado a mediação, então só operação/super decidem, com justificativa; a favor do cliente aprova e segue o fluxo da taxa; a favor da loja é recusa final e libera a reserva | API | P1 | |
| O5-COL-01 | WB-241 C1/C3 | Dado taxa paga, então nasce a corrida de coleta; o motoboy "entregar" na loja NÃO conclui a troca; só a LOJA confirma o recebimento; a reentrega só nasce depois da inspeção OK | API | P0 | |
| O5-COL-02 | WB-241 C1, DEC-038f | Dado inspeção OK, então nasce a corrida de reentrega sem nova cobrança; ao entregar a troca conclui e a baixa do tamanho novo é definitiva | API | P0 | |
| O5-COL-03 | WB-173 C4 | Dado inspeção reprovada com o item na loja, então vai à mediação; a favor do cliente reembolsa; a favor da loja encerra sem reembolso | API | P1 | |
| O5-LOJ-01 | WB-243 C1/C4 | Dado "levar à loja", então código de 6 caracteres; a loja não vê o código do cliente; errado 422, 5 erros bloqueiam (429); a peça nova sai na hora | API | P0 | |
| O5-LOJ-02 | WB-174 C3, DT-049 | Dado o custo da corrida de coleta, então vira custo de logística da Webag ligado à troca, relatório de trocas por loja e categoria confere (WB-248) | API | P1 | |
| O5-IDOR-01 | SEC-020 | Dado outro cliente, então 404 em ler, cancelar, pagar a taxa, contestar e ver as opções da troca alheia; outra loja 403/404 em aceitar, recusar e receber | API | P0 | SEC-020 |

### 2.6 Painel do lojista (WB-067 a 078, 242)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-PNL-01 | WB-067 | Dado a lista, então só pedidos PAGOS da loja, novos primeiro, com contagens; cliente só com o primeiro nome | API | P0 | |
| O5-PNL-02 | WB-068, RN-14 | Dado detalhe, então endereço e telefone do cliente só enquanto o pedido está em andamento; comanda sem preços | API | P0 | |
| O5-PNL-03 | WB-068, SEC-020 | Dado lojista de OUTRA loja, então 404 em tudo e nada muda | API | P0 | SEC-020 |
| O5-PNL-04 | WB-067 | Dado pedido novo, então a loja recebe `order.created` em tempo real só da própria sala; polling de 4 s como plano B | API/E2E-W | P1 | |
| O5-PNL-05 | WB-068 | Dado aceitar e recusar em "Em separação" e "Pronto", então o painel adapta os botões (entrega Webag x retirada) | E2E-W | P1 | |
| O5-PNL-06 | WB-075/076, RN-13 | Dado financeiro do lojista, então resumo e extrato batem com o ledger; funcionário com `vendas_valores` vê só vendas; sem a permissão nada; outra loja 404 | API | P0 | |
| O5-PNL-07 | WB-077 | Dado extrato em CSV, então sem injeção de fórmula (`=`, `+`, `-`, `@`) e exportação auditada | API | P1 | SEC-020 |
| O5-PNL-08 | WB-242 C1 | Dado o formulário de produto, então "Você recebe cerca de R$ X" = preço − comissão efetiva (loja > categoria > padrão) − estimativa da tarifa, half-up | UNIT/E2E-W | P1 | |
| O5-PNL-09 | WB-172 | Dado a fila de trocas, então 1 toque aprova, recusa exige motivo, arrependimento não tem "Recusar" | E2E-W | P1 | |

### 2.7 Painel do admin (WB-108 a 114, WB-230 a 241)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O5-ADM-01 | WB-230/232 | Dado o painel Logística, então a fila, atribuir com "primeiro operador vence" e o link do WhatsApp funcionam contra a API real | E2E-W real | P0 | |
| O5-ADM-02 | WB-109 | Dado perfis, então estorno só super e financeiro, com reauth, motivo e chave; acima de R$ 500 só super (soma por pedido, teto diário) | API | P0 | SEC-142 |
| O5-ADM-03 | WB-113 | Dado conciliação, então divergências viram alertas visíveis só a financeiro e super; webhook com falha pode ser reprocessado | API | P1 | |
| O5-ADM-04 | WB-123 | Dado ação sensível (estorno, atribuição, custo, tabela de frete, revelar contato), então há auditoria com ator, antes e depois | API | P0 | |
| O5-ADM-05 | WB-109 | Dado estorno total ou cancelamento pelo admin, então o pedido encerra (BUG-011) | API | P0 | SEC-151 |
| O5-ADM-06 | WB-108 | Dado pedido "saiu há mais de 4 h" ou "não entregue há 24 h", então destaque "Atenção" | API/E2E-W | P2 | |

### 2.8 Jornadas ponta a ponta
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O5-JOR-01 | Escopo do QA | Comprar com PIX fake, lojista aceita e marca pronto, operação atribui motoboy e conclui com o código, cliente pede troca de tamanho, loja aprova, cliente paga a taxa, coleta, loja confere, reentrega, troca concluída; o ledger fecha e a soma é zero | API real | P0 |
| O5-JOR-02 | Escopo do QA | Mesma jornada pelas telas (Playwright contra a API real: painel do lojista, Logística do admin) | E2E-W real | P1 |
| O5-JOR-03 | Escopo do QA | Mesma jornada no aparelho (Maestro `comprar-com-pix.yaml`, `pedir-troca.yaml`) | E2E-M | P0 |

## 3. Critérios de saída da onda 5
Todo P0 de API/CONC passou; nenhum Crítico aberto; BUG-011 (Alta) corrigido antes do G4 ou aceito pelo fundador em `decisoes.md`; jornada em aparelho e WhatsApp/push reais listados como pendência do fundador.
