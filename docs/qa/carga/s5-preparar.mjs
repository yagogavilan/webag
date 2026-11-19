#!/usr/bin/env node
// Preparo do S5: cria N pedidos de PIX (clientes novos), aprova cada um pela rota de desenvolvimento e imprime a lista de ids de pagamento
// do provedor (`IDS=...`) e o total do ledger antes da rajada. Uso: node docs/qa/carga/s5-preparar.mjs 20
import { newCustomer, place, pay, sql, setParam, resetParam } from '../retestes/lib.mjs';
const n = Number(process.argv[2] ?? 20);
await setParam('pix_hora_max', 30, 'Preparo S5 (restaurado no fim)');
const ids = [];
for (let i = 0; i < n; i++) {
  const c = await newCustomer();
  const o = await place(c, 'delivery');
  if (!o.order) throw new Error(`pedido recusado ${o.res.status} ${JSON.stringify(o.res.data).slice(0, 120)}`);
  await pay(c, o.order.id);
  ids.push(sql(`select provider_payment_id from payment_attempts where external_reference = '${o.order.id}' order by created_at limit 1`));
}
await resetParam('pix_hora_max');
console.log(`LEDGER_ANTES=${sql('select count(*) from ledger_entries')}`);
console.log(`IDS=${ids.join(',')}`);
