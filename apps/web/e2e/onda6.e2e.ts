import { expect, test } from '@playwright/test';
import { FAKE_API, login, loginLojista, seedMerchant } from './helpers';

/** Onda 6 nos painéis: ETA e contato na Logística, parâmetros do prazo, mediação, avaliações, ajuda e conta (API falsa). */
async function post(path: string, body: unknown): Promise<{ id: string; number?: string }> {
  const response = await fetch(`${FAKE_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as { id: string; number?: string };
}

test.describe('Onda 6: admin', () => {
  test('Logística mostra a faixa de entrega e avisa o atraso pelo fim da faixa', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const late = await post('/__test/seed-delivery', { storeId: merchant.storeId, etaToMin: -10 });
    await login(page, 'admin@webag.local');
    await page.goto('/admin/logistica');
    const eta = page.getByTestId(`admin.logistica.fila.row-${late.id}`).getByTestId('admin.logistica.eta');
    await expect(eta).toContainText('Prometido até');
    await expect(eta).toContainText('Atrasado há');
    await expect(eta).toHaveAttribute('data-level', 'late');
    await expect(page.getByTestId('admin.logistica.summary-late')).toContainText('1');
    await page.getByTestId(`admin.logistica.fila.row-${late.id}`).getByRole('button', { name: /pedido/ }).first().click();
    await expect(page.getByTestId('admin.logistica.detail').getByTestId('admin.logistica.eta')).toBeVisible();
  });

  test('lote por área: duas corridas da mesma área saem com o mesmo motoboy', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const first = await post('/__test/seed-delivery', { storeId: merchant.storeId });
    const second = await post('/__test/seed-delivery', { storeId: merchant.storeId });
    const courier = await post('/__test/seed-courier', { name: 'Beto' });
    await login(page, 'operacao@webag.local');
    await page.goto('/admin/logistica');
    await expect(page.getByTestId('admin.logistica.batches')).toContainText('pedidos esperando');
    await page.getByTestId(/admin\.logistica\.batch-/).first().click();
    await page.getByTestId(`admin.logistica.batch-driver-${courier.id}`).check();
    await page.getByTestId('admin.logistica.batch-submit').click();
    await expect(page.getByTestId(`admin.logistica.batch-result-${first.id}`)).toContainText('atribuído');
    await expect(page.getByTestId(`admin.logistica.batch-result-${second.id}`)).toContainText('atribuído');
  });

  test('suporte vê o telefone mascarado e só revela o contato com motivo (auditado)', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const delivery = await post('/__test/seed-delivery', { storeId: merchant.storeId });
    await login(page, 'suporte@webag.local');
    await page.goto('/admin/logistica');
    await page.getByTestId(`admin.logistica.fila.row-${delivery.id}`).getByRole('button', { name: /pedido/ }).first().click();
    await expect(page.getByTestId('admin.logistica.masked-phone')).toContainText('(11) 9****-4321');
    await expect(page.getByTestId('admin.logistica.customer-block')).toHaveCount(0);
    await page.getByTestId('admin.logistica.reveal').click();
    await page.getByTestId('admin.logistica.reveal-reason').fill('Cliente não atende o motoboy');
    await page.getByTestId('admin.logistica.reveal-confirm').click();
    await expect(page.getByTestId('admin.logistica.customer-block')).toContainText('Rua Azul');
    await expect(page.getByTestId('admin.logistica.revealed-note')).toBeVisible();
  });

  test('parâmetros: o simulador do prazo mostra a faixa e o fora da área', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await page.goto('/admin/parametros');
    await expect(page.getByTestId('admin.parametros.eta-band')).toContainText('de 59 a 89 min');
    await expect(page.getByTestId('admin.parametros.eta-radius-warning')).toBeVisible();
    await page.getByTestId('admin.parametros.eta-km').fill('14');
    await expect(page.getByTestId('admin.parametros.eta-outside')).toContainText('fora da área');
  });

  test('disputas: decide a mediação a favor do cliente com justificativa e a fila esvazia', async ({ page }) => {
    const mediation = await post('/__test/seed-mediation', {});
    await login(page, 'operacao@webag.local');
    await page.goto('/admin/disputas');
    await expect(page.getByTestId(`admin.disputas.law-${mediation.id}`)).toContainText('A lei não permite');
    await page.getByTestId(`admin.disputas.decide-${mediation.id}`).click();
    await page.getByTestId('admin.disputas.decision-customer').check();
    await page.getByTestId('admin.disputas.decide-reason').fill('Defeito comprovado pelas fotos');
    await page.getByTestId('admin.disputas.decide-confirm').click();
    await expect(page.getByTestId(`admin.disputas.case-${mediation.id}`)).toBeHidden();
  });
});

test.describe('Onda 6: lojista', () => {
  test('responde uma avaliação e depois abre a ajuda editada pelo admin', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const review = await post('/__test/seed-review', { storeId: merchant.storeId });
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/avaliacoes');
    await expect(page.getByRole('img', { name: '4 de 5 estrelas' })).toBeVisible();
    await page.getByTestId(`lojista.avaliacoes.reply-open-${review.id}`).click();
    await page.getByTestId(`lojista.avaliacoes.reply-input-${review.id}`).fill('Obrigado pela avaliação!');
    await page.getByTestId(`lojista.avaliacoes.reply-submit-${review.id}`).click();
    await expect(page.getByTestId(`lojista.avaliacoes.reply-${review.id}`)).toContainText('Obrigado pela avaliação!');

    await page.goto('/lojista/ajuda');
    await expect(page.getByTestId('lojista.ajuda.whatsapp')).toHaveAttribute('href', 'https://wa.me/5511999990000');
    await expect(page.getByText('Como aceito um pedido?')).toBeVisible();
  });

  test('conta: pede a exportação com a senha e exclui a conta com arrependimento de 72 h', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/conta');
    await page.getByTestId('lojista.conta.export-open').click();
    await page.getByTestId('lojista.conta.export-password').fill('senha-errada');
    await page.getByTestId('lojista.conta.export-confirm').click();
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await page.getByTestId('lojista.conta.export-password').fill(merchant.password);
    await page.getByTestId('lojista.conta.export-confirm').click();
    await expect(page.getByText(/Estamos preparando o arquivo/)).toBeVisible();

    await expect(page.getByTestId('lojista.conta.delete-effects')).toContainText('72 horas (3 dias)');
    await page.getByTestId('lojista.conta.delete-open').click();
    await page.getByTestId('lojista.conta.delete-password').fill(merchant.password);
    await page.getByTestId('lojista.conta.delete-confirm').click();
    await expect(page.getByTestId('lojista.conta.deleted')).toContainText('Você pode desistir até');
  });
});
