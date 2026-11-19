# Plano de teste: Onda 4 (compra e pagamento: pedido, PIX, cartão, estoque, comissão e ledger, estorno, cancelamento)

Dono: qa-engineer | Data: 2026-11-19 | Estratégia: `docs/qa/estrategia.md` | Fontes: `prd/cliente.md` (WB-023 a 028, 224, 225), `prd/pagamentos.md` (WB-150 a 160), `regras-de-negocio.md` (RN-01, RN-05 a RN-10), `docs/seguranca/revisao-onda4a.md` e `revisao-logistica.md` (SEC-130 a 151), DEC-033, DEC-036, DEC-043, DEC-046
Legenda: Tipo UNIT, API (e2e real: Postgres, Redis, app Nest completo, provedor `fake` pelo mesmo caminho do webhook), CONC, PROP (propriedade numérica, semente fixa), E2E-W, E2E-M (aparelho). P0 bloqueia release; Crítica = dinheiro, pedido/pagamento inconsistente. Resultado por caso: `relatorios/onda-3-5.md` §5.
Regra do plano: todo valor esperado é calculado à mão a partir da RN-10 (exemplo oficial: R$ 100,00, cupom da loja R$ 10,00, entrega R$ 8,00, comissão 15%: total 98,00, comissão 13,50, `application_fee` 21,50, líquido 76,50 antes da tarifa; com PIX 0,99%: 75,53) e conferido por um oráculo que NÃO reaproveita o código do produto (BigInt, `apps/api/test/qa-onda3-5-ledger.e2e-spec.ts`).

## 1. Pré-condições
- Ondas 1 a 3 verdes. `PAYMENT_PROVIDER=fake` (aprovação pelo `/v1/dev/payments/{id}/approve|decline|expire`, mesmo caminho do webhook). Cartões de teste `...0000` aprova, `0001` recusa, `0002` 3DS, `0003` timeout.
- Mercado Pago real, sandbox e `application_fee` aceita pelo MP: **bloqueado** (credencial do fundador, README §Mercado Pago; pontos `[confirmar no sandbox]`).
- Aparelho: PIX, cartão e 3DS dentro do app: E2E-M com o fundador.

## 2. Casos

### 2.1 Criação do pedido, valores e idempotência (WB-023, WB-024, RN-05)
| ID | Origem | Caso (Dado/Quando/Então) | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-PED-01 | WB-024 C1, RN-06 | Dado sacola e endereço, quando crio o pedido com PIX, então nasce `awaiting_payment`, o estoque é reservado, a sacola esvazia e a cobrança é igual ao total mostrado | API | P0 | |
| O4-PED-02 | WB-024 C6 | Dado a mesma `Idempotency-Key`, quando repito (rede ruim), então volta o MESMO pedido; sem chave é 400; sem login 401; sacola vazia 422 | API | P0 | |
| O4-PED-03 | WB-024 C6, CONC | Dado 8 criações simultâneas com a mesma chave, então 1 pedido, 1 reserva e nenhum 5xx | CONC | P0 | |
| O4-PED-04 | RN-05, SEC-147 | Dado preço, frete ou cupom diferentes do `expectedTotalCents`, então 409 `CART_CHANGED` com o que mudou, sem cobrar; `expectedTotalCents` é obrigatório (400) | API | P0 | SEC-147 |
| O4-PED-05 | RN-05 | Dado corpo com campos de preço, então são ignorados/recusados: o valor vem do servidor | API | P0 | SEC-033 |
| O4-PED-06 | WB-023 C6 | Dado total acima de `pedido_max_cents` (R$ 2.000,00), então 422 `ABOVE_MAX_ORDER` e a sacola é mantida | API | P1 | |
| O4-PED-07 | WB-023 C4 | Dado loja fechada, pausada ou que fechou durante o checkout, então bloqueio com a hora de abertura e sacola mantida | API | P1 | |
| O4-PED-08 | WB-225, SEC-132 | Dado loja nova (< 30 dias ou < 20 pedidos entregues), então o teto por pedido vale na sacola e no pedido; o admin libera com motivo e auditoria | API | P0 | SEC-132 |
| O4-PED-09 | SEC-131, SEC-064 | Dado 3 pedidos `awaiting_payment` da mesma conta, então o 3º dá 429; mais de 5 PIX por hora também; pagar ou cancelar libera | API | P0 | SEC-131 |
| O4-PED-10 | WB-224, DEC-014 | Dado e-mail não confirmado, então só 1 pedido pago; o pendente conta junto | API | P1 | |
| O4-PED-11 | SEC-148 | Dado 2 criações simultâneas da mesma revisão da sacola com chaves diferentes, então 1 pedido | CONC | P2 | SEC-148 |
| O4-PED-12 | WB-023 C1, RN-17 | Dado checkout no app: no máximo 3 passos, botão sempre ativo, "Algo mudou" antes de pagar | E2E-M | P1 | |

