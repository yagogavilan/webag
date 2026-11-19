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
T.1 [x] (feito: regras puras de prazo/elegibilidade em `modules/exchanges/domain`, parâmetros de prazo min/max, SLA 24 h, limite por pedido, piso legal travado; falta o módulo de solicitações) Tipos de troca (arrependimento, defeito, tamanho/cor) com prazos por tipo (7 dias; 30/90 dias; prazo da loja com mínimo e máximo no admin), piso legal fixo (PARAMETER_LOCKED), 1 troca por pedido para tamanho/cor, produtos marcados "sem troca voluntária".
T.2 [ ] (regras de taxa/diferença/SLA prontas e testadas em `eligibility.ts`; PENDENTE: tabelas e fluxo da solicitação, reserva do novo tamanho, cobrança da taxa, corrida COLETA_TROCA/REENTREGA na fila) Taxa de coleta/reentrega da tabela do admin por região, cobrada só após a aprovação (HIP-D09), gratuita na troca levando à loja; coleta da troca na fila de Logística; reserva do novo tamanho ao aprovar; diferença de preço paga/estornada; aprovação automática após o SLA da loja (parâmetro, 24 h).
T.3 [ ] Reembolso de arrependimento com frete; custo da coleta como custo de logística no ledger; relatório de trocas por loja e categoria.
T.4 [x] (feito: `sizeChart` e `noVoluntaryExchange` no produto, `fit` na avaliação; falta o endpoint de CRIAR avaliação) Campo "tabela de medidas" no produto e "como vestiu?" na avaliação (API).

## DEC-043: achados do Security na reverificação do pagamento e da logística
P.1 [ ] ANTES DO 1º CLIENTE REAL: SEC-141 (cobrir estorno que ainda está no provedor faz o cliente receber 2 vezes: bloquear cobertura enquanto houver tentativa pendente no provedor, com teste) e SEC-142 (o limite de R$ 500 do financeiro não pode ser contornado fracionando o estorno: limite acumulado por pedido/dia).
P.2 [ ] ANTES DO G4: SEC-143 (devolução à loja marcada só pela operação não pode estornar tudo), SEC-144 (leitura de telefone e endereço do cliente por suporte e financeiro com auditoria; apagar/anonimizar o dado após a conclusão, prazo LGPD), SEC-145 (separação de funções: quem lança o custo do motoboy não marca como pago), SEC-147 (total esperado obrigatório na criação do pedido).
P.3 [ ] Corrigir o teste de cupom em `orders.e2e` (2º pedido sai sem cupom e mais caro: alinhar o teste ao comportamento correto do limite).

## Estado após a rodada 2026-11-19 (CEO)
- [x] T.2/T.3 (trocas), T.4, tempo real Socket.IO, push Expo, API do painel de pedidos e financeiro do lojista, seed (15%, frete, pedidos de demo): FEITOS (commit a3c17ec).
- Abertos: P.1 a P.3 (segurança, antes do 1º cliente real/G4), DT-049 (taxa de troca e custo da coleta no ledger), DT-050 (lembretes 12 h e 4 h, mediação e contestação), relatório WB-240, revisão do Security sobre os guards HTTP que passaram a ignorar WebSocket.

## Lacunas de contrato apontadas pelo app real (2026-11-19, mobile-dev) — próxima rodada do backend
B.1 [ ] Troca: expor a diferença de preço (pagar/receber), o prazo final "até DD/MM" já na entrada de troca do pedido, ação "levar à loja" depois de aprovada, contestação de recusa e "não recebi meu pedido" (contrato hoje não oferece).
B.2 [ ] Cartão em produção: o app só oferece PIX porque a página segura do Mercado Pago (Bricks/3DS) não existe. Backend: endpoint de criação de intenção de cartão para a página segura; web: rota pública `/pagar/cartao` (apps/web, sem login do painel, SEC-106). Ver pendencias-contrato-mobile.md itens 9 a 16.

