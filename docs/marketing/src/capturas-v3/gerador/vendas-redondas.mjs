// G6 (P13): cria, pelo fluxo normal da API (pedido + pagamento simulado + aceite do lojista), 5 pedidos na "Moda Passo Firme" que somam R$ 1.000,00
// de vendas (itens): 4 x tênis R$ 180,00 e 1 x tênis R$ 180,00 + 2 camisetas R$ 50,00 (R$ 280,00). Nada é gravado direto no ledger.
// Uso: node vendas-redondas.mjs   (API 3300 no ar; roda uma vez, cada execução cria mais 5 pedidos)
import { randomUUID } from 'node:crypto';
import { call, sql } from '../../capturas/gerador/lib.mjs';
import { login, payOrder } from '../../capturas/gerador/pedido.mjs';
const STORE = sql(`select id from stores where name='Moda Passo Firme'`);
const MERCHANT = 'lojista.moda-passo-firme@seed.webag.local';
const variantOf = (name) => sql(`select v.id from product_variants v join products p on p.id=v.product_id where p.store_id='${STORE}' and p.name='${name}' and v.active and v.stock-v.reserved>0 order by v.created_at limit 1`);
async function pedir(token, itens) {
  await call('DELETE', '/v1/cart', null, token);
  for (const [nome, qtd] of itens) {
    const r = await call('PUT', `/v1/cart/items/${variantOf(nome)}`, { quantity: qtd }, token);
    if (r.status !== 200) throw new Error(`cart ${nome} ${r.status} ${JSON.stringify(r.data)}`);
  }
  const addr = (await call('GET', '/v1/me/addresses', null, token)).data.data[0];
  const cart = await call('GET', `/v1/cart?mode=delivery&addressId=${addr.id}`, null, token);
  if (cart.status !== 200) throw new Error(`getCart ${cart.status} ${JSON.stringify(cart.data)}`);
  const c = cart.data;
  const body = { mode: 'delivery', addressId: addr.id, cartRevision: c.revision, expectedTotalCents: c.summary.total.amount, paymentMethod: 'pix', payerDocument: '52998224725' };
  if (c.delivery?.eta?.toAt) body.acceptedEtaToAt = c.delivery.eta.toAt;
  const r = await call('POST', '/v1/orders', body, token, { 'Idempotency-Key': randomUUID() });
  if (![200, 201].includes(r.status)) throw new Error(`createOrder ${r.status} ${JSON.stringify(r.data)}`);
  await payOrder(r.data, token);
  return r.data;
}
const mt = await login(MERCHANT);
const toks = await Promise.all(['marina', 'joana', 'paulo', 'rita', 'joana'].map((n) => login(`${n}.mkt@seed.webag.local`)));
const lotes = [[['Tênis casual', 1]], [['Tênis casual', 1]], [['Tênis casual', 1]], [['Tênis casual', 1]], [['Tênis casual', 1], ['Camiseta básica', 2]]];
for (const [i, itens] of lotes.entries()) {
  const o = await pedir(toks[i], itens);
  const a = await call('POST', `/v1/stores/${STORE}/orders/${o.id}/accept`, {}, mt);
  console.log(o.number, 'aceite', a.status);
}
console.log(sql(`select count(*), sum(subtotal_cents) from orders where store_id='${STORE}' and paid_at::date = current_date and status not in ('cancelled','refused','awaiting_payment')`));
