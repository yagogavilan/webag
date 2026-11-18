import { expect, test } from '@playwright/test';
import { API, adminLogin, lojistaLogin, waitForMail } from './helpers';
import { loadState } from './state';

/**
 * O2-E2E-02 (R3 do roteiro de usabilidade): aprovar a loja criada no spec 01, contra a API REAL.
 * WB-103, WB-054, WB-218, RN-03, SEC-051, SEC-074. Depende do spec 01 (mesma loja).
 */
test.describe('Aprovar loja (admin) com a API real', () => {
  test('abre a loja da fila, vê os documentos (URL assinada, acesso auditado), confere os 6 itens e aprova', async ({ page, request }) => {
    const state = loadState();
    await adminLogin(page);

    await page.getByTestId('nav-lojas').click();
    await expect(page.getByRole('heading', { name: 'Fila de aprovação', level: 1 })).toBeVisible();
    await expect(page.getByTestId(`admin.fila.row-${state.storeId}`)).toBeVisible();
    await page.getByTestId(`admin.fila.row-${state.storeId}-open`).click();

    // Documento ao lado dos dados: a URL assinada do S3 abre a imagem de verdade (re-codificada pelo servidor)
    const image = page.getByTestId('admin.caso.doc-image');
    await expect(image).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('admin.caso.value-document')).toContainText('•');
    await page.getByTestId('admin.caso.reveal-document').click();
    await expect(page.getByTestId('admin.caso.value-document')).not.toContainText('•');

    // "Aprovar" só com a checklist completa
    await expect(page.getByTestId('admin.caso.approve')).toBeDisabled();
    for (const id of ['legible', 'document', 'address', 'category', 'contact', 'duplicate']) await page.getByTestId(`admin.caso.check-${id}-ok`).check();
    await expect(page.getByText('Checklist completa. Aprovar liberado.')).toBeVisible();
    await page.getByTestId('admin.caso.approve').click();
    await expect(page.getByText(`Aprovar ${state.storeName}?`)).toBeVisible();
    await page.getByTestId('admin.caso.confirm-approve').click();
    await expect(page.getByText(`${state.storeName} aprovada.`)).toBeVisible({ timeout: 20_000 });

    // Prova pela API: status aprovada e saiu da fila "em análise"
    const detail = await page.request.get(`/api/proxy/admin/admin/stores/${state.storeId}`);
    expect(detail.status()).toBe(200);
    const body = (await detail.json()) as { store: { status: string }; history: { to: string; from: string | null }[] };
    expect(body.store.status).toBe('approved');
    expect(body.history.at(-1)?.to).toBe('approved');

    // A decisão e o acesso ao documento ficam na auditoria (a tela e a API)
    const audit = await page.request.get('/api/proxy/admin/admin/audit-log?limit=50');
    expect(audit.status()).toBe(200);
    const rows = ((await audit.json()) as { data: { action: string; targetId: string | null; actorRole: string | null; reason: string | null }[] }).data;
    expect(rows.some((r) => r.action === 'store.approve' && r.targetId === state.storeId), 'aprovação auditada').toBe(true);
    // o acesso ao documento (WB-218) também: com motivo, e uma linha por visualização
    expect(rows.some((r) => r.action === 'store.document_view' && r.reason === 'initial_review'), 'visualização de documento auditada').toBe(true);

    // O lojista é avisado por e-mail (SMTP real)
    const mail = await waitForMail(state.merchantEmail, (subject) => /aprovad/i.test(subject));
    expect(mail.subject).toMatch(/aprovad/i);

    // RN-03: aprovada, com conta de recebimento ativa, mas SEM produto ativo continua invisível ao cliente
    const publicView = await request.get(`${API}/v1/browse/stores/${state.storeId}`, { params: { lat: -23.2811, lng: -46.7452 } });
    expect(publicView.status()).toBe(404);
  });

  test('o lojista vê a loja aprovada e a orientação "Cadastre 1 produto" (WB-054 C4)', async ({ page }) => {
    const state = loadState();
    await lojistaLogin(page, state.merchantEmail, state.merchantPassword);
    await expect(page).toHaveURL(/\/lojista(\/|$)/);
    await expect(page.getByText(/Cadastre 1 produto|Cadastre seu primeiro produto|Sua vitrine está vazia/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
