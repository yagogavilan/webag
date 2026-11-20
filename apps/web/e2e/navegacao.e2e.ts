import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, loginLojista, seedMerchant, totp } from './helpers';

/** No celular o nome do usuário vai para o "Mais": a entrada espera a barra de baixo, não o cabeçalho. */
async function login(page: Page, email: string): Promise<void> {
  await page.goto('/admin/entrar');
  await page.getByTestId('admin.login.email-input').fill(email);
  await page.getByTestId('admin.login.password-input').fill(PASSWORD);
  await page.getByTestId('admin.login.submit').click();
  await expect(page.getByTestId('admin.login.totp-input')).toBeVisible();
  await page.getByLabel('Dígito 1 de 6').pressSequentially(totp());
  await expect(page.getByTestId('nav-more')).toBeVisible();
}

/** Navegação v3 no celular (onda-7-navegacao-paineis): barra de 4 destinos + "Mais". */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('Navegação no celular', () => {
  test('lojista: 4 destinos na barra, Avaliações alcançável pelo Mais e o Mais marcado na página', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista');
    const bar = page.getByRole('navigation', { name: 'Menu principal' });
    for (const key of ['inicio', 'pedidos', 'produtos', 'trocas']) await expect(page.getByTestId(`lojista.nav.${key}-bottom`)).toBeVisible();
    await expect(page.getByTestId('lojista.nav.avaliacoes-bottom')).toHaveCount(0);
    await expect(bar.getByRole('link')).toHaveCount(4);
    await page.getByTestId('lojista.nav.more').click();
    const sheet = page.getByTestId('lojista.nav.more-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Mais' })).toBeFocused();
    await sheet.getByTestId('lojista.nav.more.avaliacoes').click();
    await expect(page).toHaveURL(/\/lojista\/avaliacoes$/);
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('lojista.nav.more')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('lojista.nav.more').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lojista.nav.more-sheet')).toBeHidden();
  });

  test('admin: barra por perfil, folha Mais com busca e sem menu hambúrguer', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await expect(page.getByTestId('nav-open')).toHaveCount(0);
    for (const key of ['inicio', 'logistica', 'lojas', 'disputas']) await expect(page.getByTestId(`nav-bottom-${key}`)).toBeVisible();
    await page.getByTestId('nav-more').click();
    const sheet = page.getByTestId('nav-more-sheet');
    await expect(sheet.getByTestId('nav-more-parametros_entrega')).toBeVisible();
    await expect(sheet.getByTestId('nav-more-logistica')).toHaveCount(0);
    await sheet.getByTestId('nav-more-search').fill('zzzz');
    await expect(sheet.getByText('Nenhuma área com esse nome.')).toBeVisible();
    await sheet.getByTestId('nav-more-search').fill('parâmetros');
    await sheet.getByTestId('nav-more-parametros_entrega').click();
    await expect(page).toHaveURL(/\/admin\/parametros\/entrega$/);
    await expect(page.getByTestId('panel.title')).toHaveText('Parâmetros de entrega');
  });

  test('admin suporte: Início, Lojas, Logística e Moderação na barra, sem Mais de áreas (só a conta)', async ({ page }) => {
    await login(page, 'suporte@webag.local');
    for (const key of ['inicio', 'lojas', 'logistica', 'moderacao']) await expect(page.getByTestId(`nav-bottom-${key}`)).toBeVisible();
    await page.getByTestId('nav-more').click();
    await expect(page.getByTestId('nav-more-perfil')).toBeVisible();
    await expect(page.getByTestId('nav-more-sair')).toBeVisible();
  });
});
