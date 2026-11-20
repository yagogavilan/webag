#!/usr/bin/env node
// "Pedir troca" PELA TELA do app web (react-native-web) com a API real, provedor `fake`. G4 final (tip 036e791).
// Prepara por API um cliente novo com pedido de ENTREGA entregue (corrida atribuída e concluída com o código), entra no app pelo navegador,
// abre o pedido, toca "Pedir troca", escolhe o motivo "arrependimento" (reembolso, sem digitar), envia, e confere pelo servidor que a troca
// nasceu aprovada com resolução de reembolso. Também confere que o servidor recusa o 2º pedido do mesmo item (409) e que o link da política
// abre a página /termos/trocas.
// Uso: API_URL=... MAILPIT_URL=... PG_CONTAINER=... QA_TOTP_FILE=... APP_URL=http://localhost:8181 NODE_PATH=$(npm root -g) node docs/qa/retestes/troca-app-web.mjs
import { createRequire } from 'node:module';
import { api, adminCall, record, finish, sql, setParam, resetParam, login, newCustomer, getOrder, outForDelivery, SEED_PASSWORD } from './lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const APP = (process.env.APP_URL ?? 'http://localhost:8081').replace(/\/+$/, '');
const SHOTS = process.env.SHOTS_DIR ?? '/tmp';
const id = (t) => `[data-testid="${t}"]`;

await setParam('pix_hora_max', 30, 'Reteste QA troca pela tela (restaurado no fim)');
let browser;
try {
  const c = await newCustomer();
  const { order, deliveryId } = await outForDelivery(c);
  const code = (await getOrder(c, order.id)).data?.tracking?.deliveryCode;
  const done = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'delivered', code });
  record('TROCA-UI-0', 'preparo: pedido de entrega entregue com o código', done.status === 200, `HTTP ${done.status}`);
  const delivered = (await getOrder(c, order.id)).data;
  record('TROCA-UI-0b', 'o servidor oferece "Pedir troca" (exchange.canRequest = true)', delivered?.exchange?.canRequest === true, `status=${delivered?.status} canRequest=${delivered?.exchange?.canRequest}`);

  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && r.url().includes('/v1/') && problems.push(`http ${r.status()} ${r.request().method()} ${r.url()}`));
  const visible = (testId, timeout = 30000) => page.locator(`${id(testId)}:visible`).first().waitFor({ timeout });
  const tap = async (testId) => {
    await visible(testId);
    await page.locator(`${id(testId)}:visible`).first().click();
  };
  // A sessão do app web fica só na memória da aba: navegar por links (sem recarregar) até o pedido.
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tap('location.choose-city');
  await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30000 });
  await page.locator('[data-testid^="location.city-"]').first().click();
  await page.waitForSelector(id('location.neighborhood-any'), { timeout: 20000 });
  await page.click(id('location.neighborhood-any'));
  await tap('tabs.account');
  await tap('home.login');
  await page.fill(id('auth.login-email-input'), c.email);
  await page.fill(id('auth.login-password-input'), SEED_PASSWORD);
  await tap('auth.login-submit');
  await tap('tabs.orders');
  await tap(`orders.item-${order.id}`);
  const button = page.getByText('Pedir troca', { exact: false }).first();
  const shown = await button.waitFor({ timeout: 30000 }).then(() => true, () => false);
  record('TROCA-UI-1', 'na tela do pedido entregue o botão "Pedir troca" aparece', shown, '');
  await page.screenshot({ path: `${SHOTS}/troca-1-pedido.png` });
  if (shown) {
    await button.click();
    await visible('exchange.screen');
    record('TROCA-UI-2', 'a tela de troca abre com o item e os motivos (arrependimento, defeito, tamanho e cor conforme o produto)', (await page.locator(`${id('exchange.reason-regret')}:visible`).count()) >= 1, '');
    await page.screenshot({ path: `${SHOTS}/troca-2-motivos.png` });
    const policyPage = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await tap('exchange.policy-link');
    const popup = await policyPage;
    const target = popup ?? page;
    await target.waitForTimeout(2500);
    const policyUrl = target.url();
    record('TROCA-UI-3', 'o link da política de trocas abre /termos/trocas', /\/termos\/trocas/.test(policyUrl), policyUrl);
    if (popup) await popup.close();
    else await page.goBack();
    await visible('exchange.screen');
    await tap('exchange.reason-regret');
    await page.screenshot({ path: `${SHOTS}/troca-3-arrependimento.png` });
    await tap('exchange.submit');
    const ok = await page.locator(`${id('exchange.success')}:visible`).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    record('TROCA-UI-4', 'enviar o arrependimento mostra a tela de sucesso', ok, '');
    await page.screenshot({ path: `${SHOTS}/troca-4-sucesso.png` });
  }
  const row = sql(`select status||'|'||coalesce(resolution,'')||'|'||type from exchange_requests where order_id = '${order.id}' order by created_at desc limit 1`);
  record('TROCA-UI-5', 'no servidor: troca de arrependimento nasce aprovada e a resolução é reembolso', /^approved\|refund\|withdrawal/.test(row), row);
  const options = (await api('GET', `/v1/orders/${order.id}/exchange-options`, { token: c.token })).data;
  const itemId = options?.items?.[0]?.orderItemId;
  const second = await api('POST', `/v1/orders/${order.id}/exchanges`, { token: c.token, body: { orderItemId: itemId, type: 'withdrawal', method: 'drop_at_store' }, headers: { 'idempotency-key': `qa-troca-${Date.now()}` } });
  record('TROCA-UI-6', 'o servidor recusa um 2º arrependimento do mesmo item (4xx, nunca 201 nem 5xx)', second.status >= 400 && second.status < 500, `HTTP ${second.status} ${second.data?.code ?? ''}`);
  const again = (await getOrder(c, order.id)).data;
  const refundedOrder = sql(`select count(*) from exchange_requests where order_id = '${order.id}'`);
  record('TROCA-UI-6b', 'só 1 pedido de troca existe para o pedido depois da tentativa repetida', refundedOrder === '1', `exchange_requests=${refundedOrder}; canRequest no pedido=${again?.exchange?.canRequest} (informativo)`);
  record('TROCA-UI-7', 'nenhum erro de página e nenhum 5xx durante o fluxo', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (error) {
  record('TROCA-UI-ERRO', 'o script terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '));
} finally {
  await browser?.close();
  await resetParam('pix_hora_max').catch(() => undefined);
  finish();
}
