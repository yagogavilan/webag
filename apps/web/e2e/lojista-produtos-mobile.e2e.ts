import { expect, test } from '@playwright/test';
import { loginLojista, seedMerchant } from './helpers';

/** V8.7: no celular a lista de produtos é compacta (≥ 3 produtos abaixo da busca na 1ª tela) e a pausa fica a 1 toque. */
test.use({ viewport: { width: 390, height: 844 } });

test('Produtos no celular: 3 produtos na 1ª tela, interruptor de pausa e estoque −/+ com alvo de 44 px', async ({ page }) => {
  const merchant = await seedMerchant();
  await loginLojista(page, merchant.email, merchant.password);
  await page.goto('/lojista/produtos/importar');
  const names = ['Caneca Esmaltada', 'Garrafa Térmica', 'Boné Aba Reta', 'Camiseta Básica', 'Mochila Urbana'];
  const csv = ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', ...names.map((n, i) => `${n};Casa;;${20 + i},90;;;;;;${5 + i};C-${i}`)].join('\r\n');
  await page.getByTestId('lojista.importar.file-input').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await page.getByTestId('lojista.importar.import-submit').click();
  await expect(page.getByTestId('lojista.importar.result')).toBeVisible();
  // O importador cria rascunhos; a API falsa publica com categoria, foto e variação.
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

  await page.goto('/lojista/produtos');
  const rows = page.locator('tr[data-testid^="lojista.produtos.row-"]');
  await expect(rows).toHaveCount(5);
  const viewportHeight = 844;
  const addTop = (await page.getByTestId('lojista.produtos.add').boundingBox())!.y;

  // linha compacta: até ~96 px por produto e ≥ 3 inteiros acima do botão fixo "Adicionar produto" e da barra inferior
  let whole = 0;
  for (let i = 0; i < 5; i += 1) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(100);
    if (box.y + box.height <= Math.min(addTop, viewportHeight - 72)) whole += 1;
  }
  expect(whole).toBeGreaterThanOrEqual(3);

  // sem modo "Selecionar" não há caixa de seleção na linha
  await expect(rows.first().locator('input[type="checkbox"]')).toBeHidden();

  // alvos de toque: estoque −/+ e o interruptor (a área clicável passa de 44 px)
  const plus = (await rows.first().locator('[data-testid$="-stock-plus"]').boundingBox())!;
  expect(plus.width).toBeGreaterThanOrEqual(44);
  expect(plus.height).toBeGreaterThanOrEqual(44);
  const first = rows.first().getByRole('switch');
  await expect(first).toBeChecked();
  await first.click();
  await expect(first).not.toBeChecked();

  // modo "Selecionar" mostra a caixa de seleção
  await page.getByTestId('lojista.produtos.select-mode').click();
  await expect(rows.first().locator('input[type="checkbox"]')).toBeVisible();
});
