# ADR-002: Modelo de pagamento do marketplace

- **Status:** Aceita (pendente parecer do security-engineer sobre guarda de tokens OAuth e webhook)
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** security-engineer, backend-dev, product-owner (regras de comissão/estorno)

Legenda de fontes: ver ADR-001.

## Contexto
Brief §4: camada `PaymentProvider` independente de provedor; adaptador Mercado Pago completo (PIX, cartão tokenizado, estorno total/parcial, webhook assinado, idempotência, reprocessamento, conciliação); pesquisar split do MP com OAuth e, se não servir, recebimento centralizado com repasse; avaliar Pagar.me/Asaas. Fatos que pesam: **uma loja por pedido** (DEC-006), comissão por loja/categoria + taxa de serviço (DEC-008), lojista pequeno (muitas vezes MEI), "Retira Troca" e provedor simulado obrigatório. O PO sinalizou (`docs/produto/pesquisa-mercado.md` §6; risco 2 do `backlog.md`) dois riscos que este ADR precisa tratar explicitamente: o split exige que o lojista tenha conta e KYC no provedor, e o recebimento centralizado com repasse pode ser atividade regulada.

## Opções consideradas
| Opção | Prós | Contras | Custo/complexidade |
|---|---|---|---|
| **A. Split MP 1:1 via OAuth** — pagamento criado com o token do lojista e `application_fee` para a Webag | Dinheiro cai direto na conta MP do lojista; Webag **não custodia recurso de terceiro**; liquidação e repasse feitos pelo MP; casa com "uma loja por pedido"; PIX e cartão; `public_key` do lojista vem no OAuth para tokenizar cartão [V SDK] | Lojista precisa de conta MP **verificada (KYC do próprio MP: CPF ou CNPJ, documento e validação de identidade)** e com chave PIX cadastrada [N]; Webag não segura dinheiro para disputa/troca; tokens OAuth dos lojistas viram segredo de alto valor | Médio: fluxo OAuth + refresh de token |
| B. Recebimento centralizado na conta MP da Webag + repasse | Onboarding só pede chave PIX; Webag controla prazo de repasse e retenção para trocas | Webag passa a receber e repassar dinheiro de terceiros: risco de enquadramento como instituição de pagamento/subcredenciador (Lei 12.865/2013; Res. BCB 150/2021) [N]; risco tributário de faturamento sobre o bruto `[HIPÓTESE — validar com contador]`; tarifa do MP sobre o total cai na Webag; repasse é operação manual diária (API de payout do MP não é de acesso geral `[verificar]`) | Alto em operação e risco jurídico |
| C. Pagar.me marketplace (recebedores + regras de split) | Modelo marketplace nativo: recebedor com KYC por link, split por valor/percentual, quem paga a taxa e quem assume chargeback configuráveis (`liable`, `charge_processing_fee`), cancelamento por regra de split [V SDK] | Exige contrato comercial e aprovação da conta marketplace; sem conta não dá para testar o fluxo real | Médio + dependência comercial |
| D. Asaas (subcontas + split por `walletId`) | Instituição de pagamento autorizada; subconta criada por API; split fixo/percentual em PIX, boleto e cartão [N] | Sem SDK oficial no npm [V]; subconta é conta financeira completa por lojista (KYC próprio); taxas a confirmar [N] | Médio + dependência comercial |

### Risco regulatório do recebimento centralizado (opção B)
- **Fato:** a Lei 12.865/2013 (art. 6º) define instituição de pagamento como quem, entre outras atividades, recebe pagamentos e transfere recursos de terceiros; a autorização e o funcionamento dessas instituições são regulados pelo Banco Central (Res. BCB 80/2021) e os arranjos/subcredenciadores pela Res. BCB 150/2021 [N].
- **Hipótese:** um marketplace que recebe o total na própria conta e repassa ao lojista pode ser enquadrado como subcredenciador ou exercer atividade de instituição de pagamento sem autorização; há limites de volume e exceções que dependem de leitura jurídica `[HIPÓTESE — exige parecer jurídico; não é decisão técnica]`.
- **Hipótese tributária:** valores de terceiros transitando na conta da Webag podem ser tratados como receita bruta se a contabilidade não segregar `[HIPÓTESE — validar com contador]`.
- **Conclusão:** a opção B **não é usada com dinheiro real** sem parecer jurídico registrado em `docs/decisoes.md` e autorização do fundador. O split (A, C ou D) transfere a custódia e o KYC para uma instituição autorizada, que é o motivo central da escolha.

## Decisão
**Opção A — split 1:1 do Mercado Pago via OAuth, com `application_fee`**, atrás da interface `PaymentProvider`, com dois adaptadores na 1.0: `mercadopago` e `fake`. **Não** implementar Pagar.me/Asaas na 1.0: sem conta comercial seria código especulativo e não testável; a interface já prevê o modelo "recebedor" para entrar depois.

