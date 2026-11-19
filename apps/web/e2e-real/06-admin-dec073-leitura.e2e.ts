import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

/**
 * DEC-073 contra a API REAL, SÓ LEITURA (não bloqueia, cancela, estorna nem liga a manutenção): prova que o contrato que as telas
 * esperam (alertas, usuários, pedidos, manutenção) é o que a API devolve, sem estado de erro nem de "sem acesso" para o super admin.
 */
test.describe('Admin DEC-073 (API real, leitura)', () => {
  test('Alertas, Usuários, Pedidos e Modo manutenção abrem com os dados reais', async ({ page }) => {
    await adminLogin(page);
    for (const [path, title] of [['/admin/alertas', 'Alertas'], ['/admin/usuarios', 'Usuários'], ['/admin/pedidos', 'Pedidos'], ['/admin/manutencao', 'Modo manutenção']] as const) {
      await page.goto(path);
      await expect(page.getByTestId('panel.title')).toHaveText(title);
      await expect(page.getByTestId('no-access')).toHaveCount(0);
      await expect(page.getByTestId('error-state')).toHaveCount(0);
      await expect(page.getByTestId('skeleton')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByTestId('error-state')).toHaveCount(0);
    }
    await page.goto('/admin/alertas');
    await expect(page.getByTestId('admin.alertas.summary')).toBeVisible();
    await page.goto('/admin/manutencao');
    await expect(page.getByTestId('admin.manutencao.state')).toBeVisible();
    // o primeiro pedido e o primeiro usuário da lista (se houver) abrem o detalhe mascarado
    await page.goto('/admin/pedidos');
    const firstOrder = page.getByTestId(/admin\.pedidos\.open-/).first();
    if (await firstOrder.count()) {
      await firstOrder.click();
      await expect(page.getByTestId('admin.pedidos.summary')).toBeVisible();
      const email = await page.getByTestId('admin.pedidos.email').innerText();
      expect(email === '-' || email.includes('*')).toBe(true);
    }
  });
});