## ONDA 6 do back-end (DEC-045): prioridade depois de P.1 a P.3
O6.1 [ ] **BLOQUEIA G5:** exportar meus dados (arquivo, assíncrono, link seguro, só com senha/step-up) e excluir conta (WB-213/214, SEC-096: só senha; anonimização do que a lei obriga a reter, prazos fiscais), pedidos de titulares (DSR) com fila no admin (docs/produto/prd/lgpd.md).
O6.2 [ ] Realtime por ticket de uso único (`POST /v1/realtime/tickets`, 60 s, atrelado a usuário e loja/admin) e `commissionPct` na API da loja; rotas de disputa/mediação de troca para o admin (AT3); "Revelar contato" com auditoria (SEC-144); série de vendas por dia para o gráfico do lojista.
O6.3 [ ] Push segmentado do admin (WB-197: segmento mínimo `push_mkt_min_segmento`, consentimento de marketing, agendamento) e banners/destaques/cupons da plataforma que faltarem; textos legais já existem.
O6.4 [ ] Relatórios do admin: pedidos, GMV, novas lojas, novos clientes, recompra, cancelamentos, com filtros e exportação CSV (brief §3.3).
O6.5 [ ] Ajuda do cliente e do lojista (WB-227), denúncia de produto/loja e moderação, avaliação de resposta do lojista; B.1 e B.2 (cartão seguro) da seção anterior.

## Correções da revisão do tech-lead (DEC-047) — fazer logo após O6.1; antes de o QA fechar as ondas 3 a 5
R.1 [ ] I5/SEC-148: impedir 2 pedidos e 2 cobranças (trava + Idempotency-Key no pedido); I8: pagamento da troca com trava e Idempotency-Key.
R.2 [ ] I1: Idempotency-Key não deve repetir por 24 h erros de estado (loja fechada, 429), só resultados definitivos.
R.3 [ ] I2: tornar chargeback visível (evento, estado do pedido, alerta ao admin e ao financeiro, lançamento no ledger); I3: tarifa do provedor recuperável se faltar na 1ª leitura.
R.4 [ ] I4: reembolso de troca com cupom de frete grátis; I6: UMA definição de "líquido da loja" usada em resumo, extrato e a receber; I12: diferença de preço da troca por pagamento com split (DEC-047) e ADR-011.
R.5 [ ] I7: ordem global de locks (corrida, pedido, troca) sem deadlock, com teste de concorrência; I10: `disconnectSession` na revogação de sessão e limite de taxa por mensagem WebSocket (e `@SubscribeMessage` novo nascer protegido).
R.6 [ ] I9: eliminar N+1 nas listas de pedidos e usar `/rt` com o ticket no painel (O6.2); DT-053 a 058.
R.7 [ ] Frontend (mobile-dev, depois): I11 PIX vencido pelo relógio do servidor e um único socket compartilhado no app.

## Bugs do QA das ondas 3 a 5 (DEC-048) — junto com R.1 a R.7
Q.1 [ ] BUG-011 (ALTA, bloqueia G4): rota do admin para cancelar pedido; estorno total manual deve cancelar o pedido (estado, estoque devolvido, corrida cancelada, auditoria) e a loja não pode mais aceitar; SEC-151 reclassificado para Alta.
Q.2 [ ] BUG-016: horário e pausa da logística (`logistica_horario`, "pausar entregas") valendo no pedido e no app; BUG-012: cancelar corrida não deixa o pedido parado.
Q.3 [ ] BUG-014 (retirada 48 h), BUG-015 (rotas de "não recebi meu pedido" e "pedir cancelamento"), BUG-017 (parâmetros do admin sem efeito: listar quais e ligar), BUG-018 ("Mais vendidos" na descoberta), BUG-013/SEC-148, BUG-019 (testes frágeis por horário/ordem e `seed-orders`).
Os testes `it.fails` de `apps/api/test/qa-onda3-5-lacunas.e2e-spec.ts` ficam vermelhos quando a correção entra: troque para `it` normal.

## Estado após a Onda 6 (CEO, 2026-11-19)
- [x] FEITOS: O6.1 a O6.5, B.1, B.2, DT-052 parcial (commits da Onda 6; ADR-012).
- ABERTOS, nesta ordem: Q.1 (BUG-011, ALTA, bloqueia G4), R.1 a R.6 (revisão do tech-lead), Q.2 e Q.3 (bugs do QA), DT-059 a DT-064.
- Frontend pendente: página pública `/pagar/cartao?i=<token>` (apps/web), `POST /v1/me/push-campaigns/{id}/opened` no app, I11 (R.7).