### Desenho
1. **Conexão do lojista** (onboarding): botão "Conectar Mercado Pago" → OAuth authorization code (`state` assinado, ligado à loja e ao usuário) → troca do `code` por `access_token`, `refresh_token`, `public_key`, `user_id`, `expires_in` [V `OAuthResponse`]. Guardar em `merchant_payment_accounts` com tokens cifrados (AES-256-GCM, chave `PAYMENT_TOKEN_ENC_KEY` com id de versão para rotação). Job diário renova tokens que vencem em < 30 dias. **Loja não é publicada sem conta conectada** (exceto com provedor `fake`).
2. **API do MP:** Payments API (`POST /v1/payments`) com o token do lojista, `application_fee` (comissão + taxa de serviço calculadas pelo módulo `finance`), `external_reference` = id do pedido, `notification_url` da Webag e header `X-Idempotency-Key` = id da tentativa de pagamento. A Orders API (`/v1/orders`, campo `marketplace_fee`) existe no SDK [V], mas é mais nova: reavaliar dentro do adaptador sem mudar o domínio.
3. **PIX:** QR + copia-e-cola da resposta; `date_of_expiration` = agora + 15 min (HIP-006, configurável no admin entre 5 e 60); o app nunca marca como pago (status vem do servidor).
4. **Cartão:** não existe SDK oficial do MP para React Native (só `@mercadopago/sdk-react` para web) [V npm]. O app abre, em WebView, uma página de `apps/web` (`/pagamento/cartao/[tentativa]`) com o **Card Payment Brick** inicializado com a `public_key` do lojista; o token do cartão vai direto para a API, ligado à tentativa por um token de uso único. O app e a API nunca veem número de cartão. Plano B se 3DS/WebView falharem no sandbox: Checkout Pro (preferência com `marketplace_fee`) em navegador do sistema. **Autorizar e capturar no aceite (HIP-010):** a criação aceita `capture: false` e há operação de captura no SDK [V]; se a combinação com `application_fee` falhar no sandbox `[verificar]`, cai para captura imediata + estorno na recusa, como a própria HIP-010 prevê. PIX não tem pré-autorização: é sempre cobrança imediata.
5. **Webhook:** `POST /v1/webhooks/mercadopago` valida `x-signature` (HMAC-SHA256 sobre `id`, `x-request-id` e `ts`; usar `WebhookSignatureValidator` do SDK oficial [V]) → responde 200 rápido → job BullMQ busca o pagamento **na API do MP** com o token do lojista (mapeado pelo `collector_id`) → transição idempotente (único `(provider, provider_payment_id)` + máquina de estados que ignora transição repetida ou regressiva).
6. **Conciliação:** job a cada 5 min para tentativas pendentes > 2 min; varredura diária das últimas 48 h comparando status, valor e `application_fee`; divergência vira alerta no admin.
7. **Estorno total/parcial:** Refunds API com o token do lojista [V `paymentRefund`]. O que acontece com a `application_fee` no estorno parcial **precisa ser confirmado no sandbox** `[verificar]`; a regra de negócio (comissão devolvida ou não) é do PO e fica configurável.
8. **Financeiro:** `ledger_entries` por pedido (bruto, tarifa do provedor via `fee_details`, comissão, taxa de serviço, líquido do lojista). A tela "repasses" do lojista mostra a `money_release_date` do MP — quem repassa é o MP, não a Webag.
9. **Provedor `fake`:** gera PIX falso (string marcada como TESTE), aprova/recusa por endpoint de dev (`/v1/dev/payments/{id}/approve|reject`, existe só com `PAYMENT_PROVIDER=fake` e `NODE_ENV!=production`) e dispara o **mesmo pipeline de webhook**, assinado com segredo local. O caminho testado em dev é o de produção.
10. Troca simulado → real só por `.env` (`PAYMENT_PROVIDER=mercadopago` + credenciais).

### Interface (contrato interno, resumida)
`capabilities()`, `connectMerchant()` / `completeConnection()`, `createPixCharge()`, `createCardCharge()`, `getPayment()`, `refund(amount?)`, `verifyWebhook()` / `parseWebhook()`. O domínio só conhece estados próprios (`pending`, `authorized`, `paid`, `failed`, `expired`, `refunded`, `partially_refunded`, `charged_back`).

