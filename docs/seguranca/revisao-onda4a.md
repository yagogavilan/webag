# Revisão de segurança da Onda 4A/4B (pagamento e pedido, back-end)

- **Data:** 2026-11-18 | **Revisor:** security-engineer | **Base:** `main` em `6bbdb2f` (commits `d0054ea`, `1cb99f6`, `fa06951`, `0893f16` "onda 4" e os checkpoints `264a32a`/`6bbdb2f` do painel do lojista). Trabalho do backend-dev não commitado (ledger, tempo real) ficou **fora**.
- **Escopo:** `apps/api/src/modules/payments/*` (adaptador Mercado Pago real com SDK oficial `mercadopago@3.6.2`, fake, webhook, conciliação, estorno), `orders/*` (criação, máquina de estados, painel da loja), `cart` (cotação), `catalog/inventory.service.ts` (reserva), `stores/payment-account.service.ts` (OAuth do lojista), `finance/domain/commission.ts` (split), `platform/config/env.ts`, `platform/crypto/crypto.ts`, redação de log em `app.module.ts`.
- **Referências:** `requisitos-seguranca.md` (SEC-030..048, SEC-060..067, SEC-072), `threat-model-auth-pagamento.md`, `revisao-adrs.md` (SEC-104/105), ADR-002, ADR-010, DEC-014/016/020/032.
- **Status do documento:** parte 1 (leitura de código). Parte 2 (testes e ataques executados) e parecer final abaixo, quando concluídos.

## Achados

| ID | Sev. | Tema | Dono | Status |
|---|---|---|---|---|
| SEC-130 | Alta | Estorno que falha de vez fica `failed` sem alerta nem retentativa; pedido já aparece cancelado | backend-dev | Aberto |
| SEC-131 | Alta | SEC-064 ausente: sem teto de pedidos aguardando pagamento nem de PIX/hora (trava de estoque do concorrente) | backend-dev | Aberto |
| SEC-132 | Alta | SEC-062/DEC-020b ausente: limite de exposição da loja nova não é aplicado (= BUG-009) | backend-dev | Aberto |
| SEC-133 | Média | Cartão aprovado na resposta da criação entra como pago sem a conferência do SEC-034 | backend-dev | Aberto |
| SEC-134 | Média | O gancho do pedido aceita qualquer tentativa com `external_reference` = pedido, sem conferir valor, loja e vínculo | backend-dev | Aberto |
| SEC-135 | Média | Rotas `/v1/dev/payments` ativas em todo `NODE_ENV != production`, sem dono nem papel; risco direto para o staging do DT-038 | backend-dev | Aberto |
| SEC-136 | Média | Cartão com timeout na criação: cobrança pode existir no MP, o webhook é descartado e não há estorno automático | backend-dev | Aberto |
| SEC-137 | Baixa | Validação de assinatura própria em vez do `WebhookSignatureValidator` do SDK (SEC-032) | backend-dev | Aberto |
| SEC-138 | Baixa | Código de retirada de 4 dígitos sem limite de erros por pedido | backend-dev | Aberto |
| SEC-139 | Baixa | `decryptSecret` não fixa o tamanho da tag GCM | backend-dev | Aberto |
| SEC-140 | Baixa | OAuth sem PKCE; erro de renovação de token logado sem máscara; CPF fora do `maskPii` | backend-dev | Aberto |

