# Revisão de segurança da Onda 4A/4B (pagamento e pedido, back-end)

- **Data:** 2026-11-18 | **Revisor:** security-engineer | **Base:** `main` em `6bbdb2f` (commits `d0054ea`, `1cb99f6`, `fa06951`, `0893f16` "onda 4" e os checkpoints `264a32a`/`6bbdb2f` do painel do lojista). Trabalho do backend-dev não commitado (ledger, tempo real) ficou **fora**; o `6f3113c` (staging, DT-038), que entrou durante a revisão, foi lido só no que afeta o SEC-135.
- **Escopo:** `apps/api/src/modules/payments/*` (adaptador Mercado Pago real com SDK oficial `mercadopago@3.6.2`, fake, webhook, conciliação, estorno), `orders/*` (criação, máquina de estados, painel da loja), `cart` (cotação), `catalog/inventory.service.ts` (reserva), `stores/payment-account.service.ts` (OAuth do lojista), `finance/domain/commission.ts` (split), `platform/config/env.ts`, `platform/crypto/crypto.ts`, redação de log em `app.module.ts`.
- **Referências:** `requisitos-seguranca.md` (SEC-030..048, SEC-060..067, SEC-072), `threat-model-auth-pagamento.md`, `revisao-adrs.md` (SEC-104/105), ADR-002, ADR-010, DEC-014/016/020/032.
- **Status do documento:** completo (parte 1: leitura de código; parte 2: testes e ataques executados; parecer).

## Parecer: REPROVADO para liberar o checkout do app em produção (G4)

Três achados **Altos** confirmados por teste: SEC-130 (estorno que falha some em silêncio; o cliente fica sem o dinheiro e o admin sem alerta), SEC-131 (sem teto de pedidos pendentes; 1 conta reservou 180 de 200 unidades em segundos) e SEC-132 (teto da loja nova do DEC-020b inexistente, mesmo item do BUG-009). O núcleo do pagamento está **bem feito**: assinatura, antirreplay, re-consulta, conferência de valor/recebedor/comissão, idempotência, IDOR e reserva atômica resistiram a todos os ataques abaixo.

- **Sem objeção** a o mobile-dev integrar o checkout contra o `fake`/sandbox do MP enquanto o back-end corrige, **desde que** o ambiente não seja público até o SEC-135 ser corrigido.
- **Para virar APROVADO COM RESSALVAS:** corrigir SEC-130, SEC-131, SEC-132 e SEC-134 (pequeno e confirmado), com os testes de "Como verificar". O security-engineer reverifica só esses pontos. Os Médios SEC-133, SEC-135 e SEC-136 têm prazo até o G4; o SEC-135 vale **antes de subir o staging** do DT-038 (já commitado em `6f3113c`). Baixos: ondas seguintes.
- **Pendência de escopo (não é achado):** endpoint de estorno do admin (SEC-039) e a cobertura do DEC-020a ainda não existem. Sem eles, os alertas `conciliation_mismatch`, `creation_unresolved` e o SEC-130 não têm como ser resolvidos pela operação. Precisa estar pronto antes do G4.

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
- **Cenário de ataque:** lojista mal-intencionado (DEC-016, "recebe e não entrega") recebe vários PIX, chama `DELETE /v1/stores/:id/payment-account` (dono com reautenticação, `stores.controllers.ts:287-293`) ou revoga o app no MP. O timeout de aceite cancela os pedidos; todos os estornos falham em silêncio. Mesmo efeito sem má-fé: dono reconecta com outra conta MP e os estornos/re-consultas dos pedidos antigos passam a usar o token da conta nova (pagamento "não encontrado", recebedor divergente). Impacto: dinheiro do cliente, chargeback, reputação, Procon.
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
- **Cenário de ataque:** **confirmado por teste** fora de produção: o atacante cria pela rota dev uma tentativa de R$ 0,01 com `externalReference` = pedido da vítima (total R$ 205,00), aprova, e o pedido da vítima vai a `received` (pago), mesmo com outra tentativa já vinculada. Em produção, bug futuro de outro módulo vira pedido pago por valor menor.
- **Correção recomendada:** no gancho, se `order.paymentAttemptId` existir e for diferente, ou se valor/loja divergirem: não pagar, alerta `order_attempt_mismatch` e (se aprovado) estorno automático do SEC-040.
- **Como verificar:** e2e com tentativa de valor menor e `external_reference` = pedido → pedido segue `awaiting_payment`, alerta e estorno.

