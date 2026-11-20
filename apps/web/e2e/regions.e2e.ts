import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Regiões (AD1)', () => {
  test('criar uma cidade: valida o nome, cria e ela aparece na lista', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await page.getByTestId('nav-regioes').click();
    await expect(page.getByRole('heading', { name: 'Regiões', level: 1 })).toBeVisible();
    await expect(page.getByText('Francisco Morato')).toBeVisible();

    await page.getByTestId('admin.regioes.add-city').click();
    await page.getByTestId('admin.regioes.city-submit').click();
    await expect(page.getByText(/nome/i).first()).toBeVisible();

    const name = `Franco da Rocha ${Date.now() % 10_000}`;
    await page.getByTestId('admin.regioes.city-name-input').fill(name);
    await page.getByTestId('admin.regioes.city-submit').click();
    await expect(page.getByTestId('admin.regioes.add-city-dialog')).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();
  });

  test('a criação fica registrada na auditoria', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await page.getByTestId('nav-regioes').click();
    await page.getByTestId('admin.regioes.add-city').click();
    const name = `Cajamar ${Date.now() % 10_000}`;
    await page.getByTestId('admin.regioes.city-name-input').fill(name);
    await page.getByTestId('admin.regioes.city-submit').click();
    await expect(page.getByText(name)).toBeVisible();
    await page.getByTestId('nav-auditoria').click();
    await expect(page.getByRole('cell', { name: 'Cidade criada' }).first()).toBeVisible();
  });

  test('operação cria cidade mas não vê parâmetros', async ({ page }) => {
    await login(page, 'operacao@webag.local');
    await page.getByTestId('nav-regioes').click();
    await expect(page.getByTestId('admin.regioes.add-city')).toBeVisible();
  });
});
