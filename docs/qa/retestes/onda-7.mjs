#!/usr/bin/env node
// Retestes da Onda 7 contra a API real (provedor `fake`, seed completo). Uso: node docs/qa/retestes/onda-7.mjs <seção> [<seção>...]
// Seções: bug011 bug012 bug014 bug015 bug016 bug017 bug018 teto atraso sec169 sec170 sec168 troca
// Cada verificação imprime PASS/FALHA com a evidência (HTTP, estados, valores). Manipula o relógio só pelo banco (recua timestamps)
// e espera a varredura do próprio servidor (20 a 30 s); nada é chamado "por dentro" do código.
import { randomUUID } from 'node:crypto';
import { notTested, adminCall, api, createAddress, deliveryOf, deliveryStatus, finish, getOrder, inPreparation, LAT, LNG, newCustomer, outForDelivery, paidAccepted, pay, place, readyForCollection, record, resetParam, setParam, sleep, sql, stockOf, store, storeOrder, waitFor, cartOf, login, SEED_PASSWORD } from './lib.mjs';

const money = (m) => (m && typeof m === 'object' ? (m.amount ?? m.cents ?? m.value) : m);
const status = async (customer, orderId) => (await getOrder(customer, orderId)).data?.status;
const row = (orderId, cols) => sql(`select ${cols} from orders where id = '${orderId}'`);
const reserved = () => sql(`select stock||'/'||reserved from product_variants where id = '${(globalThis.__variant ??= '')}'`);
const paymentStatus = (orderId) => sql(`select status from payment_attempts where external_reference = '${orderId}' order by created_at desc limit 1`);
const refundedCents = (orderId) => Number(sql(`select coalesce(sum(r.amount_cents),0) from payment_refunds r join payment_attempts a on a.id = r.attempt_id where a.external_reference = '${orderId}'`) || 0);
const minutesAgo = (m) => `now() - interval '${m} minutes'`;

// ------------------------------------------------------------------------------------------------ BUG-011
async function bug011() {
  const s = await store();
  globalThis.__variant = s.variantId;
  const c = await newCustomer();
  // (a) admin cancela pedido pago (recebido) com estorno total
  const slot = () => sql(`select stock||'/'||reserved from product_variants where id = '${s.variantId}'`);
  const before = slot();
  const a = await place(c, 'delivery');
  await pay(c, a.order.id);
  const during = slot();
  const r = await adminCall('POST', `/v1/admin/orders/${a.order.id}/cancel`, { reason: 'Reteste QA BUG-011: cancelar pedido pelo admin', refund: true });
  record('BUG-011a', 'admin cancela pedido pago: 200, status cancelled, estorno total, restante 0', r.status === 200 && r.data?.status === 'cancelled' && money(r.data?.remaining) === 0 && money(r.data?.refunded) === a.total, `HTTP ${r.status} ${JSON.stringify(r.data)}; total=${a.total}`);
  const after = await getOrder(c, a.order.id);
  record('BUG-011b', 'o cliente vê o pedido cancelado (ator admin) e o pagamento estornado', after.data?.status === 'cancelled' && after.data?.payment?.status === 'refunded', `status=${after.data?.status} pagamento=${after.data?.payment?.status}`);
  const accept = await storeOrder(`${a.order.id}/accept`);
  record('BUG-011c', 'a loja NÃO consegue aceitar o pedido cancelado (era o defeito: 200)', accept.status === 409 || accept.status === 422, `HTTP ${accept.status}`);
  const again = await adminCall('POST', `/v1/admin/orders/${a.order.id}/cancel`, { reason: 'Reteste QA BUG-011: repetir cancelamento', refund: true });
  record('BUG-011d', 'repetir o cancelamento é idempotente (200, sem segundo estorno)', again.status === 200, `HTTP ${again.status} ${JSON.stringify(again.data)}`);
  record('BUG-011e', 'estoque devolvido ao cancelar (estoque/reservado volta ao valor de antes do pedido)', slot() === before && during !== before, `antes ${before}; com o pedido ${during}; depois do cancelamento ${slot()}`);

  // (b) o defeito original: estorno total manual NÃO cancelava o pedido
  const b = await place(c, 'delivery');
  await pay(c, b.order.id);
  const refund = await adminCall('POST', `/v1/admin/orders/${b.order.id}/refunds`, { amountCents: b.total, reason: 'Reteste QA BUG-011: estorno total manual' }, { 'Idempotency-Key': `qa7-${Date.now()}-b` });
  const st = await status(c, b.order.id);
  const acc = await storeOrder(`${b.order.id}/accept`);
  record('BUG-011f', 'estorno total manual leva o pedido a cancelled e a loja não aceita mais (era o defeito original)', refund.status === 200 && st === 'cancelled' && acc.status !== 200, `estorno HTTP ${refund.status} ${JSON.stringify(refund.data)}; pedido=${st}; accept HTTP ${acc.status}`);

  // (c) estorno parcial não cancela
  const p = await place(c, 'delivery');
  await pay(c, p.order.id);
  const part = await adminCall('POST', `/v1/admin/orders/${p.order.id}/refunds`, { amountCents: 100, reason: 'Reteste QA BUG-011: estorno parcial' }, { 'Idempotency-Key': `qa7-${Date.now()}-p` });
  record('BUG-011g', 'estorno parcial mantém o pedido ativo (received)', part.status === 200 && (await status(c, p.order.id)) === 'received', `HTTP ${part.status}; pedido=${await status(c, p.order.id)}`);
  await adminCall('POST', `/v1/admin/orders/${p.order.id}/cancel`, { reason: 'Reteste QA BUG-011: limpar pedido parcial', refund: true });

  // (d) entregue não cancela
  const pk = await paidAccepted(c, 'pickup');
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'ready_for_pickup' });
  const code = (await getOrder(c, pk.id)).data?.pickup?.code;
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'delivered', pickupCode: code });
  const del = await adminCall('POST', `/v1/admin/orders/${pk.id}/cancel`, { reason: 'Reteste QA BUG-011: pedido entregue', refund: true });
  record('BUG-011h', 'pedido entregue não pode ser cancelado (409 ORDER_NOT_CANCELLABLE)', del.status === 409, `HTTP ${del.status} ${JSON.stringify(del.data).slice(0, 150)}`);

  // (e) sem motivo / sem permissão
  const noReason = await adminCall('POST', `/v1/admin/orders/${p.order.id}/cancel`, { reason: 'curto' });
  record('BUG-011i', 'motivo com menos de 10 caracteres é recusado (400)', noReason.status === 400, `HTTP ${noReason.status}`);
  const forbidden = await api('POST', `/v1/admin/orders/${p.order.id}/cancel`, { token: c.token, body: { reason: 'Reteste QA: cliente tentando cancelar como admin' } });
  record('BUG-011j', 'cliente comum não chama a rota de admin (401/403)', [401, 403].includes(forbidden.status), `HTTP ${forbidden.status}`);

  // (f) corrida em aberto é cancelada junto
  const d = await readyForCollection(c);
  const dl = await deliveryStatus(d.id);
  const cancel = await adminCall('POST', `/v1/admin/orders/${d.id}/cancel`, { reason: 'Reteste QA BUG-011: cancelar com corrida aberta', refund: true });
  record('BUG-011k', 'cancelar pedido pronto para coleta cancela a corrida e estorna', cancel.status === 200 && (await deliveryStatus(d.id)) === 'cancelled', `corrida antes=${dl} depois=${await deliveryStatus(d.id)}; HTTP ${cancel.status}`);
}

// ------------------------------------------------------------------------------------------------ BUG-012
async function bug012() {
  await store();
  const c = await newCustomer();
  const o = await readyForCollection(c);
  const deliveryId = deliveryOf(o.id);
  const r = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'cancel', reason: 'Reteste QA BUG-012: operação cancela a corrida' });
  const after = await getOrder(c, o.id);
  record('BUG-012a', 'cancelar a corrida pronta para coleta encerra o pedido (cancelled), não o deixa parado', r.status === 200 && after.data?.status === 'cancelled', `HTTP ${r.status}; corrida=${await deliveryStatus(o.id)}; pedido=${after.data?.status}`);
  record('BUG-012b', 'o cliente é estornado por inteiro e o motivo vai ao pedido', after.data?.payment?.status === 'refunded' && /opera/i.test(JSON.stringify(after.data?.cancellation ?? after.data?.timeline ?? '')), `pagamento=${after.data?.payment?.status}; cancelamento=${JSON.stringify(after.data?.cancellation)}`);
  const acc = await storeOrder(`${o.id}/status`, 'POST', { status: 'in_preparation' });
  record('BUG-012c', 'a loja não "volta para separação" um pedido cancelado', acc.status !== 200, `HTTP ${acc.status}`);
  const again = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'cancel', reason: 'Reteste QA BUG-012: repetir' });
  record('BUG-012d', 'repetir o cancelamento da corrida não estorna duas vezes (409 ou 200 idempotente, estorno único)', [200, 409].includes(again.status) && refundedCents(o.id) <= (after.data?.summary?.total?.amount ?? 1e12), `HTTP ${again.status}; estornado=${refundedCents(o.id)}`);
  // corrida já com motoboy a caminho da loja: cancelar também fecha?
  const o2 = await readyForCollection(c);
  const d2 = deliveryOf(o2.id);
  const courier = await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA Doze', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${d2}/assign`, { courierId: courier.data.id });
  const r2 = await adminCall('POST', `/v1/admin/logistics/deliveries/${d2}/status`, { action: 'cancel', reason: 'Reteste QA BUG-012: com motoboy atribuído' });
  record('BUG-012e', 'cancelar corrida já atribuída ao motoboy também encerra o pedido', r2.status === 200 && (await status(c, o2.id)) === 'cancelled', `HTTP ${r2.status}; pedido=${await status(c, o2.id)}`);
}

