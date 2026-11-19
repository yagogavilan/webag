// k6 — S9 Imagens (plano-carga.md §4, BUG-010): vários lojistas enviam foto de produto GRANDE ao mesmo tempo (POST pré-assinado + complete) enquanto
// a navegação (home) é medida. Invariantes: nenhum 5xx; PNG acima de 25 MP recusado com 422 UPLOAD_REJECTED (não processado); a latência de leitura não degrada
// (p95 < 1 s); RSS da API estável (conferir `docker stats`/`/proc/<pid>/status` antes e depois).
// Uso: node docs/qa/carga/s9-gerar-imagens.mjs && k6 run -e API_URL=http://localhost:3000 -e VUS=20 docs/qa/carga/s9-imagens.k6.js
// Pré: seed completo (os 12 lojistas de seed), API com TRUST_PROXY=1. Rodar no staging com a CPU/RAM do alvo e o gerador em outra máquina.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { API, LAT, LNG, PASSWORD, authed } from './lib-setup.k6.js';

const PNG25 = open('./imagens-s9/png25.png', 'b');
const PNG40 = open('./imagens-s9/png40.png', 'b');
const JPEG40 = open('./imagens-s9/jpeg40.jpg', 'b');
const VUS = Number(__ENV.VUS || 20);
const SLUGS = ['mercadinho-boa-compra', 'moda-passo-firme', 'padaria-pao-quente', 'hortifruti-sitio-verde', 'patas-cia-pet', 'papelaria-ponto-certo', 'eletro-conecta', 'farmacia-saude-ja', 'moda-express-franco', 'papelaria-ponto-do-saber', 'pet-shop-amigo-fiel', 'casa-cia-utilidades'];
const e5xx = new Counter('erros_5xx');
const aceitas = new Counter('uploads_aceitos');
const recusadas = new Counter('uploads_recusados_422');
const tComplete = new Trend('lat_complete', true);
const tHome = new Trend('lat_home_durante', true);

export const options = {
  scenarios: {
    envio: { executor: 'constant-vus', vus: VUS, duration: __ENV.DURACAO || '60s', exec: 'envio' },
    leitura: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: __ENV.DURACAO || '60s', preAllocatedVUs: 5, exec: 'leitura' },
  },
  thresholds: { erros_5xx: ['count==0'], lat_home_durante: ['p(95)<1000'] },
};

export function setup() {
  const sessions = [];
  SLUGS.forEach((slug, i) => {
    const r = http.post(`${API}/v1/auth/login`, JSON.stringify({ email: `lojista.${slug}@seed.webag.local`, password: PASSWORD }), authed(null, 5000 + i));
    const token = r.json('tokens.accessToken');
    const me = http.get(`${API}/v1/me`, authed(token, 5000 + i)).json();
    const storeId = (me.stores && me.stores[0] && (me.stores[0].id || me.stores[0].storeId)) || null;
    if (token && storeId) sessions.push({ token, storeId, n: 5000 + i });
  });
  if (sessions.length === 0) throw new Error('nenhum lojista de seed logou (ver /v1/me)');
  return { sessions };
}

export function envio(data) {
  const s = data.sessions[(__VU - 1) % data.sessions.length];
  const kind = __ITER % 3;
  const [file, type, name, expectOk] = kind === 0 ? [PNG25, 'image/png', 'a.png', true] : kind === 1 ? [JPEG40, 'image/jpeg', 'b.jpg', true] : [PNG40, 'image/png', 'c.png', false];
  const created = http.post(`${API}/v1/uploads`, JSON.stringify({ storeId: s.storeId, purpose: 'product_image', contentType: type, sizeBytes: file.byteLength }), authed(s.token, s.n));
  if (created.status !== 201) return void check(created, { 'upload criado ou limitado (429)': (r) => r.status === 429 });
  const { url, fields } = created.json('upload');
  const body = { ...fields, file: http.file(file, name, type) };
  const posted = http.post(url, body);
  if (posted.status >= 500) e5xx.add(1);
  const done = http.post(`${API}/v1/uploads/${created.json('id')}/complete`, '{}', authed(s.token, s.n));
  tComplete.add(done.timings.duration);
  if (done.status >= 500) e5xx.add(1);
  if (done.status === 200) aceitas.add(1);
  if (done.status === 422) recusadas.add(1);
  check(done, { [expectOk ? 'válida aceita (200) ou fila cheia (422 tempo)' : 'PNG gigante recusado (422)']: (r) => (expectOk ? [200, 422].includes(r.status) : r.status === 422) });
  sleep(0.2);
}

export function leitura() {
  const r = http.get(`${API}/v1/home?lat=${LAT}&lng=${LNG}`, { headers: { 'X-Forwarded-For': `10.250.${__VU % 250}.${1 + (__ITER % 250)}` } });
  tHome.add(r.timings.duration);
  check(r, { 'home 200': (x) => x.status === 200 });
}
