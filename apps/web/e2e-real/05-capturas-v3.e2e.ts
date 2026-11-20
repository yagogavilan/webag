import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { API, REAL_DB_URL, adminLogin, lojistaLogin } from './helpers';

/**
 * Capturas do redesign v3 com a API REAL (Postgres, Redis e pedidos de demonstração do seed), desktop 1440 e celular 390, para
 * `docs/qa/relatorios/capturas-v3/real-*.png`. Também confere, pelas telas, que os campos novos do contrato chegam: faixa de pedido de
 * cancelamento por atraso, "No prazo hoje", contagens do Início do admin, resumo de avaliações, "Mais vendidos", prévia de entrega,
 * "Marque pronto até", teto de custo do cupom e as planilhas financeiras. Só roda com `CAPTURE_V3=1` (mexe nos dados do banco local).
 *
 * `CAPTURE_V3=1 REAL_DB_URL=postgresql://webag:webag_dev_only@localhost:5433/webag PW_CHANNEL=chrome pnpm exec playwright test -c playwright.real.config.ts e2e-real/05-capturas-v3.e2e.ts`
 */
const DB = REAL_DB_URL;
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'webag-seed-lojista-2026';
const OUT = resolve(process.cwd(), '../../docs/qa/relatorios/capturas-v3');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const sql = (query: string): string => execFileSync('psql', [DB, '-At', '-F', '|', '-c', query], { encoding: 'utf8' }).trim();

async function shot(page: Page, name: string, viewport: 'desk' | 'mob'): Promise<void> {
  await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
  await page.waitForTimeout(1200);
  // O alerta de pedido novo é modal e travado; para fotografar o que há atrás dele, esconde-o só na captura.
  await page.addStyleTag({ content: '[data-dialog-root]:has([data-testid="lojista.alert.modal"]) { display: none !important; }' });
  await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert')));
  await page.screenshot({ path: `${OUT}/real-${viewport}-${name}.png`, fullPage: true });
}

async function customerToken(email: string): Promise<string> {
  const res = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SEED_PASSWORD }) });
  const body = (await res.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`login do cliente ${email}: ${res.status}`);
  return body.tokens.accessToken;
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.skip(!process.env.CAPTURE_V3, 'só com CAPTURE_V3=1');

const state = {} as { lateOrderId: string; lateDeliveryId: string; lateNumber: string };

