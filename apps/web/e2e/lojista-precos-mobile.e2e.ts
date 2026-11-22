import { expect, test } from '@playwright/test';
import { loginLojista, seedMerchant } from './helpers';

/** WB-377: "Preços e estoque" no celular: seleção com alvo de 44 px, reajuste com prévia, "Desfazer" por 10 min e preço de volta. */
test.use({ viewport: { width: 390, height: 844 } });

test('Preços e estoque no celular: reajusta 2 produtos em +10% com prévia e desfaz', async ({ page }) => {
  const merchant = await seedMerchant();
  await loginLojista(page, merchant.email, merchant.password);
  await page.goto('/lojista/produtos/importar');
  const names = ['Caneca Esmaltada', 'Garrafa Térmica', 'Boné Aba Reta'];
  const csv = ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', ...names.map((n, i) => `${n};Casa;;${20 + i * 10},00;;;;;;${5 + i};P-${i}`)].join('\r\n');
  await page.getByTestId('lojista.importar.file-input').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await page.getByTestId('lojista.importar.import-submit').click();
  await expect(page.getByTestId('lojista.importar.result')).toBeVisible();
  await page.evaluate(
    async (storeId) => {
      const call = (id: string, method: string, path: string, body: unknown) =>
        fetch(`/api/proxy/lojista/stores/${storeId}/products/${id}${path}`, { method, headers: { 'content-type': 'application/json', 'x-webag-client': 'web' }, body: JSON.stringify(body) });
      const list = (await (await fetch(`/api/proxy/lojista/stores/${storeId}/products?limit=50`)).json()) as { data: { id: string }[] };
      for (const { id } of list.data) {
        await call(id, 'PATCH', '', { categoryId: 'cat-1' });
        await call(id, 'PUT', '/images', { imageIds: ['asset-x'] });
        await call(id, 'POST', '/publish', {});
      }
    },
    merchant.storeId,
  );

  await page.goto('/lojista/produtos/precos');
  const rows = page.locator('tr[data-testid^="lojista.precos.row-"]');
  await expect(rows).toHaveCount(3);
  const price = (name: string) => page.getByLabel(`Preço de ${name}`);
  await expect(price('Caneca Esmaltada')).toHaveValue('20,00');

  // alvo de toque da caixa de seleção e nada de rolagem lateral
  const select = page.getByLabel('Selecionar Caneca Esmaltada').locator('xpath=..');
  const box = (await select.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByLabel('Selecionar Caneca Esmaltada').check();
  await page.getByLabel('Selecionar Garrafa Térmica').check();
  await expect(page.getByRole('region', { name: 'Ações em massa' })).toContainText('2 selecionados');
  await page.getByTestId('lojista.produtos.bulk-price').click();
  await page.getByTestId('lojista.produtos.bulk-value').fill('10');
  await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('2 produtos serão alterados');
  await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('R$ 20,00 → R$ 22,00');
  await page.getByTestId('lojista.produtos.bulk-confirm').click();

  await expect(page.getByTestId('lojista.precos.undo')).toContainText('Preços reajustados em 2 produtos');
  await expect(price('Caneca Esmaltada')).toHaveValue('22,00');
  await expect(price('Garrafa Térmica')).toHaveValue('33,00');
  await expect(price('Boné Aba Reta')).toHaveValue('40,00');

  // evidência opcional: PRECOS_SHOT=<pasta> grava um jpg pequeno da tabela com o aviso de desfazer
  if (process.env.PRECOS_SHOT) await page.screenshot({ path: `${process.env.PRECOS_SHOT}/precos-390.jpg`, type: 'jpeg', quality: 55 });
  const undo = page.getByTestId('lojista.precos.undo-button');
  const undoBox = (await undo.boundingBox())!;
  expect(undoBox.height).toBeGreaterThanOrEqual(44);
  await undo.click();
  await expect(page.getByTestId('lojista.precos.undo-done')).toContainText('Preços voltaram ao valor anterior.');
  await expect(price('Caneca Esmaltada')).toHaveValue('20,00');
  await expect(price('Garrafa Térmica')).toHaveValue('30,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