## Consequências
- Positivas: sem custódia de dinheiro de terceiros nem operação diária de repasse; menor risco regulatório e tributário; o mesmo pipeline roda simulado ponta a ponta.
- Negativas / dívida:
  - Atrito no onboarding: lojista precisa de conta MP com chave PIX `[HIPÓTESE: boa parte do pequeno varejo da região já usa MP/maquininha]`. Medir % de lojas que param no passo "Conectar Mercado Pago".
  - Webag não retém valores para trocas e disputas; estorno sai do saldo do lojista (comportamento com saldo insuficiente `[verificar]`).
  - Tokens OAuth de lojistas: cifrados, acessados só pelo módulo `payments`, nunca em log; revisão do security-engineer obrigatória.
- Depende do fundador: conta MP da Webag, aplicação criada no painel de desenvolvedor (Client ID/Secret, redirect URI do OAuth, segredo de webhook). Sem isso roda o `fake`.
- **Conflitos com hipóteses e PRD (encaminhar ao PO):** HIP-015 e `prd/admin.md` C3/C4 descrevem repasse semanal e "repasse retido até a decisão da disputa"; no split quem libera é o MP (`money_release_date`), então a Webag **não consegue reter** além do prazo do provedor. No split, o lote de repasse é só informativo (como o próprio C3 prevê) e a disputa se resolve por estorno no saldo do lojista. HIP-030 "conta de recebimento ativa" = conta MP conectada por OAuth.
- Reavaliar (gatilho para o 2º adaptador Pagar.me ou Asaas): > 30% das lojas aprovadas sem conseguir conectar o MP em 7 dias; MP negar o uso marketplace da aplicação; necessidade de reter valores por política de trocas; taxa negociada claramente melhor.

## Fallback (ordem de recurso se o split do MP não servir)
| Situação | Fallback | Custo de mudar |
|---|---|---|
| Lojista não consegue conta/KYC no MP | Ajuda guiada no onboarding (passo a passo de abrir conta MP pelo celular); loja fica "aguardando conta de recebimento" | Nenhum código novo |
| > 30% das lojas aprovadas sem conectar em 7 dias, ou MP nega uso marketplace da aplicação | **2º adaptador de split com KYC delegado**: Pagar.me (recebedor com link de KYC) ou Asaas (subconta por API). Ambos são instituições reguladas e fazem a custódia | Novo adaptador atrás de `PaymentProvider`; domínio, ledger e webhook genérico não mudam |
| Nenhum provedor de split viável | Recebimento centralizado (B) **só** com parecer jurídico + autorização do fundador em `docs/decisoes.md`; até lá, existe apenas no provedor `fake` para não travar o produto | Adaptador + rotina de repasse com dupla aprovação no admin (já prevista em `prd/admin.md` C3) |

O modelo de dados (`merchant_payment_accounts.provider`, `ledger_entries`, `payout_batches`) é o mesmo nos três caminhos; só o adaptador e quem executa o repasse mudam.

## Fontes
- [V] `mercadopago` 3.6.2 (`PaymentCreateRequest.capture`, cliente `payment/capture`)
- [V] `mercadopago` 3.6.2 (SDK Node oficial, tipos): `PaymentCreateRequest.application_fee`, `sponsor_id`; `OAuth.create/refresh/getAuthorizationURL` e `OAuthResponse` (`access_token`, `refresh_token`, `public_key`, `user_id`, `expires_in`); `CreateOrderRequest.marketplace_fee`; `AdvancedPayment.disbursements` (split multi-recebedor); `paymentRefund` (total/parcial); `utils/webhook` (`x-signature`, `ts`, `v1`, `x-request-id`, `data.id`).
- [V] `@pagarme/pagarme-nodejs-sdk` 7.0.2: `CreateSplitRequest` (`recipientId`, `amount`, `type`), `CreateSplitOptionsRequest` (`liable`, `chargeProcessingFee`), `createKYCLinkResponse`, `createCancelChargeSplitRulesRequest`.
- [V] npm: não há SDK oficial do Asaas nem SDK React Native do Mercado Pago; `@mercadopago/sdk-react` 1.1.0 = Bricks para React web.
- [N] https://www.mercadopago.com.br/developers/pt/docs/split-payments/landing ; https://www.mercadopago.com.br/developers/pt/docs/security/oauth ; https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks ; https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/introduction ; https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post ; https://www.mercadopago.com.br/custos-e-tarifas
- [N] https://docs.pagar.me/docs/split ; https://docs.asaas.com/docs/split-de-pagamentos
- [N] Lei 12.865/2013 — https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12865.htm ; Resolução BCB nº 150/2021 (arranjos de pagamento) e Resolução BCB nº 80/2021 (instituições de pagamento) — https://www.bcb.gov.br/estabilidadefinanceira/buscanormas
- Interno: `docs/produto/pesquisa-mercado.md` §6 (KYC do vendedor no split, "nível 6" `[confirmar]`), `backlog.md` risco 2, WB-155.
