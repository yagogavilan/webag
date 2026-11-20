# Revisão de segurança e LGPD: logística da Webag (L.1 a L.5) e estorno/cobertura do admin

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `685b21a` (inclui `e1a1d23`, `6a649db`, `17559a3`).
- **Escopo:** `apps/api/src/modules/logistics/*` (motoboys, corridas, estados, atribuição, WhatsApp, custo, tabela de frete), integração com pedidos (`orders.service.ts` L.4/L.5, `store-orders.*`), `payments` (fila de estornos, cobertura DEC-020a), `orders/admin-orders.controller.ts` (SEC-039), `platform/auth/permissions.ts`. **Fora:** trocas (`exchanges/*` só tem regra de elegibilidade; endpoints em andamento), tempo real, app mobile e painel admin web.
- **Referências:** DEC-036 a 039, PRD `docs/produto/prd/logistica.md` (RN-18, WB-229 a 239), `requisitos-seguranca.md` (SEC-039, SEC-062, SEC-067), `revisao-onda4a.md` (parte 3).

## Parecer

**Logística: APROVADA COM RESSALVAS** para seguir ao G4. Nenhuma Alta. O núcleo está bem feito: perfis, atribuição concorrente, código de entrega, tabela de frete sem efeito retroativo, IDOR e auditoria resistiram aos ataques. As Médias SEC-143, 144 e 145 precisam estar corrigidas **antes de a logística operar com clientes reais (G4)**. SEC-141 e SEC-142 (estorno e cobertura) são ressalvas do checkout em produção (ver `revisao-onda4a.md`, Parte 3).

## Achados

| ID | Sev. | Tema | Dono | Status |
|---|---|---|---|---|
| SEC-141 | Média | Cobertura da Webag durante um estorno em andamento: o cliente recebe 2 vezes e o estorno do provedor fica sem registro | backend-dev | Aberto |
| SEC-142 | Média | O limite de estorno do financeiro (R$ 500) é contornado fracionando | backend-dev | Aberto |
| SEC-143 | Média | "Devolvida à loja" é marcada só pela operação, sem a loja confirmar o recebimento, e gera estorno total | backend-dev, product-owner | Aberto |
| SEC-144 | Média | Contato do cliente nas corridas: suporte e financeiro leem telefone e endereço, a leitura não é auditada e o dado nunca é apagado | backend-dev | Aberto |
| SEC-145 | Média | Custo do motoboy: a mesma operação lança o custo (até R$ 1.000) e marca como pago, sem segregação nem alerta | backend-dev | Aberto |
| SEC-146 | Baixa | WhatsApp: dado do cliente fica no aparelho do operador e do motoboy, no link `wa.me` e no histórico; a nota da loja entra na mensagem | product-owner, CEO | Aberto |
| SEC-147 | Baixa | `expectedTotalCents` opcional: frete ou cupom que muda entre a cotação e o pedido é cobrado sem aviso | backend-dev | Aberto |
| SEC-148 | Baixa | A mesma revisão da sacola gera 2 pedidos (e 2 cobranças de cartão) com chaves de idempotência diferentes | backend-dev | Aberto |
| SEC-149 | Baixa | Teto da loja nova é por pedido e termina com 20 entregas que a própria loja pode fabricar (retirada) | backend-dev, product-owner | Aberto |
| SEC-150 | Baixa | Limite do código de retirada (SEC-138) falha aberto se o Redis cair | backend-dev | Aberto |
| SEC-151 | Baixa | Estorno total pelo admin deixa o pedido ativo (`received`); a loja pode preparar e a logística despachar | backend-dev | Aberto |

