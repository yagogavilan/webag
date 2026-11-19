import { expect, test } from '@playwright/test';
import { FAKE_API, login, loginLojista, seedMerchant } from './helpers';

/** Os três fluxos de dinheiro e entrega: receber e aceitar pedido, despachar motoboy, aprovar troca (API falsa). */
async function post(path: string, body: unknown): Promise<{ id: string; number?: string }> {
  const response = await fetch(`${FAKE_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as { id: string; number?: string };
}

test.describe('Pedidos, logística e trocas', () => {
  test('receber e aceitar pedido: o alerta abre, o aceite leva a "Em separação" e a loja termina em "Pronto para coleta"', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const order = await post('/__test/seed-order', { storeId: merchant.storeId });
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/pedidos');

    const alert = page.getByTestId('lojista.alert.modal');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('lojista.alert.timer')).toContainText('Responda em');
    // Sem som ligado a faixa vermelha fica no alerta até o lojista tocar em "Ligar som".
    await expect(page.getByTestId('lojista.alert.sound-off')).toBeVisible();
    await page.getByTestId('lojista.alert.accept').click();
    await expect(alert).toBeHidden();

    // No computador do balcão (>= 1280) as três colunas aparecem lado a lado; as abas são do celular.
    const next = page.getByTestId(`lojista.orders.card-${order.id}-next`);
    await expect(next).toHaveText('Iniciar separação');
    await next.click();
    await expect(next).toHaveText('Pronto para coleta');
    await next.click();
    await page.getByTestId('lojista.ready.confirm').click();
    await expect(page.getByText('Pronto para coleta').first()).toBeVisible();
    // Entrega Webag: a loja não marca "saiu" nem "entregue".
    await expect(page.getByText(/saiu para entrega|marcar como entregue/i)).toHaveCount(0);
  });

  test('celular 390x844 com 1 pedido novo: "Aceitar pedido" e "Recusar" aparecem sem rolar e sem a barra inferior por cima; o banner de som só vale em Início e Pedidos (U8.7)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const merchant = await seedMerchant('Casa Bela');
    const order = await post('/__test/seed-order', { storeId: merchant.storeId });
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/pedidos');

    await expect(page.getByTestId(`lojista.orders.card-${order.id}-accept`)).toBeVisible();
    if (process.env.SHOTS_DIR) {
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/lojista-pedidos-alerta-390x844.png` });
      // a página por trás do alerta em tela cheia (só para a captura; o teste abaixo mede os botões do cartão)
      await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="lojista.alert.modal"]');
        (modal?.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
      });
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/lojista-pedidos-390x844.png` });
    }
    const accept = page.getByTestId(`lojista.orders.card-${order.id}-accept`);
    const reject = page.getByTestId(`lojista.orders.card-${order.id}-reject`);
    await expect(accept).toBeInViewport({ ratio: 1 });
    await expect(reject).toBeInViewport({ ratio: 1 });
    // a barra inferior fixa não pode cobrir os botões
    const nav = await page.locator('nav[aria-label="Menu principal"]').boundingBox();
    const box = await reject.boundingBox();
    expect(nav).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    // com pedido novo, o aviso de "sem som" é o do alerta (uma vez); o banner da página não repete e a barra tem um só controle
    await expect(page.getByTestId('lojista.orders.sound-test')).toHaveCount(1);
    await expect(page.getByTestId('lojista.orders.sound-banner')).toHaveCount(0);
    await expect(page.getByTestId('lojista.alert.sound-off')).toHaveCount(1);

    // fora de Início e Pedidos o banner de som não aparece
    for (const path of ['/lojista/produtos', '/lojista/trocas', '/lojista/avaliacoes', '/lojista/loja']) {
      await page.goto(path);
      await expect(page.getByTestId('lojista.orders.sound-banner')).toHaveCount(0);
    }

    if (process.env.SHOTS_DIR) {
      // balcão (1366x768): a mesma tela, sem o alerta por cima
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto('/lojista/pedidos');
      await expect(page.getByTestId(`lojista.orders.card-${order.id}-accept`)).toBeVisible();
      await page.evaluate(() => (document.querySelector('[data-testid="lojista.alert.modal"]')?.parentElement as HTMLElement | null)?.style.setProperty('display', 'none'));
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/lojista-pedidos-1366x768.png` });
    }
  });

  test('despachar motoboy: atribui, abre o link do WhatsApp e o segundo operador recebe conflito', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const delivery = await post('/__test/seed-delivery', { storeId: merchant.storeId });
    await post('/__test/seed-courier', { name: 'João' });
    await login(page, 'operacao@webag.local');
    await page.goto('/admin/logistica');

    await expect(page.getByTestId(`admin.logistica.fila.row-${delivery.id}`)).toBeVisible();
    await expect(page.getByTestId('admin.logistica.wait').first()).toContainText(/Esperando há|Atrasado/);
    await page.getByTestId(`admin.logistica.fila.row-${delivery.id}-assign`).click();
    await page.getByTestId('admin.logistica.submit').click();
    await expect(page.getByTestId('admin.logistica.assign-error')).toContainText('Escolha quem vai buscar');
    await page.locator('[data-testid^="admin.logistica.driver-option-"]').first().check();
    await page.getByTestId('admin.logistica.submit').click();

    const send = page.getByTestId('admin.logistica.send-whatsapp');
    await expect(send).toBeVisible();
    await expect(send).toHaveAttribute('href', /^https:\/\/wa\.me\/5511912345678\?text=/);
    await expect(page.getByTestId('admin.logistica.message-preview')).toHaveCount(1);
    await page.getByTestId('admin.logistica.assigned-close').click();

    // Segundo operador (outra aba) tentando atribuir a mesma corrida: o primeiro venceu.
    const response = await page.request.post(`/api/proxy/admin/admin/logistics/deliveries/${delivery.id}/assign`, { data: { courierId: '00000000-0000-4000-8000-000000000000' }, headers: { 'x-webag-client': 'web', origin: 'http://localhost:3101' } });
    expect([404, 409, 403]).toContain(response.status());

    await page.getByTestId('admin.logistica.tab-andamento').click();
    await expect(page.getByTestId(`admin.logistica.andamento.row-${delivery.id}`)).toContainText('Aguardando motoboy');
  });

  test('aprovar troca: 1 toque, sem diálogo de confirmação', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    const exchange = await post('/__test/seed-exchange', { storeId: merchant.storeId });
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/trocas');

    await expect(page.getByTestId(`lojista.trocas.deadline-${exchange.id}`)).toContainText(/Responda em/);
    await expect(page.getByText('Webag busca em casa. Sem custo para você.')).toBeVisible();
    await page.getByTestId(`lojista.trocas.approve-${exchange.id}`).click();
    await expect(page.getByText(/Troca TR-1042 aprovada/)).toBeVisible();
    await expect(page.getByTestId('lojista.trocas.empty')).toBeVisible();
  });
});