### SEC-130 | Severidade: Alta | Status: Aberto
- **Onde:** `payments/payments.service.ts:515-523` (erro não-timeout marca a intenção `failed`), `:568-574` (`recoverRefundIntents` só reprocessa `pending`), `orders/orders.service.ts:382-389` (`finishRefund` só faz `logger.warn`), `payments/providers/mercadopago.provider.ts:50-55` e `stores/payment-account.service.ts:152-154` (token resolvido pela conta **ativa atual** da loja, não pela que recebeu).
- **Problema:** o pedido é encerrado (cancelado/recusado/timeout de aceite) e o estorno agendado na mesma transação. Se o provedor recusar o estorno de forma "determinística" (loja desconectou ou trocou a conta MP, revogou o app no painel do MP, token vencido, 401/403/409/4xx), a intenção vira `failed`, ninguém é alertado e nada tenta de novo. O cliente vê o pedido cancelado e o pagamento `approved`, sem o dinheiro.
- **Cenário de ataque:** lojista mal-intencionado (DEC-016, "recebe e não entrega") recebe vários PIX, chama `DELETE /v1/stores/:id/payment-account` (só senha, `stores.controllers.ts:288-293`) ou revoga o app no MP. O timeout de aceite cancela os pedidos; todos os estornos falham em silêncio. Mesmo efeito sem má-fé: dono reconecta com outra conta MP e os estornos/re-consultas dos pedidos antigos passam a usar o token da conta nova (pagamento "não encontrado", recebedor divergente). Impacto: dinheiro do cliente, chargeback, reputação, Procon.
- **Correção recomendada:** (1) gravar na tentativa a conta que cobrou (`payment_account_id` ou `providerAccountId`) e usar os tokens **dela** em `getPayment`/`refund`, mesmo `disconnected` (status desconectado bloqueia só cobrança nova); (2) erro não-timeout no estorno gera `alert('refund_failed', { orderId, attemptId, code })` e o pedido ganha um estado financeiro visível ao admin ("estorno pendente"); (3) retentativa com backoff também para 401/403/409/429, e alerta ao esgotar; (4) desconectar/trocar conta com pedido pago não concluído ou dentro da janela de estorno: bloquear (409) ou exigir liberação do admin; (5) tela/endpoint do admin para concluir o estorno (SEC-039, ainda não implementado) e a cobertura do DEC-020a.
- **Como verificar:** e2e: pedido pago, dono desconecta a conta, loja recusa o pedido → existe alerta `refund_failed` aberto e a intenção continua reprocessável; reconectar a mesma conta e rodar a conciliação → estorno concluído uma vez. Pedido pago, troca de conta MP, estorno → sai com o token da conta original.

### SEC-131 | Severidade: Alta | Status: Aberto
- **Onde:** `orders/orders.service.ts:125-185` (nenhuma contagem de pedidos `awaiting_payment`), `orders/orders.controller.ts:45` (só 30/h **por IP**, `platform/ratelimit/rate-limit.guard.ts:31-39`); `:188-193` conta só pedidos pagos (R-11 recomendava contar pendentes).
- **Problema:** SEC-064 (Must do MVP) não existe: uma conta pode ter dezenas de pedidos aguardando pagamento ao mesmo tempo, cada um reservando estoque por `pix_expiracao_min` (15 min) e até `item_qtd_max` (50) unidades por item.
- **Cenário de ataque:** "pedido falso contra concorrente": 1 conta e 1 IP geram 30 pedidos PIX/h e deixam vencer; com várias contas ou IPs de CGNAT, todo o estoque das lojas-alvo fica "esgotado" sem custo. Também contorna o DEC-014 (conta sem e-mail confirmado abre N pedidos em paralelo e paga todos).
- **Correção recomendada:** na criação, sob `pg_advisory_xact_lock(hashtext('order-create:'||user_id))`: `awaiting_payment` da conta < 2 e PIX gerados na última hora < 5 → senão 429 `TOO_MANY_PENDING_ORDERS`; a regra do DEC-014 conta pagos **+ pendentes**; limite também por dispositivo quando o header de device existir.
- **Como verificar:** 3º pedido pendente → 429; 6º PIX na hora → 429; 5 criações concorrentes da mesma conta → no máximo 2 pedidos pendentes; conta não confirmada com 2 checkouts paralelos → só 1 passa.

### SEC-132 | Severidade: Alta | Status: Aberto
- **Onde:** `cart/cart.service.ts:255` aplica só `pedido_max_cents`; `loja_nova_dias`, `loja_nova_pedidos`, `loja_nova_pedido_max_cents` (`admin/parameters.definitions.ts:62-64`) não são lidos por nenhum código. Mesmo item do `docs/qa/bugs/BUG-009.md` (WB-225).
- **Problema:** o DEC-016 aceitou o split **sem retenção** contando com o teto de exposição da loja nova (DEC-020b: R$ 500, 30 dias ou 20 pedidos). Sem ele, o risco aceito pelo CEO é maior do que o registrado.
- **Cenário de ataque:** loja falsa aprovada vende eletrônico "barato" de R$ 2.000 (teto global) a dezenas de clientes no primeiro dia e some; o dinheiro já está na conta MP dela.
- **Correção recomendada:** blocker `NEW_STORE_LIMIT` na cotação e na criação (mesma base do R-10), com mensagem ao cliente; contador de pedidos entregues e data de aprovação da loja; editável no admin.
- **Como verificar:** casos O2-NOV-04/05 do plano de QA (R$ 500,00 aceito, R$ 500,01 → 422).