### SEC-141 | Severidade: Média | Status: Aberto
- **Onde:** `payments/payments.service.ts` `coverRefundIntent` (aceita `pending` com `failures > 0`) e `refundInternal` fase 3 (grava `done` sem conferir o status da intenção).
- **Problema:** a cobertura trava a intenção, mas não sabe se a conciliação ou o "tentar de novo" já está chamando o provedor com ela. Se o estorno do provedor concluir depois da cobertura, o dinheiro sai duas vezes.
- **Cenário de ataque:** **confirmado por teste**: intenção `pending` (1 falha); a conciliação chama o provedor (lento); o super admin cobre (204); o provedor conclui. Resultado: provedor com R$ 85,00 estornados, ledger com R$ 85,00 cobertos pela Webag, `payment_refunds` vazio (a fase 3 falhou e o estorno do provedor ficou **sem registro**) e alerta `refund_covered_payout_pending` pedindo para o financeiro pagar o cliente de novo. Também acontece com um financeiro em "tentar de novo" e o super admin em "cobrir" ao mesmo tempo. Impacto: até o teto (R$ 300) por pedido, mais divergência contábil.
- **Correção recomendada:** (1) cobrir só intenção `exhausted` (não `pending`); (2) antes de chamar o provedor, a fase 2 marca a intenção `in_flight` com `UPDATE ... WHERE status = 'pending'` (lease com validade), e cobrir/tentar de novo recusam `in_flight` com 409; (3) a fase 3 grava SEMPRE o estorno do provedor em `payment_refunds`; se a intenção estiver `covered`, abre alerta `refund_double_paid` e cancela o alerta de repasse por fora.
- **Como verificar:** e2e com provedor lento: cobrir enquanto o estorno está em voo → 409; intenção `pending` com falhas → cobrir dá 409; provedor concluindo depois de `covered` (forçado) → `payment_refunds` com 1 linha e alerta `refund_double_paid`.

### SEC-142 | Severidade: Média | Status: Aberto
- **Onde:** `orders/orders.service.ts` `adminRefund` (compara só o valor da requisição com `estorno_super_admin_cents`).
- **Problema:** o SEC-039 exige super admin acima de R$ 500. O financeiro faz quantos estornos de até R$ 500 quiser no mesmo pedido, até o total pago.
- **Cenário de ataque:** **confirmado por teste**: pedido de R$ 1.205,00; financeiro faz 3 estornos de R$ 400,00 (3 x 200), mas R$ 500,01 de uma vez dá 403. Com conluio de um cliente (insider + amigo): compra, recebe a mercadoria e o financeiro estorna tudo em partes; a loja fica com a dívida no ledger.
- **Correção recomendada:** comparar com o limite a **soma** já estornada ou pendente no pedido mais o novo valor (`refundedOrPendingCents + amountCents`), e não só o valor da requisição; acima disso, só super admin. Opcional: alerta ao super admin no 2º estorno manual do mesmo pedido.
- **Como verificar:** financeiro com 3 x R$ 200 num pedido de R$ 1.000: o 3º (soma R$ 600) → 403 `SUPER_ADMIN_REQUIRED`.

### SEC-143 | Severidade: Média | Status: Aberto
- **Onde:** `logistics/deliveries.service.ts` `act('return_confirmed')` (perfil `logistics:write`) e `orders/orders.service.ts` `onDeliveryChange` (`returned_to_store` cancela com estorno total).
- **Problema:** a devolução à loja é declarada só pela operação; a loja não confirma que recebeu a mercadoria de volta. O pedido é cancelado e o cliente recebe tudo de volta, incluindo o frete (DEC-039e).
- **Cenário de ataque:** **confirmado por teste** (não entregue `customer_absent` → `return_confirmed` → pedido `cancelled`, R$ 85,00 de R$ 85,00 estornados, sem nenhuma ação da loja). Com conluio operação + cliente (ou motoboy + cliente que mente "ausente"), o cliente fica com a mercadoria e o dinheiro; a loja perde o produto e só descobre depois. Também incentiva o cliente fraudador a usar "ausente" repetidamente (custo de 2 corridas para a Webag).
- **Correção recomendada:** (1) `returned_to_store` só depois de a loja confirmar no painel "recebi de volta" (ou de o admin registrar a confirmação da loja com motivo, auditado), com prazo e alerta; até lá a corrida fica `return_pending` e o estorno não sai; (2) contador por cliente de entregas frustradas (`customer_absent`/`customer_refused`): a partir de 2 em 30 dias, alerta e exigência de PIX/retirada [HIPÓTESE, PO define]; (3) o motivo `customer_absent` exige uma tentativa de contato registrada.
- **Como verificar:** `return_confirmed` sem confirmação da loja → pedido continua ativo e nenhum estorno; loja confirma → cancelado e estornado; 3º "ausente" do mesmo cliente → alerta.

