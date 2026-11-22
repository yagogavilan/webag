#!/usr/bin/env node
// Conta as consultas SQL, o tempo de banco e o tamanho da resposta de UMA chamada a cada rota da jornada do cliente (usa pg_stat_statements, que
// precisa estar ativo no banco: `create extension pg_stat_statements`). Rode com a API parada de outras cargas. Doc: docs/qa/performance/api-2026-11-22.md
//   API_URL=http://127.0.0.1:3100 DATABASE_URL=postgresql://... node docs/qa/carga/consultas-por-rota.mjs
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const pg = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('pg');
const API = process.env.API_URL ?? 'http://127.0.0.1:3100';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://webag:perf@127.0.0.1:55432/webag_perf' });
await db.connect();
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-only-insecure-change-me-0123456789abcdef';
const user = (await db.query(`select u.id, a.id as address_id, a.lat, a.lng from users u join user_addresses a on a.user_id = u.id and a.is_default where u.email ~ '^cliente[0-9]+@perf\\.webag\\.local$' limit 1`)).rows[0];
const sid = (await db.query(`insert into sessions (user_id, ip, absolute_expires_at) values ($1, 'carga', now() + interval '1 day') returning id`, [user.id])).rows[0].id;
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'HS256', typ: 'JWT' });
const claims = b64({ sub: user.id, sid, typ: 'access', iss: 'webag-api', aud: 'webag-clients', iat: now, exp: now + 7200 });
const token = `${head}.${claims}.${createHmac('sha256', secret).update(`${head}.${claims}`).digest('base64url')}`;
const geo = `lat=${user.lat}&lng=${user.lng}`;

async function get(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-encoding': 'identity', 'x-forwarded-for': '10.99.99.1' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, bytes: Buffer.byteLength(text), json: text ? JSON.parse(text) : null, cache: res.headers.get('cache-control'), etag: res.headers.get('etag') };
}
async function measure(label, fn, warm = true) {
  if (warm) await fn(); // 1ª chamada aquece cache de parâmetros e de plano; a medida é da 2ª (cache de Redis da home pode estar quente: ver nota na doc)
  await db.query('select pg_stat_statements_reset()');
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  const q = (await db.query(`select coalesce(sum(calls),0)::int as calls, coalesce(round(sum(total_exec_time)::numeric,1),0) as db_ms from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database()) and query not like '%pg_stat_statements%'`)).rows[0];
  console.log(`${label.padEnd(44)} ${String(r.status).padStart(3)}  consultas ${String(q.calls).padStart(3)}  banco ${String(q.db_ms).padStart(7)} ms  total ${ms.toFixed(1).padStart(7)} ms  ${String(r.bytes).padStart(6)} B  Cache-Control: ${r.cache ?? '(nenhum)'}`);
  if (process.env.DETAIL && label.includes(process.env.DETAIL)) {
    const rows = (await db.query(`select calls, left(regexp_replace(query, '\\s+', ' ', 'g'), 170) as query from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database()) and query not like '%pg_stat_statements%' and query not like 'SELECT lower(public.unaccent%' order by calls desc, total_exec_time desc limit 40`)).rows;
    for (const row of rows) console.log(`    ${String(row.calls).padStart(3)}x  ${row.query}`);
  }
  return r;
}

const home = await measure('GET /v1/home (cache quente)', () => get('GET', `/v1/home?${geo}&mode=delivery`));
const jitter = () => `lat=${(Number(user.lat) + Math.random() * 0.0005).toFixed(6)}&lng=${(Number(user.lng) + Math.random() * 0.0005).toFixed(6)}`;
await measure('GET /v1/home (ponto novo = cache frio)', () => get('GET', `/v1/home?${jitter()}&mode=delivery`), false);
const store = home.json.nearbyStores[0];
await measure('GET /v1/browse/stores/{id}', () => get('GET', `/v1/browse/stores/${store.id}?${geo}`));
const list = await measure('GET /v1/browse/stores/{id}/products', () => get('GET', `/v1/browse/stores/${store.id}/products?limit=20`));
const product = list.json.data.find((p) => p.available);
const detail = await measure('GET /v1/browse/products/{id}', () => get('GET', `/v1/browse/products/${product.id}?${geo}`));
await measure('GET /v1/search/suggestions', () => get('GET', `/v1/search/suggestions?${jitter()}&q=arr`), false);
await measure('GET /v1/search/products', () => get('GET', `/v1/search/products?${jitter()}&q=arroz&limit=20`), false);
await measure('GET /v1/search/stores', () => get('GET', `/v1/search/stores?${jitter()}&q=arroz`), false);
const variant = detail.json.variants.find((v) => v.available);
await measure('PUT /v1/cart/items/{variantId}', () => get('PUT', `/v1/cart/items/${variant.id}?mode=delivery&addressId=${user.address_id}`, { quantity: 4, replaceStore: true }));
const cart = await measure('GET /v1/cart', () => get('GET', `/v1/cart?mode=delivery&addressId=${user.address_id}`));
await measure('GET /v1/me/addresses', () => get('GET', '/v1/me/addresses'));
await measure('GET /v1/orders?scope=active', () => get('GET', '/v1/orders?scope=active'));
const last = (await get('GET', '/v1/orders?scope=past&limit=1')).json?.data?.[0];
if (last) await measure('GET /v1/orders/{id} (acompanhar)', () => get('GET', `/v1/orders/${last.id}`));
if (cart.json?.checkout?.canCheckout) {
  await db.query('select pg_stat_statements_reset()');
  const t0 = performance.now();
  const r = await fetch(`${API}/v1/orders`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': `perf-${Date.now()}`, 'x-forwarded-for': '10.99.99.1' }, body: JSON.stringify({ mode: 'delivery', addressId: user.address_id, cartRevision: cart.json.revision, paymentMethod: 'pix', expectedTotalCents: cart.json.summary.total.amount }) });
  const q = (await db.query(`select coalesce(sum(calls),0)::int as calls, coalesce(round(sum(total_exec_time)::numeric,1),0) as db_ms from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database()) and query not like '%pg_stat_statements%'`)).rows[0];
  console.log(`${'POST /v1/orders'.padEnd(44)} ${String(r.status).padStart(3)}  consultas ${String(q.calls).padStart(3)}  banco ${String(q.db_ms).padStart(7)} ms  total ${(performance.now() - t0).toFixed(1).padStart(7)} ms`);
}
await db.query(`delete from sessions where id = $1`, [sid]);
await db.end();
