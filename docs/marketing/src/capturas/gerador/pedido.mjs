import { call, sql, adminToken, MODA, SEED_PASSWORD } from './lib.mjs';
import { randomUUID } from 'node:crypto';
export const MERCHANT = 'lojista.moda-express-franco@seed.webag.local';
export async function login(email) {
  const r = await call('POST', '/v1/auth/login', { email, password: SEED_PASSWORD });
  if (!r.data?.tokens) throw new Error('login ' + email + ' ' + r.status);
  return r.data.tokens.accessToken;
}
/** variante ativa com estoque do produto (por nome), preferindo a que combina com `prefer` */
export function variantOf(productName, prefer = {}) {
  const rows = sql(`select v.id, v.attributes::text, v.stock-v.reserved from product_variants v join products p on p.id=v.product_id where p.store_id='${MODA}' and p.name='${productName}' and v.active order by v.created_at`).split('\n').map((l) => l.split('|'));
  const ok = rows.filter((r) => Number(r[2]) > 0);
  return (ok[0] ?? rows[0])[0];
}
export async function placeOrder(token, items) {
  await call('DELETE', '/v1/cart', null, token);
  for (const [name, qty] of items) {
    const r = await call('PUT', `/v1/cart/items/${variantOf(name)}`, { quantity: qty }, token);
    if (r.status !== 200) throw new Error('cart ' + name + ' ' + r.status + JSON.stringify(r.data));
  }
  const addr = (await call('GET', '/v1/me/addresses', null, token)).data.data[0];
  const cart = await call('GET', `/v1/cart?mode=delivery&addressId=${addr.id}`, null, token);
  if (cart.status !== 200) throw new Error('getCart ' + cart.status + JSON.stringify(cart.data));
  const c = cart.data;
  const body = { mode: 'delivery', addressId: addr.id, cartRevision: c.revision, expectedTotalCents: c.summary.total.amount, paymentMethod: 'pix', payerDocument: '52998224725' };
  if (c.delivery?.eta?.toAt) body.acceptedEtaToAt = c.delivery.eta.toAt;
  const r = await call('POST', '/v1/orders', body, token, { 'Idempotency-Key': randomUUID() });
  if (![200, 201].includes(r.status)) throw new Error('createOrder ' + r.status + JSON.stringify(r.data));
  return r.data;
}
export async function payOrder(order, anyToken) {
  const attempt = sql(`select a.id from payment_attempts a where a.external_reference='${order.id}' and a.status='pending' order by a.created_at desc limit 1`);
  const r = await call('POST', `/v1/dev/payments/${attempt}/approve`, {}, anyToken);
  if (r.status >= 300) throw new Error('approve ' + r.status + JSON.stringify(r.data));
}
export async function merchantApi(mt, orderId, action, body = {}) {
  const r = await call('POST', `/v1/stores/${MODA}/orders/${orderId}/${action}`, body, mt);
  if (r.status >= 300) throw new Error(`${action} ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
export const deliveryOf = (orderId) => sql(`select id from deliveries where order_id='${orderId}'`);
export async function ensureCourier(at) {
  const list = await call('GET', '/v1/admin/logistics/couriers', null, at);
  if (list.data.data.length) return list.data.data[0].id;
  const r = await call('POST', '/v1/admin/logistics/couriers', { name: 'Rafael Motoboy', phone: '11977770001', note: null, documentsChecked: true }, at);
  if (r.status >= 300) throw new Error('courier ' + r.status + JSON.stringify(r.data));
  return r.data.id;
}
export async function courierStep(at, deliveryId, action, extra = {}) {
  const r = await call('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action, ...extra }, at);
  if (r.status >= 300) throw new Error(`${action} ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
export async function assign(at, deliveryId, courierId) {
  const r = await call('POST', `/v1/admin/logistics/deliveries/${deliveryId}/assign`, { courierId, addressConfirmed: true }, at);
  if (r.status >= 300) throw new Error(`assign ${r.status} ${JSON.stringify(r.data)}`);
}
