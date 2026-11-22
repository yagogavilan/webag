import { expect, test } from '@playwright/test';
import { loginLojista, seedMerchant } from './helpers';

/** BUG-048: no celular o nome do rascunho tinha 0 px de largura (uma letra por linha). Mede o painel de rascunhos em 360 e 390 px e no computador. */
const NAME = 'Caneca Esmaltada Azul com Alça';
const csv = ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', `${NAME};Casa;;20,90;;;;;;5;D-1`, 'Garrafa Térmica;Casa;;29,90;;;;;;3;D-2'].join('\r\n');

for (const vp of [
  { name: 'celular de entrada 360x640', width: 360, height: 640, stacked: true },
  { name: 'celular 390x844', width: 390, height: 844, stacked: true },
  { name: 'computador 1280x800', width: 1280, height: 800, stacked: false },
]) {
  test.describe(`BUG-048 ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('painel de rascunhos: nome legível e ações dentro do cartão', async ({ page }) => {
      const merchant = await seedMerchant();
      await loginLojista(page, merchant.email, merchant.password);
      await page.goto('/lojista/produtos/importar');
      await page.getByTestId('lojista.importar.file-input').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
      await page.getByTestId('lojista.importar.import-submit').click();
      await expect(page.getByTestId('lojista.importar.result')).toBeVisible();

      await page.goto('/lojista/produtos?filtro=draft');
      const item = page.locator('li[data-testid^="lojista.rascunhos.item-"]', { hasText: NAME });
      await expect(item).toBeVisible();

      const name = item.getByText(NAME, { exact: true });
      await expect(name).toBeVisible();
      const nameBox = (await name.boundingBox())!;
      const itemBox = (await item.boundingBox())!;
      expect(nameBox.width).toBeGreaterThan(120);
      // nome em poucas linhas (antes: uma letra por linha, ~420 px por cartão)
      expect(nameBox.height).toBeLessThanOrEqual(60);
      expect(itemBox.height).toBeLessThanOrEqual(vp.stacked ? 200 : 110);

      // as 3 ações ficam dentro do cartão, sem rolagem lateral, e com alvo de toque utilizável
      for (const [role, label] of [['link', /^Continuar /], ['button', /^Duplicar /], ['button', /^Apagar o rascunho /]] as const) {
        const button = item.getByRole(role, { name: label });
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(itemBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(itemBox.x + itemBox.width + 1);
        expect(box.height).toBeGreaterThanOrEqual(36);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // evidência opcional: BUG048_SHOT=<pasta> grava um jpg pequeno do painel
      if (process.env.BUG048_SHOT && vp.stacked) await page.screenshot({ path: `${process.env.BUG048_SHOT}/rascunhos-${vp.width}-depois.jpg`, type: 'jpeg', quality: 55 });
    });
  });
}
