import { launch, appSession, appLogin, appGo, vis, tap, tid, call, sql, addPhoneChrome, scrollOf, MODA, SEED_PASSWORD } from './lib.mjs';
import * as P from './pedido.mjs';
const OUT = process.env.OUT ?? '/tmp/webag-mkt/work/out';
const EMAIL = 'marina.mkt@seed.webag.local';
const mode = process.argv[2] ?? 'plain'; // plain | sb
const sb = mode === 'sb';
const ct = await P.login(EMAIL);
// sacola do cliente: camiseta + tenis (mesma loja)
await call('DELETE', '/v1/cart', null, ct);
// pedido a caminho: o mais recente "out_for_delivery" da Marina, com faixa de chegada daqui a pouco
const orders = (await call('GET', '/v1/orders?limit=20', null, ct)).data.data;
const track = orders.find((o) => o.status === 'out_for_delivery');
sql(`update orders set eta_from_at = now() + interval '12 minutes', eta_to_at = now() + interval '37 minutes' where id='${track.id}'`);
sql(`update deliveries set eta_to_at = now() + interval '37 minutes' where order_id='${track.id}'`);

const b = await launch();

const { context, page } = await appSession(b, { dsf: 3, topInset: sb ? 47 : 0 });
page.setDefaultTimeout(30000);
const shot = async (name, tone) => {
  await page.waitForTimeout(1200);
  if (sb) await addPhoneChrome(page, tone);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/app-${name}${sb ? '-statusbar' : ''}.png` });
  console.log('ok', name);
};
await page.addStyleTag({ content: '[data-testid="order.delivery-code"]{display:none !important}' });
await page.waitForTimeout(6500); // toast "Entregando em ..." some
await shot('home', 'light');
await scrollOf(page, '[data-testid="home.list"]', 640);
await shot('home-lojas', 'light');
await appLogin(page, EMAIL);
await appGo(page, '/'); await tap(page, 'tabs.home');
await appGo(page, `/store/${MODA}`);
await vis(page, 'store.screen');
await page.locator('[data-testid^="store.product-"]:visible').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(5000);
await shot('loja', 'dark');
await scrollOf(page, '[data-testid="store.list"]', 560);
await shot('loja-produtos', 'dark');
// produto
await page.locator('[data-testid^="store.product-"]:visible').first().click();
await vis(page, 'product.add');
await page.waitForTimeout(1500);
for (const g of ['Tamanho-M', 'Cor-Branca']) await page.locator(`[data-testid="product.variant-${g}"]:visible`).first().click();
await page.waitForTimeout(600);
await scrollOf(page, '[data-testid="product.gallery"]', 0);
await shot('produto', 'dark');
for (const n of ['Camiseta básica algodão', 'Tênis casual']) await call('PUT', `/v1/cart/items/${P.variantOf(n)}`, { quantity: 1 }, ct);
await appGo(page, '/cart');
await vis(page, 'cart.total');
await page.waitForTimeout(1500);
await shot('sacola', 'dark');
await appGo(page, `/order/${track.id}`);
await vis(page, 'order.timeline');
await page.waitForTimeout(1500);
await shot('acompanhamento', 'dark');
await b.close();
