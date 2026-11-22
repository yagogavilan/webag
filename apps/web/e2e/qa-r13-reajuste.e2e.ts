import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loginLojista, seedMerchant } from './helpers';

/**
 * QA R1.3 (2026-11-22): exploratório do reajuste em massa na tela real (build de produção, API falsa), com o contrato REAL onde a falsa não o reproduz:
 * 200 itens, 201 (a API real responde 422 BULK_TOO_LARGE; a falsa não limita, então a resposta é injetada aqui), resposta perdida com repetição da mesma chave
 * e falta de rede. O que a tela mostra fica registrado em `QA_NOTES_FILE` (padrão: `qa-r13-notes.log` no diretório temporário).
 */
const note = (line: string): void => {
  try {
    appendFileSync(process.env.QA_NOTES_FILE ?? join(tmpdir(), 'qa-r13-notes.log'), `${line}\n`);
  } catch {
    /* o registro é só evidência: nunca derruba o teste */
  }
};

async function seedProducts(page: Page, n: number): Promise<{ storeId: string }> {
  const merchant = await seedMerchant(`QA ${Math.random().toString(36).slice(2, 7)}`);
  await loginLojista(page, merchant.email, merchant.password);
  await page.goto('/lojista/produtos/importar');
  const rows = Array.from({ length: n }, (_, i) => `Produto ${String(i + 1).padStart(3, '0')};Casa;;${20 + (i % 7)},50;;;;;;5;Q-${i}`);
  const csv = ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', ...rows].join('\r\n');
  await page.getByTestId('lojista.importar.file-input').setInputFiles({ name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await page.getByTestId('lojista.importar.import-submit').click();
  await expect(page.getByTestId('lojista.importar.result')).toBeVisible();
  await page.evaluate(
    async (storeId) => {
      const call = (id: string, method: string, path: string, body: unknown) =>
        fetch(`/api/proxy/lojista/stores/${storeId}/products/${id}${path}`, { method, headers: { 'content-type': 'application/json', 'x-webag-client': 'web' }, body: JSON.stringify(body) });
      const list = (await (await fetch(`/api/proxy/lojista/stores/${storeId}/products?limit=500`)).json()) as { data: { id: string }[] };
      for (const { id } of list.data) {
        await call(id, 'PATCH', '', { categoryId: 'cat-1' });
        await call(id, 'PUT', '/images', { imageIds: ['asset-x'] });
        await call(id, 'POST', '/publish', {});
      }
    },
    merchant.storeId,
  );
  return { storeId: merchant.storeId };
}

test.describe('QA R1.3: reajuste em massa na tela', () => {
  test.setTimeout(120_000);

  test('F1: 200 itens (o teto) com prévia, aplicar e desfazer; sem rolagem lateral', async ({ page }) => {
    await seedProducts(page, 205);
    await page.goto('/lojista/produtos/precos');
    const rows = page.locator('tr[data-testid^="lojista.precos.row-"]');
    await expect(rows).toHaveCount(205);
    await page.getByTestId('lojista.precos.select-all').check();
    await expect(page.getByRole('region', { name: 'Ações em massa' })).toContainText('200 selecionados');
    await page.getByTestId('lojista.produtos.bulk-price').click();
    await page.getByTestId('lojista.produtos.bulk-value').fill('7,35');
    await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('200 produtos serão alterados');
    await page.getByTestId('lojista.produtos.bulk-confirm').click();
    await expect(page.getByTestId('lojista.precos.undo')).toContainText('Preços reajustados em 200 produtos');
    // R$ 20,50 + 7,35% = 22,00675 -> 22,01
    await expect(page.getByLabel('Preço de Produto 001')).toHaveValue('22,01');
    await expect(page.getByLabel('Preço de Produto 205')).toHaveValue('21,50'); // fora da seleção, intacto
    await page.getByTestId('lojista.precos.undo-button').click();
    await expect(page.getByTestId('lojista.precos.undo-done')).toContainText('Preços voltaram ao valor anterior.');
    await expect(page.getByLabel('Preço de Produto 001')).toHaveValue('20,50');
  });

  test('F2: 201 selecionados: a tela avisa e o que o lojista vê ao tentar (a API real responde 422 BULK_TOO_LARGE)', async ({ page }) => {
    test.fail(true, 'BUG-050: o diálogo mostra só "Não foi possível calcular a prévia" e não diz que o teto é 200; remover esta linha quando for corrigido');
    await seedProducts(page, 205);
    await page.route('**/products/bulk', async (route) => {
      const sent = route.request().postDataJSON() as { productIds: string[] };
      if (sent.productIds.length > 200) {
        return route.fulfill({ status: 422, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Seleção grande demais', status: 422, code: 'BULK_TOO_LARGE', errors: [{ field: 'productIds', message: 'No máximo 200 produtos por vez.' }] }) });
      }
      return route.continue();
    });
    await page.goto('/lojista/produtos/precos');
    await expect(page.locator('tr[data-testid^="lojista.precos.row-"]')).toHaveCount(205);
    await page.getByTestId('lojista.precos.select-all').check();
    await page.getByLabel('Selecionar Produto 201').check();
    await expect(page.getByRole('region', { name: 'Ações em massa' })).toContainText('201 selecionados');
    await expect(page.getByText('O máximo é 200 produtos por vez. Desmarque alguns.')).toBeVisible();
    await page.getByTestId('lojista.produtos.bulk-price').click();
    await page.getByTestId('lojista.produtos.bulk-value').fill('10');
    const dialog = page.getByTestId('lojista.produtos.bulk-dialog-price');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Tentar de novo')).toBeVisible(); // a prévia falhou (422): espera a tela assentar
    const confirm = page.getByTestId('lojista.produtos.bulk-confirm');
    const text = (await dialog.innerText()).replace(/\s+/g, ' ');
    note(`[QA-R13] F2 (201 itens) diálogo: "${text.slice(0, 400)}" | confirmar habilitado: ${await confirm.isEnabled()}`);
    // Critério mínimo: com 201 itens o lojista NÃO pode ficar sem saber por quê, nem conseguir aplicar.
    const mentions200 = /200/.test(text);
    expect({ confirmEnabled: await confirm.isEnabled(), mentions200 }).toEqual({ confirmEnabled: false, mentions200: true });
  });

  test('F3: resposta perdida (o servidor aplicou, a tela não soube): repetir usa a MESMA chave e o preço sobe uma vez só', async ({ page }) => {
    await seedProducts(page, 3);
    const keys: string[] = [];
    let dropped = false;
    await page.route('**/products/bulk', async (route) => {
      const request = route.request();
      const sent = request.postDataJSON() as { dryRun?: boolean };
      const key = request.headers()['idempotency-key'];
      if (!sent.dryRun && key) {
        keys.push(key);
        if (!dropped) {
          dropped = true;
          await route.fetch(); // o servidor aplica de verdade
          return route.abort('connectionreset'); // e a resposta se perde
        }
      }
      return route.continue();
    });
    await page.goto('/lojista/produtos/precos');
    await expect(page.locator('tr[data-testid^="lojista.precos.row-"]')).toHaveCount(3);
    await page.getByLabel('Selecionar Produto 001').check();
    await page.getByTestId('lojista.produtos.bulk-price').click();
    await page.getByTestId('lojista.produtos.bulk-value').fill('10');
    await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('1 produto será alterado');
    await page.getByTestId('lojista.produtos.bulk-confirm').click();
    const dialog = page.getByTestId('lojista.produtos.bulk-dialog-price');
    await expect(dialog).toContainText(/internet|salvar|conex/i);
    note(`[QA-R13] F3 mensagem após resposta perdida: "${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 300)}"`);
    await page.getByTestId('lojista.produtos.bulk-confirm').click();
    await expect(page.getByTestId('lojista.precos.undo')).toContainText('Preços reajustados em 1 produto');
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await expect(page.getByLabel('Preço de Produto 001')).toHaveValue('22,55'); // 20,50 +10% uma vez; duas vezes daria 24,81
  });

  test('F4: sem internet com o diálogo aberto: "aplicar" fica inerte com o motivo escrito e nada é enviado; ao voltar, funciona', async ({ page, context }) => {
    await seedProducts(page, 3);
    let applies = 0;
    await page.route('**/products/bulk', (route) => {
      const sent = route.request().postDataJSON() as { dryRun?: boolean };
      if (!sent.dryRun) applies += 1;
      return route.continue();
    });
    await page.goto('/lojista/produtos/precos');
    await expect(page.locator('tr[data-testid^="lojista.precos.row-"]')).toHaveCount(3);
    await page.getByLabel('Selecionar Produto 002').check();
    await page.getByTestId('lojista.produtos.bulk-price').click();
    await page.getByTestId('lojista.produtos.bulk-value').fill('10');
    await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('1 produto será alterado');
    await context.setOffline(true);
    const dialog = page.getByTestId('lojista.produtos.bulk-dialog-price');
    await expect(dialog).toContainText('Conecte-se para alterar vários produtos.');
    await expect(page.getByTestId('lojista.produtos.bulk-confirm')).toBeDisabled();
    expect(applies).toBe(0);
    await context.setOffline(false);
    await expect(page.getByTestId('lojista.produtos.bulk-confirm')).toBeEnabled();
    await page.getByTestId('lojista.produtos.bulk-confirm').click();
    await expect(page.getByTestId('lojista.precos.undo')).toBeVisible();
    expect(applies).toBe(1);
  });

  test('F5: sem internet no desfazer e voltando: nada é desfeito offline e a repetição desfaz uma vez', async ({ page, context }) => {
    await seedProducts(page, 2);
    await page.goto('/lojista/produtos/precos');
    await expect(page.locator('tr[data-testid^="lojista.precos.row-"]')).toHaveCount(2);
    await page.getByLabel('Selecionar Produto 001').check();
    await page.getByTestId('lojista.produtos.bulk-price').click();
    await page.getByTestId('lojista.produtos.bulk-value').fill('10');
    await expect(page.getByTestId('lojista.produtos.bulk-preview')).toContainText('1 produto será alterado');
    await page.getByTestId('lojista.produtos.bulk-confirm').click();
    await expect(page.getByLabel('Preço de Produto 001')).toHaveValue('22,55');
    await context.setOffline(true);
    await expect(page.getByTestId('lojista.precos.undo-button')).toBeDisabled();
    await expect(page.getByTestId('lojista.precos.undo')).toContainText('Sem internet');
    await context.setOffline(false);
    await expect(page.getByTestId('lojista.precos.undo-button')).toBeEnabled();
    await page.getByTestId('lojista.precos.undo-button').click();
    await expect(page.getByTestId('lojista.precos.undo-done')).toBeVisible();
    await expect(page.getByLabel('Preço de Produto 001')).toHaveValue('20,50');
  });
});
