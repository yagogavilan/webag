// k6 — S1 Navegação (plano-carga.md §4): home, busca por proximidade, página da loja e do produto.
// ESBOÇO NÃO EXECUTADO: o k6 não rodou no ambiente desta rodada (binário baixado do release oficial, sha256 conferido contra o
// arquivo de checksums do mesmo release, mas a execução foi negada pela política do sandbox). A carga indicativa da Onda 7
// foi feita com o gerador Node `carga-curta.mjs` (mesmos endpoints e mesmos limites). Rodar o k6 num staging igual à produção.
//
// Uso:  k6 run -e API_URL=http://localhost:3000 -e VUS=200 docs/qa/carga/s1-navegacao.k6.js
// Pré: seed completo (`pnpm run setup`) e API com TRUST_PROXY=1 (o limite de taxa é por IP; cada VU manda o próprio X-Forwarded-For).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const API = __ENV.API_URL || 'http://localhost:3000';
const VUS = Number(__ENV.VUS || 200);
const LAT = -23.2801;
const LNG = -46.744;
const home = new Trend('lat_home', true);
const search = new Trend('lat_busca', true);
const store = new Trend('lat_loja', true);
const product = new Trend('lat_produto', true);

export const options = {
  scenarios: {
    navegacao: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5m', target: VUS }, // rampa
        { duration: '10m', target: VUS }, // platô
        { duration: '3m', target: 0 }, // descida
      ],
    },
  },
  thresholds: {
    // plano-carga.md §5 (HIPÓTESE, exceto a busca: WB-013 C2)
    lat_home: ['p(95)<500', 'p(99)<1200'],
    lat_loja: ['p(95)<500', 'p(99)<1200'],
    lat_produto: ['p(95)<500', 'p(99)<1200'],
    lat_busca: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.005'],
  },
};

export function setup() {
  const found = http.get(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}`).json('data');
  const stores = found.map((s) => s.id);
  const products = [];
  for (const id of stores.slice(0, 6)) {
    for (const p of http.get(`${API}/v1/browse/stores/${id}/products?limit=10`).json('data')) products.push(p.id);
  }
  return { stores, products };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function (data) {
  const headers = { 'X-Forwarded-For': `10.${__VU % 250}.${Math.floor(__VU / 250) % 250}.${1 + (__ITER % 250)}` };
  let r = http.get(`${API}/v1/home?lat=${LAT}&lng=${LNG}`, { headers });
  home.add(r.timings.duration);
  check(r, { 'home 200': (x) => x.status === 200 });
  sleep(5 + Math.random() * 10);

  r = http.get(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}&q=pao`, { headers });
  search.add(r.timings.duration);
  check(r, { 'busca 200': (x) => x.status === 200 });
  sleep(5 + Math.random() * 10);

  r = http.get(`${API}/v1/browse/stores/${pick(data.stores)}/products?limit=20`, { headers });
  store.add(r.timings.duration);
  check(r, { 'loja 200': (x) => x.status === 200 });
  sleep(5 + Math.random() * 10);

  r = http.get(`${API}/v1/browse/products/${pick(data.products)}`, { headers });
  product.add(r.timings.duration);
  check(r, { 'produto 200': (x) => x.status === 200 });
  sleep(5 + Math.random() * 10);
}