### SEC-144 | Severidade: Média | Status: Aberto
- **Onde:** `logistics/logistics.controllers.ts` (`GET /deliveries/:id` e `GET /deliveries/:id/whatsapp` com `logistics:read` = super, operação, **financeiro e suporte**); `deliveries.contact` (jsonb) e `pii_cleared_at` nunca preenchido (nenhum código grava).
- **Problema:** (a) minimização: o financeiro não precisa do telefone e do endereço do cliente para nada; o suporte gera a mensagem pronta do WhatsApp; (b) o PRD (§Regras, LGPD) promete dados "mascarados depois com Revelar auditado", mas nenhuma leitura do contato é auditada; (c) retenção: o contato fica no banco para sempre, duplicando o endereço do pedido.
- **Cenário de ataque:** **confirmado por teste**: suporte recebe 200 com "Cliente: Maria, 11988887777" e o endereço; financeiro vê `contact` no detalhe; após "entregue", `contact` continua no banco com `pii_cleared_at = null`. Um admin de suporte com conta comprometida (ou insider) coleta telefone e endereço de todos os pedidos ativos sem deixar rastro.
- **Correção recomendada:** (1) `GET .../whatsapp` exige `logistics:write`; o detalhe só traz `contact` para `logistics:write` e para o suporte via ação "Revelar" que grava auditoria (`delivery.contact_revealed`, quem, quando, por quê); (2) job de retenção: limpar `contact` (manter bairro/cidade) e gravar `pii_cleared_at` em até 7 dias [HIPÓTESE] após a corrida terminar; o endereço completo já está no pedido para fins fiscais/disputa; (3) a exclusão de conta (WB-215) precisa cobrir `deliveries.contact`.
- **Como verificar:** suporte em `GET /whatsapp` → 403; financeiro no detalhe sem `contact`; "Revelar" gera linha em `audit_log`; corrida terminada há 8 dias → `contact` sem telefone e `pii_cleared_at` preenchido.

### SEC-145 | Severidade: Média | Status: Aberto
- **Onde:** `logistics/deliveries.service.ts` `setCost` e `markPaid`; ambos `logistics:write` (super e operação); `costBody` aceita até R$ 1.000,00 por corrida.
- **Problema:** quem despacha também lança o custo e marca o lote como pago. O pagamento real é PIX fora do app (DEC-036c), feito com base no relatório "a pagar por motoboy". Não há segunda pessoa, nem alerta de custo muito acima do previsto da faixa.
- **Cenário de ataque:** [HIPÓTESE, por leitura de código] operador infla o custo das corridas de um motoboy amigo (ou de um motoboy cadastrado com o próprio telefone) até R$ 1.000 cada; o relatório leva o fundador a pagar. Tudo fica auditado, mas ninguém é avisado.
- **Correção recomendada:** (1) `markPaid` só para financeiro e super admin (segregação: quem lança não aprova); (2) custo acima de 1,5x o previsto da faixa (ou acima de R$ 50 [HIPÓTESE]) exige motivo e gera alerta ao financeiro; (3) teto do `costBody` menor e parametrizável; (4) relatório "a pagar" mostra lançado por quem.
- **Como verificar:** operação em `POST /payouts` → 403; custo de 3x o previsto sem motivo → 422; com motivo → alerta.

