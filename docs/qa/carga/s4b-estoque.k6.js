// k6 — S4-B Disputa de estoque (plano-carga.md §4): N clientes criam pedido do MESMO produto com estoque pequeno ao mesmo tempo.
// Invariante (dinheiro/estoque corretos sob concorrência, RN-06): pedidos criados x QTD <= estoque (com 12 e QTD 4: no máximo 3 vencedores); nenhum 5xx; os perdedores recebem 409 STOCK_CONFLICT/CART_CHANGED.
// Uso: k6 run -e API_URL=http://localhost:3000 -e CLIENTES=40 -e ESTOQUE=12 -e QTD=4 docs/qa/carga/s4b-estoque.k6.js
// Pré: seed (`pnpm run setup`), API com TRUST_PROXY=1 e `pedidos_pendentes_max`/`pix_hora_max` padrão (cada cliente faz 1 pedido). O estoque do produto é
// ajustado no `setup()` pelo lojista de seed (Mercadinho Boa Compra). Depois da rodada, conferir no banco:
//   select stock, reserved from product_variants where id = '<variante impressa no resumo>';   -- reserved deve ser = pedidos criados e <= ESTOQUE
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API, LAT, LNG, PASSWORD, newCustomer, authed } from './lib-setup.k6.js';

const CLIENTES = Number(__ENV.CLIENTES || 40);
const ESTOQUE = Number(__ENV.ESTOQUE || 12);
const MODO = __ENV.MODO || 'pickup'; // 'pickup' não depende do horário da logística (a entrega fecha às 20 h e a faixa precisa terminar antes: RN-19)
const QTD = Number(__ENV.QTD || 4); // unidades por pedido (o pedido mínimo da entrega é R$ 20,00: 1 unidade do produto de seed não basta)
const venceu = new Counter('pedidos_criados');
const conflito = new Counter('conflitos_409');
const erro5xx = new Counter('erros_5xx');
const outros = new Counter('outros_status');

export const options = {
  scenarios: { disputa: { executor: 'per-vu-iterations', vus: CLIENTES, iterations: 1, maxDuration: '2m' } },
  thresholds: { erros_5xx: ['count==0'], pedidos_criados: [`count<=${Math.floor(ESTOQUE / QTD)}`] },
};

export function setup() {
  const owner = http.post(`${API}/v1/auth/login`, JSON.stringify({ email: 'lojista.mercadinho-boa-compra@seed.webag.local', password: PASSWORD }), authed(null, 1)).json('tokens.accessToken');
  const found = http.get(`${API}/v1/search/stores?lat=${LAT}&lng=${LNG}`).json('data').find((s) => s.name === 'Mercadinho Boa Compra');
  const product = http.get(`${API}/v1/browse/stores/${found.id}/products?limit=10`).json('data').find((p) => p.available);
  const variant = http.get(`${API}/v1/browse/products/${product.id}`).json('variants.0.id');
  const adjust = http.post(`${API}/v1/stores/${found.id}/products/${product.id}/variants/${variant}/stock`, JSON.stringify({ set: ESTOQUE }), { headers: { ...authed(owner, 1).headers, 'Idempotency-Key': `k6-${Date.now()}` } });
  if (adjust.status !== 200) throw new Error(`ajuste de estoque ${adjust.status} ${adjust.body}`);
  const customers = [];
  for (let i = 0; i < CLIENTES; i++) customers.push(newCustomer(1000 + i));
  console.log(`variante ${variant}; estoque ${ESTOQUE}; ${CLIENTES} clientes`);
  return { customers, variant };
}

export default function (data) {
  const c = data.customers[(__VU - 1) % data.customers.length];
  const q = MODO === 'delivery' ? `mode=delivery&addressId=${c.addressId}` : 'mode=pickup';
  http.del(`${API}/v1/cart`, null, authed(c.token, c.n));
  const put = http.put(`${API}/v1/cart/items/${data.variant}?${q}`, JSON.stringify({ quantity: QTD, replaceStore: true }), authed(c.token, c.n));
  if (put.status !== 200) {
    if (__VU <= 2) console.log(`PUT da sacola ${put.status}: ${String(put.body).slice(0, 160)}`);
    return void (put.status === 409 || put.status === 422 ? conflito.add(1) : outros.add(1));
  }
  const cart = http.get(`${API}/v1/cart?${q}`, authed(c.token, c.n)).json();
  // todos criam o pedido no mesmo instante (barreira aproximada: o início das iterações é simultâneo)
  const res = http.post(`${API}/v1/orders`, JSON.stringify({ mode: MODO, ...(MODO === 'delivery' ? { addressId: c.addressId } : {}), cartRevision: cart.revision, expectedTotalCents: cart.summary.total.amount, paymentMethod: 'pix' }), { headers: { ...authed(c.token, c.n).headers, 'Idempotency-Key': `k6-${__VU}-${Date.now()}-${Math.floor(Math.random() * 1e9)}` } });
  check(res, { 'sem 5xx': (r) => r.status < 500 });
  if (res.status === 201) venceu.add(1);
  else if (res.status === 409 || res.status === 422) {
    conflito.add(1);
    if (__VU <= 2) console.log(`pedido ${res.status}: ${String(res.body).slice(0, 160)}`);
  }
  else if (res.status >= 500) erro5xx.add(1);
  else {
    outros.add(1);
    if (__VU <= 3) console.log(`status inesperado ${res.status}: ${String(res.body).slice(0, 200)}`);
  }
}