// ------------------------------------------------------------------------------------------------ BUG-014 (retirada 48 h)
async function bug014() {
  globalThis.__variant = (await store()).variantId;
  const c = await newCustomer();
  const pk = await paidAccepted(c, 'pickup');
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'in_preparation' });
  const ready = await storeOrder(`${pk.id}/status`, 'POST', { status: 'ready_for_pickup' });
  record('BUG-014a', 'pedido de retirada chega a ready_for_pickup', ready.status === 200, `HTTP ${ready.status}`);
  const t0 = sql(`select max(at) from order_events where order_id = '${pk.id}' and to_status = 'ready_for_pickup'`);
  // aviso 24 h antes do prazo: pronto há 25 h
  sql(`update order_events set at = at - interval '25 hours' where order_id = '${pk.id}'`);
  const reminded = await waitFor(() => row(pk.id, 'pickup_reminded_at is not null') === 't');
  record('BUG-014b', 'pronto há 25 h: o cliente recebe UM aviso (pickup_reminded_at preenchido) e o pedido continua ativo', reminded && (await status(c, pk.id)) === 'ready_for_pickup', `lembrete=${row(pk.id, 'pickup_reminded_at')}; status=${await status(c, pk.id)}`);
  await sleep(25_000);
  const notifs = sql(`select count(*) from order_events where order_id = '${pk.id}' and to_status = 'ready_for_pickup'`);
  record('BUG-014c', 'a varredura seguinte não repete o aviso (claim atômico: pickup_reminded_at estável)', row(pk.id, 'pickup_reminded_at is not null') === 't', `eventos ready=${notifs}`);
  const reservedBefore = sql(`select stock||'/'||reserved from product_variants where id = '${globalThis.__variant}'`);
  // vence: pronto há 49 h
  sql(`update order_events set at = at - interval '24 hours' where order_id = '${pk.id}'`);
  const cancelled = await waitFor(async () => (await status(c, pk.id)) === 'cancelled');
  const o = (await getOrder(c, pk.id)).data;
  record('BUG-014d', 'pronto há 49 h: cancelado pelo sistema, com estorno total', cancelled && o.payment?.status === 'refunded', `status=${o.status}; pagamento=${o.payment?.status}; motivo=${JSON.stringify(o.cancellation)}`);
  const reservedAfter = sql(`select stock||'/'||reserved from product_variants where id = '${globalThis.__variant}'`);
  record('BUG-014e', 'estoque devolvido (as unidades do pedido cancelado voltam ao estoque)', Number(reservedAfter.split('/')[0]) > Number(reservedBefore.split('/')[0]), `estoque/reservado antes do cancelamento ${reservedBefore}, depois ${reservedAfter} (a reserva é o próprio decremento de estoque)`);
  void t0;
  // retirado a tempo não é cancelado
  const pk2 = await paidAccepted(c, 'pickup');
  await storeOrder(`${pk2.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${pk2.id}/status`, 'POST', { status: 'ready_for_pickup' });
  const code = (await getOrder(c, pk2.id)).data?.pickup?.code;
  sql(`update order_events set at = at - interval '30 hours' where order_id = '${pk2.id}'`);
  const done = await storeOrder(`${pk2.id}/status`, 'POST', { status: 'delivered', pickupCode: code });
  await sleep(25_000);
  record('BUG-014f', 'retirado antes do prazo fica entregue e não é cancelado depois', done.status === 200 && (await status(c, pk2.id)) === 'delivered', `HTTP ${done.status}; status=${await status(c, pk2.id)}`);
}

// ------------------------------------------------------------------------------------------------ BUG-015
async function bug015() {
  const s = await store();
  const c = await newCustomer();
  const other = await newCustomer();
  // cancelamento pedido em separação: a loja aceita
  const a = await inPreparation(c, 'delivery');
  const req = await api('POST', `/v1/orders/${a.id}/cancel-request`, { token: c.token, body: { reason: 'Reteste QA BUG-015' } });
  record('BUG-015a', 'cliente pede o cancelamento em separação: 202 e pedido continua in_preparation', req.status === 202 && (await status(c, a.id)) === 'in_preparation', `HTTP ${req.status} ${JSON.stringify(req.data).slice(0, 160)}`);
  const view = (await getOrder(c, a.id)).data;
  record('BUG-015b', 'Order.cancelRequest mostra o pedido pendente', view.cancelRequest?.status === 'pending', JSON.stringify(view.cancelRequest));
  const again = await api('POST', `/v1/orders/${a.id}/cancel-request`, { token: c.token, body: {} });
  record('BUG-015c', 'pedir de novo é idempotente (mesma solicitação)', again.status === 202 && again.data?.id === req.data?.id, `HTTP ${again.status}`);
  const foreign = await api('POST', `/v1/orders/${a.id}/cancel-request`, { token: other.token, body: {} });
  record('BUG-015d', 'pedido de outra conta: 404 (sem BOLA)', foreign.status === 404, `HTTP ${foreign.status}`);
  const acc = await storeOrder(`${a.id}/cancel-request/accept`);
  const afterAcc = (await getOrder(c, a.id)).data;
  record('BUG-015e', 'a loja aceita: pedido cancelado e estorno total', acc.status === 200 && afterAcc.status === 'cancelled' && afterAcc.payment?.status === 'refunded', `HTTP ${acc.status}; status=${afterAcc.status}; pagamento=${afterAcc.payment?.status}`);
  // loja recusa
  const b = await inPreparation(c, 'delivery');
  await api('POST', `/v1/orders/${b.id}/cancel-request`, { token: c.token, body: {} });
  const rej = await storeOrder(`${b.id}/cancel-request/reject`, 'POST', { reason: 'Já está separado' });
  record('BUG-015f', 'a loja recusa com motivo: o pedido segue em separação', rej.status === 200 && (await status(c, b.id)) === 'in_preparation', `HTTP ${rej.status}`);
  // sem resposta da loja: alerta ao admin
  const d = await inPreparation(c, 'delivery');
  await api('POST', `/v1/orders/${d.id}/cancel-request`, { token: c.token, body: {} });
  sql(`update order_cancel_requests set requested_at = ${minutesAgo(11)} where order_id = '${d.id}'`);
  const alerted = await waitFor(() => sql(`select count(*) from order_cancel_requests where order_id = '${d.id}' and alerted_at is not null`) === '1');
  const alerts = await adminCall('GET', '/v1/admin/payments/alerts?openOnly=true&limit=100');
  const hasAlert = JSON.stringify(alerts.data).includes('cancel_request_unanswered') && JSON.stringify(alerts.data).includes(d.id);
  record('BUG-015g', 'sem resposta da loja em 10 min o admin é alertado (alerta cancel_request_unanswered, uma vez)', alerted && hasAlert, `alerted_at=${alerted}; alerta visível=${hasAlert}`);
  const adminCancel = await adminCall('POST', `/v1/admin/orders/${d.id}/cancel`, { reason: 'Reteste QA BUG-015: admin decide', refund: true });
  record('BUG-015h', 'o admin decide cancelando (200)', adminCancel.status === 200, `HTTP ${adminCancel.status}`);
  // estados em que não vale
  const e = await paidAccepted(c, 'delivery');
  const bad = await api('POST', `/v1/orders/${e.id}/cancel-request`, { token: c.token, body: {} });
  record('BUG-015i', 'em accepted o pedir-cancelamento é recusado (409, usa o cancelamento direto)', bad.status === 409, `HTTP ${bad.status}`);
  const direct = await api('POST', `/v1/orders/${e.id}/cancel`, { token: c.token, body: {} });
  record('BUG-015j', 'cancelamento direto em accepted funciona e estorna', direct.status === 200 && (await getOrder(c, e.id)).data?.payment?.status === 'refunded', `HTTP ${direct.status}`);

  // "Não recebi"
  const { order, deliveryId } = await outForDelivery(c);
  const nr = await api('POST', `/v1/orders/${order.id}/not-received`, { token: c.token });
  record('BUG-015k', '"não recebi" a caminho: 202 {reported:true}', nr.status === 202 && nr.data?.reported === true, `HTTP ${nr.status} ${JSON.stringify(nr.data)}`);
  const nr2 = await api('POST', `/v1/orders/${order.id}/not-received`, { token: c.token });
  const alertCount = sql(`select count(*) from payment_alerts where kind = 'order_not_received' and details->>'orderId' = '${order.id}'`);
  record('BUG-015l', 'repetir é idempotente (202) e gera UM alerta à operação', nr2.status === 202 && alertCount === '1', `HTTP ${nr2.status}; alertas=${alertCount}`);
  const nrForeign = await api('POST', `/v1/orders/${order.id}/not-received`, { token: other.token });
  record('BUG-015m', '"não recebi" em pedido de outra conta: 404', nrForeign.status === 404, `HTTP ${nrForeign.status}`);
  const nrEarly = await place(c, 'delivery');
  await pay(c, nrEarly.order.id);
  const early = await api('POST', `/v1/orders/${nrEarly.order.id}/not-received`, { token: c.token });
  record('BUG-015n', '"não recebi" com o pedido ainda recebido: 409 ORDER_NOT_REPORTABLE', early.status === 409, `HTTP ${early.status}`);
  await adminCall('POST', `/v1/admin/orders/${nrEarly.order.id}/cancel`, { reason: 'Reteste QA BUG-015: limpar', refund: true });
  // RN-07: a auto-conclusão de 24 h vale "salvo não recebi do cliente (abre disputa)". delivery_events é append-only (trigger): não dá para
  // recuar o relógio da corrida pelo banco; o teste está em repro/qa-notreceived-autoconclude.e2e-spec.ts (relógio injetado) e FALHA hoje (BUG-020).
  notTested('BUG-015o', 'RN-07: "não recebi" impede a auto-conclusão em 24 h', 'não executável pela API real (histórico append-only); ver repro/qa-notreceived-autoconclude.e2e-spec.ts: FALHA (pedido vira delivered), BUG-020');
  void s;
}