### SEC-135 | Severidade: Média | Status: Aberto
- **Onde:** `payments/payments.dev.ts:15-61` (rotas exigem só login, sem dono da tentativa nem papel; `GET :attemptId` devolve a tentativa de qualquer um, com o PIX copia e cola) e `:67-70` (`devModulesFor`). Atualizado pelo commit `6f3113c` (DT-038), que entrou durante esta revisão: com `NODE_ENV=production` + `APP_ENV=staging` + `PAYMENT_PROVIDER=fake` o módulo **é registrado** (`app.module.ts:106`), e `infra/docker-compose.prod.yml` aceita `APP_ENV` por variável.
- **Problema:** em produção real está correto (verificado: módulo não registrado; boot recusa `fake` e `TEST-` sem `APP_ENV=staging`; o staging mantém as demais travas de `env.ts:139-186`, o que é bom). Mas o staging fica na internet (o app precisa alcançá-lo) e lá **qualquer conta aprova pagamento de qualquer pedido, por qualquer valor** (confirmado por teste, combinado com SEC-134). E a fronteira entre "staging" e "produção" é uma única variável no mesmo arquivo de env: `APP_ENV=staging` + `PAYMENT_PROVIDER=fake` num servidor com lojistas reais vira "pedido pago sem dinheiro" (o risco que o DEC-032 quis evitar).
- **Correção recomendada:** (1) rotas dev no staging só com `@AdminOnly` (ou papel de testador) **e** conferência de que `externalReference` é pedido do próprio usuário com `amountCents` = total do pedido; fora disso 404; (2) em `APP_ENV=staging`, recusar no boot credencial **de produção** do MP (`APP_USR-` que não seja de usuário de teste) e exigir `API_PUBLIC_URL` diferente do domínio de produção (lista em env), para que staging e produção não possam ser confundidos; (3) e-mails/push do staging com prefixo "[TESTE]" e banner no app; (4) checklist do deploy: staging com banco, Redis, bucket e segredos próprios.
- **Como verificar:** `production-boot.e2e-spec.ts`: staging com `APP_USR-` de produção → boot falha; staging com usuário comum em `POST /v1/dev/payments` → 404/403; com pedido de outro usuário → 404.

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
- **Onde:** `orders/store-orders.service.ts:182-187`; limite só `store-order-write` 600/h por IP (`store-orders.controller.ts:30`).
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

## Parte 2: testes e ataques executados (2026-11-19)

Postgres e Redis reais, provedor `fake` (mesmo caminho de assinatura e re-consulta do real). Os ataques rodaram num spec temporário fora do repositório (não versionado; os cenários estão descritos aqui para o backend-dev transformar em teste de regressão).

| Verificação | Resultado |
|---|---|
| Unitários `payments`, `orders`, `platform/config` (inclui assinatura e mapeamento do MP) | 5 arquivos, 65 testes OK |
| E2E `payments`, `payments-hardening`, `orders`, `production-boot`, `stores-team-payment`, `store-orders` | 85 de 86 OK. A falha é `store-orders` "detalhe..." (404), do checkpoint em andamento do painel do lojista (`6bbdb2f`); não é achado de segurança, avisar o backend-dev |
| Webhook sem `x-signature`, segredo errado, `ts` de 10 min, IPN legado `?topic=&id=`, assinatura de outro `data.id`, `data.id` duplicado na query | 401 em todos, nada enfileirado |
| Mesma notificação 2x + 5 concorrentes + `type` trocado na query; corpo com `data.id` falso | 1 evento gravado, os demais `duplicate: true`; o corpo é ignorado; pedido pago 1 vez (1 evento `received`) |
| Pagamento aprovado com valor 1 centavo menor / recebedor de outra conta / comissão zerada / `external_reference` de outro pedido | Pedido segue `awaiting_payment`, tentativa `divergent`, alerta `conciliation_mismatch` com o campo certo (SEC-034 OK) |
| IDOR: cliente B em `GET/payment/cancel` do pedido de A; dono da loja B pela rota da loja B e pela da loja A (`get`, `refuse`, `accept`) | 404 em todos; pedido de A intacto |
| Corrida pela última unidade (2 pedidos simultâneos) | 201 e 409 `STOCK_CONFLICT`; reservado 1/1 |
| PIX pago depois de o pedido expirar, notificação repetida | 1 estorno total (R$ 45,00), pedido segue `expired` (SEC-040 OK) |
| **SEC-131:** 6 pedidos PIX seguidos da mesma conta | 6 x 201; 180 de 200 unidades reservadas |
| **SEC-130:** pedido pago, provedor recusa o estorno (409 conta indisponível), loja recusa; provedor volta; 2 conciliações | Pedido `refused`, intenção `failed`, 0 estornos, **nenhum alerta**, cliente vê pagamento `approved` |
| **SEC-133:** cartão aprovado na criação com `application_fee` 0 e recebedor errado | 201, pedido `received` (pago) |
| **SEC-134/135:** rota dev, atacante paga pedido alheio com R$ 0,01 e lê a tentativa da vítima | Pedido da vítima `received`; `GET /v1/dev/payments/:id` devolve o PIX copia e cola da vítima |
| Busca de segredos no diff da Onda 4 (`APP_USR-`, `TEST-`, `-----BEGIN`, `client_secret`) | Nada |
| `pnpm audit --audit-level high` | 0 Alta/Crítica (5 Moderadas, de dev, já avaliadas na `revisao-onda1.md`) |

**Não coberto:** chamada real ao Mercado Pago (sandbox não acessível daqui; pendências `[confirmar no sandbox]` do adaptador: `ts` do webhook, qual segredo assina pagamento criado com token do lojista, `application_fee` em `fee_details`, estorno parcial, CPF no PIX, PKCE); ledger e tempo real (não commitados); app mobile (Brick, WebView, 3DS, SEC-037); pentest dinâmico. Pentest externo antes de escalar continua recomendado.

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
| OAuth: só dono (`payment_account` é owner-only) com reautenticação para iniciar/desconectar; `state` de uso único ligado a sessão e loja; `redirect_uri` de configuração; tokens AES-256-GCM com AAD = loja + versão; renovação com lock por loja; titular divergente → `under_review` | `stores.controllers.ts:258-293`, `payment-account.service.ts:152-253`, `permissions.ts:56` | OK (ver SEC-139/140) |
| Produção: boot falha com `fake`, `TEST-`, segredo `DEV_*`, chave de token ausente; dev module não registrado | `env.ts:139-186`, `payments.dev.ts:67-70` | OK em produção real (staging: SEC-135) |
