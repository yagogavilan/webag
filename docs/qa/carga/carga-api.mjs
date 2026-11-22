#!/usr/bin/env node
// Gerador de carga em Node (sem dependência externa) para a jornada do cliente: home -> loja -> produto -> busca -> sacola -> pedido -> acompanhamento.
// Mede latência por rota (p50/p95/p99), req/s, erros, bytes de resposta e CPU/RAM da API, do PostgreSQL e do Redis. Doc: docs/qa/performance/api-2026-11-22.md
//
//   API_URL=http://127.0.0.1:3100 DATABASE_URL=postgresql://... API_PID=<pid> VUS=300 DURATION_S=60 RAMP_S=15 node docs/qa/carga/carga-api.mjs
//
// Pré-requisitos: banco com `seed-large.sql`, API com TRUST_PROXY=1 (cada VU manda um X-Forwarded-For próprio, como cada celular tem o seu IP) e PAYMENT_PROVIDER=fake.
// Os tokens são assinados aqui com o segredo de dev (JWT_ACCESS_SECRET) e a sessão é criada direto no banco: o login (Argon2id, caro de propósito) fica fora do tráfego de navegação.
// Variáveis: VUS, DURATION_S, RAMP_S, THINK_MIN_MS/THINK_MAX_MS (pausa entre telas; padrão 1500 a 4500), ORDER_PCT (fração das jornadas que criam pedido; padrão 0.05),
// SEARCH_PCT (0.5), ENCODING (identity|gzip; padrão identity), OUT (arquivo JSON), STATS=1 (zera e lê o pg_stat_statements), LABEL (nome da rodada).
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
const pg = require('pg');

const env = (name, fallback) => process.env[name] ?? fallback;
const API_URL = new URL(env('API_URL', 'http://127.0.0.1:3100'));
const DATABASE_URL = env('DATABASE_URL', 'postgresql://webag:perf@127.0.0.1:55432/webag_perf');
const VUS = Number(env('VUS', '100'));
const DURATION_S = Number(env('DURATION_S', '60'));
const RAMP_S = Number(env('RAMP_S', '15'));
const THINK_MIN = Number(env('THINK_MIN_MS', '1500'));
const THINK_MAX = Number(env('THINK_MAX_MS', '4500'));
const ORDER_PCT = Number(env('ORDER_PCT', '0.05'));
const SEARCH_PCT = Number(env('SEARCH_PCT', '0.5'));
const ENCODING = env('ENCODING', 'identity');
const JWT_SECRET = env('JWT_ACCESS_SECRET', 'dev-only-insecure-change-me-0123456789abcdef');
const API_PID = env('API_PID', '');
const OUT = env('OUT', '');
const LABEL = env('LABEL', `vus${VUS}`);

