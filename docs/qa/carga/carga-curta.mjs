#!/usr/bin/env node
// Carga CURTA e INDICATIVA contra a API local (Onda 7). Gerador em Node (fetch), mesma intenção do s1-navegacao.k6.js.
// LIMITES HONESTOS: gerador, API, PostgreSQL, Redis e outros processos dividem a MESMA máquina de sandbox (4 vCPU) com outros agentes;
// não vale como aprovação de desempenho (plano-carga.md §1 e §3 exigem staging igual à produção e gerador separado). Serve para
// achar erro funcional sob concorrência e dar uma ordem de grandeza.
// Uso: API_URL=http://localhost:3000 VUS=20 SECONDS=60 node docs/qa/carga/carga-curta.mjs   (API com TRUST_PROXY=1 e seed completo)
import { readFileSync } from 'node:fs';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const VUS = Number(process.env.VUS ?? 20);
const SECONDS = Number(process.env.SECONDS ?? 60);
const THINK_MS = Number(process.env.THINK_MS ?? 0); // 0 = pior caso (sem pausa); o plano usa 5 a 15 s
const LAT = -23.2801;
const LNG = -46.744;

const stats = new Map(); // operação -> { ms: [], ok: 0, fail: 0, codes: Map }
function note(op, ms, status) {
  const s = stats.get(op) ?? { ms: [], ok: 0, fail: 0, codes: new Map() };
  s.ms.push(ms);
  if (status >= 200 && status < 400) s.ok++;
  else s.fail++;
  s.codes.set(status, (s.codes.get(status) ?? 0) + 1);
  stats.set(op, s);
}
async function timed(op, path, vu) {
  const ip = `10.${vu % 250}.${Math.floor(vu / 250)}.7`;
  const t0 = performance.now();
  let status = 0;
  try {
    const r = await fetch(API + path, { headers: { 'x-forwarded-for': ip } });
    status = r.status;
    await r.arrayBuffer();
  } catch {
    status = 0;
  }
  note(op, performance.now() - t0, status);
  return status;
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);
const rssMb = (pidFile) => {
  try {
    const pid = readFileSync(pidFile, 'utf8').trim();
    const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/);
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
};

const found = await (await fetch(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}`)).json();
const storeIds = (found.data ?? []).map((s) => s.id);
if (!storeIds.length) throw new Error('sem lojas na busca: o seed rodou?');
const productIds = [];
for (const id of storeIds.slice(0, 6)) for (const p of (await (await fetch(`${API}/v1/browse/stores/${id}/products?limit=10`)).json()).data ?? []) productIds.push(p.id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

console.log(`[carga] API ${API} | ${VUS} VUs | ${SECONDS} s | pausa ${THINK_MS} ms | ${storeIds.length} lojas, ${productIds.length} produtos`);
const rssBefore = rssMb(process.env.API_PID_FILE ?? '/nonexistent');
const end = Date.now() + SECONDS * 1000;
const started = Date.now();
await Promise.all(
  Array.from({ length: VUS }, async (_, i) => {
    // rampa simples: cada VU entra espaçado em 1/3 do tempo
    await new Promise((r) => setTimeout(r, ((SECONDS * 1000) / 3) * (i / VUS)));
    while (Date.now() < end) {
      await timed('home', `/v1/home?lat=${LAT}&lng=${LNG}`, i);
      await timed('busca-lojas', `/v1/search/stores?lat=${LAT}&lng=${LNG}&q=pao`, i);
      await timed('loja-produtos', `/v1/browse/stores/${pick(storeIds)}/products?limit=20`, i);
      await timed('produto', `/v1/browse/products/${pick(productIds)}`, i);
      if (THINK_MS) await new Promise((r) => setTimeout(r, THINK_MS * (0.5 + Math.random())));
    }
  }),
);
const elapsed = (Date.now() - started) / 1000;
const rssAfter = rssMb(process.env.API_PID_FILE ?? '/nonexistent');

console.log(`\n| operação | requisições | erros | p50 ms | p95 ms | p99 ms | máx ms | códigos |\n|---|---|---|---|---|---|---|---|`);
let total = 0;
let failed = 0;
for (const [op, s] of stats) {
  const sorted = [...s.ms].sort((a, b) => a - b);
  total += s.ok + s.fail;
  failed += s.fail;
  console.log(`| ${op} | ${s.ok + s.fail} | ${s.fail} | ${pct(sorted, 50).toFixed(0)} | ${pct(sorted, 95).toFixed(0)} | ${pct(sorted, 99).toFixed(0)} | ${sorted.at(-1).toFixed(0)} | ${[...s.codes].map(([c, n]) => `${c}x${n}`).join(' ')} |`);
}
console.log(`\n[carga] total ${total} requisições em ${elapsed.toFixed(0)} s = ${(total / elapsed).toFixed(1)} req/s; erros ${failed} (${((failed / total) * 100).toFixed(2)}%)${rssBefore ? `; RSS da API ${rssBefore} MB -> ${rssAfter} MB` : ''}`);
process.exit(failed === 0 ? 0 : 1);
