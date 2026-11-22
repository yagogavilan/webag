#!/usr/bin/env node
// Prova que uma otimização NÃO mudou o resultado: chama as MESMAS URLs públicas de descoberta em duas APIs (a versão anterior e a nova, apontando para o mesmo banco
// e para Redis diferentes) e compara o JSON. Só leitura. Doc: docs/qa/performance/api-2026-11-22.md
//   A=http://127.0.0.1:3101 B=http://127.0.0.1:3100 DATABASE_URL=postgresql://... PONTOS=80 node docs/qa/carga/equivalencia.mjs
import { createRequire } from 'node:module';

const pg = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('pg');
const A = process.env.A ?? 'http://127.0.0.1:3101';
const B = process.env.B ?? 'http://127.0.0.1:3100';
const N = Number(process.env.PONTOS ?? 60);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://webag:perf@127.0.0.1:55432/webag_perf' });
await db.connect();
const base = (await db.query(`select lat, lng from user_addresses order by random() limit $1`, [N])).rows.map((r) => [Number(r.lat), Number(r.lng)]);
// bordas do raio e fora da área: 8, 14, 16 e 25 km de Francisco Morato, e um ponto longe de tudo
const extra = [[-23.2808, -46.7442], [-23.2808 + 0.07, -46.7442], [-23.2808 + 0.126, -46.7442], [-23.2808 + 0.145, -46.7442], [-23.2808 + 0.225, -46.7442], [-22.9, -47.1], [-23.5505, -46.6333]];
const points = [...base, ...extra];
const terms = ['arroz', 'camiseta', 'racao', 'cafe', 'tenis', 'pao', 'queijo', 'caderno', 'sabon', 'xyzxyz', 'ração', 'Banan', 'arrozz', 'camisata'];
const sorts = ['relevance', 'price_asc', 'distance', 'rating', 'discount'];
const urls = [];
for (const [lat, lng] of points) {
  const g = `lat=${lat}&lng=${lng}`;
  urls.push(`/v1/home?${g}&mode=delivery`, `/v1/home?${g}&mode=pickup`);
}
for (let i = 0; i < points.length; i++) {
  const [lat, lng] = points[i];
  const g = `lat=${lat}&lng=${lng}`;
  const q = terms[i % terms.length];
  urls.push(`/v1/search/products?${g}&q=${encodeURIComponent(q)}&sort=${sorts[i % sorts.length]}&limit=20`, `/v1/search/stores?${g}&q=${encodeURIComponent(q)}`, `/v1/search/stores?${g}&sort=distance`, `/v1/search/suggestions?${g}&q=${encodeURIComponent(q.slice(0, 4))}`, `/v1/search/products?${g}&sort=discount&limit=20`);
}
const get = async (host, url) => {
  const r = await fetch(host + url, { headers: { 'x-forwarded-for': '10.77.0.' + (1 + Math.floor(Math.random() * 250)) } });
  // `eta.fromAt/toAt` = "agora + minutos": mudam em milissegundos entre duas chamadas e não fazem parte da comparação.
  return { status: r.status, body: (await r.text()).replace(/"(fromAt|toAt)":"[^"]*"/g, '"$1":"~"') };
};
let same = 0;
let diff = 0;
const samples = [];
for (const url of urls) {
  const [a, b] = await Promise.all([get(A, url), get(B, url)]);
  if (a.status === b.status && a.body === b.body) same++;
  else {
    diff++;
    if (samples.length < 5) {
      let at = 0;
      while (at < a.body.length && a.body[at] === b.body[at]) at++;
      samples.push({ url: url.replace(/lat=[^&]+&lng=[^&]+/, 'lat,lng'), statusA: a.status, statusB: b.status, at, a: a.body.slice(Math.max(0, at - 60), at + 80), b: b.body.slice(Math.max(0, at - 60), at + 80) });
    }
  }
}
console.log(`URLs comparadas: ${urls.length} | idênticas: ${same} | diferentes: ${diff}`);
for (const s of samples) console.log(JSON.stringify(s));
await db.end();
process.exit(diff === 0 ? 0 : 1);