### SEC-146 | Severidade: Baixa | Status: Aberto (decisão de produto/jurídico)
- **Onde:** `logistics/domain/whatsapp.ts` e fluxo WB-232.
- **Problema:** o modelo da mensagem está correto e mínimo (1º nome, telefone, endereço de entrega, loja; sem CPF, e-mail, itens, valores ou código; "Pagamento: pago no app. Não cobrar do cliente."), confirmado por teste. O risco que sobra está fora do sistema: (a) a mensagem fica no WhatsApp do operador e do motoboy sem prazo; (b) o link `wa.me/...?text=` leva telefone e endereço na URL (histórico do navegador do operador, extensões); (c) o motoboy reatribuído continua com a mensagem anterior; (d) a `note` da loja (100 caracteres) entra no texto: uma loja pode escrever "cobrar R$ 10 de taxa" (golpe contra o cliente, mitigado pela linha "Não cobrar"); (e) WhatsApp/Meta é operador com transferência internacional (LGPD art. 33) [validar com jurídico].
- **Correção recomendada:** (1) WhatsApp Business num aparelho/número da Webag, não pessoal; (2) termo de confidencialidade do motoboy (apagar a conversa após a entrega, não repassar dados), no mesmo pacote jurídico do DEC-039 (J1 a J13); (3) prefixar a nota como "Obs. da loja:" e manter "Não cobrar" como última linha antes do "OK"; (4) política de privacidade cita o compartilhamento com entregador terceiro e o WhatsApp; (5) fase 2: link com token expirável (DEC-036e) substitui o texto com telefone.
- **Como verificar:** checklist do G5 (política publicada com o item; termo assinado pelos motoboys do piloto); teste unitário da mensagem com a nota prefixada.

### SEC-147 | Severidade: Baixa | Status: Aberto
- **Onde:** `orders/orders.controller.ts:23` (`expectedTotalCents` opcional) e `orders.service.ts:144`.
- **Problema:** a revisão da sacola não muda quando a tabela de frete muda ou o cupom esgota. Sem `expectedTotalCents`, o pedido é criado com o novo total sem aviso. O app oficial envia o campo (`mobile/src/features/checkout/state.ts:86`), então o cliente do app está protegido; cliente de API/versão antiga não.
- **Cenário:** **confirmado por teste**: total visto R$ 55,00; admin muda a faixa para R$ 49,00 de frete; pedido sem o campo → 201 com R$ 99,00. Mesmo efeito no cupom esgotado (é por isso que o teste de cupom do `orders.e2e` falha: o 2º pedido sai sem o cupom e mais caro).
- **Correção recomendada:** tornar `expectedTotalCents` obrigatório no contrato (OpenAPI + Zod), e atualizar o teste de cupom para o comportamento correto (409 `CART_CHANGED` com `DISCOUNT_CHANGED`).
- **Como verificar:** `POST /v1/orders` sem o campo → 400; cupom esgotado entre a cotação e o pedido → 409.

### SEC-148 | Severidade: Baixa | Status: Aberto
- **Onde:** `orders/orders.service.ts:184-189` (a revisão da sacola só sobe depois de criar o pagamento, fora da transação do pedido).
- **Problema/cenário:** **confirmado por teste**: 6 criações simultâneas com a mesma revisão e chaves diferentes → 2 pedidos (o teto do SEC-131 parou o resto). Com cartão, as 2 são cobradas. O app usa a mesma chave para o mesmo corpo (`idempotency.ts`), mas a chave vive só em memória: reiniciar o app no meio e tocar de novo gera chave nova.
- **Correção recomendada:** subir a revisão da sacola (ou marcar a sacola "em checkout") dentro da transação de `insertOrder`, sob o `FOR UPDATE` que já existe; a 2ª criação vê revisão diferente → 409.
- **Como verificar:** 2 criações simultâneas com a mesma revisão e chaves diferentes → 1 x 201 e 1 x 409.

