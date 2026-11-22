#!/usr/bin/env node
// Smoke de desempenho das rotas tocadas pela R1.3 (QA, 2026-11-22), contra a API REAL compilada (mesmo ambiente de `docs/qa/retestes/lib.mjs`: seed, provedor `fake`).
// Mede tempo (p50, p95, máx.) de cada rota, em série e em paralelo. É régua de regressão, não aprovação de desempenho (máquina compartilhada, 1 réplica, disco em tmpfs).
// Uso: API_URL=http://127.0.0.1:3400 QA_TOTP_FILE=/caminho/totp.txt N=30 node docs/qa/performance/r13-rotas-tocadas.mjs [rótulo]
// Cria 200 produtos "QAPERF ..." (por SQL) na loja do seed (ficam no banco de teste; use banco descartável) e roda: lista de lotes, tabela de preços, prévia, aplicar e desfazer de 200 itens,
// ajuste de estoque, ficha 360 do admin (DT-088) e a massa do admin (prévia e estoque de 200 itens; limite de 10 por hora por admin, usa 3).
import { adminCall, api, sql, store } from '../retestes/lib.mjs';

const N = Number(process.env.N ?? 30);
const label = process.argv[2] ?? 'head';
const BASE = process.env.BASE === '1'; // build anterior à R1.3: sem lotes, sem desfazer e sem massa do admin; mede só o que já existia
const rows = [];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
async function measure(name, n, fn, { parallel = 1 } = {}) {
  const times = [];
  let bad = 0;
  const one = async () => {
    const t0 = performance.now();
    const status = await fn();
    times.push(performance.now() - t0);
    if (status >= 400) bad += 1;
  };
  for (let i = 0; i < n; i += parallel) await Promise.all(Array.from({ length: Math.min(parallel, n - i) }, one));
  times.sort((a, b) => a - b);
  const row = { name, n, parallel, p50: Math.round(pct(times, 50)), p95: Math.round(pct(times, 95)), max: Math.round(times.at(-1)), erros: bad };
  rows.push(row);
  console.log(`${label} | ${name} | n=${n} x${parallel} | p50 ${row.p50} ms | p95 ${row.p95} ms | máx ${row.max} ms | erros ${bad}`);
  return row;
}

const s = await store();
const owner = s.owner;
const sid = s.id;
const first = (await api('GET', `/v1/stores/${sid}/products?limit=1`, { token: owner })).data?.data?.[0];
const categoryId = first?.categoryId ?? (await api('GET', `/v1/stores/${sid}/products/${first.id}`, { token: owner })).data?.categoryId;

// ---- preparo: 200 produtos ativos com 1 variação cada (fora da medição)
const existing = Number(sql(`select count(*) from products where store_id = '${sid}' and name like 'QAPERF %'`));
const ids = [];
const variants = new Map();
if (existing >= 200) {
  for (const line of sql(`select p.id || '|' || v.id from products p join product_variants v on v.product_id = p.id where p.store_id = '${sid}' and p.name like 'QAPERF %' order by p.id limit 200`).split('\n')) {
    const [pid, vid] = line.split('|');
    ids.push(pid);
    variants.set(pid, vid);
  }
} else {
  // Preparo por SQL (a criação pela API tem limite de taxa e o teto de 100 rascunhos); a medição abaixo é toda pela API.
  const tag = Math.random().toString(36).slice(2, 6);
  sql(`insert into products (store_id, name, status, base_price_cents, category_id) select '${sid}', 'QAPERF ' || lpad(g::text, 3, '0') || ' ${tag}', 'active', 1000 + ((g * 137) % 9000), '${categoryId}' from generate_series(0, 199) g`);
  sql(`insert into product_variants (product_id, store_id, attributes, attributes_key, stock) select id, store_id, '{}'::jsonb, '', 50 from products where store_id = '${sid}' and name like 'QAPERF %' and name like '% ${tag}'`);
  for (const line of sql(`select p.id || '|' || v.id from products p join product_variants v on v.product_id = p.id where p.store_id = '${sid}' and p.name like 'QAPERF %' and p.name like '% ${tag}' order by p.id`).split('\n')) {
    const [pid, vid] = line.split('|');
    ids.push(pid);
    variants.set(pid, vid);
  }
}

const key = () => `perf-${Math.random().toString(36).slice(2, 12)}${Date.now()}`;
const bulkBody = (preview, over = {}) => ({ productIds: preview.map((p) => p.productId), expectedVersions: preview.map((p) => ({ productId: p.productId, version: p.version })), action: { type: 'price_adjust', mode: 'percent', value: 1 }, ...over });
const dry = async () => (await api('POST', `/v1/stores/${sid}/products/bulk`, { token: owner, body: { productIds: ids, dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 1 } } })).data;

