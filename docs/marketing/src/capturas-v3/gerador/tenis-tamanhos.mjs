// A2: "Tênis casual" da Moda Express Franco com tamanhos 36 a 40, só o 38 esgotado. Usa a API do lojista (PUT setProductVariants), não grava no banco.
// O app lista as variações por data de criação; por isso cada tamanho é criado numa chamada própria, na ordem 36, 37, 38, 39, 40
// (as variações antigas saem da lista e ficam desativadas). Uso: node tenis-tamanhos.mjs   (API 3300 no ar)
import { call, sql, MODA } from '../../capturas/gerador/lib.mjs';
import { login, MERCHANT } from '../../capturas/gerador/pedido.mjs';
const mt = await login(MERCHANT);
const pid = sql(`select id from products where store_id='${MODA}' and name='Tênis casual'`);
const stock = [['36', 8], ['37', 10], ['38', 0], ['39', 12], ['40', 10]];
const keep = [];
for (const [n, qty] of stock) {
  const version = sql(`select version from products where id='${pid}'`);
  keep.push({ attributes: { Tamanho: n }, stock: qty });
  // as já criadas entram com o id, para não serem recriadas
  const ids = Object.fromEntries(sql(`select attributes->>'Tamanho', id from product_variants where product_id='${pid}' and active and attributes ? 'Tamanho'`).split('\n').filter(Boolean).map((l) => l.split('|')));
  const variants = keep.map((v) => (keep.indexOf(v) < keep.length - 1 && ids[v.attributes.Tamanho] ? { ...v, id: ids[v.attributes.Tamanho] } : v));
  const r = await call('PUT', `/v1/stores/${MODA}/products/${pid}/variants`, { attributes: ['Tamanho'], variants }, mt, { 'If-Match': `"${version}"` });
  console.log(n, r.status, r.status >= 300 ? JSON.stringify(r.data).slice(0, 300) : 'ok');
  await new Promise((res) => setTimeout(res, 1500));
}
console.log(sql(`select attributes::text, stock, reserved, active, created_at::time(2) from product_variants where product_id='${pid}' order by active desc, created_at`));