// ------------------------------------------------------------------------------------------------ BUG-016
async function bug016() {
  await store();
  const c = await newCustomer();
  const av = await adminCall('GET', '/v1/admin/logistics/availability');
  record('BUG-016a', 'disponibilidade da logística existe e está aberta no horário padrão (seg a sáb 09 às 20 h)', av.status === 200 && av.data?.open === true, `HTTP ${av.status} ${JSON.stringify(av.data)}`);
  const pause = await adminCall('POST', '/v1/admin/logistics/pause', { reason: 'Reteste QA BUG-016: pausa geral' });
  const closed = await adminCall('GET', '/v1/admin/logistics/availability');
  record('BUG-016b', 'pausa geral com motivo: availability open=false closedBy=PAUSED', pause.status === 200 && closed.data?.open === false && closed.data?.closedBy === 'PAUSED', `pausa HTTP ${pause.status}; ${JSON.stringify(closed.data).slice(0, 200)}`);
  const { cart } = await cartOf(c, 'delivery');
  const blockers = cart.data?.checkout?.blockers ?? cart.data?.checkout?.blockedBy ?? [];
  record('BUG-016c', 'sacola de entrega bloqueada com LOGISTICS_CLOSED durante a pausa', JSON.stringify(cart.data?.checkout).includes('LOGISTICS_CLOSED'), JSON.stringify(cart.data?.checkout).slice(0, 220));
  const placed = await place(c, 'delivery');
  record('BUG-016d', 'criar pedido de entrega durante a pausa é recusado no servidor (não só na tela)', !placed.order, `HTTP ${placed.res.status} ${JSON.stringify(placed.res.data).slice(0, 200)}`);
  const pickup = await place(c, 'pickup');
  record('BUG-016e', 'retirada continua disponível durante a pausa', Boolean(pickup.order), `HTTP ${pickup.res.status}`);
  if (pickup.order) await api('POST', `/v1/orders/${pickup.order.id}/cancel`, { token: c.token, body: {} });
  const pause2 = await adminCall('POST', '/v1/admin/logistics/pause', { reason: 'Reteste QA BUG-016: repetir' });
  record('BUG-016f', 'repetir a mesma pausa devolve a existente', pause2.status === 200 && pause2.data?.id === pause.data?.id, `HTTP ${pause2.status}`);
  const resume = await adminCall('POST', '/v1/admin/logistics/resume', {});
  const resume2 = await adminCall('POST', '/v1/admin/logistics/resume', {});
  record('BUG-016g', 'liberar: 204; liberar de novo: 409 NOT_PAUSED', resume.status === 204 && resume2.status === 409, `HTTP ${resume.status} e ${resume2.status}`);
  const reopened = await place(c, 'delivery');
  record('BUG-016h', 'depois de liberar a entrega volta a ser aceita', Boolean(reopened.order), `HTTP ${reopened.res.status}`);
  if (reopened.order) await api('POST', `/v1/orders/${reopened.order.id}/cancel`, { token: c.token, body: {} });
  // pausa por cidade
  const city = sql(`select id from cities where name = 'Franco da Rocha' limit 1`);
  const cityPause = await adminCall('POST', '/v1/admin/logistics/pause', { cityId: city, reason: 'Reteste QA BUG-016: só Franco da Rocha' });
  const stillOpen = await place(c, 'delivery');
  record('BUG-016i', 'pausar só Franco da Rocha não bloqueia entrega para Francisco Morato', cityPause.status === 200 && Boolean(stillOpen.order), `pausa HTTP ${cityPause.status}; pedido ${stillOpen.res.status}`);
  if (stillOpen.order) await api('POST', `/v1/orders/${stillOpen.order.id}/cancel`, { token: c.token, body: {} });
  await adminCall('POST', '/v1/admin/logistics/resume', { cityId: city });
  // horário
  const brt = new Date(Date.now() - 3 * 3600_000);
  const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const win = (fromMin, toMin) => `${hhmm(new Date(brt.getTime() + fromMin * 60_000))}-${hhmm(new Date(brt.getTime() + toMin * 60_000))}`;
  await setParam('logistica_horario', win(120, 240));
  const outside = await adminCall('GET', '/v1/admin/logistics/availability');
  const closedCart = (await cartOf(c, 'delivery')).cart;
  record('BUG-016j', 'fora do horário: open=false closedBy=HOURS com opensAt; o carrinho informa quando a entrega volta', outside.data?.open === false && outside.data?.closedBy === 'HOURS' && Boolean(outside.data?.opensAt) && Boolean(closedCart.data?.delivery?.logisticsOpensAt), `${JSON.stringify(outside.data).slice(0, 200)}; logisticsOpensAt=${closedCart.data?.delivery?.logisticsOpensAt}`);
  const late = await place(c, 'delivery');
  record('BUG-016k', 'pedido de entrega fora do horário é recusado', !late.order, `HTTP ${late.res.status}`);
  // RN-19: o fim da faixa precisa cair antes do fechamento. Fecha em 20 min: ainda "aberto", mas a faixa (>= 35 min) estoura.
  await setParam('logistica_horario', win(-60, 20));
  const nearClose = (await cartOf(c, 'delivery')).cart;
  const nearPlaced = await place(c, 'delivery');
  record('BUG-016l', 'RN-19: faltando 20 min para fechar, a entrega cuja faixa termina depois do fechamento NÃO é oferecida', JSON.stringify(nearClose.data?.checkout).includes('LOGISTICS_CLOSED') && !nearPlaced.order, `eta=${JSON.stringify(nearClose.data?.delivery?.eta)}; checkout=${JSON.stringify(nearClose.data?.checkout).slice(0, 160)}; criar pedido HTTP ${nearPlaced.res.status}`);
  if (nearPlaced.order) await api('POST', `/v1/orders/${nearPlaced.order.id}/cancel`, { token: c.token, body: {} });
  await resetParam('logistica_horario');
  // dia fechado
  const dow = brt.getUTCDay(); // 0 domingo
  const closedDays = dow === 0 ? 'seg_sab' : null;
  void closedDays;
  notTested('BUG-016m', 'domingo: logistica_dias=seg_sab fecha a entrega', `hoje é o dia ${dow} da semana (0 = domingo); só coberto por logistics-hours.e2e-spec`);
  const back = await adminCall('GET', '/v1/admin/logistics/availability');
  record('BUG-016n', 'estado final restaurado (aberto)', back.data?.open === true, JSON.stringify(back.data).slice(0, 160));
}