// ---- lojista
if (!BASE) await measure('GET lotes (bulk-batches?limit=20)', N, async () => (await api('GET', `/v1/stores/${sid}/products/bulk-batches?limit=20`, { token: owner })).status);
await measure('GET tabela de preços (limit=50)', N, async () => (await api('GET', `/v1/stores/${sid}/products/table?limit=50`, { token: owner })).status);
await measure('POST bulk prévia 200 itens', 10, async () => (await api('POST', `/v1/stores/${sid}/products/bulk`, { token: owner, body: { productIds: ids, dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 1 } } })).status);
await measure('POST bulk prévia 200 itens, 5 em paralelo', 10, async () => (await api('POST', `/v1/stores/${sid}/products/bulk`, { token: owner, body: { productIds: ids, dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 1 } } })).status, { parallel: 5 });
const applyTimes = [];
const undoTimes = [];
let applyBad = 0;
for (let i = 0; i < 5; i += 1) {
  const preview = (await dry()).preview;
  let t0 = performance.now();
  const applied = await api('POST', `/v1/stores/${sid}/products/bulk`, { token: owner, headers: { 'idempotency-key': key() }, body: bulkBody(preview) });
  applyTimes.push(performance.now() - t0);
  if (applied.status !== 200) {
    applyBad += 1;
    continue;
  }
  if (BASE) continue;
  t0 = performance.now();
  const undone = await api('POST', `/v1/stores/${sid}/products/bulk/${applied.data.batchId}/undo`, { token: owner });
  undoTimes.push(performance.now() - t0);
  if (undone.status !== 200 || undone.data.reverted !== 200) applyBad += 1;
}
for (const [name, times] of BASE ? [['POST bulk aplicar 200 itens (base: sem lote)', applyTimes]] : [['POST bulk aplicar 200 itens (com lote)', applyTimes], ['POST desfazer lote de 200 itens', undoTimes]]) {
  times.sort((a, b) => a - b);
  const row = { name, n: times.length, parallel: 1, p50: Math.round(pct(times, 50)), p95: Math.round(pct(times, 95)), max: Math.round(times.at(-1) ?? 0), erros: applyBad };
  rows.push(row);
  console.log(`${label} | ${name} | n=${row.n} x1 | p50 ${row.p50} ms | p95 ${row.p95} ms | máx ${row.max} ms | erros ${applyBad}`);
}
const one = ids[0];
await measure('POST ajuste de estoque (1 produto, delta +1)', N, async () => (await api('POST', `/v1/stores/${sid}/products/${one}/variants/${variants.get(one)}/stock`, { token: owner, body: { delta: 1 } })).status);

// ---- admin
// A 1ª chamada do admin pode esperar o próximo passo do TOTP (reautenticação do `lib.mjs`, até 30 s): é do preparo, não da rota; fica fora da medição.
await adminCall('GET', `/v1/admin/stores/${sid}/overview`);
await measure('GET ficha 360 (overview) do admin (DT-088)', N, async () => (await adminCall('GET', `/v1/admin/stores/${sid}/overview`)).status);
await measure('GET ficha 360, 5 em paralelo', N, async () => (await adminCall('GET', `/v1/admin/stores/${sid}/overview`)).status, { parallel: 5 });
if (BASE) {
  console.log(JSON.stringify({ label, rows }));
  process.exit(0);
}
const reason = { code: 'requested_by_merchant', note: 'QA smoke de desempenho' };
const adminDry = async () => (await adminCall('POST', `/v1/admin/stores/${sid}/products/bulk`, { reason, productIds: ids, dryRun: true, action: { type: 'stock_adjust', value: 1 } })).data;
await measure('POST admin bulk prévia 200 itens', 5, async () => (await adminCall('POST', `/v1/admin/stores/${sid}/products/bulk`, { reason, productIds: ids, dryRun: true, action: { type: 'stock_adjust', value: 1 } })).status);
const adminTimes = [];
let adminBad = 0;
for (let i = 0; i < 3; i += 1) {
  const preview = await adminDry();
  const t0 = performance.now();
  const res = await adminCall('POST', `/v1/admin/stores/${sid}/products/bulk`, { reason, productIds: ids, expectedVersions: (preview.items ?? preview.preview ?? []).map((p) => ({ productId: p.productId, version: p.version })), action: { type: 'stock_adjust', value: 1 } }, { 'idempotency-key': key() });
  adminTimes.push(performance.now() - t0);
  if (res.status !== 200) adminBad += 1;
}
adminTimes.sort((a, b) => a - b);
rows.push({ name: 'POST admin bulk estoque 200 itens', n: 3, parallel: 1, p50: Math.round(pct(adminTimes, 50)), p95: Math.round(pct(adminTimes, 95)), max: Math.round(adminTimes.at(-1)), erros: adminBad });
console.log(`${label} | POST admin bulk estoque 200 itens | n=3 x1 | p50 ${rows.at(-1).p50} ms | p95 ${rows.at(-1).p95} ms | máx ${rows.at(-1).max} ms | erros ${adminBad}`);

console.log(JSON.stringify({ label, rows }));
