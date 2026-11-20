import { expect, test } from '@playwright/test';
import { FAKE_API, login, seedStoreInReview } from './helpers';

/** R3 do roteiro de usabilidade: aprovar loja (WB-103, 104, 218). */
test.describe('Aprovar loja (admin)', () => {
  test('abre a mais antiga, confere os documentos, confere os 6 itens e aprova', async ({ page }) => {
    const first = await seedStoreInReview(`Casa Bela ${Date.now() % 10_000}`);
    // Super admin: é o único perfil que lê a auditoria (a operação decide do mesmo jeito).
    await login(page, 'admin@webag.local');
    await page.getByTestId('nav-lojas').click();
    await expect(page.getByRole('heading', { name: 'Fila de aprovação', level: 1 })).toBeVisible();
    await expect(page.getByTestId(`admin.fila.row-${first.id}`)).toBeVisible();

    await page.getByTestId(`admin.fila.row-${first.id}-open`).click();
    // Documento ao lado dos dados, sem trocar de aba; a URL assinada abre a imagem de verdade
    const image = page.getByTestId('admin.caso.doc-image');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId('admin.caso.value-document')).toContainText('•');
    await page.getByTestId('admin.caso.reveal-document').click();
    await expect(page.getByTestId('admin.caso.value-document')).not.toContainText('•');

    // "Aprovar" só com a checklist completa
    await expect(page.getByTestId('admin.caso.approve')).toBeDisabled();
    await expect(page.getByText('Confira os 6 itens para aprovar.')).toBeVisible();
    for (const id of ['legible', 'document', 'address', 'category', 'contact', 'duplicate']) await page.getByTestId(`admin.caso.check-${id}-ok`).check();
    await expect(page.getByText('Checklist completa. Aprovar liberado.')).toBeVisible();
    await page.getByTestId('admin.caso.approve').click();
    await expect(page.getByText(`Aprovar ${first.name}?`)).toBeVisible();
    await page.getByTestId('admin.caso.confirm-approve').click();
    await expect(page.getByText(`${first.name} aprovada.`)).toBeVisible();

    // A decisão e o acesso ao documento ficam na auditoria
    await page.getByTestId('nav-auditoria').click();
    await expect(page.getByRole('cell', { name: /Loja aprovada|store\.approved/ }).first()).toBeVisible();
  });

  test('SEC-188: o servidor não tem a abertura dos documentos (409 DOCUMENTS_NOT_REVIEWED): mostra qual falta, foca o documento e aprova depois de abrir', async ({ page }) => {
    const store = await seedStoreInReview(`Loja Conferida ${Date.now() % 10_000}`);
    await login(page, 'operacao@webag.local');
    await page.goto(`/admin/lojas/${store.id}`);
    await expect(page.getByTestId('admin.caso.doc-image')).toBeVisible();
    // Abre todos os documentos (cada abertura é gravada no servidor) e confere os 6 itens
    for (const id of store.documents) {
      await page.getByTestId(`admin.caso.doc-thumb-${id}`).click();
      await expect(page.getByTestId('admin.caso.doc-image')).toBeVisible();
    }
    await expect(page.getByTestId('admin.caso.check-all')).toBeEnabled();
    await page.getByTestId('admin.caso.check-all').click();
    await expect(page.getByTestId('admin.caso.approve')).toBeEnabled();

    // O servidor perde o registro das aberturas: a aprovação volta 409 e a tela explica sem aprovar
    await fetch(`${FAKE_API}/__test/forget-document-views`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId: store.id }) });
    await page.getByTestId('admin.caso.approve').click();
    await page.getByTestId('admin.caso.confirm-approve').click();
    const banner = page.getByTestId('admin.caso.not-reviewed');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('A loja não foi aprovada');
    await expect(banner).toContainText('Documento');
    await expect(page.getByTestId('admin.caso.approve-dialog')).toHaveCount(0);
    await expect(page.getByTestId('admin.caso.doc-viewer')).toBeFocused();
    await page.screenshot({ path: 'test-results/sec188-documentos-nao-abertos.png', fullPage: false });

    // Reabrir o documento selecionado regrava a abertura; os outros precisam ser abertos de novo (o servidor esqueceu todos)
    for (const id of store.documents) {
      await page.getByTestId(`admin.caso.doc-thumb-${id}`).click();
      await expect(page.getByTestId('admin.caso.doc-image')).toBeVisible();
    }
    await expect(page.getByTestId('admin.caso.approve')).toBeEnabled();
    await page.getByTestId('admin.caso.approve').click();
    await expect(page.getByTestId('admin.caso.not-reviewed')).toHaveCount(0);
    await page.getByTestId('admin.caso.confirm-approve').click();
    await expect(page.getByText(`${store.name} aprovada.`)).toBeVisible();
  });

  test('pedir correção exige o texto e leva o motivo por item; recusar exige motivo', async ({ page }) => {
    const store = await seedStoreInReview(`Padaria Sol ${Date.now() % 10_000}`);
    await login(page, 'operacao@webag.local');
    await page.goto(`/admin/lojas/${store.id}`);
    await page.getByTestId('admin.caso.check-legible-problem').check();
    await page.getByTestId('admin.caso.request-correction').click();
    await page.getByTestId('admin.caso.confirm-correction').click();
    await expect(page.getByText('Escreva o que está errado em cada item com problema.')).toBeVisible();
    await page.getByTestId('admin.caso.correction-note-legible').fill('O verso do documento está cortado.');
    await page.getByTestId('admin.caso.confirm-correction').click();
    await expect(page.getByText('Correção pedida.')).toBeVisible();

    await page.goto('/admin/lojas');
    await page.getByTestId('admin.fila.tab-waiting').click();
    await expect(page.getByTestId(`admin.fila.row-${store.id}`)).toContainText('Prazo pausado');

    const other = await seedStoreInReview(`Loja Duplicada ${Date.now() % 10_000}`);
    await page.goto(`/admin/lojas/${other.id}`);
    await page.getByTestId('admin.caso.reject').click();
    await page.getByTestId('admin.caso.confirm-reject').click();
    await expect(page.getByTestId('reason-error').or(page.getByText(/Escreva o motivo/)).first()).toBeVisible();
    await page.getByRole('button', { name: 'Loja duplicada' }).click();
    await page.getByTestId('admin.caso.confirm-reject').click();
    await expect(page.getByText(`${other.name} recusada.`)).toBeVisible();
  });
});
