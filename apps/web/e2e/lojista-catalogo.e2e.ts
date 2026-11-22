import { expect, test } from '@playwright/test';
import { documentPhoto, loginLojista, seedMerchant } from './helpers';

const T = (screen: string, id: string) => `lojista.${screen}.${id}`;

/** R4 do roteiro de usabilidade: cadastrar produto com variação e importar planilha (WB-060, 061, 065). */
test.describe('Catálogo (lojista)', () => {
  test('cadastra um produto com foto recortada, variações e estoque por variação e publica', async ({ page }) => {
    const merchant = await seedMerchant();
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/produtos');
    await expect(page.getByText('Sua vitrine está vazia')).toBeVisible();
    // "Novo produto" agora abre o cadastro rápido (WB-370); este fluxo cobre o formulário completo, que segue em /novo/completo.
    await page.goto('/lojista/produtos/novo/completo');

    // Publicar vazio: o resumo lista o que falta e nada é enviado
    await page.getByTestId(T('produto', 'submit')).click();
    await expect(page.getByTestId(T('produto', 'error-summary'))).toContainText('4 campos precisam de atenção');

    // Foto: escolhe, recorta em 1:1 no navegador e envia com progresso
    await page.getByTestId(T('produto', 'photo-file-input')).setInputFiles(documentPhoto());
    await page.getByTestId('lojista.crop.crop-accept').click();
    await expect(page.getByTestId(T('produto', 'photo-0'))).toBeVisible();
    await expect(page.getByTestId(T('produto', 'photo-0')).getByText('Capa')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);

    await page.getByTestId(T('produto', 'name-input')).fill('Camiseta Básica');
    await page.getByTestId(T('produto', 'category-select')).selectOption({ label: 'Mercado' });
    await page.getByTestId(T('produto', 'price-input')).pressSequentially('5990');
    await expect(page.getByTestId(T('produto', 'price-input'))).toHaveValue('59,90');

    // K3: variações
    await page.getByTestId(T('produto', 'variations-radio')).click();
    await page.getByTestId(T('variacoes', 'attr-add-size')).click();
    await page.getByRole('button', { name: 'P', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByTestId(T('variacoes', 'attr-add-color')).click();
    await page.getByRole('button', { name: 'Preto', exact: true }).click();
    await page.getByRole('button', { name: 'Azul', exact: true }).click();
    await expect(page.getByTestId(T('variacoes', 'summary'))).toContainText('4 opções · 40 em estoque');
    await page.getByTestId(T('variacoes', 'row-0-stock')).fill('3');
    await expect(page.getByTestId(T('variacoes', 'summary'))).toContainText('4 opções · 33 em estoque');
    await page.getByTestId(T('variacoes', 'submit')).click();
    await expect(page.getByTestId(T('produto', 'variations-summary'))).toContainText('33 em 4 opções');

    await page.getByTestId(T('produto', 'submit')).click();
    await expect(page).toHaveURL(/\/lojista\/produtos$/);
    await expect(page.getByText('Produto publicado. Já aparece na sua loja.')).toBeVisible();

    // Na lista: vendendo, com o estoque somado das opções
    const row = page.locator('[data-testid^="lojista.produtos.row-"]').filter({ hasText: 'Camiseta Básica' }).first();
    await expect(row).toContainText('33 em 4 opções');
    await expect(row.getByRole('switch')).toBeChecked();

    // V8.3: foto que não carrega nunca vira ícone quebrado do navegador nem texto alternativo na tela
    await expect(page.locator('main img:visible').evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 0).length)).resolves.toBe(0);

    // Pausar com 1 toque e desfazer
    await row.getByRole('switch').click();
    await expect(page.getByText('Camiseta Básica pausada.')).toBeVisible();
    await expect(row.getByRole('switch')).not.toBeChecked();
    await page.getByTestId('toast-action').click();
    await expect(row.getByRole('switch')).toBeChecked();
  });

  test('importa uma planilha: confere os erros por linha, importa como rascunho e abre os rascunhos', async ({ page }) => {
    const merchant = await seedMerchant();
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/produtos/importar');
    await expect(page.getByTestId(T('importar', 'template-csv'))).toHaveAttribute('href', `/api/proxy/lojista/stores/${merchant.storeId}/products/import/template`);

    const csv = [
      'nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo',
      'Caneca Esmaltada;Casa;;29,90;;;;;;12;CAN-1',
      'Garrafa Térmica;Casa;;;;;;;;5;GAR-1',
      'Boné Aba Reta;Moda;;49,90;;;;;;8;BON-1',
    ].join('\r\n');
    await page.getByTestId(T('importar', 'file-input')).setInputFiles({ name: 'produtos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });

    await expect(page.getByTestId(T('importar', 'summary-valid'))).toContainText('2 válidas');
    await expect(page.getByTestId(T('importar', 'summary-errors'))).toContainText('1 com erro');
    await expect(page.getByTestId(T('importar', 'error-row-3'))).toContainText('preço');
    await expect(page.getByTestId(T('importar', 'import-submit'))).toHaveText('Importar 2 produtos');
    await page.getByTestId(T('importar', 'import-submit')).click();

    await expect(page.getByTestId(T('importar', 'result'))).toContainText('2 produtos importados como rascunho.');
    await expect(page.getByTestId(T('importar', 'errors-download'))).toBeVisible();
    await page.getByTestId(T('importar', 'view-drafts')).click();
    await expect(page).toHaveURL(/filtro=draft/);
    await expect(page.getByTestId(T('produtos', 'filter-draft'))).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Caneca Esmaltada')).toBeVisible();
    await expect(page.getByText('Boné Aba Reta')).toBeVisible();
    await expect(page.getByText('Garrafa Térmica')).toHaveCount(0);
  });
});