## SEGURANÇA DA ONDA 6 (DEC-050) — logo após Q.1; SEC-155 bloqueia o G4
S6.1 [ ] SEC-155 (ALTA): conferir `firstPurchaseOnly` do cupom no servidor (e-mail confirmado + nenhum pedido pago anterior do mesmo dispositivo/telefone/endereço/documento, SEC-060); proibido criar cupom desse tipo até a correção.
S6.2 [ ] SEC-152 (via código da página web não revela se a conta confirmada existe), SEC-153 (via por senha respeita o step-up), SEC-156 (CSV: escapar fórmula em todos os campos de texto livre: =, +, -, @, tab, CR), SEC-157 (derrubar sockets na exclusão e revogação), SEC-158 (anonimização também em texto livre: notas, endereços, motivos, mensagens), SEC-154 (arrependimento padrão 72 h, parâmetro editável), SEC-160 (alerta quando a anonimização falhar), SEC-159 (truncar IP /24 e /48 na anonimização).
S6.3 [ ] Baixas SEC-161 a 165 e 167 conforme o tempo. Transformar os ataques A1 a A6 do `revisao-onda6.md` em testes e2e do repositório.

## ENTREGA EM ATÉ 2 H (DEC-053) — fazer junto com Q.1 e S6 (alta prioridade de produto)
E.1 [ ] Cálculo de ETA por loja e endereço: preparo (por loja, padrão 20 min) + despacho (padrão 15) + deslocamento (distância PostGIS × 1,3 × `entrega_min_por_km`, padrão 6); faixa ±15 min; teto `entrega_max_min` = 120: acima disso a loja não entrega para esse endereço; parâmetros novos em RN-02 e editáveis no admin; expor a faixa na descoberta, loja, produto, sacola, checkout e pedido (e recalcular na criação do pedido: `expectedTotalCents` e ETA no contrato).
E.2 [ ] Logística: alerta de atraso quando passa do fim da faixa do pedido (substitui `logistica_alerta_entrega_min`); lotes de corrida (mesma área); o "Chega entre" do pedido nasce do ETA e é atualizado conforme a atribuição e o status.

## AJUSTE DE E.1 (DEC-054, prioridade alta)
E.3 [ ] O teto `entrega_max_min` = 120 vale para o FIM da faixa (estimativa + `entrega_faixa_min` de folga <= 120), não para a estimativa; o alcance cai (~9 km a 6 min/km); loja que não cabe aparece "fora da área" para o endereço; testes de limite (119, 120, 121). Nomes de parâmetro: usar os que já existem (`entrega_despacho_min`, `entrega_rota_fator_pct`, `entrega_faixa_min`); criar 4 chaves novas da RN-19: tolerância de atraso, tipo e valor da compensação (padrão: entrega grátis no próximo pedido) e resposta ao cancelamento por atraso (WB-253 a WB-255).

## Achados do Security nos frontends da Onda 6 (DEC-056; `seguranca/revisao-onda6-frontends.md`)
F.1 [ ] SEC-168 (Média, pequena): no arrependimento da exclusão, limitar tentativas de senha POR CONTA (não só por IP) e exigir reautenticação completa (com o segundo fator/código quando houver) ao reabrir a conta.
F.2 [ ] SEC-169: conferir o ponto de latitude/longitude enviado pelo app com o CEP e o município do endereço (tolerância configurável); recusar/ignorar ponto incoerente; E.3 (teto no fim da faixa) segue aberto: loja a 10,5 km não pode mostrar faixa de 102 a 132 min.
F.3 [ ] SEC-170: cupom `firstPurchaseOnly` não pode ser burlado trocando só o complemento do endereço (normalizar endereço: sem complemento) nem por pedidos simultâneos antes do pagamento (reservar o uso do cupom por conta/dispositivo/telefone no momento do pedido); permitir criar cupom de primeira compra somente com teto de orçamento por campanha.
F.4 [ ] SEC-171 a 174 (Baixas) conforme o tempo. Inventário de dados para o Data Safety/App Privacy (fotos, busca, conteúdo do usuário, interações de push, ViaCEP): manter em `docs/seguranca/`.

