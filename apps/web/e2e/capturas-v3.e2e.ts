import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, type Page } from '@playwright/test';
import { FAKE_API, login, loginLojista, seedMerchant } from './helpers';

/**
 * Capturas das telas do redesign v3 (desktop 1440 e celular 390) para `docs/qa/relatorios/`. Só roda com `CAPTURE_V3=1`
 * (`CAPTURE_V3=1 PW_CHANNEL=chrome pnpm exec playwright test e2e/capturas-v3.e2e.ts`); no CI normal fica ignorado.
 */
const OUT = resolve(process.cwd(), '../../docs/qa/relatorios/capturas-v3');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function post(path: string, body: unknown): Promise<{ id: string; number?: string }> {
  const response = await fetch(`${FAKE_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as { id: string; number?: string };
}

/** O alerta de pedido novo é modal e travado; para fotografar o que há atrás dele, esconde-o só na captura. */
async function hideAlert(page: Page) {
  await page.addStyleTag({ content: '[data-dialog-root]:has([data-testid="lojista.alert.modal"]) { display: none !important; }' });
  await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert')));
}

async function shot(page: Page, name: string, viewport: 'desk' | 'mob', full = true) {
  await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
  await page.waitForTimeout(1200);
  await hideAlert(page);
  await page.screenshot({ path: `${OUT}/${viewport}-${name}.png`, fullPage: full });
}

test.describe('capturas v3', () => {
  test.skip(!process.env.CAPTURE_V3, 'só com CAPTURE_V3=1');
  test.describe.configure({ timeout: 120_000 });
  mkdirSync(OUT, { recursive: true });

  test('lojista', async ({ page }) => {
    const merchant = (await post('/__test/seed-merchant', { name: 'Moda Morato', status: 'live' })) as unknown as { email: string; password: string; storeId: string };
    await loginLojista(page, merchant.email, merchant.password);
    for (const viewport of ['desk', 'mob'] as const) {
      await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
      await page.goto('/lojista');
      await shot(page, 'lojista-inicio-sem-pedido', viewport);
    }
    await post('/__test/seed-order', { storeId: merchant.storeId });
    await post('/__test/seed-review', { storeId: merchant.storeId, rating: 5, comment: 'Chegou bem embalado e a camiseta veste muito bem.' });
    await post('/__test/seed-review', { storeId: merchant.storeId, rating: 4, comment: 'Gostei do atendimento.' });
    await post('/__test/seed-exchange', { storeId: merchant.storeId });
    await page.reload();
    for (const viewport of ['desk', 'mob'] as const) {
      await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
      await page.goto('/lojista');
      await page.getByTestId('lojista.alert.modal').waitFor({ timeout: 6000 }).catch(() => undefined);
      await hideAlert(page);
      await shot(page, 'lojista-inicio', viewport);
      await page.goto('/lojista/pedidos');
      await page.getByTestId('lojista.alert.modal').waitFor({ timeout: 6000 }).catch(() => undefined);
      await hideAlert(page);
      await shot(page, 'lojista-pedidos', viewport);
      await page.goto('/lojista/avaliacoes');
      await shot(page, 'lojista-avaliacoes', viewport);
      await page.goto('/lojista/loja/entrega');
      await shot(page, 'lojista-entrega', viewport);
      await page.goto('/lojista/produtos');
      await shot(page, 'lojista-produtos', viewport);
      await page.goto('/lojista/trocas');
      await shot(page, 'lojista-trocas', viewport);
    }
    await page.setViewportSize(MOBILE);
    await page.goto('/lojista');
    await page.getByTestId('lojista.nav.more').click({ force: true });
    await page.waitForTimeout(600);
    await hideAlert(page);
    await page.screenshot({ path: `${OUT}/mob-lojista-mais.png` });
  });

  test('admin', async ({ page }) => {
    const merchant = await seedMerchant('Moda Morato');
    for (const eta of [-8, 12, 40]) await post('/__test/seed-delivery', { storeId: merchant.storeId, etaToMin: eta });
    await post('/__test/seed-delivery', { storeId: merchant.storeId });
    await login(page, 'admin@webag.local');
    for (const viewport of ['desk', 'mob'] as const) {
      await page.setViewportSize(viewport === 'desk' ? DESKTOP : MOBILE);
      await page.goto('/admin');
      await shot(page, 'admin-inicio', viewport);
      await page.goto('/admin/logistica');
      await shot(page, 'admin-logistica', viewport);
      await page.goto('/admin/parametros/entrega');
      await shot(page, 'admin-parametros-entrega', viewport);
      await page.goto('/admin/lojas');
      await shot(page, 'admin-lojas', viewport);
    }
    await page.setViewportSize(MOBILE);
    await page.goto('/admin/logistica');
    await page.getByTestId('nav-more').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/mob-admin-mais.png` });
  });
});
