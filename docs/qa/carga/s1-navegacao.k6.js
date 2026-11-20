// k6 — S1 Navegação (plano-carga.md §4): home, busca por proximidade, página da loja e do produto.
// EXECUTADO no G4 final em versão curta (indicativo, sandbox; ver docs/qa/carga/README.md). A versão completa (rampa 5 min, platô 10 min) é para o
// staging igual à produção. Variáveis: API_URL, VUS (padrão 200), RAMPA/PLATO/DESCIDA (padrão 5m/10m/3m), PAUSA_MIN/PAUSA_MAX (s, padrão 5/15).
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
        { duration: __ENV.RAMPA || '5m', target: VUS }, // rampa
        { duration: __ENV.PLATO || '10m', target: VUS }, // platô
        { duration: __ENV.DESCIDA || '3m', target: 0 }, // descida
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
const PAUSA_MIN = Number(__ENV.PAUSA_MIN || 5);
const PAUSA_MAX = Number(__ENV.PAUSA_MAX || 15);
const pausa = () => sleep(PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN));

export default function (data) {
  const headers = { 'X-Forwarded-For': `10.${__VU % 250}.${Math.floor(__VU / 250) % 250}.${1 + (__ITER % 250)}` };
  let r = http.get(`${API}/v1/home?lat=${LAT}&lng=${LNG}`, { headers });
  home.add(r.timings.duration);
  check(r, { 'home 200': (x) => x.status === 200 });
  pausa();

  r = http.get(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}&q=pao`, { headers });
  search.add(r.timings.duration);
  check(r, { 'busca 200': (x) => x.status === 200 });
  pausa();

  r = http.get(`${API}/v1/browse/stores/${pick(data.stores)}/products?limit=20`, { headers });
  store.add(r.timings.duration);
  check(r, { 'loja 200': (x) => x.status === 200 });
  pausa();

  r = http.get(`${API}/v1/browse/products/${pick(data.products)}`, { headers });
  product.add(r.timings.duration);
  check(r, { 'produto 200': (x) => x.status === 200 });
  pausa();
}