### SEC-149 | Severidade: Baixa | Status: Aberto
- **Onde:** `stores/exposure-limit.ts` e `exposure-limit.service.ts` (conta pedidos `delivered` da loja, de qualquer modo).
- **Problema:** (a) o teto da loja nova é por pedido: no dia 1, 100 pedidos de R$ 500 = R$ 50 mil expostos no split sem retenção; (b) os 20 pedidos que encerram o limite podem ser autocompras de retirada (a loja sabe o código porque ela mesma comprou): cerca de R$ 400 em compras de R$ 20 e R$ 60 de comissão liberam o teto.
- **Correção recomendada:** contar só entregas Webag ou pedidos de clientes distintos com conta antiga; somar um teto agregado de valor pago e não entregue por loja nova [HIPÓTESE R$ 3.000]; alerta de autocompra (mesmo dispositivo/endereço/CPF do pagador e do dono). O PO valida os números.
- **Como verificar:** 20 retiradas do mesmo cliente não encerram o limite; loja nova com R$ 3.000 em aberto → `NEW_STORE_LIMIT` no pedido seguinte.

### SEC-150 | Severidade: Baixa | Status: Aberto
- **Onde:** `orders/store-orders.service.ts` `assertPickupCode` (`.catch(() => 0)` e `.catch(() => null)`).
- **Problema:** com o Redis fora, o contador nunca chega a 5 e o código de retirada volta a ter tentativas ilimitadas.
- **Correção recomendada:** falhar fechado (erro 503 na conferência) ou guardar o contador no Postgres, como o `code_failures` da corrida.
- **Como verificar:** teste com Redis indisponível → conferência recusada.

### SEC-151 | Severidade: Baixa | Status: Aberto
- **Onde:** `orders/orders.service.ts` `adminRefund` (não muda o pedido).
- **Problema/cenário:** **confirmado por teste**: estorno total pelo super admin, pedido continua `received`; a loja pode aceitar, preparar e marcar "pronto", e a logística despachar mercadoria já paga de volta ao cliente.
- **Correção recomendada:** estorno total em pedido não entregue cancela o pedido (ou marca `refunded` e bloqueia "pronto para coleta" e atribuição), com aviso à loja.
- **Como verificar:** estorno total em `received` → pedido `cancelled` e `ready_for_collection` → 409.

## Ataques executados (2026-11-19)

Spec temporário com Postgres e Redis reais e provedor `fake` (não versionado; ver incidente em `revisao-onda4a.md` Parte 3).

| Ataque | Resultado |
|---|---|
| Atribuir a mesma corrida 6 vezes em paralelo (6 motoboys) | 1 x 200 e 5 x 409 `DELIVERY_ALREADY_ASSIGNED`; motoboy final = o vencedor. OK |
| 20 palpites simultâneos do código de entrega | 5 x 422 e 15 x 429 `DELIVERY_CODE_LOCKED`; `code_failures` = 5. OK |
| Alterar frete depois do pedido | Pedido guarda snapshot; vigência no passado → 422 `FEE_TABLE_RETROACTIVE`; edição concorrente → 409 (`delivery-fees.e2e`). OK. Entre a cotação e o pedido: SEC-147 |
| Estorno acima do pago; 3 estornos simultâneos de 70% | 422 `REFUND_EXCEEDS_PAID`; 1 x 200 e 2 x 422; provedor com 70% estornado. OK |
| Estorno fracionado pelo financeiro | SEC-142 |
| Cobertura com estorno em voo | SEC-141 |
| Webhook repetido e fora de ordem após estorno total | Tentativa segue `refunded`, sem alerta nem regressão. OK |
| Tentativa de outra loja com o valor certo e `external_reference` do pedido | Pedido não pago, alerta `order_attempt_mismatch`, 1 estorno. OK |
| IDOR: cliente B no acompanhamento do pedido de A; loja B no pedido de A | 404 (`order-logistics.e2e`, `store-orders.e2e`). OK |
| Suporte/financeiro lendo contato do cliente | SEC-144 |
| Devolução à loja sem a loja | SEC-143 |

## Controles verificados e corretos

