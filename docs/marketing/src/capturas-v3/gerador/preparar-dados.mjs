// Prepara o banco de marketing (local, descartavel) para as capturas v3: so lojas de moda, casa e presentes, precos redondos,
// nomes de cliente so com o primeiro nome. Idempotente. Uso: node preparar-dados.mjs  (precisa do Postgres de marketing no ar)
import { sql } from '../../capturas/gerador/lib.mjs';
import { writeArt as writeArtModa } from '../../capturas/gerador/produtos.mjs';
import { ART, writeArt } from './arte-casa.mjs';
const S3 = '/tmp/webag-mkt/s3/webag-public/media';
const q = (s) => s.replace(/'/g, "''");

// 1) so as lojas de moda, casa e presentes ficam visiveis
const KEEP = ['Moda Express Franco', 'Moda Passo Firme', 'Casa & Cia Utilidades'];
sql(`update stores set status='suspended', suspended_at=now(), suspension_reason='fora do recorte de apresentacao' where name not in (${KEEP.map((n) => `'${q(n)}'`).join(',')}) and status='approved'`);
sql(`update stores set name='Casa & Presentes', description='Decoração e presentes para sua casa' where name='Casa & Cia Utilidades'`);

// 2) catalogo de casa e presentes (renomeia os itens de ferramenta do seed; preco em reais inteiros)
const CASA = [
  ['Chave de fenda (jogo 6)', 'Vaso de cerâmica', 8000, 'Vaso de cerâmica artesanal, ideal para flores secas.'],
  ['Escorredor de louça', 'Luminária de mesa', 15000, 'Luminária de mesa com cúpula amarela e base de metal.'],
  ['Extensão elétrica 3m', 'Almofada de linho', 6000, 'Almofada de linho com listras, 45 x 45 cm.'],
  ['Jogo de panelas 5 peças', 'Vela aromática', 4000, 'Vela aromática em pote de vidro, cerca de 40 horas.'],
  ['Lâmpada LED 9W', 'Caneca esmaltada', 3000, 'Caneca esmaltada de 300 ml, ótima para presente.'],
  ['Martelo 500g', 'Porta-retrato', 5000, 'Porta-retrato de madeira preta, foto 15 x 21 cm.'],
];
const casaId = sql(`select id from stores where name='Casa & Presentes'`);
for (const [old, name, price, desc] of CASA) {
  sql(`update products set name='${q(name)}', description='${q(desc)}', base_price_cents=${price}, promo_price_cents=null, promo_starts_at=null, promo_ends_at=null, status='active' where store_id='${casaId}' and name in ('${q(old)}','${q(name)}')`);
}
sql(`update product_variants set price_cents=null, stock=greatest(stock, 12), sku=left(replace(upper(sku),'-',''),12) where product_id in (select id from products where store_id='${casaId}')`);
const casaAssets = Object.fromEntries(sql(`select p.name, i.asset_id from products p join product_images i on i.product_id=p.id where p.store_id='${casaId}'`).split('\n').filter(Boolean).map((l) => l.split('|')));
await writeArt(S3, casaAssets, ART);

// 3) moda: precos redondos, sem promocao, estoque confortavel (sem "ultimas unidades")
const MODA = [['Camiseta básica algodão', 6000], ['Bermuda de sarja', 8000], ['Boné aba reta', 4000], ['Chinelo de borracha', 3000], ['Tênis casual', 20000], ['Vestido midi floral', 12000]];
const modaId = sql(`select id from stores where name='Moda Express Franco'`);
for (const [name, price] of MODA) sql(`update products set base_price_cents=${price}, promo_price_cents=null, promo_starts_at=null, promo_ends_at=null where store_id='${modaId}' and name='${q(name)}'`);
sql(`update product_variants set stock=greatest(stock, 12) where product_id in (select id from products where store_id='${modaId}') and active`);
const passoId = sql(`select id from stores where name='Moda Passo Firme'`);
sql(`update products set status='archived', archived_at=now() where store_id='${passoId}' and name='Sandália rasteira'`);
sql(`update products set base_price_cents=18000, promo_price_cents=null where store_id='${passoId}' and name='Tênis casual'`);
sql(`update products set base_price_cents=5000, promo_price_cents=null where store_id='${passoId}' and name='Camiseta básica'`);
sql(`update product_variants set price_cents=null, stock=greatest(stock, 12) where product_id in (select id from products where store_id='${passoId}')`);
const passoAssets = Object.fromEntries(sql(`select p.name, i.asset_id from products p join product_images i on i.product_id=p.id where p.store_id='${passoId}'`).split('\n').filter(Boolean).map((l) => l.split('|')));
await writeArtModa(S3, { 'Tênis casual': passoAssets['Tênis casual'], 'Camiseta básica algodão': passoAssets['Camiseta básica'] });

// 4) clientes e lojistas: so o primeiro nome
sql(`update users set name = split_part(name, ' ', 1) where email like '%.mkt@seed.webag.local'`);
sql(`update users set name = 'Camila' where email='lojista.moda-express-franco@seed.webag.local'`);
console.log('dados preparados');
