// k6 — S10 `createOrder` COM campanha (DT-100, ADR-019 D4, review R2.1 R5): 20 a 50 clientes na MESMA campanha criam pedido ao mesmo tempo, e o mesmo número de
// clientes SEM cupom faz a linha de base. O gate NÃO é "aplicar cupom" (aplicar não reserva nem trava a campanha): é o p95 do POST /v1/orders.
//   Gate (R5): p95 do `createOrder` com campanha <= 1,0 s com 50 clientes na mesma campanha e o p95 do checkout SEM campanha não muda (variação <= 20% contra a linha de base).
//   Nenhum 5xx; 409 (orçamento, uso ou pausa) é resposta válida; 503 `SERVICE_BUSY` (lock_timeout de 3 s) conta separado e deve ser 0 com 50 clientes.
// Uso:  k6 run -e API_URL=http://localhost:3000 -e CLIENTES=50 -e CODIGO=PROMO8 -e MODO=pickup docs/qa/carga/s10-cupom-criar-pedido.k6.js
//       (rode de novo SEM -e CODIGO para a linha de base sem campanha e compare o p95 de `criar_pedido_ms`)
// Pré: seed (`pnpm run setup`), API com TRUST_PROXY=1; campanha "Webag paga" de valor fixo ATIVA na loja do seed, com orçamento total e diário folgados (>= CLIENTES x valor),
//   criada pelo admin (`POST /v1/admin/campaigns` + `activate`, 2º fator) e `cupom_orcamento_mensal_webag_cents` > 0. Cada cliente faz 1 pedido (limites de pedidos pendentes padrão).
// Estado: NÃO executado nesta sessão (k6 ausente no ambiente, sem Docker). A medição equivalente em Vitest (30 pedidos simultâneos, com e sem campanha) está em
//   apps/api/test/r2-campaign-load.e2e-spec.ts e os números em docs/arquitetura/adr/ADR-019 "Estado da R2.2".
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { API, LAT, LNG, newCustomer, authed } from './lib-setup.k6.js';

const CLIENTES = Number(__ENV.CLIENTES || 50);
const CODIGO = __ENV.CODIGO || '';
const MODO = __ENV.MODO || 'pickup';
const criarMs = new Trend('criar_pedido_ms', true);
const criados = new Counter('pedidos_criados');
const conflitos = new Counter('conflitos_409');
const ocupado = new Counter('service_busy_503');
const erro5xx = new Counter('erros_5xx');

export const options = {
  scenarios: { corrida: { executor: 'per-vu-iterations', vus: CLIENTES, iterations: 1, maxDuration: '2m' } },
  thresholds: { erros_5xx: ['count==0'], service_busy_503: ['count==0'], criar_pedido_ms: ['p(95)<1000'] },
};

export function setup() {
  const found = http.get(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}`).json('data').find((s) => s.name === 'Mercadinho Boa Compra');
  const product = http.get(`${API}/v1/browse/stores/${found.id}/products?limit=10`).json('data').find((p) => p.available);
  const variant = http.get(`${API}/v1/browse/products/${product.id}`).json('variants.0.id');
  const customers = [];
  for (let i = 0; i < CLIENTES; i++) customers.push(newCustomer(2000 + i));
  console.log(`variante ${variant}; ${CLIENTES} clientes; ${CODIGO ? `campanha ${CODIGO}` : 'SEM campanha (linha de base)'}`);
  return { customers, variant };
}

export default function (data) {
  const c = data.customers[(__VU - 1) % data.customers.length];
  const q = MODO === 'delivery' ? `mode=delivery&addressId=${c.addressId}` : 'mode=pickup';
  http.del(`${API}/v1/cart`, null, authed(c.token, c.n));
  if (http.put(`${API}/v1/cart/items/${data.variant}?${q}`, JSON.stringify({ quantity: 4, replaceStore: true }), authed(c.token, c.n)).status !== 200) return;
  if (CODIGO && http.put(`${API}/v1/cart/coupon?${q}`, JSON.stringify({ code: CODIGO }), authed(c.token, c.n)).status !== 200) return;
  const cart = http.get(`${API}/v1/cart?${q}`, authed(c.token, c.n)).json();
  const res = http.post(`${API}/v1/orders`, JSON.stringify({ mode: MODO, ...(MODO === 'delivery' ? { addressId: c.addressId } : {}), cartRevision: cart.revision, expectedTotalCents: cart.summary.total.amount, paymentMethod: 'pix' }), { headers: { ...authed(c.token, c.n).headers, 'Idempotency-Key': `k6-s10-${__VU}-${Date.now()}-${Math.floor(Math.random() * 1e9)}` } });
  criarMs.add(res.timings.duration);
  check(res, { 'sem 5xx': (r) => r.status < 500 });
  if (res.status === 201) criados.add(1);
  else if (res.status === 409 || res.status === 422) conflitos.add(1);
  else if (res.status === 503) ocupado.add(1);
  else if (res.status >= 500) erro5xx.add(1);
}