| Tema | Evidência |
|---|---|
| Perfis: `logistics:write` só super e operação; financeiro e suporte só leem; tabela de frete grava só super e financeiro; estorno manual super e financeiro (acima do limite só super, com SEC-142); cobrir estorno só super; tentar de novo super e financeiro; reautenticação em estorno, retry e cobertura | `permissions.ts:44-56`, `rbac.e2e` (matriz), `logistics.e2e`, `delivery-fees.e2e`, `refund-queue.e2e` |
| Atribuição: `FOR UPDATE` + `UPDATE ... WHERE status = 'ready_for_collection'`; motoboy inativo recusado; endereço incompleto exige confirmação | `deliveries.service.ts:213-241` |
| Máquina de estados da corrida e do pedido: a loja não marca "saiu" nem "entregue" na entrega Webag; transição revalidada sob lock; voltar exige motivo | `logistics/domain/state.ts`, `orders/domain/state.ts:44-51`, `deliveries.service.ts:272-313` |
| Código de entrega: `randomInt`, ligado por padrão (`codigo_entrega`), nunca aparece para admin nem loja, para o cliente só a partir de "saiu para entrega", apagado ao entregar; 5 erros bloqueiam; sem código só super admin com motivo | `deliveries.service.ts:98,300,315-325`, `logistics.controllers.ts:61`, `orders.service.ts:775` |
| Tabela de frete: versão nova a cada gravação, sem retroativo, até 90 dias à frente, faixas contíguas até o raio, taxa máx. R$ 50, lock por escopo e versão esperada (409), auditoria com faixas; pedido guarda snapshot; `application_fee` = comissão + entrega + serviço − promoção da plataforma, conferida pelo SEC-034 | `delivery-fees.service.ts:166-195`, `fees.ts`, `commission.ts:106-108` |
| Mensagem de WhatsApp mínima e sem quebra de linha injetada; "Não cobrar do cliente"; telefone só com motoboy atribuído e corrida ativa | `whatsapp.ts`, `deliveries.service.ts:244-252`, `logistics.e2e` |
| Loja vê só o estado da corrida e o 1º nome do motoboy; cliente vê 1º nome, sem telefone | `store-orders.service.ts`, `orders.service.ts:768-783` |
| Auditoria: toda mudança de corrida grava evento append-only (trigger testado) e `audit_log` na mesma transação; custo preserva o valor anterior; cobertura, retry e estorno auditados | `deliveries.service.ts:327-331,340-353`, `payments.service.ts` |
| Motoboy: só nome, telefone, observação e aceite "documentos conferidos" (sem CPF nem upload); troca de telefone auditada com antes e depois | `logistics/db/schema.ts`, `couriers.service.ts` |

## LGPD da logística (insumo para `docs/seguranca/lgpd.md` e jurídico)

| Dado | Titular | Finalidade | Base legal [validar com jurídico] | Onde fica | Retenção recomendada |
|---|---|---|---|---|---|
| 1º nome, telefone, endereço de entrega | Cliente | Executar a entrega | Execução de contrato (art. 7º, V) | `deliveries.contact`, WhatsApp do operador e do motoboy | Banco: 7 dias após a corrida (SEC-144); WhatsApp: apagar após a entrega (termo, SEC-146) |
| Nome e telefone | Motoboy | Despacho e pagamento | Execução de contrato (art. 7º, V) | `couriers` | Enquanto houver relação + prazo fiscal; anonimizar a pedido (WB-231 C4) |
| Custo e pagamento por corrida | Motoboy | Relatório e pagamento | Obrigação legal/fiscal (art. 7º, II) | `deliveries`, `delivery_events` | 5 anos [HIPÓTESE, contador confirma] |

Pendências: política de privacidade citar o entregador terceiro e o WhatsApp (SEC-146); exclusão de conta (WB-215) cobrir `deliveries.contact`; Data Safety/App Privacy: "compartilhado com prestadores de entrega".

## Não coberto

Trocas ("Retira Troca") e tempo real (em andamento); painel admin web e app; chamada real ao Mercado Pago; pentest dinâmico. Revisar as trocas quando os endpoints forem commitados (taxa de troca cobrada só após aprovação, estorno de diferença, coleta ligada à troca certa, IDOR da troca).
