import { expect, test } from '@playwright/test';

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3999}`;
const intent = async (request: import('@playwright/test').APIRequestContext, name: string) => (await (await request.get(`${API}/__test/card-intent/${name}`)).json()).token as string;

test.describe('Página pública de cartão (B.2, SEC-106)', () => {
  test('sem login do painel: mostra o total, paga com cartão de teste e volta ao app sem confirmar pagamento', async ({ page, request }) => {
    const token = await intent(request, 'ok');
    await page.goto(`/pagar/cartao?i=${token}`);
    await expect(page.getByTestId('public.cartao.amount')).toContainText('59,90');
    await expect(page.getByTestId('public.cartao.fake-banner')).toBeVisible();
    await page.getByTestId('public.cartao.fake-fake_tok_approved').check();
    await page.getByTestId('public.cartao.submit').click();
    await expect(page.getByTestId('public.cartao.done')).toBeVisible();
    await expect(page.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://order/11111111-1111-4111-8111-111111111111');
  });

  test('cartão recusado e link já usado mostram o caminho de volta', async ({ page, request }) => {
    const token = await intent(request, 'recusa');
    await page.goto(`/pagar/cartao?i=${token}`);
    await page.getByTestId('public.cartao.fake-fake_tok_insufficient').check();
    await page.getByTestId('public.cartao.submit').click();
    await expect(page.getByTestId('public.cartao.failure')).toContainText('Limite insuficiente.');
    await page.goto(`/pagar/cartao?i=${token}`);
    await expect(page.getByTestId('public.cartao.invalid')).toBeVisible();
    await expect(page.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://checkout');
  });

  test('token ausente ou malformado cai no estado de link inválido, sem tela de painel', async ({ page }) => {
    await page.goto('/pagar/cartao');
    await expect(page.getByTestId('public.cartao.invalid')).toBeVisible();
    await expect(page.getByTestId('logo')).toBeVisible();
  });

  test('a CSP da página admite o Mercado Pago e a dos painéis não', async ({ page, request }) => {
    const token = await intent(request, 'csp');
    const response = await page.goto(`/pagar/cartao?i=${token}`);
    expect(response!.headers()['content-security-policy']).toContain('sdk.mercadopago.com');
    const admin = await page.goto('/admin/entrar');
    expect(admin!.headers()['content-security-policy']).not.toContain('mercadopago');
  });
});
