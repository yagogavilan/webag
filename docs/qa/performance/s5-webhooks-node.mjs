#!/usr/bin/env node
// S5 (rajada de webhooks) em Node, para quando o k6 não está disponível. Mesmas regras de `docs/qa/carga/s5-webhooks.k6.js`: 85% válidas (todas DUPLICADAS: os
// pedidos já foram pagos no preparo), 5% assinatura inválida, 5% id desconhecido, 5% vencidas (ts de 10 min atrás). Mais um caso que o k6 não cobre:
// notificações válidas CONCORRENTES chegando junto com a aprovação (a corrida que o `processDue` com `now()` do banco corrige).
// Invariantes (conferidos no banco): nenhum 5xx; inválida e vencida = 401; o ledger NÃO muda com o reenvio; cada pedido tem exatamente 1 tentativa aprovada.
// Uso: API_URL=http://127.0.0.1:3400 QA_PGDB=webag_reg [TAXA=50 DURACAO_S=30 PEDIDOS=20] node docs/qa/performance/s5-webhooks-node.mjs   (ambiente de docs/qa/retestes/lib.mjs)
import { createHmac } from 'node:crypto';
import { api, finish, newCustomer, pay, place, record, resetParam, setParam, sleep, sql, waitFor, API } from '../retestes/lib.mjs';

const SECRET = process.env.WEBHOOK_SECRET ?? 'dev-only-fake-webhook-secret';
const TAXA = Number(process.env.TAXA ?? 50);
const DURACAO_S = Number(process.env.DURACAO_S ?? 30);
const PEDIDOS = Number(process.env.PEDIDOS ?? 20);

