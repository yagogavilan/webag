---
name: metricas-de-produto
description: Métricas do Webag: North Star e métricas de entrada, AARRR para lojista e consumidor, indicadores de marketplace (liquidez, densidade, take rate), e especificação mínima de eventos de analytics com cuidado de LGPD. Use ao definir métrica de sucesso de PRD, escolher eventos a instrumentar ou avaliar o piloto.
---
# Métricas de produto (PO)

Toda métrica tem: definição exata, fonte (qual tabela/evento), dono, cadência e decisão que ela informa. Sem decisão associada, é métrica de vaidade. Metas numéricas são `[HIPÓTESE]` até haver dado do piloto. Registre em `docs/produto/metricas.md`.

## 1. North Star
Jogo de **transação** (marketplace): a métrica mede trocas bem-sucedidas, não receita nem downloads. Candidata `[HIPÓTESE]`: **pedidos entregues dentro da faixa prometida por semana, por cidade**. Teste (7 critérios): entendida por todos; reflete valor ao cliente e à loja; liga a receita; mensurável; acionável; indicador antecedente; alinhada ao brief.
Métricas de entrada (3 a 5), cada uma movível por uma área:
| Entrada | Mexe com |
|---|---|
| Lojas ativas (1 ou mais pedidos/semana) | oferta, onboarding |
| Conversão sessão para pedido pago | busca, sacola, checkout |
| Recompra em 30 dias | confiança, entrega, trocas |
| % entregues na faixa (DEC-053) | logística, despacho |
| Aceite da loja em até N min | painel do lojista, notificação |
Contra-métricas (guardrails): cancelamento, atraso, estorno, reclamação, troca, tempo de despacho. Não suba a North Star piorando uma delas.

## 2. AARRR por lado
| | Lojista | Consumidor |
|---|---|---|
| Aquisição | visita comercial para aceite; cadastro iniciado | instalação/visita vinda de link da loja, QR, indicação |
| Ativação | 1º produto publicado e 1º pedido aceito | 1º pedido pago (meta do brief: comprar em menos de 2 min) |
| Retenção | loja ativa na semana 4; pedidos/semana | recompra em 30 dias (curva de coorte) |
| Receita | GMV, comissão, contribuição por pedido | ticket médio, frequência |
| Indicação | lojas indicadas por lojas; divulgação do link | pedidos de clientes novos via link/indicação |
Funil: calcule a conversão de cada etapa separada (não só a final) e onde perde mais. Com 5 a 30 lojas, % engana: mostre número absoluto + conversa qualitativa; só use % acima de amostra mínima definida antes `[HIPÓTESE]`.

## 3. Marketplace: densidade e liquidez
Lojas ativas por bairro/cidade; % sessões com loja aberta no raio; tempo até 1º pedido da loja; % pedidos aceitos e entregues; take rate; contribuição por pedido (ver `economia-de-marketplace`). Segmente sempre por cidade (DEC-009) e por loja: média esconde concentração.

## 4. Instrumentação mínima (o PRD de cada funcionalidade lista só os eventos de que precisa)
Fluxo de trabalho: pergunta que a métrica responde, evento, gatilho exato, propriedades, privacidade, teste.
- **Nome:** `snake_case`, padrão `objeto_acao` em passado (`store_viewed`, `item_added`, `checkout_started`, `payment_confirmed`, `order_accepted`, `order_delivered`, `order_canceled`, `merchant_activated`).
- **Gatilho:** diga quando dispara (clicar em "Pagar" ≠ pagamento confirmado). Eventos de dinheiro e status de pedido nascem no servidor (webhook/transição de estado), não no app, para não perder com rede ruim.
- **Propriedades:** nome, tipo, exemplo (`city_id`, `store_id`, `order_id`, `items_count`, `value_cents`, `reason_code`).
- **Privacidade (LGPD, regra do projeto):** nunca nome, e-mail, telefone, endereço ou texto livre em evento; use IDs opacos; finalidade e base legal registradas (`docs/seguranca`); coordene com o `security-engineer`.
- **Teste:** lista de verificação para o QA: dispara uma vez, na hora certa, com as propriedades certas, sem duplicar em reenvio.
Critério de "pronto": evento instrumentado só conta no DoD se estiver no PRD.

## 5. Revisão
Semanal no piloto: North Star, entradas, guardrails e 1 aprendizado. Saída: decisão (manter, mudar, parar) e ação com dono. Relatório sem decisão não é produzido.

## Fontes e licença
- phuryn/pm-skills, skill `north-star-metric` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22. Adaptado: jogo de transação, 7 critérios e métricas de entrada, aplicados ao Webag.
- product-on-purpose/pm-skills, skill `measure-instrumentation-spec` (Apache-2.0, Copyright Jonathan Prisant), consultada em 2026-11-22. Adaptado: passos do plano de rastreio e cuidado com PII, em português e com eventos do Webag.
- AARRR (Dave McClung) e métricas de marketplace: conhecimento geral (inspirado em).