## Reverificação do Security, Ondas 6/7 (`seguranca/revisoes/onda-7-reverificacao.md`)
V.1 [x] SEC-175 (backend-dev, 2026-11-19): `decide` confere pedido E corrida `out_for_delivery` sob trava (senão `superseded`, sem evento "aceito"); entrega concluída/não entregue/devolvida/cancelada encerra o pedido de cancelamento pendente na mesma transação (`LateDeliveryService.onDeliveryChange`); o aceite e a transição da corrida são UMA transação (`DeliveriesService.actInTx`; falha = nada aceito e o pedido segue `pending` para a varredura repetir); alerta `delivery_cancelled_with_courier` quando o pedido é encerrado com a corrida já com motoboy (`cancelForOrderInTx`). L1 e L5 são E2E em `late-delivery.e2e-spec.ts`.
V.2 [x] SEC-176 (API, 2026-11-19): o contador por e-mail (sem IP) nunca devolve 429 ao dono: acima de 10/h a senha CERTA vira step-up (`403 LOGIN_CODE_REQUIRED`, código `delete_web`) e a errada segue 401 genérica sem enviar código (o terceiro não esgota o limite de envio). O 429 só vale por IP + e-mail (5/h). Fluxo documentado no OpenAPI (`cancelAccountDeletion`). D1 é E2E em `sec168-170-hardening.e2e-spec.ts`. **Resta o app e a web (`fila-mobile.md` M.2).** Dúvida ao Security: acima do limite, senha certa = 403 e errada = 401 é o mesmo oráculo do login com step-up; mantive por consistência. Conta com e-mail NÃO confirmado sob ataque continua sem caminho de volta (401 genérico): só o suporte; o comando `privacy:cancel-deletion <email>` (opcional da revisão) NÃO foi feito.
V.3 [x] SEC-169 (API, 2026-11-19): CEP inexistente = 422 `ADDRESS_CEP_NOT_FOUND` (com ou sem pino); município/UF conferidos sempre; `GEOCODER_URL` (vazio = desligado, padrão; o boot de produção recusa o Nominatim público e http), cache por CEP em Redis (30 dias; "não achou" 1 dia), recuo de 1 min com o provedor fora, só rua/cidade/UF do CEP vão ao geocodificador; `user_addresses.pin_verified` (0048) exposto em `Address.pinVerified` e no snapshot do pedido; `GET /v1/cep/{cep}` agora serve qualquer conta autenticada (M.6) com `lat`/`lng` nulos sem geocodificador. ADR-008 (adendo), env.example, env.prod.example, compose e guia de deploy atualizados. A1 é E2E. **Decisões do fundador/Security:** (a) qual geocodificador ligar e o custo (nada contratado; sem ele toda a produção grava `pinVerified=false` e o pino pode ser deslocado dentro do município atendido); (b) o "raio conservador" para `pinVerified=false` (usar o centro da cidade) exige coordenada de cidade em `cities`, que não existe: precisa de decisão e de cadastro no admin; (c) a Logística precisa VER `pinVerified=false` no painel (mobile-dev) e o alerta por endereço não foi criado (seria ruído com o geocodificador desligado).
V.4 [ ] SEC-166 (Alta, bloqueia G5 Google Play), SE o CEO escolher a opção 2: ação de super admin "executar exclusão" no DSR (reauth, motivo, identidade conferida, mesmos bloqueios da WB-213, auditoria). A opção 1 (página com via A/B) é do web, em `fila-mobile.md`.
V.5 [x] SEC-177 (2026-11-19): sem compensação quando a corrida teve `not_delivered` por `customer_absent`, `address_not_found` ou `customer_refused` (o evento `compensation_skipped` registra a causa). L4 é E2E. **PO ajusta a RN-19 4c** (a regra está implementada como hipótese); a hora do "entregue" informada pelo operador não existe como campo (o PO decide se vale criar).
V.6 [ ] Baixas conforme o tempo: SEC-161, 162, 163 (c, d), 167, 174 (definição de pronto na revisão).

### Itens fechados nesta rodada além de V.x (backend-dev, 2026-11-19)
- `GET /v1/me/coupons` (cupons pessoais, incluindo o de atraso; paginado por cursor; `status` available|used|expired|all; sem pedido de origem): OpenAPI `listMyCoupons`, E2E `my-coupons.e2e-spec.ts`.
- WB-241 C7: aviso ao cliente do novo prazo da coleta atrasada (push `A coleta da sua troca atrasou`, uma vez por corrida, junto do alerta `collection_late`; evento `collection_late_notice` no histórico da corrida). **Dúvida ao PO:** a RN não define o novo prazo; usei `coleta_agendamento_dias_uteis` dias úteis a contar do aviso (reuso do parâmetro, sem número novo). Se o PO quiser outro prazo (ex.: 1 dia útil), é um parâmetro novo.
- Contrato novo para o mobile-dev: `GET /v1/me/coupons`; `Address.pinVerified` (opcional); `CancelRequest.status = superseded` (tratar como encerrado, sem "aceito"); `POST /v1/auth/account-deletion/cancel` com o fluxo do código (403 `LOGIN_CODE_REQUIRED`, 400 `CODE_INVALID`/`CODE_EXPIRED`, reenviar = repetir sem `code`); `GET /v1/cep/{cep}` para qualquer conta (lat/lng nulos possíveis); 422 `ADDRESS_CEP_NOT_FOUND`. O painel admin deve rotular os alertas novos `delivery_cancelled_with_courier`.
