# Fila prioritária do backend-dev (decidida pelo CEO, DEC-030)

> O backend-dev lê este arquivo ao iniciar qualquer tarefa. Itens por ordem; marque `[x]` ao concluir.

1. [x] I1 a I4 da Onda 2 (`docs/arquitetura/reviews/review-onda2-api.md`): revogar convite de equipe sem tocar convite de outra loja; `activity` com os 50 eventos MAIS RECENTES; cursor de produtos estável; `Idempotency-Key` em `stock` por delta e `bulk` por percentual. Com testes que reproduzem cada falha.
2. [x] I5 a I10 da Onda 2 (locks em horários/feriados, documentos, categoria nula em produto ativo, limite de concorrência do sharp, importação CSV duplicável) e REMOVER o caminho `SEED_ONDA2=true` em produção (DEC-030d): produção só roda o seed base.
3. [x] S9: e2e com banco e Redis de teste por execução (nome/DB index único).
4. [x] N1: auditar estorno concluído pela conciliação (antes da Onda 4A).
5. [ ] I9 / DT-021 (retenção de dados): antes do G4.
6. [ ] DT-028 a DT-034 conforme o plano.

## Acrescentado pelo CEO após o QA da Onda 2 (DEC-031)
7. [ ] BUG-009 (Média, bloqueia G4): WB-225, limite de exposição de loja nova (R$ 500, 30 dias ou 20 pedidos, parâmetros em RN-02) com lógica no pedido/pagamento e API para a tela do admin/lojista. Entra na Onda 4A.
8. [ ] BUG-010 / I8: teto de concorrência no processamento de imagens (sharp).
9. [ ] DT-038 (DEC-032a): modo `staging` (APP_ENV=staging) aceita provedor `fake` e credencial `TEST-` do Mercado Pago; produção recusa os dois. Atualizar env.prod.example e o guia de deploy.
10. [ ] DT-039 (DEC-032b): Sentry plugável na API (sem DSN = desligado), com máscara de PII.

## PRIORIDADE ZERO (DEC-033, veto do Security no pagamento): fazer ANTES do resto da fila
0.1 [x] (feito: backoff 5 min a 24 h, alerta `refund_failed`/`refund_exhausted`, fila `/v1/admin/payments/refund-queue`, retentativa e cobertura do super admin com teto `estorno_cobertura_teto_cents`, token da conta que recebeu) SEC-130: estorno recusado pelo provedor (conta MP da loja desconectada/trocada) NÃO pode ficar `failed` em silêncio: nova tentativa com backoff, alerta ao admin e ao financeiro, fila de pendências visível, e o cliente recebe estorno por outro caminho (cobertura da Webag até o teto, DEC-020a) quando esgotar.
0.2 [x] SEC-131: teto de pedidos pendentes por conta/dispositivo (SEC-064) e expiração da reserva; teste: uma conta não reserva 180 de 200 unidades.
0.3 [x] SEC-132 = BUG-009 = WB-225: teto de exposição da loja nova (R$ 500, 30 dias ou 20 pedidos; parâmetros) aplicado no pedido, com tela/API.
0.4 [x] SEC-134: o pedido só aceita pagamento cujas tentativas ele criou (referência + dono + valor); teste de pagar pedido alheio com R$ 0,01.
0.5 [x] (SEC-133/136/137/138/139/140 feitos; SEC-137 mantém a validação própria com teste diferencial contra o SDK; PKCE ligado por `MP_OAUTH_PKCE`, confirmar no painel do MP) SEC-133 (cartão aprovado na criação confere comissão e recebedor), SEC-136 (timeout de cartão sem pedido: reconciliar/estornar), SEC-137 a 140 (OAuth com PKCE, mascarar erro de refresh e CPF nos logs).
0.6 [x] (feito: `POST /v1/admin/orders/{id}/refunds`) SEC-039: estorno pelo admin (total e parcial) com auditoria, antes do G4.
Depois de 0.x o Security reverifica. NUNCA troque de branch nem faça push fora de `claude/admiring-lamport-62tq1a`.

## MUDANÇA DE MODELO (DEC-035/036, fundador, 2026-11-19): logística da Webag
> O backend-dev lê isto ao iniciar a PRÓXIMA rodada. Antes de codar, ler DEC-036 e os PRDs/regras que o PO vai atualizar (docs/produto/prd/logistica.md quando existir). Não desfazer o que já está certo: a comissão por loja/categoria e o ledger permanecem.
L.1 [x] (feito: módulo `logistics`, `/v1/admin/delivery-fees`, parâmetros `pedido_minimo_cents` e `frete_gratis_acima_cents`, carrinho/feed/prévia leem a tabela, lojista só escolhe entrega/retirada) Parâmetros de frete no admin: tabela de taxa de entrega por região e faixa de distância (cobrada do cliente), pedido mínimo e frete grátis acima de X globais; lojista perde a configuração de taxa/raio próprios (manter só "entrega pela Webag" e "retirada").
L.2 [x] (feito: `application_fee` = comissão + entrega + serviço - cupom da plataforma, conta `delivery_fee_revenue`, exemplo R$ 75,53 / R$ 21,50 em teste) Split/ledger: `application_fee` = comissão + taxa de entrega + taxa de serviço; o lojista recebe itens menos comissão; a taxa de entrega é receita da Webag no ledger; testes numéricos.
L.3 [x] (feito: `/v1/admin/logistics/*`: motoboys, corridas, estados RN-18, atribuição com 1º vence, histórico append-only, custo e lote pago, auditoria, código de entrega, aviso ao cliente por evento do pedido; falta a auto-conclusão de 24 h e o relatório WB-240) Módulo logística: motoboys (CRUD), entregas (uma por pedido de entrega e por coleta de troca), estados (pronto para coleta, aguardando motoboy, motoboy a caminho, coletado/saiu para entrega, entregue, não entregue com motivo), atribuição, histórico, custo por entrega, auditoria, permissão de perfil (operação/super admin), notificação ao cliente a cada mudança.
L.4 [x] (feito: estado `ready_for_collection`, corrida criada na mesma transação, aviso ao admin por alerta `delivery_ready`; o Socket.IO/push entram no item C) Pedido: o lojista só chega até "pronto para coleta"; os estados seguintes são da logística; aviso ao admin em tempo real (Socket.IO/painel) quando um pedido fica pronto.
L.5 [x] Mensagem pronta de WhatsApp (link wa.me) para o motoboy com dados da coleta e entrega; dado pessoal do cliente minimizado (só o necessário, LGPD).

## TROCAS (DEC-037): depois de L.1 a L.5
T.1 [ ] Tipos de troca (arrependimento, defeito, tamanho/cor) com prazos por tipo (7 dias; 30/90 dias; prazo da loja com mínimo e máximo no admin), piso legal fixo (PARAMETER_LOCKED), 1 troca por pedido para tamanho/cor, produtos marcados "sem troca voluntária".
T.2 [ ] Taxa de coleta/reentrega da tabela do admin por região, cobrada só após a aprovação (HIP-D09), gratuita na troca levando à loja; coleta da troca na fila de Logística; reserva do novo tamanho ao aprovar; diferença de preço paga/estornada; aprovação automática após o SLA da loja (parâmetro, 24 h).
T.3 [ ] Reembolso de arrependimento com frete; custo da coleta como custo de logística no ledger; relatório de trocas por loja e categoria.
T.4 [ ] Campo "tabela de medidas" no produto e "como vestiu?" na avaliação (API).