const signed = (dataId, ts = Date.now()) => {
  const requestId = `qa-${Math.random().toString(16).slice(2)}`;
  const id = /^[A-Za-z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
  const v1 = createHmac('sha256', SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
};
const post = (id, headers, n) =>
  fetch(`${API}/v1/webhooks/fake?data.id=${id}&type=payment`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.${n % 250}.${Math.floor(n / 250) % 250}.${1 + (n % 250)}`, ...headers } }).then((r) => r.status);

// ------------------------------------------------------------------ preparo: pedidos de PIX pagos pela rota de desenvolvimento
await setParam('pix_hora_max', 30, 'Preparo S5 (restaurado no fim)');
const ids = [];
const orders = [];
try {
  for (let i = 0; i < PEDIDOS; i++) {
    const c = await newCustomer();
    const o = await place(c, 'pickup');
    if (!o.order) throw new Error(`pedido recusado ${o.res.status} ${JSON.stringify(o.res.data).slice(0, 120)}`);
    await pay(c, o.order.id);
    orders.push(o.order.id);
    ids.push(sql(`select provider_payment_id from payment_attempts where external_reference = '${o.order.id}' order by created_at limit 1`));
  }
} finally {
  await resetParam('pix_hora_max');
}
const snap = () => ({ ledger: sql('select count(*)||\'|\'||coalesce(sum(amount_cents),0) from ledger_entries'), approved: sql(`select count(*) from payment_attempts where status = 'approved' and external_reference in ('${orders.join("','")}')`) });
await sleep(3000);
const before = snap();

// ------------------------------------------------------------------ rajada
const count = { valid: {}, invalid: {}, unknown: {}, expired: {} };
const bump = (kind, status) => (count[kind][status] = (count[kind][status] ?? 0) + 1);
let n = 0;
const total = TAXA * DURACAO_S;
const started = Date.now();
const inflight = new Set();
for (let i = 0; i < total; i++) {
  const wait = started + (i * 1000) / TAXA - Date.now();
  if (wait > 0) await sleep(wait);
  const k = n++;
  const pick = ids[Math.floor(Math.random() * ids.length)];
  const roll = Math.random();
  const job = (roll < 0.05 ? post(pick, { 'x-signature': `ts=${Date.now()},v1=${'0'.repeat(64)}`, 'x-request-id': 'qa-bad' }, k).then((s) => bump('invalid', s))
    : roll < 0.1 ? post(`desconhecido${k}`, signed(`desconhecido${k}`), k).then((s) => bump('unknown', s))
    : roll < 0.15 ? post(pick, signed(pick, Date.now() - 10 * 60 * 1000), k).then((s) => bump('expired', s))
    : post(pick, signed(pick), k).then((s) => bump('valid', s))).catch(() => bump('valid', 'erro'));
  inflight.add(job);
  job.finally(() => inflight.delete(job));
}
await Promise.all(inflight);
const elapsed = (Date.now() - started) / 1000;
await sleep(3000);
const after = snap();
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const has5xx = Object.values(count).some((o) => Object.keys(o).some((s) => Number(s) >= 500 || s === 'erro'));
console.log(`  [info] ${total} requisições em ${elapsed.toFixed(1)} s (${(total / elapsed).toFixed(0)}/s): ${JSON.stringify(count)}`);
record('S5-1', 'nenhum 5xx nem erro de transporte na rajada', !has5xx, JSON.stringify(count));
record('S5-2', 'assinatura inválida e notificação vencida = 401 sempre', Object.keys(count.invalid).every((s) => s === '401') && Object.keys(count.expired).every((s) => s === '401') && sum(count.invalid) > 0, `inválidas ${JSON.stringify(count.invalid)}; vencidas ${JSON.stringify(count.expired)}`);
record('S5-3', 'válida duplicada = 200 (idempotente)', Object.keys(count.valid).every((s) => s === '200') && sum(count.valid) > 0, JSON.stringify(count.valid));
record('S5-4', 'o ledger NÃO mudou com o reenvio (mesma contagem e mesma soma)', before.ledger === after.ledger, `antes ${before.ledger}; depois ${after.ledger}`);
record('S5-5', 'cada pedido do lote segue com exatamente 1 tentativa aprovada', Number(after.approved) === orders.length && before.approved === after.approved, `aprovadas ${before.approved} -> ${after.approved} de ${orders.length}`);
const statuses = sql(`select status||':'||count(*) from orders where id in ('${orders.join("','")}') group by status`);
record('S5-6', 'todos os pedidos do lote continuam em estado pago (received)', statuses === `received:${orders.length}`, statuses.replace(/\n/g, ' '));

// ------------------------------------------------------------------ corrida: notificações válidas simultâneas junto com a aprovação (primeira vez)
{
  const c = await newCustomer();
  await setParam('pix_hora_max', 30, 'S5 corrida (restaurado no fim)');
  let order;
  try {
    order = (await place(c, 'pickup')).order;
  } finally {
    await resetParam('pix_hora_max');
  }
  const pid = sql(`select provider_payment_id from payment_attempts where external_reference = '${order.id}' order by created_at limit 1`);
  const ledgerBefore = sql('select count(*) from ledger_entries');
  const approve = pay(c, order.id); // aprova pela rota de desenvolvimento...
  const burst = Promise.all(Array.from({ length: 30 }, (_, i) => post(pid, signed(pid), 5000 + i))); // ...enquanto 30 notificações válidas chegam juntas
  const [, statuses30] = await Promise.all([approve, burst]);
  const got = await waitFor(() => sql(`select status from orders where id = '${order.id}'`) === 'received', { timeoutMs: 15_000, everyMs: 250 });
  await sleep(2500);
  const rows = sql(`select count(*) from ledger_transactions where order_id = '${order.id}'`);
  const approved = sql(`select count(*) from payment_attempts where external_reference = '${order.id}' and status = 'approved'`);
  const eventsReceived = sql(`select count(*) from order_events where order_id = '${order.id}' and to_status = 'received'`);
  record('S5-7', 'corrida (30 notificações válidas + aprovação juntas): pedido vira received uma só vez, 1 tentativa aprovada, lançamentos únicos', got && approved === '1' && eventsReceived === '1' && statuses30.every((s) => s < 500), `received=${got}; aprovadas=${approved}; transições para received=${eventsReceived}; transações do ledger do pedido=${rows}; HTTP ${[...new Set(statuses30)].join('/')}; ledger total ${ledgerBefore} -> ${sql('select count(*) from ledger_entries')}`);
}

process.exit(finish() === 0 ? 0 : 1);