### 2.2 Pagamento PIX e cartão, webhook, conciliação (WB-024, WB-025, WB-150 a 153, 157, 158)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-PAG-01 | WB-024 C2, WB-151 | Dado PIX aprovado, então `received`, baixa definitiva do estoque (reserva vira venda), tarifa lançada, ledger fecha | API | P0 | |
| O4-PAG-02 | WB-153, SEC-033 | Dado o mesmo webhook 2 vezes (mesmo request-id e com outro), então 1 evento e 1 efeito | API/CONC | P0 | SEC-033 |
| O4-PAG-03 | CONC | Dado 6 aprovações simultâneas do mesmo PIX, então 1 venda no ledger e 1 baixa de estoque | CONC | P0 | |
| O4-PAG-04 | WB-153, SEC-032 | Dado assinatura errada, ausente, `ts` de 10 min atrás, IPN legado ou `data.id` só no corpo, então 401 e nada enfileirado | API | P0 | SEC-032 |
| O4-PAG-05 | WB-153 | Dado evento fora de ordem (aprovado depois de estornado), então ignorado; ID desconhecido adia e depois alerta | API | P0 | SEC-136 |
| O4-PAG-06 | WB-158, SEC-040 | Dado PIX pago depois de expirar, então pedido segue expirado, o estoque já voltou e há 1 estorno total automático idempotente | API | P0 | SEC-040 |
| O4-PAG-07 | SEC-133 | Dado cartão aprovado na criação com comissão ou recebedor errados, então o pedido NÃO fica pago: divergente com alerta | API | P0 | SEC-133 |
| O4-PAG-08 | SEC-134 | Dado pagamento avulso de valor menor com a referência do pedido, então não paga o pedido, alerta e é estornado; só vale tentativa criada pelo pedido, dono e valor | API | P0 | SEC-134 |
| O4-PAG-09 | WB-152 | Dado cartão `...0001`, então 422 `PAYMENT_DECLINED` com texto seguro, pedido expirado, estoque devolvido; `...0002` pede 3DS; `...0003` dá 503 sem pedido aberto | API | P0 | |
| O4-PAG-10 | WB-152, regra 2 | Dado qualquer coluna do banco, então nenhuma guarda cartão, CPF ou documento do pagador; resposta de pagamento sem ID do provedor | API | P0 | SEC-044 |
| O4-PAG-11 | SEC-035 | Dado rota fora de `/v1/dev`, então nenhuma confirma, aprova ou recusa pagamento; em produção `/v1/dev` é 404 | API | P0 | SEC-035 |
| O4-PAG-12 | WB-157 | Dado webhook perdido, então a conciliação pega o aprovado e expira o PIX vencido; falha em 1 pagamento não aborta os demais; só 1 instância concilia | API | P0 | |
| O4-PAG-13 | WB-113 | Dado divergência de valor, referência ou recebedor injetada, então vira alerta ao financeiro | API | P1 | |
| O4-PAG-14 | WB-024 C3 | Dado PIX vencido, então o sweep expira o pedido e devolve o estoque | API | P0 | |
| O4-PAG-15 | CONC | Dado "cancelar" e "PIX caiu" ao mesmo tempo (6 rodadas), então nunca pago sem estorno, nem estoque preso, nem baixado em pedido cancelado; ledger sem saldo | CONC | P0 | |
| O4-PAG-16 | WB-160 | Dado `PAYMENT_PROVIDER=mercadopago` sem uma chave, então a API não sobe e a mensagem lista os nomes (nunca valores); `TEST-` recusado em produção | API | P1 | |
| O4-PAG-17 | WB-151/152 | Dado Mercado Pago sandbox: PIX, cartão, 3DS, `x-signature` e `application_fee` aceita | E2E | P0 | |
| O4-PAG-18 | WB-025 C1/C4 | Dado app: campo seguro do provedor, 3DS dentro do app, recusa permite outro cartão ou PIX | E2E-M | P0 | |

