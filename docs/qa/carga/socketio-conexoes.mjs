#!/usr/bin/env node
// S6 (plano de carga): N conexões Socket.IO (`/rt`) de clientes autenticados + latência do evento `order.status_changed` + memória/CPU da API por conexão.
// Os tokens são assinados aqui (como em carga-api.mjs) e as sessões criadas direto no banco. Doc: docs/qa/performance/api-2026-11-22.md
//   API_URL=http://127.0.0.1:3100 API_PID=<pid> DATABASE_URL=postgresql://... CONEXOES=1000 TRANSPORTS=websocket,polling OCIOSO_S=30 node docs/qa/carga/socketio-conexoes.mjs
// TRANSPORTS=polling mede o plano B (rede que bloqueia WebSocket). O evento é provocado aceitando pedidos "received" pela API (a loja aceita; o cliente recebe).
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
const pg = require('pg');
const { io } = require('socket.io-client');

const API = process.env.API_URL ?? 'http://127.0.0.1:3100';
const N = Number(process.env.CONEXOES ?? 1000);
const TRANSPORTS = (process.env.TRANSPORTS ?? 'websocket,polling').split(',');
const IDLE_S = Number(process.env.OCIOSO_S ?? 30);
const SAMPLE = Number(process.env.EVENTOS ?? 25);
const SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-only-insecure-change-me-0123456789abcdef';
const PID = process.env.API_PID;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://webag:perf@127.0.0.1:55432/webag_perf' });
await db.connect();

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sign = (sub, sid) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const claims = b64({ sub, sid, typ: 'access', iss: 'webag-api', aud: 'webag-clients', iat: now, exp: now + 4 * 3600 });
  return `${head}.${claims}.${createHmac('sha256', SECRET).update(`${head}.${claims}`).digest('base64url')}`;
};
const session = async (userId) => (await db.query(`insert into sessions (user_id, ip, absolute_expires_at) values ($1, 'carga', now() + interval '1 day') returning id`, [userId])).rows[0].id;
const rss = () => {
  if (!PID) return 0;
  try {
    return Number(/Pss:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${PID}/smaps_rollup`, 'utf8'))[1]) / 1024;
  } catch {
    return 0;
  }
};
const ticks = () => {
  try {
    const f = fs.readFileSync(`/proc/${PID}/stat`, 'utf8');
    const p = f.slice(f.lastIndexOf(')') + 2).split(' ');
    return Number(p[11]) + Number(p[12]);
  } catch {
    return 0;
  }
};
const pct = (list, p) => (list.length === 0 ? 0 : list.slice().sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor((p / 100) * list.length))]);

// pedidos "received" para provocar eventos: (cliente, loja, dono da loja, pedido)
const live = (
  await db.query(`select o.id as order_id, o.user_id, o.store_id, s.owner_user_id from orders o join stores s on s.id = o.store_id where o.status = 'received' and o.user_id in (select id from users where email ~ '^cliente[0-9]+@perf') order by random() limit $1`, [SAMPLE])
).rows;
const liveUsers = new Set(live.map((r) => r.user_id));
const others = (await db.query(`select id from users where email ~ '^cliente[0-9]+@perf' and id <> all($1) order by random() limit $2`, [[...liveUsers], Math.max(0, N - liveUsers.size)])).rows.map((r) => r.id);
const userIds = [...liveUsers, ...others];

const rssBefore = rss();
const connectMs = [];
let failed = 0;
const sockets = new Map();
const t0 = Date.now();
const ramp = 100; // conexões por segundo, como a abertura do app em horário de pico
for (let i = 0; i < userIds.length; i += ramp) {
  await Promise.all(
    userIds.slice(i, i + ramp).map(async (userId) => {
      const token = sign(userId, await session(userId));
      const started = performance.now();
      await new Promise((resolve) => {
        const socket = io(`${API}/rt`, { transports: TRANSPORTS, auth: { token }, reconnection: false, forceNew: true, extraHeaders: { 'x-forwarded-for': `10.${(i >> 8) & 255}.${i & 255}.${1 + (sockets.size % 250)}` } });
        socket.once('connect', () => {
          connectMs.push(performance.now() - started);
          sockets.set(userId, socket);
          resolve();
        });
        socket.once('connect_error', () => {
          failed++;
          resolve();
        });
      });
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
const rampS = (Date.now() - t0) / 1000;

// ocioso: batimento (ping/pong do engine.io) e memória
const cpu0 = ticks();
const idleStart = Date.now();
await new Promise((resolve) => setTimeout(resolve, IDLE_S * 1000));
const idleCpuPct = ((ticks() - cpu0) / 100 / ((Date.now() - idleStart) / 1000)) * 100;
const rssAfter = rss();

// eventos: a loja aceita o pedido, o cliente recebe `order.status_changed`
const latencies = [];
let lost = 0;
// sessão de cada dono de loja (quem aceita o pedido)
const ownerSessions = new Map();
for (const row of live) if (!ownerSessions.has(row.owner_user_id)) ownerSessions.set(row.owner_user_id, sign(row.owner_user_id, await session(row.owner_user_id)));
await Promise.all(
  live.map(async (row) => {
    const socket = sockets.get(row.user_id);
    if (!socket) return;
    const started = performance.now();
    const arrived = new Promise((resolve) => {
      socket.once('order.status_changed', () => resolve(performance.now() - started));
      setTimeout(() => resolve(null), 10_000);
    });
    const res = await fetch(`${API}/v1/stores/${row.store_id}/orders/${row.order_id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${ownerSessions.get(row.owner_user_id)}` } });
    const ms = await arrived;
    if (res.status !== 200 || ms === null) lost++;
    else latencies.push(ms);
  }),
);

console.log(`\n== Socket.IO: ${sockets.size}/${userIds.length} conexões (${TRANSPORTS.join(',')}), ${failed} falhas, rampa de ${rampS.toFixed(0)} s a ${ramp}/s`);
console.log(`conectar (ms): p50 ${pct(connectMs, 50).toFixed(0)}, p95 ${pct(connectMs, 95).toFixed(0)}, p99 ${pct(connectMs, 99).toFixed(0)}`);
console.log(`memória da API (PSS): ${rssBefore.toFixed(0)} MB antes, ${rssAfter.toFixed(0)} MB com ${sockets.size} conexões (${(((rssAfter - rssBefore) * 1024) / Math.max(sockets.size, 1)).toFixed(1)} KB por conexão) | CPU ociosa da API: ${idleCpuPct.toFixed(1)}% de 1 vCPU em ${IDLE_S} s`);
console.log(`evento order.status_changed (aceite pela API até o cliente receber, ms): ${latencies.length}/${live.length} recebidos, p50 ${pct(latencies, 50).toFixed(0)}, p95 ${pct(latencies, 95).toFixed(0)}, perdidos/falhas ${lost}`);
for (const socket of sockets.values()) socket.disconnect();
await db.end();
process.exit(0);