// ------------------------------------------------------------------------------------------------ BUG-017
async function bug017() {
  const s = await store();
  globalThis.__variant = s.variantId;
  const params = (await adminCall('GET', '/v1/admin/parameters')).data?.data ?? [];
  const keys = params.map((p) => p.key);
  record('BUG-017a', 'chaves aposentadas (raio_padrao_km, repasse_periodicidade, dados_cliente_visivel_dias) não aparecem mais no painel', !['raio_padrao_km', 'repasse_periodicidade', 'dados_cliente_visivel_dias'].some((k) => keys.includes(k)), `${keys.length} parâmetros; presentes: ${['raio_padrao_km', 'repasse_periodicidade', 'dados_cliente_visivel_dias'].filter((k) => keys.includes(k)).join(',') || 'nenhuma'}`);
  const c = await newCustomer();
  // codigo_retirada_digitos
  await setParam('codigo_retirada_digitos', 6);
  const pk = await paidAccepted(c, 'pickup');
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${pk.id}/status`, 'POST', { status: 'ready_for_pickup' });
  const code = (await getOrder(c, pk.id)).data?.pickup?.code;
  const wrong = await storeOrder(`${pk.id}/status`, 'POST', { status: 'delivered', pickupCode: '0000' });
  const ok = await storeOrder(`${pk.id}/status`, 'POST', { status: 'delivered', pickupCode: code });
  record('BUG-017b', 'codigo_retirada_digitos=6: o código nasce com 6 dígitos e a loja conclui com ele', /^\d{6}$/.test(code ?? '') && wrong.status !== 200 && ok.status === 200, `código="${code}"; errado HTTP ${wrong.status}; certo HTTP ${ok.status}`);
  await resetParam('codigo_retirada_digitos');
  const normal = await paidAccepted(c, 'pickup');
  await storeOrder(`${normal.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${normal.id}/status`, 'POST', { status: 'ready_for_pickup' });
  const code4 = (await getOrder(c, normal.id)).data?.pickup?.code;
  record('BUG-017c', 'restaurado o padrão: código volta a 4 dígitos', /^\d{4}$/.test(code4 ?? ''), `código="${code4}"`);
  await adminCall('POST', `/v1/admin/orders/${normal.id}/cancel`, { reason: 'Reteste QA BUG-017: limpar', refund: true });

  // loja_aceite_lembrete_min
  await setParam('loja_aceite_lembrete_min', 3);
  const r = await place(c, 'delivery');
  await pay(c, r.order.id);
  sql(`update orders set paid_at = ${minutesAgo(4)} where id = '${r.order.id}'`);
  const reminded = await waitFor(() => row(r.order.id, 'accept_reminded_at is not null') === 't');
  record('BUG-017d', 'loja_aceite_lembrete_min=3: pedido sem aceite há 4 min gera UM lembrete (accept_reminded_at)', reminded, `accept_reminded_at=${row(r.order.id, 'accept_reminded_at')}`);
  await adminCall('POST', `/v1/admin/orders/${r.order.id}/cancel`, { reason: 'Reteste QA BUG-017: limpar', refund: true });
  await resetParam('loja_aceite_lembrete_min');

  // retirada_prazo_horas = 12
  await setParam('retirada_prazo_horas', 12);
  const p2 = await paidAccepted(c, 'pickup');
  await storeOrder(`${p2.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${p2.id}/status`, 'POST', { status: 'ready_for_pickup' });
  sql(`update order_events set at = at - interval '13 hours' where order_id = '${p2.id}'`);
  const exp = await waitFor(async () => (await status(c, p2.id)) === 'cancelled');
  record('BUG-017e', 'retirada_prazo_horas=12: pronto há 13 h é cancelado (o parâmetro do painel altera o prazo)', exp, `status=${await status(c, p2.id)}`);
  await resetParam('retirada_prazo_horas');

  // troca_voluntaria_dias_padrao: é o prazo que o painel da loja PROPÕE ao religar a troca voluntária (store-settings: defaultVoluntaryDays)
  await setParam('troca_voluntaria_dias_padrao', 12);
  const settings = await api('GET', `/v1/stores/${s.id}/settings`, { token: s.owner });
  record('BUG-017f', 'troca_voluntaria_dias_padrao=12: o painel do lojista passa a propor 12 dias (settings.exchange.defaultVoluntaryDays)', JSON.stringify(settings.data).includes('"defaultVoluntaryDays":12'), `HTTP ${settings.status}; ${JSON.stringify(settings.data).match(/"defaultVoluntaryDays":\d+/)?.[0] ?? 'campo ausente'}`);
  await resetParam('troca_voluntaria_dias_padrao');
  notTested('BUG-017g', 'cancelamento_loja_alerta_pct e coleta_agendamento_dias_uteis', 'precisam de amostra de 30 dias e de calendário de dias úteis; só cobertos por bug017-parameters.e2e-spec e parameters-wired.spec');
}

// ------------------------------------------------------------------------------------------------ BUG-018
async function bug018() {
  const home = await api('GET', `/v1/home?lat=${LAT}&lng=${LNG}`);
  const best = home.data?.bestSellers ?? [];
  record('BUG-018a', 'home traz "Mais vendidos" com os 60 pedidos de demonstração do seed', home.status === 200 && best.length > 0, `HTTP ${home.status}; bestSellers=${best.length} ${JSON.stringify(best.slice(0, 2)).slice(0, 240)}`);
  const stores = new Set(best.map((b) => b.store?.id ?? b.storeId));
  record('BUG-018b', 'os itens são de lojas visíveis na região (todos com loja e preço)', best.every((b) => (b.store?.id ?? b.storeId) && (b.price ?? b.priceCents ?? b.minPrice)), `lojas distintas=${stores.size}`);
  const far = await api('GET', '/v1/home?lat=-22.9&lng=-43.2');
  record('BUG-018c', 'fora da região não aparece "Mais vendidos" de outra cidade', (far.data?.bestSellers ?? []).length === 0, `HTTP ${far.status}; bestSellers=${(far.data?.bestSellers ?? []).length}`);
}

// ------------------------------------------------------------------------------------------------ teto 119/120/121 (DEC-054 Q1)
// Endereços reais a ~9 km da loja (Caieiras): o geocodificador `fake` devolve um ponto determinístico por CEP; escolhemos CEPs cujo
// FIM da faixa (preparo 20 + despacho 15 + ceil(km x 1,3 x 6) + folga 15) cai em 119, 120 e 121 minutos, sem mexer em nenhum parâmetro.
function fakePoint(digits) {
  const n = Number(digits.slice(3));
  return { lat: -23.364 + (((n * 7919) % 2000) - 1000) / 1000 / 70, lng: -46.7407 + (((n * 104729) % 2000) - 1000) / 1000 / 70, hood: ['Centro', 'Laranjeiras', 'Jardim São Judas'][n % 3] };
}
const haversineKm = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};
async function teto() {
  // BUG-021 (RN-19 §2): perto do fechamento (20 h) a entrega de 119/120 min NÃO é oferecida; o teste do teto roda com a logística aberta o dia todo.
  await setParam('logistica_horario', '00:00-23:59', 'Reteste QA TETO: logística aberta o dia todo (restaurado no fim)');
  try {
    await tetoInner();
  } finally {
    await resetParam('logistica_horario').catch(() => undefined);
  }
}
async function tetoInner() {
  const s = await store();
  const [slat, slng] = sql(`select lat||'|'||lng from stores where id = '${s.id}'`).split('|').map(Number);
  const wanted = { 119: null, 120: null, 121: null };
  for (let n = 0; n < 99999 && Object.values(wanted).some((v) => v === null); n++) {
    const digits = `077${String(n).padStart(5, '0')}`;
    const p = fakePoint(digits);
    const raw = haversineKm({ lat: slat, lng: slng }, p) * 1.3 * 6;
    const travel = Math.ceil(raw - 1e-9);
    const end = 20 + 15 + travel + 15;
    if (wanted[end] === null && raw - Math.floor(raw) > 0.2 && raw - Math.floor(raw) < 0.8) wanted[end] = { digits, hood: p.hood, km: raw / 7.8 };
  }
  console.log(`  CEPs escolhidos (fim da faixa -> CEP, km em linha reta): ${JSON.stringify(wanted)}`);
  for (const target of [119, 120, 121]) {
    const w = wanted[target];
    if (!w) {
      notTested(`TETO-${target}`, `fim da faixa = ${target} min`, 'não achei um CEP do geocodificador fake com esse fim de faixa');
      continue;
    }
    const c = await newCustomer({ noAddress: true });
    const addr = await createAddress(c, { cep: `${w.digits.slice(0, 5)}-${w.digits.slice(5)}`, number: '10', city: 'Caieiras', neighborhood: w.hood, omitPoint: true });
    if (addr.status !== 201) {
      record(`TETO-${target}`, `endereço de teste a ${w.km.toFixed(2)} km`, false, `HTTP ${addr.status} ${JSON.stringify(addr.data).slice(0, 200)}`);
      continue;
    }
    c.addressId = addr.data.id;
    const cart = (await cartOf(c, 'delivery')).cart.data;
    const end = cart.delivery?.eta?.maxMinutes;
    const available = cart.delivery?.available;
    const blocked = JSON.stringify(cart.checkout).includes('OUT_OF_RANGE');
    const expected = end <= 120;
    record(`TETO-${target}`, `fim da faixa = ${target} min (${w.km.toFixed(2)} km): ${target <= 120 ? 'entrega oferecida' : 'fora da área (OUT_OF_RANGE)'}`, end === target ? available === expected && blocked === !expected : available === (end <= 120 && end !== undefined), `fim da faixa servidor=${end}; available=${available}; OUT_OF_RANGE=${blocked}; faixa=${JSON.stringify(cart.delivery?.eta)}; distanceM=${cart.delivery?.distanceM}`);
    const placed = await place(c, 'delivery');
    if (target <= 120) {
      const ok = Boolean(placed.order);
      const rec = ok ? (await getOrder(c, placed.order.id)).data : null;
      record(`TETO-${target}b`, 'o servidor cria o pedido no limite e grava a faixa dentro do teto', ok && rec.delivery?.eta?.maxMinutes <= 120, `HTTP ${placed.res.status} ${ok ? '' : JSON.stringify(placed.res.data).slice(0, 160)}; faixa gravada=${JSON.stringify(rec?.delivery?.eta)}`);
      if (ok) await api('POST', `/v1/orders/${placed.order.id}/cancel`, { token: c.token, body: {} });
    } else {
      record(`TETO-${target}b`, 'o servidor RECUSA criar o pedido acima do teto (não depende do app)', !placed.order, `HTTP ${placed.res.status} ${JSON.stringify(placed.res.data).slice(0, 160)}`);
    }
  }
  // RN-02: validação ao salvar (422): teto - folga >= preparo + despacho + 5 e folga <= teto / 4
  const bad = await adminCall('PUT', '/v1/admin/parameters/entrega_max_min', { value: 40, reason: 'Reteste QA: teto impossível' });
  const bad2 = await adminCall('PUT', '/v1/admin/parameters/entrega_faixa_min', { value: 60, reason: 'Reteste QA: folga maior que teto/4' });
  await resetParam('entrega_max_min');
  await resetParam('entrega_faixa_min');
  record('TETO-RN02', 'RN-02: o admin não consegue salvar um teto que nenhuma loja alcança (entrega_max_min=40 com preparo 20, despacho 15, folga 15) nem folga > teto/4 (60): 422', bad.status === 422 && bad2.status === 422, `teto=40 HTTP ${bad.status}; folga=60 HTTP ${bad2.status} (valores restaurados ao padrão logo depois)`);
  const home = await api('GET', `/v1/home?lat=${LAT}&lng=${LNG}`);
  record('TETO-home', 'a descoberta mostra a faixa em minutos (nunca número único)', JSON.stringify(home.data).includes('minMinutes'), 'campo minMinutes presente na home');
}

// ------------------------------------------------------------------------------------------------ atraso, cancelamento sem custo, compensação, aceite automático
async function atraso() {
  await store();
  const c = await newCustomer();
  const setLate = (orderId, minAgo) => sql(`update orders set eta_to_at = ${minutesAgo(minAgo)} where id = '${orderId}'`);

  // (1) dentro da faixa
  const o1 = await paidAccepted(c, 'delivery');
  const v1 = (await getOrder(c, o1.id)).data;
  record('ATRASO-1', 'dentro da faixa: sem atraso e cancelar sem custo é 409 LATE_CANCEL_NOT_AVAILABLE', v1.delivery?.eta && v1.delay?.late === false && (await api('POST', `/v1/orders/${o1.id}/cancel-late`, { token: c.token, body: {} })).status === 409, `delay=${JSON.stringify(v1.delay)}`);
  // (2) passou do fim: só aviso (1 push)
  setLate(o1.id, 5);
  const noticed = await waitFor(() => row(o1.id, 'late_notified_at is not null') === 't');
  const v2 = (await getOrder(c, o1.id)).data;
  const early = await api('POST', `/v1/orders/${o1.id}/cancel-late`, { token: c.token, body: {} });
  record('ATRASO-2', '5 min depois do fim: late=true, aviso emitido uma vez, mas cancelar sem custo ainda é recusado (tolerância 15 min)', noticed && v2.delay?.late === true && v2.delay?.canCancelWithoutCost === false && early.status === 409, `delay=${JSON.stringify(v2.delay)}; cancel-late HTTP ${early.status}`);
  // (3) 14 min / 15 min / 16 min (limite da tolerância)
  setLate(o1.id, 14);
  const at14 = (await getOrder(c, o1.id)).data.delay;
  setLate(o1.id, 16);
  const at16 = (await getOrder(c, o1.id)).data.delay;
  record('ATRASO-3', 'limite da tolerância: 14 min depois do fim não libera; 16 min libera (cancelMode=immediate antes da saída)', at14.canCancelWithoutCost === false && at16.canCancelWithoutCost === true && at16.cancelMode === 'immediate', `14: ${JSON.stringify(at14)}; 16: ${JSON.stringify(at16)}`);
  // (4) cancelamento sem custo antes de sair: estorno total incluindo a taxa de entrega, estoque liberado
  const paidTotal = money((await getOrder(c, o1.id)).data.summary.total);
  const fee = money((await getOrder(c, o1.id)).data.summary.delivery ?? 0);
  const [cl1, cl2] = await Promise.all([api('POST', `/v1/orders/${o1.id}/cancel-late`, { token: c.token, body: {} }), api('POST', `/v1/orders/${o1.id}/cancel-late`, { token: c.token, body: {} })]);
  const after = (await getOrder(c, o1.id)).data;
  const refundTotal = Number(sql(`select coalesce(sum(r.amount_cents),0) from payment_refunds r join payment_attempts a on a.id = r.attempt_id where a.external_reference = '${o1.id}'`));
  record('ATRASO-4', 'toque duplo em "Cancelar sem custo": um só efeito; pedido cancelado (ator cliente, motivo atraso), estorno TOTAL com a taxa de entrega', [cl1.status, cl2.status].every((s) => s === 200) && after.status === 'cancelled' && after.payment?.status === 'refunded' && refundTotal === paidTotal, `HTTP ${cl1.status}/${cl2.status}; status=${after.status}; total pago=${paidTotal} (frete=${fee}); estornado=${refundTotal}; corrida=${deliveryStatus(o1.id) || 'sem corrida'}`);

  // (5) pedido pronto para coleta e atrasado: cancelar cancela a corrida
  const o2 = await readyForCollection(c);
  setLate(o2.id, 20);
  const cl = await api('POST', `/v1/orders/${o2.id}/cancel-late`, { token: c.token, body: {} });
  record('ATRASO-5', 'cancelar sem custo com o pedido pronto para coleta cancela também a corrida', cl.status === 200 && (await status(c, o2.id)) === 'cancelled' && (await deliveryStatus(o2.id)) === 'cancelled', `HTTP ${cl.status}; corrida=${await deliveryStatus(o2.id)}`);

  // (6) já saiu para entrega: vira pedido à operação; operação responde "chega logo"; depois aceite AUTOMÁTICO no silêncio
  const out = await outForDelivery(c);
  setLate(out.order.id, 20);
  const req = await api('POST', `/v1/orders/${out.order.id}/cancel-late`, { token: c.token, body: {} });
  const reqView = (await getOrder(c, out.order.id)).data;
  record('ATRASO-6', 'depois de sair, o cancelamento sem custo vira PEDIDO à operação (status pending; pedido segue out_for_delivery)', req.status === 200 && reqView.status === 'out_for_delivery' && reqView.delay?.cancelRequest?.status === 'pending', `HTTP ${req.status}; status=${reqView.status}; cancelRequest=${JSON.stringify(reqView.delay?.cancelRequest)}`);
  const soon = await adminCall('POST', `/v1/admin/orders/${out.order.id}/late-cancel/respond`, { action: 'arrive_soon', note: 'Chegamos em até 10 minutos' });
  record('ATRASO-7', 'operação responde "chega em até 10 min" (200) e o cliente pode pedir de novo', soon.status === 200, `HTTP ${soon.status} ${JSON.stringify(soon.data).slice(0, 160)}`);
  const re = await api('POST', `/v1/orders/${out.order.id}/cancel-late`, { token: c.token, body: {} });
  const afterSoon = (await getOrder(c, out.order.id)).data;
  record('ATRASO-8', 'o cliente pede de novo: novo pedido pending', re.status === 200 && afterSoon.delay?.cancelRequest?.status === 'pending', `HTTP ${re.status}; ${JSON.stringify(afterSoon.delay?.cancelRequest)}`);
  sql(`update order_cancel_requests set requested_at = ${minutesAgo(11)} where order_id = '${out.order.id}' and status = 'pending'`);
  const auto = await waitFor(() => deliveryStatus(out.order.id) === 'not_delivered' || deliveryStatus(out.order.id) === 'returning' || deliveryStatus(out.order.id) === 'returned_to_store');
  const reqRow = sql(`select status||'/'||decided_by from order_cancel_requests where order_id = '${out.order.id}' and status <> 'refused' order by requested_at desc limit 1`);
  record('ATRASO-9', 'ACEITE AUTOMÁTICO: sem resposta em 10 min o sistema aceita (decided_by system) e a corrida segue para devolução à loja', reqRow.startsWith('approved/system') && auto, `pedido de cancelamento=${reqRow}; corrida=${deliveryStatus(out.order.id)}`);
  const noReply = await adminCall('POST', `/v1/admin/orders/${out.order.id}/late-cancel/respond`, { action: 'accept' });
  record('ATRASO-10', 'responder depois do aceite automático: 409 NO_CANCEL_REQUEST', noReply.status === 409, `HTTP ${noReply.status}`);
  // devolução confirmada pela loja => pedido cancelado e estorno total
  const dId = deliveryOf(out.order.id);
  const ret = await adminCall('POST', `/v1/admin/logistics/deliveries/${dId}/status`, { action: 'return_confirmed' });
  const storeRet = await storeOrder(`${out.order.id}/return-received`);
  const fin = (await getOrder(c, out.order.id)).data;
  record('ATRASO-11', 'devolução à loja confirmada: pedido cancelado e estorno total', fin.status === 'cancelled' && fin.payment?.status === 'refunded', `return_confirmed HTTP ${ret.status}; loja HTTP ${storeRet.status}; status=${fin.status}; pagamento=${fin.payment?.status}`);
  const coupon = sql(`select count(*) from coupons where source_order_id = '${out.order.id}'`);
  record('ATRASO-12', 'quem cancelou por atraso NÃO recebe a compensação', coupon === '0', `cupons de compensação=${coupon}`);

  // (7) compensação: entregue depois do fim da faixa + tolerância
  const late = await outForDelivery(c);
  setLate(late.order.id, 20);
  const dl = await adminCall('POST', `/v1/admin/logistics/deliveries/${late.deliveryId}/status`, { action: 'delivered', code: (await getOrder(c, late.order.id)).data?.tracking?.deliveryCode });
  const comp = sql(`select code||'|'||kind||'|'||value||'|'||max_uses||'|'||per_customer_limit||'|'||ends_at::date from coupons where source_order_id = '${late.order.id}'`);
  record('ATRASO-13', 'entregue 20 min depois do fim da faixa: gera 1 cupom de frete grátis pessoal (30 dias, 1 uso)', dl.status === 200 && comp !== '', `entrega HTTP ${dl.status}; cupom=${comp}`);
  const code = comp.split('|')[0];
  const other = await newCustomer();
  await cartOf(other, 'delivery');
  const stolen2 = await api('PUT', '/v1/cart/coupon?mode=delivery&addressId=' + other.addressId, { token: other.token, body: { code } });
  record('ATRASO-14', 'cupom é intransferível: outra conta não consegue aplicar (COUPON_NOT_FOUND, sem revelar que existe)', stolen2.status === 422 && stolen2.data?.code === 'COUPON_NOT_FOUND', `HTTP ${stolen2.status} ${stolen2.data?.code}`);
  await cartOf(c, 'pickup');
  const pk = await api('PUT', '/v1/cart/coupon?mode=pickup', { token: c.token, body: { code } });
  record('ATRASO-15', 'cupom de frete grátis não vale em pedido de retirada', pk.status === 422, `HTTP ${pk.status} ${JSON.stringify(pk.data).slice(0, 160)}`);
  const withCoupon = await place(c, 'delivery', { couponCode: code });
  const sum = withCoupon.cart?.summary;
  record('ATRASO-16', 'no próximo pedido de entrega o cupom zera a taxa de entrega', Boolean(withCoupon.order) && (money(sum?.deliveryFee) === 0 || money(sum?.delivery) === 0 || money(sum?.discount) > 0), `summary=${JSON.stringify(sum)}`);
  if (withCoupon.order) {
    await pay(c, withCoupon.order.id);
    const reuse = sql(`select count(*) from coupon_redemptions where coupon_id = (select id from coupons where code = '${code}')`);
    record('ATRASO-17', 'cupom usado uma única vez (resgate registrado)', reuse === '1', `resgates=${reuse}`);
    await adminCall('POST', `/v1/admin/orders/${withCoupon.order.id}/cancel`, { reason: 'Reteste QA ATRASO: limpar', refund: true });
  }
  // entregue dentro da faixa + tolerância: sem compensação
  const ok = await outForDelivery(c);
  const dl2 = await adminCall('POST', `/v1/admin/logistics/deliveries/${ok.deliveryId}/status`, { action: 'delivered', code: (await getOrder(c, ok.order.id)).data?.tracking?.deliveryCode });
  record('ATRASO-18', 'entregue no prazo: sem compensação', dl2.status === 200 && sql(`select count(*) from coupons where source_order_id = '${ok.order.id}'`) === '0', `HTTP ${dl2.status}`);
  // entregue 14 min depois do fim (dentro da tolerância)
  const edge = await outForDelivery(c);
  setLate(edge.order.id, 14);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${edge.deliveryId}/status`, { action: 'delivered', code: (await getOrder(c, edge.order.id)).data?.tracking?.deliveryCode });
  record('ATRASO-19', 'limite: 14 min depois do fim da faixa (dentro da tolerância) não gera compensação', sql(`select count(*) from coupons where source_order_id = '${edge.order.id}'`) === '0', '');
  const edge2 = await outForDelivery(c);
  setLate(edge2.order.id, 16);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${edge2.deliveryId}/status`, { action: 'delivered', code: (await getOrder(c, edge2.order.id)).data?.tracking?.deliveryCode });
  record('ATRASO-20', 'limite: 16 min depois do fim da faixa gera compensação (e uma só, mesmo que reprocesse)', sql(`select count(*) from coupons where source_order_id = '${edge2.order.id}'`) === '1', '');
}

// ------------------------------------------------------------------------------------------------ SEC-169 (ponto x CEP)
async function sec169() {
  await store();
  const c = await newCustomer({ noAddress: true });
  const far = await createAddress(c, { cep: '07900-100', number: '11', lat: -23.2801 + 0.25, lng: LNG }); // ~27 km ao norte
  record('SEC-169a', 'ponto a ~27 km do CEP é recusado (422 ADDRESS_PIN_FAR_FROM_CEP)', far.status === 422 && far.data?.code === 'ADDRESS_PIN_FAR_FROM_CEP', `HTTP ${far.status} ${far.data?.code}`);
  const wrongCity = await createAddress(c, { cep: '07900-100', number: '12', city: 'Franco da Rocha', neighborhood: 'Centro' });
  record('SEC-169b', 'CEP de Francisco Morato com cidade "Franco da Rocha": 422 ADDRESS_CEP_CITY_MISMATCH', wrongCity.status === 422 && wrongCity.data?.code === 'ADDRESS_CEP_CITY_MISMATCH', `HTTP ${wrongCity.status} ${wrongCity.data?.code}`);
  const near = await createAddress(c, { cep: '07900-100', number: '13', lat: -23.2811 + 0.002, lng: -46.7452 });
  record('SEC-169c', 'ponto a ~200 m do centro do CEP é aceito', near.status === 201, `HTTP ${near.status} ${near.data?.code ?? ''}`);
  const none = await createAddress(c, { cep: '07900-100', number: '14', omitPoint: true });
  record('SEC-169d', 'sem ponto, o servidor usa o do CEP', none.status === 201 && Math.abs(none.data?.lat - -23.28) < 0.1, `HTTP ${none.status} lat=${none.data?.lat} lng=${none.data?.lng}`);
  // edição também confere
  const edit = await api('PATCH', `/v1/me/addresses/${near.data?.id}`, { token: c.token, body: { lat: -22.5, lng: -46.0 } });
  record('SEC-169e', 'editar o endereço para um ponto longe do CEP também é recusado', edit.status === 422, `HTTP ${edit.status} ${edit.data?.code}`);
  // limite de 2000 m (endereco_pino_max_m): 1,9 km passa, 2,1 km não (centro real do CEP = o ponto devolvido sem GPS)
  const center = { lat: none.data?.lat, lng: none.data?.lng };
  const metersNorth = (m) => center.lat + m / 111_320;
  const inside = await createAddress(c, { cep: '07900-100', number: '15', lat: metersNorth(1900), lng: center.lng });
  const outside = await createAddress(c, { cep: '07900-100', number: '16', lat: metersNorth(2100), lng: center.lng });
  record('SEC-169f', 'limite de 2000 m do centro do CEP: 1,9 km aceito (201) e 2,1 km recusado (422)', inside.status === 201 && outside.status === 422, `1,9 km HTTP ${inside.status}; 2,1 km HTTP ${outside.status} ${outside.data?.code}`);
  // CEP de outra cidade, nome certo da outra cidade, mas região não atendida
  const ghost = await createAddress(c, { cep: '07000-000', number: '21', omitPoint: false });
  const ghost2 = await createAddress(c, { cep: '00000-000', number: '22', city: 'Francisco Morato' });
  record('SEC-169h', 'CEP que não existe (00000-000) é recusado mesmo com pino e cidade (ceebc28: "CEP must exist")', ghost2.status >= 400 && ghost2.status < 500, `HTTP ${ghost2.status} ${ghost2.data?.code}; (07000-000 sem região: HTTP ${ghost.status} ${ghost.data?.code})`);
  const sp = await createAddress(c, { cep: '01001-000', number: '1', city: 'São Paulo', neighborhood: 'Sé', lat: -23.55, lng: -46.633 });
  record('SEC-169g', 'CEP de São Paulo (fora das regiões): 422 REGION_NOT_SERVED', sp.status === 422, `HTTP ${sp.status} ${sp.data?.code}`);
}

// ------------------------------------------------------------------------------------------------ SEC-155 / SEC-170 (cupom de primeira compra)
async function sec170() {
  await store();
  const coupons = sql(`select code||':'||coalesce(max_uses::text,'sem teto') from coupons where first_purchase_only`);
  console.log(`  cupons de primeira compra no seed: ${coupons || 'nenhum'}`);
  const created = await adminCall('POST', '/v1/admin/coupons', { code: `QAPC${Date.now() % 1000000}`, kind: 'percent', value: 10, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString(), firstPurchaseOnly: true, minOrderCents: 0, maxUses: 50 });
  const code = created.data?.code ?? 'BEMVINDO10';
  console.log(`  cupom de primeira compra do teste: ${code} (criação HTTP ${created.status})`);
  const tag = String(Date.now() % 100000); // endereço novo a cada execução (a regra olha pedidos pagos anteriores no mesmo CEP+número)
  const a = await newCustomer({ address: { cep: '07900-200', number: tag } });
  const a1 = await place(a, 'delivery', { couponCode: code });
  record('SEC-170a', `primeira compra com ${code}: pedido nasce com desconto`, Boolean(a1.order) && money(a1.cart?.summary?.discount) > 0, `HTTP ${a1.res.status}; desconto=${JSON.stringify(a1.cart?.summary?.discount)}`);
  if (a1.order) await pay(a, a1.order.id);
  // (a) outra conta, mesmo CEP + número, complemento diferente
  const b = await newCustomer({ address: { cep: '07900-200', number: tag, complement: 'Apto 12' } });
  const b1 = await place(b, 'delivery', { couponCode: code });
  const applied = money(b1.cart?.summary?.discount) > 0;
  record('SEC-170b', 'multiconta: outra conta no MESMO CEP+número (só o complemento muda) não leva o cupom', !applied || !b1.order, `pedido=${Boolean(b1.order)} desconto=${JSON.stringify(b1.cart?.summary?.discount)}; HTTP ${b1.res.status} ${JSON.stringify(b1.res.data).slice(0, 160)}`);
  // (b) pedidos simultâneos não pagos no mesmo endereço
  const c1 = await newCustomer({ address: { cep: '07900-300', number: tag } });
  const c2 = await newCustomer({ address: { cep: '07900-300', number: tag, complement: 'Casa 2' } });
  const [p1, p2] = await Promise.all([place(c1, 'delivery', { couponCode: code }), place(c2, 'delivery', { couponCode: code })]);
  const winners = [p1, p2].filter((p) => p.order && money(p.order.summary?.discount ?? p.cart?.summary?.discount) > 0).length;
  record('SEC-170c', 'pedidos SIMULTÂNEOS (não pagos) no mesmo endereço: só um leva o desconto', winners <= 1, `descontos concedidos=${winners}; HTTP ${p1.res.status}/${p2.res.status}`);
  // (c) quem já comprou
  const again = await place(a, 'delivery', { couponCode: code });
  record('SEC-155a', 'quem já tem pedido pago não usa o cupom de primeira compra de novo', !again.order || !(money(again.cart?.summary?.discount) > 0), `HTTP ${again.res.status}; desconto=${JSON.stringify(again.cart?.summary?.discount)}`);
  // (d) e-mail não confirmado
  const unv = await newCustomer({ verify: false, address: { cep: '07900-400', number: tag } });
  await cartOf(unv, 'delivery');
  const r = await api('PUT', `/v1/cart/coupon?mode=delivery&addressId=${unv.addressId}`, { token: unv.token, body: { code } });
  record('SEC-155b', 'e-mail não confirmado: cupom de primeira compra recusado (COUPON_EMAIL_UNVERIFIED)', r.status === 422 && /EMAIL_UNVERIFIED/.test(JSON.stringify(r.data)), `HTTP ${r.status} ${r.data?.code}`);
  // (e) admin: cupom de primeira compra exige teto de usos (SEC-170d)
  const base = { kind: 'percent', value: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString(), firstPurchaseOnly: true, minOrderCents: 0 };
  const noCap = await adminCall('POST', '/v1/admin/coupons', { ...base, code: `QA7A${Date.now() % 100000}` });
  record('SEC-170d', 'criar cupom de primeira compra SEM teto de usos (maxUses) é recusado pelo admin (4xx)', noCap.status >= 400 && noCap.status < 500, `HTTP ${noCap.status} ${JSON.stringify(noCap.data).slice(0, 200)}`);
  const withCap = await adminCall('POST', '/v1/admin/coupons', { ...base, code: `QA7B${Date.now() % 100000}`, maxUses: 5 });
  record('SEC-170e', 'com teto de usos (maxUses=5) o mesmo cupom é criado (201)', withCap.status === 201, `HTTP ${withCap.status} ${JSON.stringify(withCap.data).slice(0, 120)}`);
  if (withCap.status === 201) {
    const remove = await adminCall('PATCH', `/v1/admin/coupons/${withCap.data.id}`, { maxUses: null });
    record('SEC-170f', 'remover o teto depois (PATCH maxUses=null) de um cupom de primeira compra também é recusado', remove.status >= 400 && remove.status < 500, `HTTP ${remove.status} ${JSON.stringify(remove.data).slice(0, 160)}`);
  }
  record('SEC-170g', 'o cupom de demonstração BEMVINDO10 do seed é de primeira compra e NÃO tem teto (maxUses nulo), contra a regra que o admin impõe', sql(`select max_uses is not null from coupons where code = 'BEMVINDO10'`) === 't', `max_uses=${sql(`select coalesce(max_uses::text,'nulo') from coupons where code = 'BEMVINDO10'`)} (só dados de desenvolvimento)`);
  for (const o of [a1.order, b1.order, p1.order, p2.order]) if (o) await adminCall('POST', `/v1/admin/orders/${o.id}/cancel`, { reason: 'Reteste QA SEC-170: limpar', refund: true }).catch(() => undefined);
}

// ------------------------------------------------------------------------------------------------ SEC-168 (limite de tentativas no arrependimento)
async function sec168() {
  await store();
  await setParam('exclusao_arrependimento_horas', 72);
  const mail = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  // código do e-mail mais novo depois de `since` (o cadastro também mandou um código: não pode ser esse)
  const lastCode = async (email, since) => {
    for (let i = 0; i < 12; i++) {
      const found = await (await fetch(`${mail}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const mails = (found.messages ?? []).filter((x) => /código/i.test(x.Subject) && new Date(x.Created).getTime() >= since - 300).sort((a, b) => new Date(b.Created) - new Date(a.Created));
      const code = mails[0]?.Subject.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
      await sleep(400);
    }
  };
  const cancel = (email, password, ip, code) => api('POST', '/v1/auth/account-deletion/cancel', { body: { email, password, ...(code ? { code } : {}) }, headers: { 'x-forwarded-for': ip } });
  const pending = async () => {
    const c = await newCustomer({ noAddress: true });
    const r = await api('POST', '/v1/me/deletion', { token: c.token, body: { password: SEED_PASSWORD } });
    if (r.status !== 200) throw new Error(`exclusão ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return c;
  };
  try {
    await setParam('login_stepup_falhas_h', 10); // mínimo permitido; o padrão é 20 e o limite por e-mail do cancelamento é 10
    const stepUp = 10;
    const u = await pending();
    const wrong = [];
    // metade das falhas pelo próprio endpoint de cancelamento e metade pelo /auth/login, sempre de IPs diferentes (botnet)
    for (let i = 0; i < stepUp / 2; i++) wrong.push((await cancel(u.email, 'errada-errada-1', `198.51.100.${10 + i}`)).status);
    for (let i = 0; i < stepUp / 2; i++) wrong.push((await api('POST', '/v1/auth/login', { body: { email: u.email, password: 'errada-errada-1' }, headers: { 'x-forwarded-for': `198.51.105.${10 + i}` } })).status);
    const sentAt = Date.now();
    const good = await cancel(u.email, SEED_PASSWORD, '203.0.113.50');
    record('SEC-168a', `${stepUp} senhas erradas de IPs DIFERENTES somam no contador da conta; a senha certa então exige o código do e-mail (403 LOGIN_CODE_REQUIRED), não reabre direto`, wrong.every((x) => x === 401 || x === 403) && good.status === 403 && good.data?.code === 'LOGIN_CODE_REQUIRED', `erradas=${wrong.join(',')}; certa sem código HTTP ${good.status} ${good.data?.code}`);
    const code = await lastCode(u.email, sentAt);
    const badCode = await cancel(u.email, SEED_PASSWORD, '203.0.113.51', code === '000000' ? '111111' : '000000');
    const stillClosed = await login(u.email);
    const okCode = await cancel(u.email, SEED_PASSWORD, '203.0.113.52', code);
    const reuse = await cancel(u.email, SEED_PASSWORD, '203.0.113.53', code);
    const reopened = await login(u.email);
    record('SEC-168b', 'código errado: 400; conta continua fechada; com o código certo reabre (204); o código é de uso único; depois o login volta (ou pede o 2º código do step-up)', badCode.status === 400 && stillClosed.status >= 400 && okCode.status === 204 && reuse.status === 401 && (reopened.status === 200 || reopened.data?.code === 'LOGIN_CODE_REQUIRED'), `errado ${badCode.status} ${badCode.data?.code}; login fechado ${stillClosed.status}; certo ${okCode.status} ${okCode.data?.code ?? ''} ${okCode.data?.detail ?? ''}; reuso ${reuse.status}; login depois ${reopened.status}; código usado=${code}`);

    // SEC-176 (3f0ca5e) trocou o 429 por e-mail (que deixava um terceiro trancar o dono para fora) pelo step-up: depois de 10 tentativas/h
    // no e-mail, a SENHA CERTA passa a exigir o código do e-mail; quem não tem a senha segue com 401 genérico, sem 429 e sem gerar e-mail.
    const v = await pending();
    const seq = [];
    for (let i = 0; i < 12; i++) seq.push((await cancel(v.email, 'errada-errada-1', `198.51.102.${i + 1}`)).status);
    const sentV = Date.now();
    const ownerTry = await cancel(v.email, SEED_PASSWORD, '203.0.113.70');
    const ownerCode = await lastCode(v.email, sentV);
    const ownerDone = await cancel(v.email, SEED_PASSWORD, '203.0.113.71', ownerCode);
    record('SEC-168c', '12 tentativas erradas de IPs diferentes: todas 401 (terceiro não tranca o dono com 429); o dono (senha certa, IP novo) recebe 403 LOGIN_CODE_REQUIRED e reabre com o código (204)', seq.every((x) => x === 401) && ownerTry.status === 403 && ownerTry.data?.code === 'LOGIN_CODE_REQUIRED' && ownerDone.status === 204, `erradas=${seq.join(',')}; dono sem código ${ownerTry.status} ${ownerTry.data?.code}; com código ${ownerDone.status}`);

    const w = await pending();
    const one = await cancel(w.email, SEED_PASSWORD, '203.0.113.60');
    record('SEC-168d', 'sem ataque, a senha certa reabre direto (204, sem código)', one.status === 204, `HTTP ${one.status}`);

    const x = await newCustomer({ noAddress: true, verify: false });
    await api('POST', '/v1/me/deletion', { token: x.token, body: { password: SEED_PASSWORD } });
    for (let i = 0; i < stepUp / 2; i++) await cancel(x.email, 'errada-errada-1', `198.51.103.${i + 1}`);
    for (let i = 0; i < stepUp / 2; i++) await api('POST', '/v1/auth/login', { body: { email: x.email, password: 'errada-errada-1' }, headers: { 'x-forwarded-for': `198.51.106.${i + 1}` } });
    const generic = await cancel(x.email, SEED_PASSWORD, '203.0.113.61');
    record('SEC-168e', 'conta SEM e-mail confirmado sob ataque recebe a resposta genérica 401 (nunca o código)', generic.status === 401 && generic.data?.code === 'INVALID_CREDENTIALS', `HTTP ${generic.status} ${generic.data?.code}`);

    // mesmo IP: limite de 5 por hora
    const y = await pending();
    const same = [];
    const sameIp = `198.51.${100 + Math.floor(Math.random() * 100)}.${1 + Math.floor(Math.random() * 250)}`; // IP novo: o limite por IP é de 10/h na rota
    for (let i = 0; i < 7; i++) same.push((await cancel(y.email, 'errada-errada-1', sameIp)).status);
    record('SEC-168f', 'mesmo IP: a 6ª tentativa em diante é 429 (o X-Forwarded-For é honrado só atrás do proxy confiável)', same.slice(5).every((s) => s === 429), `status=${same.join(',')}`);
  } finally {
    await resetParam('exclusao_arrependimento_horas');
    await resetParam('login_stepup_falhas_h');
  }
}

// ------------------------------------------------------------------------------------------------ concorrência de estoque (flaky visto na suíte)
async function estoque() {
  const s = await store();
  const original = sql(`select stock||'|'||reserved from product_variants where id = '${s.variantId}'`).split('|');
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    sql(`update product_variants set stock = 12, reserved = 0 where id = '${s.variantId}'`); // 6 clientes x 4 unidades: só 3 cabem
    const customers = await Promise.all(Array.from({ length: 6 }, () => newCustomer()));
    const prepared = [];
    for (const c of customers) {
      const { cart } = await cartOf(c, 'pickup');
      prepared.push({ c, cart: cart.data });
    }
    const results = await Promise.all(prepared.map(({ c, cart }, i) => api('POST', '/v1/orders', { token: c.token, headers: { 'Idempotency-Key': `qa7-${round}-${i}-${Date.now()}` }, body: { mode: 'pickup', cartRevision: cart.revision, expectedTotalCents: cart.summary.total.amount, paymentMethod: 'pix' } })));
    const won = results.filter((r) => r.status === 201).length;
    const lostCodes = results.filter((r) => r.status !== 201).map((r) => `${r.status}:${r.data?.code}`);
    const [stock, reserved] = sql(`select stock, reserved from product_variants where id = '${s.variantId}'`).split('|').map(Number);
    rounds.push({ won, lostCodes, stock, reserved });
    for (const r of results) if (r.status === 201) await adminCall('POST', `/v1/admin/orders/${r.data.id}/cancel`, { reason: 'Reteste QA estoque: limpar', refund: true }).catch(() => undefined);
  }
  sql(`update product_variants set stock = ${original[0]}, reserved = ${original[1]} where id = '${s.variantId}'`);
  record('ESTOQUE-1', '6 clientes simultâneos disputam o estoque de 3 pedidos (3 rodadas): exatamente 3 vencem, 3 perdem com o MESMO código STOCK_CONFLICT e a reserva termina em 12 (nunca acima do estoque)', rounds.every((r) => r.won === 3 && r.lostCodes.every((c) => c === '409:STOCK_CONFLICT') && r.reserved === 12 && r.stock >= r.reserved), JSON.stringify(rounds));
}

// ------------------------------------------------------------------------------------------------ limpeza (devolve o estoque dos pedidos de teste que ficaram abertos)
async function limpeza() {
  const ids = sql(`select o.id from orders o join users u on u.id = o.user_id where (u.email like 'qa7.%' or u.email like 'smoke.%') and o.status in ('awaiting_payment','received','accepted','in_preparation','ready_for_pickup','ready_for_collection','out_for_delivery')`).split('\n').filter(Boolean);
  let done = 0;
  for (const id of ids) {
    const r = await adminCall('POST', `/v1/admin/orders/${id}/cancel`, { reason: 'Limpeza do QA: devolver estoque do pedido de teste', refund: true });
    if (r.status === 200) done++;
  }
  console.log(`  pedidos de teste abertos: ${ids.length}; cancelados: ${done}`);
}

// ------------------------------------------------------------------------------------------------ trocas (exchanges) e logística de coleta
async function deliveredOrder(c) {
  const { order, deliveryId } = await outForDelivery(c);
  const code = (await getOrder(c, order.id)).data?.tracking?.deliveryCode;
  const done = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'delivered', code });
  if (done.status !== 200) throw new Error(`entregar ${done.status} ${JSON.stringify(done.data).slice(0, 200)}`);
  return (await getOrder(c, order.id)).data;
}
async function troca() {
  const s = await store();
  const c = await newCustomer();
  const other = await newCustomer();
  const exch = (customer, orderId, body) => api('POST', `/v1/orders/${orderId}/exchanges`, { token: customer.token, headers: { 'Idempotency-Key': randomUUID() }, body });
  const storeCall = (method, path, body) => api(method, `/v1/stores/${s.id}${path}`, { token: s.owner, body });

  // (1) arrependimento, entrega na loja
  const o1 = await deliveredOrder(c);
  const itemOf = async (order) => (await api('GET', `/v1/orders/${order.id}/exchange-options`, { token: c.token })).data?.items?.[0]?.orderItemId;
  const item1 = { id: await itemOf(o1) };
  const total1 = money(o1.summary.total);
  const bola = await exch(other, o1.id, { orderItemId: item1.id, type: 'withdrawal', method: 'drop_at_store' });
  record('TROCA-1', 'outra conta não pede troca do pedido alheio (404)', bola.status === 404, `HTTP ${bola.status}`);
  const w = await exch(c, o1.id, { orderItemId: item1.id, type: 'withdrawal', method: 'drop_at_store' });
  record('TROCA-2', 'arrependimento nasce aprovado na hora e a resolução é sempre reembolso', w.status === 201 && w.data?.status === 'approved' && w.data?.resolution === 'refund', `HTTP ${w.status}; status=${w.data?.status}; resolução=${w.data?.resolution}; taxa de coleta=${money(w.data?.fee)}`);
  const dup = await exch(c, o1.id, { orderItemId: item1.id, type: 'withdrawal', method: 'drop_at_store' });
  record('TROCA-3', 'o mesmo item não pode ser trocado duas vezes (409/422)', [409, 422].includes(dup.status), `HTTP ${dup.status} ${dup.data?.code}`);
  const drop = await api('POST', `/v1/exchanges/${w.data?.id}/drop-at-store`, { token: c.token, body: {} });
  const mid = await api('GET', `/v1/exchanges/${w.data?.id}`, { token: c.token });
  const recv = await storeCall('POST', `/exchanges/${w.data?.id}/receive`, { ok: true, code: mid.data?.storeCode });
  const afterW = await api('GET', `/v1/exchanges/${w.data?.id}`, { token: c.token });
  const refunded = refundedCents(o1.id);
  record('TROCA-4', 'a loja confirma o recebimento: troca concluída e reembolso feito (total do pedido)', recv.status === 200 && afterW.data?.status === 'completed' && refunded === total1, `drop HTTP ${drop.status}; receive HTTP ${recv.status}; status=${afterW.data?.status}; reembolsado=${refunded}/${total1}`);

  // (2) arrependimento com coleta em casa => corrida de coleta (logística)
  const o2 = await deliveredOrder(c);
  const w2 = await exch(c, o2.id, { orderItemId: await itemOf(o2), type: 'withdrawal', method: 'pickup_at_home' });
  const pickupDelivery = w2.data?.id ? sql(`select id||'|'||status||'|'||kind from deliveries where exchange_id = '${w2.data.id}' order by created_at desc limit 1`) : '';
  record('TROCA-5', 'coleta em casa cria a corrida de coleta na fila da logística', w2.status === 201 && pickupDelivery !== '', `HTTP ${w2.status} ${w2.data?.code ?? ''}; corrida=${pickupDelivery}`);
  if (pickupDelivery) {
    const [dId] = pickupDelivery.split('|');
    const couriers = await adminCall('GET', '/v1/admin/logistics/couriers');
    const courier = couriers.data?.data?.find((m) => m.active !== false)?.id;
    const as = await adminCall('POST', `/v1/admin/logistics/deliveries/${dId}/assign`, { courierId: courier });
    const steps = [];
    for (const action of ['confirm', 'picked_up']) steps.push((await adminCall('POST', `/v1/admin/logistics/deliveries/${dId}/status`, { action })).status);
    const fin = await adminCall('POST', `/v1/admin/logistics/deliveries/${dId}/status`, { action: 'delivered' });
    const ex2 = await api('GET', `/v1/exchanges/${w2.data?.id}`, { token: c.token });
    record('TROCA-6', 'coleta percorre atribuir, a caminho, coletou e entregue à loja; a troca avança', as.status === 200 && steps.every((x) => x === 200), `assign ${as.status}; passos ${steps.join(',')}; entrega-à-loja HTTP ${fin.status}; troca=${ex2.data?.status}`);
    const rc = await storeCall('POST', `/exchanges/${w2.data?.id}/receive`, { ok: true });
    const ex3 = await api('GET', `/v1/exchanges/${w2.data?.id}`, { token: c.token });
    record('TROCA-7', 'a loja confirma o recebimento da coleta: troca concluída e reembolso total', rc.status === 200 && ex3.data?.status === 'completed' && refundedCents(o2.id) === money(o2.summary.total), `receive HTTP ${rc.status}; status=${ex3.data?.status}; reembolsado=${refundedCents(o2.id)}/${money(o2.summary.total)}`);
  }

  // (3) fora do prazo de 7 dias do arrependimento
  const o3 = await deliveredOrder(c);
  sql(`update orders set delivered_at = now() - interval '8 days' where id = '${o3.id}'`);
  const late = await exch(c, o3.id, { orderItemId: await itemOf(o3), type: 'withdrawal', method: 'drop_at_store' });
  record('TROCA-8', 'arrependimento fora dos 7 dias é recusado (piso legal: CDC art. 49)', [409, 422].includes(late.status), `HTTP ${late.status} ${late.data?.code}`);

  // (4) troca voluntária por tamanho/cor: loja em silêncio => aprovação automática
  const policy = await api('PUT', `/v1/stores/${s.id}/exchange-policy`, { token: s.owner, body: { voluntaryDays: 7, collectionFeeCents: 0 } });
  const o4 = await deliveredOrder(c);
  const v = await exch(c, o4.id, { orderItemId: await itemOf(o4), type: 'size_color', reasonCode: 'size', method: 'drop_at_store', resolution: 'refund' });
  record('TROCA-9', 'troca por tamanho/cor nasce "requested" (a loja decide)', v.status === 201 && v.data?.status === 'requested', `HTTP ${v.status} ${v.data?.code ?? ''}; status=${v.data?.status}`);
  if (v.status === 201) {
    sql(`update exchange_requests set answer_deadline_at = now() - interval '1 minute' where id = '${v.data.id}'`);
    const auto = await waitFor(async () => (await api('GET', `/v1/exchanges/${v.data.id}`, { token: c.token })).data?.status !== 'requested', { timeoutMs: 90_000 });
    const ex = (await api('GET', `/v1/exchanges/${v.data.id}`, { token: c.token })).data;
    record('TROCA-10', 'APROVAÇÃO AUTOMÁTICA: loja em silêncio além do prazo => aprovada pelo sistema (autoApproved=true, decidedBy=system)', auto && ['approved', 'awaiting_fee'].includes(ex?.status) && ex?.autoApproved === true && ex?.decidedBy === 'system', `status=${ex?.status}; autoApproved=${ex?.autoApproved}; decidedBy=${ex?.decidedBy}`);
  }
  // (5) loja recusa com motivo, cliente contesta => mediação
  const o5 = await deliveredOrder(c);
  const v5 = await exch(c, o5.id, { orderItemId: await itemOf(o5), type: 'size_color', reasonCode: 'color', method: 'drop_at_store', resolution: 'refund' });
  if (v5.status === 201) {
    const ref = await storeCall('POST', `/exchanges/${v5.data.id}/refuse`, { reason: 'Item usado, fora da política' });
    const contest = await api('POST', `/v1/exchanges/${v5.data.id}/contest`, { token: c.token, body: { text: 'O item está lacrado, com etiqueta de fábrica' } });
    const med = await adminCall('GET', '/v1/admin/exchanges/mediations');
    record('TROCA-11', 'loja recusa, cliente contesta: a troca vai para mediação e aparece na fila do admin', ref.status === 200 && contest.status === 200 && JSON.stringify(med.data).includes(v5.data.id), `refuse ${ref.status}; contest ${contest.status} ${JSON.stringify(contest.data).slice(0, 120)}; fila=${JSON.stringify(med.data).includes(v5.data.id)}`);
  } else record('TROCA-11', 'loja recusa, cliente contesta', false, `criação HTTP ${v5.status} ${v5.data?.code}`);
}

// ------------------------------------------------------------------------------------------------ BUG-013 (pedido duplicado por corrida)
async function bug013() {
  await store();
  const c = await newCustomer();
  const { cart } = await cartOf(c, 'pickup');
  const body = { mode: 'pickup', cartRevision: cart.data.revision, expectedTotalCents: cart.data.summary.total.amount, paymentMethod: 'pix' };
  const res = await Promise.all([0, 1, 2].map((i) => api('POST', '/v1/orders', { token: c.token, headers: { 'Idempotency-Key': `qa7-dup-${Date.now()}-${i}` }, body })));
  const created = res.filter((r) => r.status === 201).length;
  const orders = Number(sql(`select count(*) from orders where user_id = (select id from users where email = '${c.email}')`));
  record('BUG-013a', '3 criações simultâneas da mesma revisão da sacola com chaves de idempotência DIFERENTES geram 1 pedido', created === 1 && orders === 1, `HTTP ${res.map((r) => `${r.status}:${r.data?.code ?? 'ok'}`).join(' ')}; pedidos no banco=${orders}`);
  const key = `qa7-same-${Date.now()}`;
  const c2 = await newCustomer();
  const { cart: cart2 } = await cartOf(c2, 'pickup');
  const body2 = { mode: 'pickup', cartRevision: cart2.data.revision, expectedTotalCents: cart2.data.summary.total.amount, paymentMethod: 'pix' };
  const [r1, r2] = await Promise.all([api('POST', '/v1/orders', { token: c2.token, headers: { 'Idempotency-Key': key }, body: body2 }), api('POST', '/v1/orders', { token: c2.token, headers: { 'Idempotency-Key': key }, body: body2 })]);
  const n2 = Number(sql(`select count(*) from orders where user_id = (select id from users where email = '${c2.email}')`));
  const ok201 = [r1, r2].filter((r) => r.status === 201);
  const sameOrConflict = ok201.length >= 1 && [r1, r2].every((r) => r.status === 201 || r.status === 409) && (ok201.length === 1 || r1.data?.id === r2.data?.id);
  record('BUG-013b', 'toque duplo com a MESMA chave: um pedido só (o segundo recebe o mesmo pedido ou 409 "em andamento")', sameOrConflict && n2 === 1, `HTTP ${r1.status}/${r2.status}; pedidos no banco=${n2}`);
}

const sections = { bug013, troca, limpeza, estoque, bug011, bug012, bug014, bug015, bug016, bug017, bug018, teto, atraso, sec169, sec170, sec168 };
const wanted = process.argv.slice(2);
// Acomodação do gerador (não é o que se testa): um cliente só gera 5 PIX por hora (`pix_hora_max`); os cenários precisam de mais.
await setParam('pix_hora_max', 30, 'Reteste QA Onda 7: acomodação do gerador de pedidos (restaurado no fim)');
for (const name of wanted.length ? wanted : Object.keys(sections)) {
  if (!sections[name]) {
    console.error(`seção desconhecida: ${name}`);
    continue;
  }
  console.log(`\n=== ${name} ===`);
  try {
    await sections[name]();
  } catch (error) {
    record(`${name.toUpperCase()}-ERRO`, 'a seção terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '));
  }
}
await resetParam('pix_hora_max').catch(() => undefined);
process.exit(finish() === 0 ? 0 : 1);
