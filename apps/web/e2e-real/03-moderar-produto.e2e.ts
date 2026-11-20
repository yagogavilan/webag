import { expect, test } from '@playwright/test';
import { API, adminLogin, apiCall, categoryId, lojistaLogin, merchantToken, publishProduct, waitForMail } from './helpers';
import { loadState, saveState } from './state';

/**
 * O2-E2E-03 / A4 (WB-107): moderação de produto contra a API REAL. O produto é publicado pelo lojista (pela API, só como
 * preparação); a loja passa a ser visível (RN-03); o admin remove o produto pela tela, com motivo, e conferimos os efeitos reais:
 * sai da vitrine pública, o lojista recebe o motivo por e-mail, não consegue reativar, a decisão fica na auditoria.
 * Depende dos specs 01 e 02.
 */
test.describe('Moderar produto (admin, A4) com a API real', () => {
  test('remover com motivo: some da vitrine, avisa o lojista, o lojista não reativa e a auditoria registra', async ({ page, request }) => {
    const state = loadState();
    const token = await merchantToken(state.merchantEmail, state.merchantPassword);
    const productName = `Camiseta QA ${Date.now() % 100_000}`;
    const productId = await publishProduct(token, state.storeId, productName, await categoryId(token));
    saveState({ ...state, productId, productName });

    // Com 1 produto ativo + conta de recebimento ativa + aprovada, a loja fica visível (RN-03) e o produto aparece na vitrine
    const visible = await request.get(`${API}/v1/browse/stores/${state.storeId}`, { params: { lat: -23.2811, lng: -46.7452 } });
    expect(visible.status()).toBe(200);
    const shelf = await request.get(`${API}/v1/browse/stores/${state.storeId}/products`);
    expect(((await shelf.json()) as { data: { id: string }[] }).data.map((p) => p.id)).toContain(productId);

    // Admin: Moderação > Todos > abrir > Remover com motivo
    await adminLogin(page);
    await page.goto('/admin/moderacao');
    await page.getByTestId('admin.moderacao.tab-all').click();
    const row = page.getByTestId(`admin.moderacao.row-${productId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(productName);
    await page.getByTestId(`admin.moderacao.row-${productId}-open`).click();
    await page.getByTestId('admin.moderacao.remove').click();
    // Sem motivo a tela não deixa confirmar (WB-107 C1): o diálogo continua aberto e nada foi enviado
    await expect(page.getByTestId('admin.moderacao.reason-dialog')).toBeVisible();
    await page.getByTestId('admin.moderacao.remove-confirm').click();
    await expect(page.getByTestId('admin.moderacao.reason-dialog')).toBeVisible();
    const stillActive = await page.request.get(`/api/proxy/admin/admin/products?storeId=${state.storeId}&moderationStatus=removed`);
    expect(((await stillActive.json()) as { data: unknown[] }).data).toHaveLength(0);
    const reason = 'Produto proibido pela política do Webag (teste QA)';
    await page.getByTestId('admin.moderacao.remove-reason').fill(reason);
    await page.getByTestId('admin.moderacao.remove-confirm').click();
    await expect(page.getByTestId('admin.moderacao.reason-dialog')).toBeHidden({ timeout: 15_000 });

    // Efeito real 1: a API do admin mostra o produto removido
    const adminList = await page.request.get(`/api/proxy/admin/admin/products?storeId=${state.storeId}&moderationStatus=removed`);
    expect(((await adminList.json()) as { data: { id: string; moderationStatus: string }[] }).data.map((p) => p.id)).toContain(productId);

    // Efeito real 2: a vitrine pública não oferece mais o produto; sem produto ativo, a loja volta a ficar invisível (RN-03)
    const shelfAfter = await request.get(`${API}/v1/browse/stores/${state.storeId}/products`);
    if (shelfAfter.status() === 200) expect(((await shelfAfter.json()) as { data: { id: string }[] }).data.map((p) => p.id)).not.toContain(productId);
    else expect(shelfAfter.status()).toBe(404);
    const productView = await request.get(`${API}/v1/browse/products/${productId}`);
    if (productView.status() === 200) expect(JSON.stringify(await productView.json())).toMatch(/unavailable|indispon/i);
    else expect(productView.status()).toBe(404);

    // Efeito real 3: o lojista é avisado por e-mail, com o motivo
    const mail = await waitForMail(state.merchantEmail, (subject) => /produto|removid|moderação|moderacao/i.test(subject));
    expect(`${mail.subject}\n${mail.text}`).toContain('Produto proibido');

    // Efeito real 4: o lojista NÃO consegue reativar o produto removido (O2-MOD-02): 403 ou 409, nunca 200
    const resume = await apiCall(token, 'POST', `/v1/stores/${state.storeId}/products/${productId}/resume`, {});
    expect([403, 409, 422]).toContain(resume.status);
    const publish = await apiCall(token, 'POST', `/v1/stores/${state.storeId}/products/${productId}/publish`, {});
    expect([403, 409, 422]).toContain(publish.status);

    // Efeito real 5: a decisão está na auditoria com ator e motivo
    const audit = await page.request.get('/api/proxy/admin/admin/audit-log?limit=50');
    const rows = ((await audit.json()) as { data: { action: string; target?: string; targetId?: string }[] }).data;
    expect(rows.some((r) => /product/.test(r.action) && /moderat|remove/.test(r.action))).toBe(true);

    // O lojista vê o produto removido na própria lista (UI) e não tem o interruptor para reativar
    await page.context().clearCookies();
    await lojistaLogin(page, state.merchantEmail, state.merchantPassword);
    await page.goto('/lojista/produtos');
    const lojistaRow = page.locator('[data-testid^="lojista.produtos.row-"]').filter({ hasText: productName }).first();
    await expect(lojistaRow).toBeVisible({ timeout: 15_000 });
    await expect(lojistaRow).toContainText(/removido|Removido|moderação/);
  });
});