### SEC-133 | Severidade: Média | Status: Aberto
- **Onde:** `payments/payments.service.ts:194-211` (`completeCreation` grava `remote.status` e chama `notifyTransition`), comparado com `:383-399` (`sync` confere `mismatches`).
- **Problema:** o cartão captura na criação (`capture: true`, `mercadopago.provider.ts:85`). A resposta `approved` vai direto para "pago" sem conferir valor, moeda, `application_fee` e recebedor. A conciliação pega depois (até 5 min), mas só alerta: o pedido já está pago e o ledger lançado com a comissão esperada.
- **Cenário de ataque:** conta OAuth sem vínculo de marketplace ou `application_fee` ignorada/ajustada pelo MP → Webag perde a comissão em todos os cartões sem bloqueio; token errado → dinheiro em outra conta.
- **Correção recomendada:** em `completeCreation`, se `remote.status === 'approved'`, rodar `mismatches()`; divergente → status `divergent`, alerta `conciliation_mismatch`, sem `notifyTransition`.
- **Como verificar:** teste unitário com o fake devolvendo `approved` e `applicationFeeCents` diferente na criação → pedido não vai a `received` e há alerta.

### SEC-134 | Severidade: Média | Status: Aberto
- **Onde:** `orders/orders.service.ts:430-458` (`onAttemptTransition`/`markPaid`).
- **Problema:** qualquer tentativa cujo `external_reference` seja o UUID de um pedido paga aquele pedido: não confere `attempt.amountCents === order.totalCents`, `attempt.storeId === order.storeId` nem `attempt.id === order.paymentAttemptId` (a linha 434 vincula a primeira que chegar). Em produção só `createOnce` cria tentativas, então hoje não é explorável lá; é a última barreira se surgir "tentar pagar de novo", ferramenta de admin ou outro chamador.
- **Cenário de ataque:** ver SEC-135 (fora de produção, qualquer logado paga pedido alheio com R$ 0,01). Em produção, bug futuro de outro módulo vira pedido pago por valor menor.
- **Correção recomendada:** no gancho, se `order.paymentAttemptId` existir e for diferente, ou se valor/loja divergirem: não pagar, alerta `order_attempt_mismatch` e (se aprovado) estorno automático do SEC-040.
- **Como verificar:** e2e com tentativa de valor menor e `external_reference` = pedido → pedido segue `awaiting_payment`, alerta e estorno.

### SEC-135 | Severidade: Média | Status: Aberto
- **Onde:** `payments/payments.dev.ts:207-260` (`devModulesFor` só exclui `NODE_ENV=production`; rotas exigem só login, sem dono da tentativa nem papel; `GET :attemptId` devolve tentativa de qualquer um com o PIX copia e cola).
- **Problema:** em produção está correto (verificado: módulo não registrado, boot recusa `fake` e `TEST-`). O risco é o ambiente intermediário: o `guia-deploy.md:40` já empurra para "servidor de ensaio", e o DT-038 (DEC-032a) vai criar `APP_ENV=staging` aceitando `fake`. Se esse staging (ou um servidor público com `NODE_ENV=development`) for exposto, qualquer conta aprova pagamento de qualquer pedido, por qualquer valor (combinado com SEC-134), e os segredos `DEV_*` padrão valem.
- **Correção recomendada (requisito para o DT-038):** (1) dev module só com `NODE_ENV in (development, test)` **e** flag explícita `PAYMENTS_DEV_ROUTES=true`; nunca com `APP_ENV=staging`; (2) em staging a simulação, se necessária, fica atrás de `@AdminOnly` + conferência de dono do pedido; (3) staging roda com `NODE_ENV=production` e só relaxa `PAYMENT_PROVIDER=fake`/`TEST-`, mantendo todas as outras travas do `env.ts:131-177`; (4) a tentativa fake só aceita `externalReference` de pedido do próprio usuário.
- **Como verificar:** `production-boot.e2e-spec.ts` estendido: `APP_ENV=staging` → `/v1/dev/payments` 404; staging com segredo `DEV_*` → boot falha.