### 2.3 Comissão, split e ledger (WB-155, WB-156, RN-09, RN-10, DEC-035, DEC-036)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-FIN-01 | RN-10 exemplo | Dado R$ 100,00, cupom da loja R$ 10,00, entrega R$ 8,00, 15%, então total 98,00, comissão 13,50, `application_fee` 21,50, líquido do lojista 76,50 (75,53 com PIX 0,99%) | UNIT/API | P0 | |
| O4-FIN-02 | PROP | Dado 20.000 cenários aleatórios (itens, %, cupom da loja, desconto da plataforma, entrega, serviço), então total = líquido do lojista + `application_fee`, comissão = Σ half-up por item (oráculo BigInt), `application_fee` >= 0 | PROP | P0 | SEC-060 |
| O4-FIN-03 | RN-09, SEC-060 | Dado cupom da plataforma, então o desconto nunca passa de comissão + entrega + serviço (a Webag não paga ao lojista por fora); cortado e informado | PROP/API | P0 | SEC-060 |
| O4-FIN-04 | RN-09 | Dado cupom da loja, então reduz a base da comissão e é rateado por maior resto; cupom da plataforma não reduz a base | PROP | P0 | |
| O4-FIN-05 | RN-10 | Dado comissão loja > categoria (própria e mãe) > padrão, vigência futura só vale depois, 0 a 30%, e mudança do padrão não altera pedido já pago (snapshot) | API | P0 | |
| O4-FIN-06 | WB-156 C4 | Dado qualquer pedido, então cada lançamento fecha (débitos = créditos) e `provider_clearing` = pago − estornado − tarifa | PROP/API | P0 | SEC-041 |
| O4-FIN-07 | SEC-041 | Dado o banco todo, então a soma de todo o ledger é ZERO, o banco recusa lançamento que não fecha, a aplicação não altera nem apaga, valor sempre > 0 | API | P0 | SEC-041 |
| O4-FIN-08 | RN-10 | Dado 12 pedidos reais com preços, quantidades, categorias, % e cupons aleatórios, então comissão, `application_fee`, total cobrado e ledger batem com o oráculo | API | P0 | |
| O4-FIN-09 | RN-10 | Dado frete grátis acima de X, então só a parcela da entrega sai da `application_fee` (nunca negativa) e o motoboy continua pago | API | P1 | |
| O4-FIN-10 | WB-156 | Dado pedido pago, então a taxa do provedor real (`fee_details`) substitui a estimada; uma por pedido | API | P1 | |
| O4-FIN-11 | WB-076/077 | Dado extrato do lojista, então bate com o ledger; funcionário com `vendas_valores` vê só vendas; entrega não aparece como receita dele | API | P0 | |
| O4-FIN-12 | RN-10 | Dado split no sandbox, então o MP aceita `application_fee` = comissão + entrega e devolve a parte proporcional no estorno parcial | E2E | P0 | |

