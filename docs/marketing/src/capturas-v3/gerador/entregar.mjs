// Conclui as entregas pendentes dos pedidos de hoje que estao "a caminho" (exceto o pedido do acompanhamento "a caminho").
import { readFileSync } from 'node:fs';
import { sql, adminToken } from '../../capturas/gerador/lib.mjs';
import * as P from '../../capturas/gerador/pedido.mjs';
const keep = JSON.parse(readFileSync('/tmp/webag-mkt/v3/pedidos.json', 'utf8')).aCaminho;
const at = await adminToken();
const rows = sql(`select d.id, d.delivery_code from deliveries d join orders o on o.id=d.order_id where o.created_at > now() - interval '3 hours' and d.status in ('out_for_delivery','picked_up') and o.id<>'${keep}'`).split('\n').filter(Boolean).map((l) => l.split('|'));
for (const [did, code] of rows) { await P.courierStep(at, did, 'delivered', { code }); console.log('entregue', did); }
