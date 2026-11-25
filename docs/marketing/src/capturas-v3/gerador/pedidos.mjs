// Cria os pedidos de apresentacao no banco de marketing (API local, pagamento simulado). Idempotente por execucao: cada rodada cria pedidos novos.
// Uso: node pedidos.mjs   -> imprime ids em /tmp/webag-mkt/v3/pedidos.json
import { writeFileSync } from 'node:fs';
import { sql, adminToken, call } from '../../capturas/gerador/lib.mjs';
import * as P from '../../capturas/gerador/pedido.mjs';
const mt = await P.login(P.MERCHANT);
const at = await adminToken();
const cid = await P.ensureCourier(at);
// zera a fila antiga (pedidos de execucoes anteriores e do seed) para a fila mostrar so o que importa
sql(`update orders set status='delivered', delivered_at=coalesce(delivered_at, now()-interval '2 days') where status in ('received','accepted','in_preparation','ready_for_collection','out_for_delivery')`);
sql(`update deliveries set status='delivered' where status not in ('delivered','cancelled')`);
const out = {};
const tok = Object.fromEntries(await Promise.all(['marina', 'joana', 'paulo', 'rita'].map(async (n) => [n, await P.login(`${n}.mkt@seed.webag.local`)])));
async function novo(who, items) { const o = await P.placeOrder(tok[who], items); await P.payOrder(o, tok[who]); return o; }
async function ate(o, step) {
  const s = ['accept', 'prep', 'ready', 'out', 'delivered'];
  const n = s.indexOf(step);
  if (n >= 0) await P.merchantApi(mt, o.id, 'accept');
  if (n >= 1) await P.merchantApi(mt, o.id, 'status', { status: 'in_preparation' });
  if (n >= 2) await P.merchantApi(mt, o.id, 'status', { status: 'ready_for_collection', volumes: 1 });
  if (n >= 3) { const did = P.deliveryOf(o.id); await P.assign(at, did, cid); await P.courierStep(at, did, 'confirm'); await P.courierStep(at, did, 'picked_up'); }
  if (n >= 4) { const did = P.deliveryOf(o.id); await P.courierStep(at, did, 'delivered', { code: sql(`select delivery_code from deliveries where id='${did}'`) }).catch((e) => console.log('entrega', String(e).slice(0, 200))); }
}
// historico de hoje (financeiro e extrato): 4 pedidos entregues
for (const [who, items] of [['joana', [['Vestido midi floral', 1]]], ['paulo', [['Tênis casual', 1]]], ['rita', [['Bermuda de sarja', 1], ['Boné aba reta', 1]]], ['joana', [['Camiseta básica algodão', 2]]]]) {
  const o = await novo(who, items); await ate(o, 'delivered'); console.log('entregue', o.number);
}
// app: acompanhar pedido nos tres estados (cliente Marina)
const sep = await novo('marina', [['Camiseta básica algodão', 1], ['Tênis casual', 1]]); await ate(sep, 'prep'); out.separando = sep.id;
const cam = await novo('marina', [['Vestido midi floral', 1]]); await ate(cam, 'out'); out.aCaminho = cam.id;
const ent = await novo('marina', [['Bermuda de sarja', 1], ['Boné aba reta', 1]]); await ate(ent, 'delivered'); out.entregue = ent.id;
// painel: pronto para coleta e pedido novo
const pronto = await novo('rita', [['Vestido midi floral', 1], ['Chinelo de borracha', 1]]); await ate(pronto, 'ready'); out.pronto = pronto.id;
const nv = await novo('joana', [['Camiseta básica algodão', 1], ['Bermuda de sarja', 1]]); out.novo = nv.id;
writeFileSync('/tmp/webag-mkt/v3/pedidos.json', JSON.stringify(out, null, 1));
console.log(out);