### 2.4 Estoque (RN-06)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-EST-01 | RN-06 | Dado estoque 7 e 30 pedidos de 1 unidade ao mesmo tempo, então exatamente 7 reservas e 23 conflitos, nunca negativo | CONC | P0 | |
| O4-EST-02 | RN-06 | Dado 6 clientes disputando as 3 últimas unidades, então 3 pedidos e 3 recusas "Acabou o estoque" | CONC | P0 | |
| O4-EST-03 | RN-06 | Dado pedido com 2 itens e o 2º sem estoque, então nada fica reservado (transação) | API | P0 | |
| O4-EST-04 | RN-06 | Dado expiração, recusa, cancelamento e timeout da loja, então a reserva volta; baixa definitiva só no pagamento | API | P0 | |
| O4-EST-05 | SEC-131 | Dado uma conta, então não reserva mais que o teto de pendentes (180 de 200 unidades) | API | P0 | SEC-131 |
| O4-EST-06 | RN-06 | Dado variação desativada, produto fora do ar ou lojista ajustando abaixo do reservado, então bloqueado com aviso | API | P1 | |

### 2.5 Cupom: usos, limite e concorrência (WB-022, RN-09)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-CUP-01 | RN-09 | Dado cupom com 1 uso e 2 clientes ao mesmo tempo, então um pedido leva o desconto; o outro recebe 409 `CART_CHANGED` (`DISCOUNT_CHANGED`), sem cobrança | CONC | P0 | |
| O4-CUP-02 | RN-09 | Dado cupom com 3 usos e 6 clientes, então exatamente 3 resgates e 3 pedidos com desconto | CONC | P0 | |
| O4-CUP-03 | RN-08 | Dado pedido cancelado antes do pagamento, então o cupom volta ao saldo de usos se ainda válido | API | P1 | |
| O4-CUP-04 | RN-09, SEC-061 | Dado cupom da plataforma/primeira compra, então exige e-mail confirmado e é recusado em autoconsumo | API | P0 | SEC-061 |

### 2.6 Estados do pedido, aceite, cancelamento e estorno (WB-027, WB-028, WB-067 a 070, WB-109, WB-154, RN-07, RN-08)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-STA-01 | RN-07 | Dado a tabela de transições, então só as válidas acontecem; transição inválida é 409; toda transição grava ator, hora e motivo | API/UNIT | P0 | |
| O4-CAN-01 | WB-028 C4/C5 | Dado `awaiting_payment`, quando cancelo (e repito), então libera estoque e cupom, sem estorno; repetir é idempotente | API | P0 | |
| O4-CAN-02 | WB-028 C1, RN-08 | Dado `received` ou `accepted`, quando o cliente cancela, então estorno total automático, sem comissão, estoque devolvido, ledger zerado (resta só a tarifa do provedor) | API | P0 | |
| O4-CAN-03 | RN-08 | Dado pedido em separação ou depois, então o cliente não cancela (409 `ORDER_NOT_CANCELLABLE`) | API | P0 | |
| O4-CAN-04 | WB-028 C2 | Dado `in_preparation`, então o cliente PEDE o cancelamento; a loja decide em 10 min; sem resposta vai ao admin | API | P1 | |
| O4-CAN-05 | WB-068 | Dado loja que recusa (motivo obrigatório), então estorno total, estoque devolvido, cliente vê o motivo | API | P0 | |
| O4-CAN-06 | RN-07 | Dado a loja não aceitar em `loja_aceite_timeout_min` (10), então cancelamento pelo sistema com estorno total | API | P0 | |
| O4-CAN-07 | CONC | Dado aceite da loja e cancelamento do cliente ao mesmo tempo (6 rodadas), então ou aceito sem estorno ou cancelado com estorno total, nunca os dois | CONC | P0 | |
| O4-CAN-08 | CONC | Dado aceite e recusa simultâneos, então uma vence e o dinheiro nunca é estornado se o pedido foi aceito | CONC | P0 | |
| O4-CAN-09 | RN-08, WB-109 | Dado qualquer estado, então o admin cancela e estorna (total ou parcial), motivo obrigatório, auditado; estorno total encerra o pedido e impede aceite/despacho | API | P0 | SEC-151 |
| O4-CAN-10 | WB-070, RN-08 | Dado item indisponível após o aceite, então a loja o marca, o sistema estorna o valor do item menos o cupom proporcional e a comissão recalcula | API | P1 | |
| O4-CAN-11 | WB-037 | Dado "não recebi meu pedido", então abre disputa e impede a auto-conclusão | API | P0 | |
| O4-CAN-12 | RN-07, WB-026 C3 | Dado retirada não feita em 48 h, então cancelamento pelo sistema com estorno total, aviso 24 h antes | API | P1 | |
| O4-CAN-13 | WB-026, SEC-138 | Dado código de retirada, então só conclui com o código do cliente; 5 erros bloqueiam 30 min e avisam o admin (Redis fora: falha aberta, SEC-150) | API | P0 | SEC-138 |
| O4-CAN-14 | WB-027 C4 | Dado pedido recusado, cancelado ou expirado, então a linha do tempo mostra motivo, ator e estado do estorno | API/E2E-M | P1 | |