test.describe('capturas v3 com a API real', () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test('prepara um pedido atrasado em saída e o cliente pede o cancelamento por atraso (contrato W.3)', async () => {
    const [orderId, number, deliveryId, customerEmail] = sql(
      `select o.id, o.number, d.id, c.email from orders o join deliveries d on d.order_id=o.id join users c on c.id=o.user_id where o.status='out_for_delivery' and o.mode='delivery' order by o.number limit 1`,
    ).split('|') as [string, string, string, string];
    Object.assign(state, { lateOrderId: orderId, lateDeliveryId: deliveryId, lateNumber: number });
    // faixa vencida há 40 min (além da tolerância); só o banco local de desenvolvimento
    sql(`update orders set eta_from_at = now() - interval '100 minutes', eta_to_at = now() - interval '40 minutes' where id='${orderId}'`);
    sql(`update deliveries set eta_to_at = now() - interval '40 minutes' where id='${deliveryId}'`);
    const token = await customerToken(customerEmail);
    const res = await fetch(`${API}/v1/orders/${orderId}/cancel-late`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    expect([200, 409], await res.text()).toContain(res.status);
    expect(sql(`select count(*) from order_cancel_requests where order_id='${orderId}' and status='pending'`)).not.toBe('0');
  });

  test('admin: Início com contagens, Logística com "No prazo hoje" e a faixa do pedido de cancelamento, Cupons e Relatórios', async ({ page }) => {
    await adminLogin(page);
    for (const viewport of ['desk', 'mob'] as const) {
      await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
      await page.goto('/admin');
      await expect(page.getByTestId('admin.home.pending')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('admin.home.pending-lojas')).toBeVisible();
      await shot(page, 'admin-inicio', viewport);

      await page.goto('/admin/logistica');
      await expect(page.getByTestId('admin.logistica.summary-ontime')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('admin.logistica.late-alert')).toContainText(/pedido de cancelamento|corridas? atrasadas?/);
      await shot(page, 'admin-logistica-fila', viewport);
      await page.getByTestId('admin.logistica.tab-andamento').click();
      const strip = page.getByTestId(`admin.logistica.cancel-request-${state.lateDeliveryId}`);
      await expect(strip).toBeVisible();
      await expect(strip).toContainText('O cliente pediu cancelamento por atraso');
      await expect(page.getByTestId(`admin.logistica.cancel-request-${state.lateDeliveryId}-countdown`)).toHaveText(/^\d{2}:\d{2}$/);
      await shot(page, 'admin-logistica-andamento', viewport);

      await page.goto('/admin/cupons');
      await expect(page.locator('[data-testid^="admin.cupons.row-"][data-testid$="-maxcost"]').first()).toBeVisible({ timeout: 20_000 });
      await page.locator('[data-testid$="-usage"]').first().click();
      await expect(page.getByTestId('admin.cupons.usage')).toBeVisible();
      await shot(page, 'admin-cupons-uso', viewport);
      await page.keyboard.press('Escape');

      await page.goto('/admin/relatorios');
      await expect(page.getByTestId('admin.relatorios.export-revenue')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'admin-relatorios', viewport);
    }
    // CSV financeiro de verdade pelo BFF (R1 e R2)
    await page.goto('/admin/relatorios');
    await page.getByTestId('admin.relatorios.period-30d').click();
    for (const id of ['revenue', 'refunds']) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`admin.relatorios.export-${id}`).click()]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  });

  test('lojista: Início com avaliação e "Mais vendidos", Avaliações com distribuição, Entrega com prévia real e "Marque pronto até"', async ({ page }) => {
    const owner = 'lojista.mercadinho-boa-compra@seed.webag.local';
    const storeId = sql(`select s.id from stores s join store_members m on m.store_id=s.id and m.role='owner' join users u on u.id=m.user_id where u.email='${owner}'`);
    // um pedido em preparo com pagamento recente, para a pastilha "Marque pronto até" (hora do servidor: pagamento + preparo)
    // (os pedidos de demonstração do seed não trazem o preparo gravado; aqui grava, só no banco local, para a API calcular `readyByAt`)
    const preparing = sql(`select id from orders where store_id='${storeId}' and status in ('accepted','in_preparation') and mode='delivery' limit 1`);
    if (preparing) sql(`update orders set paid_at = now() - interval '12 minutes', delivery_snapshot = coalesce(delivery_snapshot, '{}'::jsonb) || '{"eta":{"prepMin":25}}'::jsonb where id='${preparing}'`);
    await lojistaLogin(page, owner, SEED_PASSWORD);
    for (const viewport of ['desk', 'mob'] as const) {
      await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
      await page.goto('/lojista');
      await expect(page.getByTestId('lojista.home.reviews')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('lojista.inicio.top-products')).toBeVisible();
      await expect(page.getByTestId('lojista.inicio.top-products')).toContainText('Você recebe');
      await shot(page, 'lojista-inicio', viewport);

      await page.goto('/lojista/avaliacoes');
      await expect(page.getByTestId('lojista.avaliacoes.summary-average')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'lojista-avaliacoes', viewport);

      await page.goto('/lojista/loja/entrega');
      await expect(page.getByTestId('lojista.entrega.preview-band')).toContainText(/Chega em \d+ a \d+ min/, { timeout: 20_000 });
      await expect(page.getByTestId('lojista.entrega.preview-sum')).toContainText('Conta: preparo');
      await shot(page, 'lojista-entrega-previa', viewport);
      await page.getByTestId('lojista.entrega.preview-km').fill('90');
      await expect(page.getByTestId('lojista.entrega.preview-out')).toContainText('Fora da área de entrega da loja', { timeout: 20_000 });
      await shot(page, 'lojista-entrega-previa-fora', viewport);

      await page.goto('/lojista/pedidos');
      // no celular os pedidos ficam em abas (Novos, Em separação, Prontos); o alerta de pedido novo cobre a tela
      await page.getByTestId('lojista.alert.modal').waitFor({ timeout: 8000 }).catch(() => undefined);
      await page.addStyleTag({ content: '[data-dialog-root]:has([data-testid="lojista.alert.modal"]) { display: none !important; }' });
      await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert')));
      if (viewport === 'mob') await page.getByTestId('lojista.orders.tab-preparing').click();
      if (preparing) await expect(page.locator('[data-testid^="lojista.orders.ready-by-"]').first()).toBeVisible({ timeout: 20_000 });
      await shot(page, 'lojista-pedidos', viewport);
    }
  });
});