### SEC-136 | Severidade: Média | Status: Aberto
- **Onde:** `payments/payments.service.ts:178-183` (timeout deixa `creating` sem `providerPaymentId`), `:364-372` (webhook do pagamento é `unknown_payment` → `discarded`), `:676-681` (cartão em `creating` só vira alerta), `orders/orders.service.ts:168-171` (pedido abandonado e estoque liberado).
- **Problema:** se o MP cobrou o cartão e a resposta não chegou, o cliente fica cobrado sem pedido; o webhook que traria o ID é descartado e não há ferramenta de estorno do admin (SEC-039 ainda não implementado).
- **Correção recomendada:** em `recoverCreating` para cartão, buscar no MP por `external_reference` com o token da loja (SDK `new Payment(client).search({ options: { external_reference } })`); achou → grava o `providerPaymentId` e segue o `sync` (pedido já expirado → estorno automático SEC-040). No webhook `unknown_payment`, guardar o evento como `pending` por alguns minutos (não `discarded`) para casar depois da recuperação.
- **Como verificar:** teste com o fake: criação de cartão com timeout mas cobrança criada do lado do provedor → após a conciliação, 1 estorno e nenhum alerta aberto.

### SEC-137 | Severidade: Baixa | Status: Aberto
- **Onde:** `payments/webhook-signature.ts:36-57`; o SEC-032 pedia `WebhookSignatureValidator.validate` do SDK, que existe em `mercadopago@3.6.2` (`dist/utils/webhook`).
- **Problema:** a implementação própria está correta no essencial (HMAC-SHA256, `data.id` da query, `x-request-id` no manifesto, comparação em tempo constante, tolerância de 300 s, corpo ignorado) e é mais estrita que o SDK em `data.id` ausente. Difere em dois pontos: aceita `ts` em milissegundos e põe `data.id` alfanumérico em minúsculas (o SDK não faz nenhum dos dois). Risco é de divergência futura (ex.: `v2`), não de bypass.
- **Correção recomendada:** usar o validador do SDK ou manter o próprio com um teste diferencial contra ele (mesmas entradas, mesmo veredito). Confirmar no sandbox se a reentrega do MP gera `ts` novo; se reutilizar o original, reentregas após 5 min dão 401 e só a conciliação recupera (aceitável, mas registrar).
- **Como verificar:** teste diferencial com 100 entradas aleatórias.

### SEC-138 | Severidade: Baixa | Status: Aberto
- **Onde:** `orders/store-orders.service.ts:182-187`; limite só `store-order-write` 600/h por IP (`store-orders.controller.ts:112`).
- **Problema:** o código de retirada (10.000 valores) não tem limite de erros por pedido. Um membro da loja marca "entregue" sem o cliente em poucas horas, o que esvazia o "não recebi".
- **Correção recomendada:** 5 erros por pedido → bloqueia por 30 min e alerta o admin; contagem em `order_events` ou Redis. Aplicar o mesmo ao código de entrega (SEC-067) quando entrar.
- **Como verificar:** 6º código errado no mesmo pedido → 429 e alerta.

### SEC-139 | Severidade: Baixa | Status: Aberto
- **Onde:** `platform/crypto/crypto.ts:42-44`.
- **Problema:** `createDecipheriv('aes-256-gcm', ...)` sem `authTagLength` aceita tag curta (4 a 16 bytes); quem consegue escrever no banco teria mais chance de forjar um ciphertext de token. Exige acesso de escrita ao banco, por isso Baixa.
- **Correção recomendada:** `createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })` e recusar tag com tamanho diferente de 16 bytes. Rotação: `KEY_VERSION` fixo em `k1` (`payment-account.service.ts:22`); prever leitura de `k1` e gravação de `k2` antes da 1ª rotação.
- **Como verificar:** teste com tag truncada → erro.

### SEC-140 | Severidade: Baixa | Status: Aberto
- **Onde:** `stores/payment-account.service.ts:95-98` (sem PKCE), `:169` (`error.message` cru no log), `platform/logging/mask.ts:6-13` (CPF não mascarado).
- **Problema:** (a) o `state` está correto (256 bits, hash no banco, uso único, 10 min, ligado a usuário, sessão e loja; callback por POST, então `code` não entra no log de acesso), mas sem PKCE uma injeção de `code` depende só do `state`. O SDK 3.6.2 não expõe `code_challenge`; o MP documenta PKCE opcional por aplicação [HIPÓTESE, confirmar no painel do MP]. (b) Mensagem de erro do MP na renovação vai ao log sem `safeErrorMessage`. (c) `maskPii` não cobre CPF (11 dígitos), que vai ao MP no PIX quando exigido.
- **Correção recomendada:** ligar PKCE (S256) se o painel permitir, montando a URL manualmente; `safeErrorMessage` em `:169`; acrescentar CPF/CNPJ ao `maskPii`.
- **Como verificar:** teste de `maskPii('12345678901')` → mascarado; URL de autorização com `code_challenge_method=S256`.