### 2.7 Estorno: total, parcial, provedor que recusa, cobertura (WB-154, WB-109, SEC-130, 141, 142)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O4-EXT-01 | WB-154 | Dado estornos parciais e o resto, então a soma nunca passa do pago (`REFUND_EXCEEDS_PAID`), cada um auditado e a mesma chave não estorna de novo | API | P0 | |
| O4-EXT-02 | WB-154 | Dado 2 estornos parciais concorrentes que somam mais que o pago, então um falha | CONC | P0 | |
| O4-EXT-03 | PROP | Dado estornos parciais em qualquer partição, então cada lançamento fecha, nenhuma receita fica negativa, o acumulado é independente do caminho e o total estornado zera tudo (menos a tarifa) | PROP | P0 | |
| O4-EXT-04 | RN-10 | Dado estorno parcial, então comissão, entrega, serviço e desconto da plataforma voltam proporcionalmente e a diferença de centavo fica com o lojista; o lojista nunca fica negativo (sem contar a tarifa) | PROP/API | P0 | |
| O4-EXT-05 | SEC-130 | Dado o provedor recusando o estorno, então nova tentativa em 5 min, 30 min, 2 h, 6 h, 24 h, alerta `refund_failed`, na 6ª `refund_exhausted`; usa o token da conta que RECEBEU | API | P0 | SEC-130 |
| O4-EXT-06 | SEC-141 | Dado intenção ainda no provedor, então cobertura da Webag dá 409; o provedor conclui UMA vez | API | P0 | SEC-141 |
| O4-EXT-07 | SEC-142 | Dado financeiro fracionando o estorno, então o limite de R$ 500 vale pela SOMA do pedido e há teto diário por operador; super admin segue podendo | API/CONC | P0 | SEC-142 |
| O4-EXT-08 | SEC-039, WB-109 | Dado perfis, então só super admin e financeiro estornam; suporte, lojista e cliente recebem 403 e nada muda; reautenticação, motivo e `Idempotency-Key` obrigatórios | API | P0 | SEC-039 |
| O4-EXT-09 | RN-08 | Dado estorno que o provedor falha, então fica pendente e a conciliação o conclui (nunca se perde) | API | P0 | |
| O4-EXT-10 | RN-08 | Dado cartão, então o app informa "até 2 faturas"; PIX volta à conta de origem; status do estorno visível | E2E-M | P1 | |

## 3. Critérios de saída da onda 4
Todo P0 de API/CONC/PROP passou com evidência; nenhum bug Crítico aberto; Alto só com decisão do fundador registrada; sandbox do Mercado Pago (O4-PAG-17, O4-FIN-12) e aparelho (O4-PAG-18, O4-PED-12, O4-EXT-10) listados como pendência do fundador.
