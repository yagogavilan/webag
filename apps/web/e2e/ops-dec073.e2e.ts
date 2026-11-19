import { expect, test, type Page } from '@playwright/test';
import { FAKE_API, PASSWORD, login, loginLojista, seedMerchant, totp } from './helpers';

/**
 * DEC-073/074 na API falsa: Alertas (B3), Usuários (B4), Pedidos (B5), Modo manutenção (WB-121) e o e-mail de pedido novo do lojista (B2).
 * O RBAC por perfil e o texto de cada confirmação são o que se confere aqui; a regra em si é da API (E2E do backend).
 */
const ORDER_RECEIVED = 'b0000000-0000-4000-8000-000000000002';
const ORDER_DELIVERED = 'b0000000-0000-4000-8000-000000000001';
const ORDER_BIG = 'b0000000-0000-4000-8000-000000000004';
const ALERT_REFUND = 'a0000000-0000-4000-8000-000000000001';
const ALERT_DSR = 'a0000000-0000-4000-8000-000000000004';
const USER_MARIA = 'c0000000-0000-4000-8000-000000000001';

async function post(path: string, body: unknown = {}): Promise<void> {
  const response = await fetch(`${FAKE_API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
}

test.beforeEach(async () => {
  await post('/__test/reset-ops');
  await post('/__test/maintenance', { enabled: false });
});

test.describe('Alertas (B3)', () => {
  test('super admin: contagem no Início e no menu, filtros por estado e tipo, detalhe e "marcar como resolvido" com nota', async ({ page }) => {
    await login(page, 'admin@webag.local');
    await page.goto('/admin');
    await expect(page.getByTestId('admin.home.pending-alertas')).toContainText('Alertas abertos');
    await expect(page.getByTestId('admin.home.pending-alertas')).toContainText('2 críticos: agir hoje');
    await expect(page.getByTestId('admin.alertas.nav-count')).toHaveText('4');

    await page.getByTestId('nav-alertas').click();
    await expect(page.getByTestId('admin.alertas.kpi-critical')).toContainText('2');
    await expect(page.getByTestId('admin.alertas.list').getByRole('listitem')).toHaveCount(4);
    await page.getByTestId('admin.alertas.kind').selectOption('delivery_late');
    await expect(page.getByTestId('admin.alertas.list').getByRole('listitem')).toHaveCount(1);
    await page.getByTestId('admin.alertas.kind').selectOption('');
    await page.getByTestId('admin.alertas.filter-resolved').click();
    await expect(page.getByTestId('admin.alertas.list')).toContainText('Pedido parado sem aceite');
    await expect(page.getByTestId('admin.alertas.list').getByRole('listitem')).toHaveCount(1);
    await page.getByTestId('admin.alertas.filter-open').click();

    await page.getByTestId(`admin.alertas.open-${ALERT_REFUND}`).click();
    await expect(page.getByTestId('admin.alertas.hint')).toContainText('cubra o valor pela Webag');
    await expect(page.getByTestId('admin.alertas.link-order')).toHaveAttribute('href', `/admin/pedidos/b0000000-0000-4000-8000-000000000001`);
    await page.getByTestId('admin.alertas.resolve').click();
    await page.getByTestId('admin.alertas.resolve-confirm').click();
    await expect(page.getByText(/Escreva a nota/)).toBeVisible();
    await page.getByTestId('admin.alertas.resolve-note').fill('Cobri o estorno pelo painel.');
    await page.getByTestId('admin.alertas.resolve-confirm').click();
    await expect(page.getByTestId('admin.alertas.status')).toHaveText('Resolvido');
    await expect(page.getByTestId('admin.alertas.note')).toContainText('Cobri o estorno pelo painel.');
    await expect(page.getByTestId('admin.alertas.resolve')).toHaveCount(0);
    await page.goto('/admin/alertas');
    await expect(page.getByTestId('admin.alertas.kpi-open')).toContainText('3');
  });

  test('suporte vê só os tipos do público dele e não encerra; financeiro vê dinheiro e encerra', async ({ page, browser }) => {
    await login(page, 'suporte@webag.local');
    await page.goto('/admin/alertas');
    await expect(page.getByTestId('admin.alertas.list').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId(`admin.alertas.row-${ALERT_REFUND}`)).toHaveCount(0);
    await expect(page.getByTestId('admin.alertas.kind').locator('option')).toHaveCount(3);
    await page.goto(`/admin/alertas/${ALERT_DSR}`);
    await expect(page.getByTestId('admin.alertas.not-found')).toBeVisible();
    await page.goto('/admin/alertas');
    await page.getByTestId('admin.alertas.list').getByRole('link').first().click();
    await expect(page.getByTestId('admin.alertas.read-only')).toContainText('só consulta');
    await expect(page.getByTestId('admin.alertas.resolve')).toHaveCount(0);

    const finance = await browser.newPage();
    await login(finance, 'financeiro@webag.local');
    await finance.goto('/admin/alertas');
    await expect(finance.getByTestId(`admin.alertas.row-${ALERT_REFUND}`)).toBeVisible();
    await finance.getByTestId(`admin.alertas.open-${ALERT_REFUND}`).click();
    await expect(finance.getByTestId('admin.alertas.resolve')).toBeVisible();
    await finance.close();
  });
});

test.describe('Usuários (B4)', () => {
  test('operação busca, vê o detalhe mascarado e bloqueia com motivo; a loja do dono é suspensa; desbloquear não reativa a loja', async ({ page }) => {
    await login(page, 'operacao@webag.local');
    await page.getByTestId('nav-usuarios').click();
    await page.getByTestId('admin.usuarios.search').fill('Mar');
    await page.getByTestId('admin.usuarios.search').press('Enter');
    await expect(page.getByTestId('admin.usuarios.list').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId(`admin.usuarios.row-${USER_MARIA}`)).toContainText('m***@gmail.com');
    await page.getByTestId(`admin.usuarios.open-${USER_MARIA}`).click();
    await expect(page.getByTestId('admin.usuarios.email')).toHaveText('m***@gmail.com');
    await page.getByTestId('admin.usuarios.block').click();
    await expect(page.getByTestId('admin.usuarios.block-effects')).toContainText('sai de todos os aparelhos');
    await expect(page.getByTestId('admin.usuarios.block-effects')).toContainText('Mercadinho Boa Compra');
    await expect(page.getByTestId('admin.usuarios.block-effects')).toContainText('Pedidos em andamento não são cancelados');
    await page.getByTestId('admin.usuarios.block-confirm').click();
    await expect(page.getByText(/Escreva o motivo/)).toBeVisible();
    await page.getByTestId('admin.usuarios.block-reason').fill('Fraude confirmada em 3 pedidos.');
    await page.getByTestId('admin.usuarios.block-confirm').click();
    await expect(page.getByTestId('admin.usuarios.detail-status')).toHaveText('Bloqueada');
    await expect(page.getByTestId('admin.usuarios.suspended-stores')).toContainText('suspensa junto');
    await expect(page.getByTestId('admin.usuarios.history')).toContainText('Fraude confirmada em 3 pedidos.');
    await page.getByTestId('admin.usuarios.unblock').click();
    await expect(page.getByTestId('admin.usuarios.unblock-effects')).toContainText('não são reativadas sozinhas');
    await page.getByTestId('admin.usuarios.unblock-reason').fill('Contestação aceita pelo suporte.');
    await page.getByTestId('admin.usuarios.unblock-confirm').click();
    await expect(page.getByTestId('admin.usuarios.detail-status')).toHaveText('Ativa');
    await expect(page.getByTestId('admin.usuarios.detail-stores')).toContainText('Suspensa');
  });

  test('suporte consulta sem bloquear; financeiro não tem a área', async ({ page, browser }) => {
    await login(page, 'suporte@webag.local');
    await page.goto(`/admin/usuarios/${USER_MARIA}`);
    await expect(page.getByTestId('admin.usuarios.read-only')).toBeVisible();
    await expect(page.getByTestId('admin.usuarios.block')).toHaveCount(0);
    const finance = await browser.newPage();
    await login(finance, 'financeiro@webag.local');
    await expect(finance.getByTestId('nav-usuarios')).toHaveCount(0);
    await finance.goto('/admin/usuarios');
    await expect(finance.getByTestId('no-access')).toBeVisible();
    await finance.close();
  });
});

test.describe('Pedidos (B5)', () => {
  test('lista com filtros e detalhe mascarado; operação e suporte não cancelam nem estornam e não veem a comissão', async ({ page }) => {
    await login(page, 'operacao@webag.local');
    await page.getByTestId('nav-pedidos').click();
    await expect(page.getByTestId('admin.pedidos.table').getByRole('row')).toHaveCount(5);
    await page.getByTestId('admin.pedidos.filter-awaiting_payment').click();
    await expect(page.getByTestId('admin.pedidos.table').getByRole('row')).toHaveCount(2);
    await page.getByTestId('admin.pedidos.filter-all').click();
    await page.getByTestId('admin.pedidos.search').fill('WB-1A02');
    await page.getByTestId('admin.pedidos.search').press('Enter');
    await expect(page.getByTestId('admin.pedidos.table').getByRole('row')).toHaveCount(2);
    await page.getByTestId(`admin.pedidos.open-${ORDER_RECEIVED}`).click();
    await expect(page.getByTestId('admin.pedidos.email')).toHaveText('m***@gmail.com');
    await expect(page.getByTestId('admin.pedidos.delivery')).toContainText('Centro, Francisco Morato, SP');
    await expect(page.getByTestId('admin.pedidos.no-actions')).toContainText('financeiro e do super admin');
    await expect(page.getByTestId('admin.pedidos.cancel')).toHaveCount(0);
    await expect(page.getByTestId('admin.pedidos.refund')).toHaveCount(0);
    await expect(page.getByTestId('admin.pedidos.commission')).toHaveCount(0);
    await expect(page.getByTestId('admin.pedidos.split-hidden')).toBeVisible();
  });

  test('financeiro cancela com estorno (confirmação diz os efeitos) e estorna parcialmente com valor validado', async ({ page }) => {
    await login(page, 'financeiro@webag.local');
    await page.goto(`/admin/pedidos/${ORDER_RECEIVED}`);
    await expect(page.getByTestId('admin.pedidos.commission')).toBeVisible();
    await page.getByTestId('admin.pedidos.cancel').click();
    await expect(page.getByTestId('admin.pedidos.cancel-effects')).toContainText('estoque');
    await page.getByTestId('admin.pedidos.cancel-reason').fill('Loja sem estoque do item.');
    await page.getByTestId('admin.pedidos.cancel-confirm').click();
    await expect(page.getByTestId('admin.pedidos.status')).toContainText('Cancelado');
    await expect(page.getByTestId('admin.pedidos.cancel')).toHaveCount(0);
    await expect(page.getByTestId('admin.pedidos.refund-totals')).toContainText('R$ 0,00');

    await page.goto(`/admin/pedidos/${ORDER_DELIVERED}`);
    await expect(page.getByTestId('admin.pedidos.cancel')).toHaveCount(0);
    await page.getByTestId('admin.pedidos.refund').click();
    await page.getByTestId('admin.pedidos.refund-amount').fill('80,00');
    await page.getByTestId('admin.pedidos.refund-reason').fill('Item veio errado.');
    await page.getByTestId('admin.pedidos.refund-confirm').click();
    await expect(page.getByText('O máximo é R$ 45,90.')).toBeVisible();
    await page.getByTestId('admin.pedidos.refund-amount').fill('10,00');
    await page.getByTestId('admin.pedidos.refund-confirm').click();
    await expect(page.getByTestId('admin.pedidos.refund-totals')).toContainText('R$ 35,90');
    await expect(page.getByTestId('admin.pedidos.payment')).toContainText('Concluído');
  });

  test('financeiro acima de R$ 500: cancelar com estorno pede super admin; sem estorno passa', async ({ page }) => {
    await login(page, 'financeiro@webag.local');
    await page.goto(`/admin/pedidos/${ORDER_BIG}`);
    await page.getByTestId('admin.pedidos.cancel').click();
    await expect(page.getByTestId('admin.pedidos.cancel-limit')).toContainText('Peça aprovação a um super admin');
    await page.getByTestId('admin.pedidos.cancel-reason').fill('Cliente desistiu da compra.');
    await page.getByTestId('admin.pedidos.cancel-confirm').click();
    await expect(page.getByText('Desmarque o estorno ou peça aprovação a um super admin.')).toBeVisible();
    await page.getByTestId('admin.pedidos.cancel-refund').uncheck();
    await page.getByTestId('admin.pedidos.cancel-confirm').click();
    await expect(page.getByTestId('admin.pedidos.status')).toContainText('Cancelado');
  });
});

async function loginNarrow(page: Page, email: string): Promise<void> {
  await page.goto('/admin/entrar');
  await page.getByTestId('admin.login.email-input').fill(email);
  await page.getByTestId('admin.login.password-input').fill(PASSWORD);
  await page.getByTestId('admin.login.submit').click();
  await page.getByLabel('Dígito 1 de 6').pressSequentially(totp());
  await expect(page.getByTestId('nav-more')).toBeVisible();
}

test.describe('Modo manutenção (WB-121)', () => {
  test('super admin liga com mensagem e previsão e desliga; todo perfil vê o aviso no painel; operação não tem a tela', async ({ page, browser }) => {
    await login(page, 'admin@webag.local');
    await page.getByTestId('nav-manutencao').click();
    await expect(page.getByTestId('admin.manutencao.state')).toHaveText('Desligado');
    await expect(page.getByTestId('admin.manutencao.keeps')).toContainText('Pedidos já criados');
    await page.getByTestId('admin.manutencao.turn-on').click();
    await page.getByTestId('admin.manutencao.reason').fill('Troca do gateway.');
    await page.getByTestId('admin.manutencao.expected-back').fill('2020-01-01T10:00');
    await page.getByTestId('admin.manutencao.on-confirm').click();
    await expect(page.getByText('A previsão de volta precisa estar no futuro.')).toBeVisible();
    await page.getByTestId('admin.manutencao.expected-back').fill('2099-01-01T10:00');
    await page.getByTestId('admin.manutencao.message').fill('Atualizando o sistema de pagamentos.');
    await page.getByTestId('admin.manutencao.on-confirm').click();
    await expect(page.getByTestId('admin.manutencao.state')).toHaveText('Ligado');
    await expect(page.getByTestId('admin.manutencao.on-block')).toContainText('Atualizando o sistema de pagamentos.');
    await expect(page.getByTestId('admin.manutencao.history')).toContainText('Modo manutenção ligado');
    await page.goto('/admin');
    await expect(page.getByTestId('admin.maintenance.banner')).toBeVisible();
    await page.goto('/admin/manutencao');

    const ops = await browser.newPage();
    await login(ops, 'operacao@webag.local');
    await expect(ops.getByTestId('admin.maintenance.banner')).toContainText('Modo manutenção ligado');
    await expect(ops.getByTestId('nav-manutencao')).toHaveCount(0);
    await ops.goto('/admin/manutencao');
    await expect(ops.getByTestId('no-access')).toBeVisible();
    await ops.close();

    await page.getByTestId('admin.manutencao.turn-off').click();
    await page.getByTestId('admin.manutencao.reason').fill('Troca concluída.');
    await page.getByTestId('admin.manutencao.off-confirm').click();
    await expect(page.getByTestId('admin.manutencao.state')).toHaveText('Desligado');
    await page.goto('/admin');
    await expect(page.getByTestId('admin.maintenance.banner')).toHaveCount(0);
  });

  test('site e painel do lojista mostram o aviso amigável enquanto durar; ao desligar, some', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    await post('/__test/maintenance', { enabled: true, message: 'Voltamos às 14h.' });
    await expect(async () => {
      await page.goto('/');
      await expect(page.getByTestId('public.maintenance')).toContainText('Voltamos já: estamos em manutenção', { timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByTestId('public.maintenance')).toContainText('Voltamos às 14h.');
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista');
    await expect(page.getByTestId('lojista.maintenance.banner')).toContainText('pedidos já pagos continuam com você');
    await post('/__test/maintenance', { enabled: false });
    await expect(async () => {
      await page.goto('/');
      await expect(page.getByTestId('public.maintenance')).toHaveCount(0, { timeout: 1500 });
    }).toPass({ timeout: 30_000 });
  });
});

test.describe('Lojista: e-mail de pedido novo (B2)', () => {
  test('o dono desliga só o e-mail; o texto diz que o alerta e o som do painel não desligam; vale depois de recarregar', async ({ page }) => {
    const merchant = await seedMerchant('Casa Bela');
    await loginLojista(page, merchant.email, merchant.password);
    await page.goto('/lojista/loja');
    await expect(page.getByTestId('lojista.minha-loja.item-notifications')).toContainText('E-mail ligado. Alerta e som no painel sempre ligados');
    await page.getByTestId('lojista.minha-loja.item-notifications').click();
    await expect(page.getByTestId('lojista.avisos.always-on')).toContainText('não desligam');
    await page.getByTestId('lojista.avisos.email-switch').click();
    await expect(page.getByTestId('lojista.avisos.off-warning')).toBeVisible();
    await expect(page.getByTestId('lojista.avisos.always-on')).toBeVisible();
    await page.getByTestId('lojista.avisos.submit').click();
    await expect(page).toHaveURL(/\/lojista\/loja$/);
    await expect(page.getByTestId('lojista.minha-loja.item-notifications')).toContainText('E-mail desligado. Alerta e som no painel sempre ligados');
    await page.goto('/lojista/loja/avisos');
    await expect(page.getByRole('switch', { name: /E-mail de pedido novo, desligado/ })).toBeVisible();
  });
});

test.describe('Celular 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Alertas, Usuários e Pedidos cabem na tela sem rolagem lateral e a folha Mais leva às três áreas', async ({ page }) => {
    await loginNarrow(page, 'admin@webag.local');
    await page.getByTestId('nav-more').click();
    await expect(page.getByTestId('nav-more-alertas')).toBeVisible();
    await expect(page.getByTestId('nav-more-usuarios')).toBeVisible();
    await expect(page.getByTestId('nav-more-pedidos')).toBeVisible();
    for (const path of ['/admin/alertas', '/admin/usuarios', '/admin/pedidos', `/admin/pedidos/${ORDER_RECEIVED}`, '/admin/manutencao']) {
      await page.goto(path);
      await expect(page.getByTestId('panel.title')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