const agent = new http.Agent({ keepAlive: true, maxSockets: Math.max(VUS * 2, 64) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const think = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------- métricas
const metrics = new Map();
let recording = false;
const WORDS = ['arroz', 'feijao', 'camiseta', 'tenis', 'racao', 'shampoo', 'caderno', 'fone', 'cafe', 'leite', 'pao', 'maca', 'sabonete', 'mochila', 'brinquedo', 'lampada', 'queijo', 'frango'];

function record(label, ms, status, bytes, gz) {
  if (!recording) return;
  let m = metrics.get(label);
  if (!m) metrics.set(label, (m = { lat: [], status: {}, bytes: 0, gz: 0, gzN: 0, n: 0 }));
  m.lat.push(ms);
  m.n += 1;
  m.status[status] = (m.status[status] ?? 0) + 1;
  m.bytes += bytes;
  if (gz) {
    m.gz += gz;
    m.gzN += 1;
  }
}

function call(label, method, path, { token, ip, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      { agent, host: API_URL.hostname, port: API_URL.port, method, path, headers: { 'accept-encoding': ENCODING, 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          let raw = Buffer.concat(chunks);
          const wire = raw.length;
          if (res.headers['content-encoding'] === 'gzip') raw = zlib.gunzipSync(raw);
          // Para dimensionar o ganho da compressão sem ligá-la: gzip de amostra das primeiras respostas de cada rota (só quando o cliente pediu identity).
          const m = metrics.get(label);
          const gz = ENCODING === 'identity' && raw.length > 200 && (!m || m.gzN < 30) ? zlib.gzipSync(raw).length : 0;
          let json = null;
          if (raw.length > 0 && String(res.headers['content-type'] ?? '').includes('json')) {
            try {
              json = JSON.parse(raw.toString('utf8'));
            } catch {
              /* corpo não JSON */
            }
          }
          record(label, ms, res.statusCode ?? 0, wire, gz);
          resolve({ status: res.statusCode ?? 0, json, ms, headers: res.headers });
        });
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')));
    req.on('error', () => {
      record(label, Number(process.hrtime.bigint() - started) / 1e6, 'ERR', 0, 0);
      resolve({ status: 0, json: null, ms: 0, headers: {} });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------- preparo (usuários, sessões, tokens)
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function signJwt(sub, sid) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const claims = b64({ sub, sid, typ: 'access', iss: 'webag-api', aud: 'webag-clients', iat: now, exp: now + 4 * 3600 });
  return `${head}.${claims}.${createHmac('sha256', JWT_SECRET).update(`${head}.${claims}`).digest('base64url')}`;
}

async function prepare() {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  const users = (
    await db.query(
      `select u.id, a.id as address_id, a.lat, a.lng from users u join user_addresses a on a.user_id = u.id and a.is_default
        where u.email ~ '^cliente[0-9]+@perf\\.webag\\.local$' order by random() limit $1`,
      [VUS],
    )
  ).rows;
  if (users.length < VUS) throw new Error(`Só ${users.length} clientes no banco (precisa de ${VUS}); rode seed-large.sql`);
  const ids = users.map((u) => u.id);
  await db.query(`delete from sessions where user_id = any($1) and ip = 'carga'`, [ids]);
  const sessions = (await db.query(`insert into sessions (user_id, ip, absolute_expires_at) select unnest($1::uuid[]), 'carga', now() + interval '1 day' returning id, user_id`, [ids])).rows;
  const sessionOf = new Map(sessions.map((s) => [s.user_id, s.id]));
  const vus = users.map((u, i) => ({ ...u, lat: Number(u.lat), lng: Number(u.lng), token: signJwt(u.id, sessionOf.get(u.id)), ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${(i & 255) + 1}` }));
  if (process.env.STATS === '1') await db.query('select pg_stat_statements_reset()').catch(() => undefined);
  return { db, vus };
}

// ---------------------------------------------------------------- jornada de um cliente
const geo = (vu) => `lat=${vu.lat}&lng=${vu.lng}`;
async function journey(vu, counters) {
  const opts = { token: vu.token, ip: vu.ip };
  const pub = { ip: vu.ip };
  if (Math.random() < 0.3) await call('GET /v1/me/addresses', 'GET', '/v1/me/addresses', opts);
  const home = await call('GET /v1/home', 'GET', `/v1/home?${geo(vu)}&mode=delivery`, pub);
  await think();
  const feed = [...(home.json?.nearbyStores ?? []), ...(home.json?.newStores ?? [])];
  const store = feed.length > 0 ? pick(feed.slice(0, 6)) : null;
  if (!store) return counters.empty++;
  const [, list] = await Promise.all([call('GET /v1/browse/stores/{id}', 'GET', `/v1/browse/stores/${store.id}?${geo(vu)}`, pub), call('GET /v1/browse/stores/{id}/products', 'GET', `/v1/browse/stores/${store.id}/products?limit=20`, pub)]);
  await think();
  const available = (list.json?.data ?? []).filter((p) => p.available);
  if (Math.random() < 0.15 && list.json?.nextCursor) {
    await call('GET /v1/browse/stores/{id}/products (pág. 2)', 'GET', `/v1/browse/stores/${store.id}/products?limit=20&cursor=${encodeURIComponent(list.json.nextCursor)}`, pub);
    await think();
  }
  if (Math.random() < SEARCH_PCT) {
    const q = pick(WORDS);
    await call('GET /v1/search/suggestions', 'GET', `/v1/search/suggestions?${geo(vu)}&q=${q.slice(0, 3)}`, pub);
    await call('GET /v1/search/products', 'GET', `/v1/search/products?${geo(vu)}&q=${q}&limit=20`, pub);
    await think();
    if (Math.random() < 0.3) await call('GET /v1/search/stores', 'GET', `/v1/search/stores?${geo(vu)}&q=${q}`, pub);
  }
  if (available.length === 0) return counters.empty++;
  const product = pick(available);
  const detail = await call('GET /v1/browse/products/{id}', 'GET', `/v1/browse/products/${product.id}?${geo(vu)}`, pub);
  await think();
  const variant = (detail.json?.variants ?? []).find((v) => v.available);
  if (!variant) return counters.empty++;
  const wantsOrder = Math.random() < ORDER_PCT;
  const qty = wantsOrder ? Math.min(variant.maxQuantity, Math.max(1, Math.ceil(2500 / variant.price.amount))) : 1;
  const added = await call('PUT /v1/cart/items/{variantId}', 'PUT', `/v1/cart/items/${variant.id}?mode=delivery&addressId=${vu.address_id}`, { ...opts, body: { quantity: qty, replaceStore: true } });
  await think();
  const cart = await call('GET /v1/cart', 'GET', `/v1/cart?mode=delivery&addressId=${vu.address_id}`, opts);
  if (!wantsOrder || !cart.json?.checkout?.canCheckout) return counters.journeys++;
  await think();
  const created = await call('POST /v1/orders', 'POST', '/v1/orders', {
    ...opts,
    headers: { 'idempotency-key': randomUUID() },
    body: { mode: 'delivery', addressId: vu.address_id, cartRevision: cart.json.revision, paymentMethod: 'pix', expectedTotalCents: cart.json.summary.total.amount },
  });
  if (created.status !== 201 && created.status !== 200) return void counters.orderFail++;
  counters.orders++;
  const orderId = created.json?.id;
  await call('GET /v1/orders/{id}/payment', 'GET', `/v1/orders/${orderId}/payment`, opts);
  for (let i = 0; i < 3; i++) {
    await think();
    await call('GET /v1/orders/{id}', 'GET', `/v1/orders/${orderId}`, opts); // acompanhar o pedido
  }
  await call('GET /v1/orders', 'GET', '/v1/orders?scope=active', opts);
  counters.journeys++;
  void added;
}

// ---------------------------------------------------------------- recursos (CPU/RAM) por amostragem de /proc
const TICKS = 100;
function procStat(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    // PSS (memória proporcional) em vez de RSS: o shared_buffers do PostgreSQL não pode ser contado uma vez por processo.
    let rss = Number(fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]) * 4096;
    try {
      rss = Number(/Pss:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))[1]) * 1024;
    } catch {
      /* sem smaps_rollup */
    }
    return { ticks: Number(f[11]) + Number(f[12]), rss };
  } catch {
    return null;
  }
}
function pidsByName(name) {
  const out = [];
  for (const dir of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(dir)) continue;
    try {
      if (fs.readFileSync(`/proc/${dir}/comm`, 'utf8').trim() === name) out.push(dir);
    } catch {
      /* processo terminou */
    }
  }
  return out;
}
function cpuTotal() {
  const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  return { total: f.reduce((a, b) => a + b, 0), idle: f[3] + f[4] };
}
const samples = [];
function sampler() {
  let last = { at: Date.now(), sys: cpuTotal(), api: API_PID ? procStat(API_PID) : null, pg: sumOf(pidsByName('postgres')), redis: sumOf(pidsByName('redis-server')), self: process.cpuUsage() };
  function sumOf(pids) {
    return pids.reduce((acc, pid) => {
      const s = procStat(pid);
      return s ? { ticks: acc.ticks + s.ticks, rss: acc.rss + s.rss } : acc;
    }, { ticks: 0, rss: 0 });
  }
  return setInterval(() => {
    const now = Date.now();
    const dt = (now - last.at) / 1000;
    const sys = cpuTotal();
    const api = API_PID ? procStat(API_PID) : null;
    const pgs = sumOf(pidsByName('postgres'));
    const redis = sumOf(pidsByName('redis-server'));
    const self = process.cpuUsage();
    if (recording)
      samples.push({
        sysCpu: 100 * (1 - (sys.idle - last.sys.idle) / (sys.total - last.sys.total)),
        apiCpu: api && last.api ? ((api.ticks - last.api.ticks) / TICKS / dt) * 100 : null,
        apiRssMb: api ? api.rss / 1048576 : null,
        pgCpu: ((pgs.ticks - last.pg.ticks) / TICKS / dt) * 100,
        pgRssMb: pgs.rss / 1048576,
        redisCpu: ((redis.ticks - last.redis.ticks) / TICKS / dt) * 100,
        genCpu: ((self.user + self.system - last.self.user - last.self.system) / 1e6 / dt) * 100,
      });
    last = { at: now, sys, api, pg: pgs, redis, self };
  }, 2000);
}

// ---------------------------------------------------------------- execução
const pct = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
const avg = (list) => (list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length);
const fmt = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

const { db, vus } = await prepare();
const counters = { journeys: 0, orders: 0, orderFail: 0, empty: 0 };
const startedAt = Date.now();
const stopAt = startedAt + (RAMP_S + DURATION_S) * 1000;
const timer = sampler();
let measuredStart = 0;
let measuredEnd = 0;
setTimeout(() => {
  recording = true;
  measuredStart = Date.now();
}, RAMP_S * 1000);
setTimeout(() => {
  recording = false; // fecha a janela medida; as jornadas em curso terminam sem entrar nas estatísticas
  measuredEnd = Date.now();
}, (RAMP_S + DURATION_S) * 1000);

await Promise.all(
  vus.map(async (vu, i) => {
    await sleep((i / vus.length) * RAMP_S * 1000); // rampa linear de entrada
    while (Date.now() < stopAt) await journey(vu, counters).catch(() => counters.orderFail++);
  }),
);
clearInterval(timer);
const measuredS = (measuredEnd - measuredStart) / 1000;

const rows = [...metrics.entries()].map(([label, m]) => {
  const sorted = m.lat.slice().sort((a, b) => a - b);
  const errs = Object.entries(m.status).filter(([s]) => !/^(2|3)/.test(s)).reduce((a, [, n]) => a + n, 0);
  return { label, n: m.n, rps: m.n / measuredS, p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), max: sorted.at(-1) ?? 0, errPct: (100 * errs) / m.n, status: m.status, avgBytes: m.bytes / m.n, avgGzBytes: m.gzN ? m.gz / m.gzN : null };
});
rows.sort((a, b) => b.n - a.n);
const total = rows.reduce((a, r) => a + r.n, 0);
const totalErr = rows.reduce((a, r) => a + (r.errPct * r.n) / 100, 0);
const res = {
  label: LABEL, vus: VUS, durationS: measuredS, rampS: RAMP_S, thinkMs: [THINK_MIN, THINK_MAX], requests: total, rps: total / measuredS, errPct: (100 * totalErr) / Math.max(total, 1), journeys: counters,
  cpu: { sysAvg: avg(samples.map((s) => s.sysCpu)), apiAvg: avg(samples.map((s) => s.apiCpu ?? 0)), apiMax: Math.max(0, ...samples.map((s) => s.apiCpu ?? 0)), pgAvg: avg(samples.map((s) => s.pgCpu)), pgMax: Math.max(0, ...samples.map((s) => s.pgCpu)), redisAvg: avg(samples.map((s) => s.redisCpu)), generatorAvg: avg(samples.map((s) => s.genCpu)) },
  ramMb: { apiMax: Math.max(0, ...samples.map((s) => s.apiRssMb ?? 0)), pgMax: Math.max(0, ...samples.map((s) => s.pgRssMb)) },
  routes: rows,
};
if (process.env.STATS === '1') {
  res.topStatements = (await db.query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as query, calls, round(total_exec_time::numeric, 0) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms, round(max_exec_time::numeric, 1) as max_ms, rows
     from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database()) order by total_exec_time desc limit 12`).catch(() => ({ rows: [] }))).rows;
}
await db.end();

console.log(`\n== ${LABEL}: ${VUS} VUs, ${measuredS.toFixed(0)} s medidos, ${total} req, ${res.rps.toFixed(0)} req/s, erros ${res.errPct.toFixed(2)}% | jornadas ${counters.journeys}, pedidos ${counters.orders}, falhas ${counters.orderFail}`);
console.log(`CPU% (100 = 1 vCPU): API ${fmt(res.cpu.apiAvg)} (pico ${fmt(res.cpu.apiMax)}), PG ${fmt(res.cpu.pgAvg)} (pico ${fmt(res.cpu.pgMax)}), Redis ${fmt(res.cpu.redisAvg)}, gerador ${fmt(res.cpu.generatorAvg)}, máquina ${fmt(res.cpu.sysAvg)}% | RAM máx: API ${fmt(res.ramMb.apiMax)} MB, PG ${fmt(res.ramMb.pgMax)} MB`);
console.log('rota'.padEnd(46), 'n'.padStart(7), 'req/s'.padStart(7), 'p50'.padStart(8), 'p95'.padStart(8), 'p99'.padStart(8), 'erro%'.padStart(6), 'bytes'.padStart(8), 'gzip'.padStart(7));
for (const r of rows) console.log(r.label.padEnd(46), String(r.n).padStart(7), fmt(r.rps).padStart(7), fmt(r.p50).padStart(8), fmt(r.p95).padStart(8), fmt(r.p99).padStart(8), r.errPct.toFixed(1).padStart(6), String(Math.round(r.avgBytes)).padStart(8), r.avgGzBytes === null ? '-'.padStart(7) : String(Math.round(r.avgGzBytes)).padStart(7));
if (res.topStatements) {
  console.log('\nTop consultas por tempo total (pg_stat_statements):');
  for (const s of res.topStatements) console.log(`${String(s.total_ms).padStart(8)} ms  ${String(s.calls).padStart(7)}x  média ${String(s.mean_ms).padStart(7)}  ${s.query}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
process.exit(0);