## Controles verificados e corretos (leitura de código)

| Tema | Evidência | Situação |
|---|---|---|
| Assinatura do webhook: `data.id` da **query**, `x-request-id` no manifesto, tolerância 300 s, `timingSafeEqual`, sem `x-signature` → 401, corpo ignorado | `webhook-signature.ts:36-57`, `mercadopago.provider.ts:117-138` | OK (ver SEC-137) |
| Antirreplay e idempotência do evento: único `(provider, event_key)` no banco + atalho Redis 24 h; grava antes de marcar o Redis | `payments.service.ts:271-299`, `db/schema.ts:138` | OK |
| Ordem de eventos: estado vem sempre da re-consulta; máquina só avança; `approved` depois de `refunded` não regride; `UPDATE ... WHERE status = anterior` evita efeito duplo | `payments.service.ts:55-66`, `:364-413` | OK |
| Valor, moeda, referência, comissão e recebedor conferidos antes de aprovar via webhook/conciliação; divergente → `divergent` + alerta | `payments.service.ts:383-423` | OK (falta na criação: SEC-133) |
| Valor calculado no servidor: o corpo do pedido só tem modo, endereço, revisão, método e parcelas (máx. 3); `expectedTotalCents` só compara | `orders.controller.ts:17-35`, `orders.service.ts:130-149` | OK |
| Split e DEC-016: `application_fee` = comissão + taxa de serviço − cupom da plataforma, cupom da plataforma limitado à comissão | `finance/domain/commission.ts:104-121`, `orders.service.ts:212-229` | OK |
| Cartão: só token do Brick; nenhum PAN/CVV no schema, no DTO de entrada (`strictObject`) nem na resposta; texto do provedor nunca repassado; corpo de requisição redigido no log | `orders.controller.ts:24-31`, `payments/db/schema.ts`, `mercadopago.provider.ts:145-155`, `app.module.ts:65-72` | OK |
| CPF do pagador não persistido (só vai ao MP); idempotência guarda só o hash do corpo | `idempotency.service.ts:44-48`, schema sem coluna de documento | OK (SEC-044) |
| Estorno: lock da tentativa, soma <= pago, chave idempotente por estorno, intenção gravada na transação do cancelamento, auditoria na transação que confirma | `payments.service.ts:445-565` | OK (falha definitiva: SEC-130) |
| PIX tardio/pagamento em pedido encerrado → estorno total automático | `payments.service.ts:393-398`, `orders.service.ts:461-470` | OK |
| IDOR: pedido e pagamento do cliente filtram por `userId` (404); painel da loja filtra por `storeId` da rota + `paid_at`, guard de membro (404) e permissão (403); valores só com `sales_values`; código de retirada nunca mostrado à loja | `orders.service.ts:539-603`, `store-orders.service.ts:96-101`, `identity/auth.guard.ts:108-112` | OK |
| Reserva de estoque atômica (`UPDATE ... WHERE stock - reserved >= q`), `CHECK (stock >= reserved)`, cupom com `FOR UPDATE` | `catalog/inventory.service.ts:29-69`, `orders.service.ts:313-324` | OK |
| OAuth: só dono (`payment_account` é owner-only) com reautenticação para iniciar/desconectar; `state` de uso único ligado a sessão e loja; `redirect_uri` de configuração; tokens AES-256-GCM com AAD = loja + versão; renovação com lock por loja; titular divergente → `under_review` | `stores.controllers.ts:264-293`, `payment-account.service.ts:152-253`, `permissions.ts:56` | OK (ver SEC-139/140) |
| Produção: boot falha com `fake`, `TEST-`, segredo `DEV_*`, chave de token ausente; dev module não registrado | `env.ts:131-177`, `payments.dev.ts:259-261` | OK (staging: SEC-135) |
