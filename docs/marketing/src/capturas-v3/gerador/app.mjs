// Capturas do app do cliente (versao web do app, 390x844 a 2x). Pre-requisitos: API 3300, app web em 3302, `node preparar-dados.mjs`, `node pedidos.mjs`.
import { readFileSync } from 'node:fs';
import { launch, appSession, appLogin, appGo, vis, tap, scrollOf, sql, call } from '../../capturas/gerador/lib.mjs';
import * as P from '../../capturas/gerador/pedido.mjs';
import { salvar } from './salvar.mjs';
const MODA = '8ab41b27-6685-4a95-958a-48b1dbdb0a3f';
const ped = JSON.parse(readFileSync('/tmp/webag-mkt/v3/pedidos.json', 'utf8'));
const EMAIL = 'marina.mkt@seed.webag.local';
const ct = await P.login(EMAIL);
await call('DELETE', '/v1/cart', null, ct);
// faixa de chegada coerente com o horario comercial (agora + 15 a 40 min)
for (const id of [ped.separando, ped.aCaminho]) {
  sql(`update orders set eta_from_at = now() + interval '15 minutes', eta_to_at = now() + interval '40 minutes' where id='${id}'`);
  sql(`update deliveries set eta_to_at = now() + interval '40 minutes' where order_id='${id}'`);
}
const b = await launch();
const { page } = await appSession(b, { dsf: 2 });
page.setDefaultTimeout(30000);
const hide = () => page.addStyleTag({ content: '[data-testid="order.delivery-code"]{display:none !important}' });
const shot = async (nome) => { await page.waitForTimeout(1500); await salvar(page, nome); };
await hide();
await page.waitForTimeout(6500); // some o aviso "Entregando em ..."
await shot('app-inicio');
await scrollOf(page, '[data-testid="home.list"]', 560);
await shot('app-inicio-lojas');
await appLogin(page, EMAIL);
await appGo(page, '/'); await tap(page, 'tabs.home');
await appGo(page, `/store/${MODA}`);
await vis(page, 'store.screen');
await page.locator('[data-testid^="store.product-"]:visible').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(5000);
await shot('app-loja');
await scrollOf(page, '[data-testid="store.list"]', 520);
await shot('app-loja-vitrine');
await page.locator('[data-testid^="store.product-"]:visible').first().click();
await vis(page, 'product.add');
await page.waitForTimeout(1500);
for (const g of ['Tamanho-M', 'Cor-Preta']) await page.locator(`[data-testid="product.variant-${g}"]:visible`).first().click().catch(() => console.log('variante ausente', g));
await page.waitForTimeout(600);
await scrollOf(page, '[data-testid="product.gallery"]', 0);
await shot('app-produto');
for (const n of ['Camiseta básica algodão', 'Tênis casual']) await call('PUT', `/v1/cart/items/${P.variantOf(n)}`, { quantity: 1 }, ct);
await appGo(page, '/cart');
await vis(page, 'cart.total');
await shot('app-sacola');
await call('DELETE', '/v1/cart', null, ct);
for (const [nome, id] of [['separando', ped.separando], ['a-caminho', ped.aCaminho], ['entregue', ped.entregue]]) {
  await appGo(page, `/order/${id}`);
  await vis(page, 'order.timeline');
  await hide();
  await shot(`app-pedido-${nome}`);
}
await b.close();
