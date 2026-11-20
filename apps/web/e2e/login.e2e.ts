import { expect, test } from '@playwright/test';
import { PASSWORD, login } from './helpers';

test.describe('Login do admin (AC1)', () => {
  test('senha errada mostra a mensagem única e não revela o que errou', async ({ page }) => {
    await page.goto('/admin/entrar');
    await page.getByTestId('admin.login.email-input').fill('admin@webag.local');
    await page.getByTestId('admin.login.password-input').fill('senha-errada-123');
    await page.getByTestId('admin.login.submit').click();
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/entrar/);
  });

  test('campos vazios mostram o erro ao tocar no botão (botão sempre ativo)', async ({ page }) => {
    await page.goto('/admin/entrar');
    await page.getByTestId('admin.login.submit').click();
    await expect(page.getByText('Digite seu e-mail.')).toBeVisible();
    await expect(page.getByText('Digite sua senha.')).toBeVisible();
  });

  test('senha certa pede o código do autenticador e entra no painel', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await expect(page).toHaveURL(/\/admin(\/|$)/);
    await expect(page.getByTestId('nav-parametros')).toBeVisible();
    await expect(page.getByTestId('nav-admins')).toBeVisible();
  });

  test('operação entra e o menu só mostra o que o perfil acessa', async ({ page }) => {
    await login(page, 'operacao@webag.local');
    await expect(page.getByTestId('nav-regioes')).toBeVisible();
    await expect(page.getByTestId('nav-parametros')).toHaveCount(0);
    await expect(page.getByTestId('nav-admins')).toHaveCount(0);
    await page.goto('/admin/parametros');
    await expect(page.getByTestId('no-access')).toBeVisible();
  });

  test('sem sessão, uma tela do painel manda para o login', async ({ page }) => {
    await page.goto('/admin/regioes');
    await expect(page).toHaveURL(/\/admin\/entrar/);
  });

  test('sair encerra a sessão', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await page.getByTestId('user-menu').click();
    await page.getByTestId('user-menu-logout').click();
    await expect(page).toHaveURL(/\/admin\/entrar/);
    await page.goto('/admin/regioes');
    await expect(page).toHaveURL(/\/admin\/entrar/);
  });

  test('senha do e-mail certo sem o código segue pedindo o segundo fator', async ({ page }) => {
    await page.goto('/admin/entrar');
    await page.getByTestId('admin.login.email-input').fill('admin@webag.local');
    await page.getByTestId('admin.login.password-input').fill(PASSWORD);
    await page.getByTestId('admin.login.submit').click();
    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
    await page.getByLabel('Dígito 1 de 6').pressSequentially('000000');
    await expect(page.getByText('Código incorreto ou vencido.')).toBeVisible();
  });
});
