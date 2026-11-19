import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { API, adminLogin, lojistaLogin } from './helpers';

/**
 * QA ondas 4 e 5 (O5-JOR-02): a jornada do pedido pelas TELAS contra a API REAL (Postgres e Redis reais, sem API falsa).
 * Usa os pedidos de demonstração do seed (`WB-DMxxx`): a loja aceita e marca pronto na tela, a operação atribui o motoboy na tela
 * Logística, a entrega fecha com o código do cliente, e uma troca de tamanho pedida é aprovada pela loja na tela de trocas.
 * Variáveis: REAL_DB_URL (psql, só leitura do que o seed criou), senha do seed em SEED_PASSWORD.
 */
const DB = process.env.REAL_DB_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag_qa35e';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'webag-seed-lojista-2026';
const sql = (query: string): string => execFileSync('psql', [DB, '-At', '-F', '|', '-c', query], { encoding: 'utf8' }).trim();

async function customerToken(email: string): Promise<string> {
  const res = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SEED_PASSWORD }) });
  const body = (await res.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`login do cliente ${email}: ${res.status}`);
  return body.tokens.accessToken;
}

test.describe.configure({ mode: 'serial' });

const state = {} as { orderId: string; number: string; ownerEmail: string; customerEmail: string; deliveryId: string };

test.describe('Jornada pelas telas com a API real: aceitar, pronto, motoboy, entrega, troca', () => {
  test('a loja aceita o pedido novo, separa e marca "Pronto para coleta"; a entrega nasce na fila e a loja não marca "saiu"', async ({ page }) => {
    const [orderId, number, ownerEmail, customerEmail] = sql(
      `select o.id, o.number, u.email, c.email from orders o join store_members m on m.store_id=o.store_id and m.role='owner' join users u on u.id=m.user_id join users c on c.id=o.user_id where o.number='WB-DM002'`,
    ).split('|') as [string, string, string, string];
    Object.assign(state, { orderId, number, ownerEmail, customerEmail });
    expect(sql(`select status from orders where id='${orderId}'`)).toBe('received');

    await lojistaLogin(page, ownerEmail, SEED_PASSWORD);
    await page.goto('/lojista/pedidos');
    const alert = page.getByTestId('lojista.alert.modal');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('lojista.alert.accept').click();
    await expect(alert).toBeHidden();
    expect(sql(`select status from orders where id='${orderId}'`)).toBe('accepted');

    const next = page.getByTestId(`lojista.orders.card-${orderId}-next`);
    await expect(next).toHaveText('Iniciar separação');
    await next.click();
    await expect(next).toHaveText('Pronto para coleta');
    await next.click();
    await page.getByTestId('lojista.ready.confirm').click();
    await expect.poll(() => sql(`select status from orders where id='${orderId}'`), { timeout: 15_000 }).toBe('ready_for_collection');
    state.deliveryId = sql(`select id from deliveries where order_id='${orderId}'`);
    expect(state.deliveryId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`select count(*) from deliveries where order_id='${orderId}'`)).toBe('1');
    await expect(page.getByText(/saiu para entrega|marcar como entregue/i)).toHaveCount(0);
  });

  test('a operação atribui o motoboy na tela Logística, abre o WhatsApp sem dado proibido e fecha a entrega só com o código do cliente', async ({ page }) => {
    await adminLogin(page);
    const courierRes = await page.request.post('/api/proxy/admin/admin/logistics/couriers', { data: { name: 'Carlos Moto QA', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }, headers: { 'x-webag-client': 'web' } });
    expect(courierRes.status(), await courierRes.text()).toBe(201);
    await page.goto('/admin/logistica');
    const row = page.getByTestId(`admin.logistica.fila.row-${state.deliveryId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`admin.logistica.fila.row-${state.deliveryId}-assign`).click();
    await page.locator('[data-testid^="admin.logistica.driver-option-"]').first().check();
    await page.getByTestId('admin.logistica.submit').click();
    const send = page.getByTestId('admin.logistica.send-whatsapp');
    await expect(send).toBeVisible();
    const href = (await send.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    const text = decodeURIComponent(href.split('?text=')[1] ?? '');
    expect(text).not.toMatch(/R\$|@|cpf/i);
    expect(text).toContain('Não cobrar');
    await page.getByTestId('admin.logistica.assigned-close').click();

    const call = (action: string, extra: Record<string, unknown> = {}) =>
      page.request.post(`/api/proxy/admin/admin/logistics/deliveries/${state.deliveryId}/status`, { data: { action, ...extra }, headers: { 'x-webag-client': 'web' } });
    expect((await call('confirm')).status()).toBe(200);
    expect((await call('picked_up')).status()).toBe(200);
    expect(sql(`select status from orders where id='${state.orderId}'`)).toBe('out_for_delivery');
    // o código é do cliente: ele o lê no app; o painel nunca o mostra
    const token = await customerToken(state.customerEmail);
    const view = (await (await fetch(`${API}/v1/orders/${state.orderId}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { tracking: { deliveryCode: string | null; courierFirstName: string | null } };
    expect(view.tracking.deliveryCode).toMatch(/^\d{4}$/);
    expect(view.tracking.courierFirstName).toBe('Carlos');
    await page.goto('/admin/logistica');
    await expect(page.locator('body')).not.toContainText(view.tracking.deliveryCode!);
    const wrong = view.tracking.deliveryCode === '0000' ? '1111' : '0000';
    expect((await call('delivered', { code: wrong })).status()).toBe(422);
    expect(sql(`select status from orders where id='${state.orderId}'`)).toBe('out_for_delivery');
    expect((await call('delivered', { code: view.tracking.deliveryCode })).status()).toBe(200);
    expect(sql(`select status from orders where id='${state.orderId}'`)).toBe('delivered');
    // o dinheiro do pedido fecha no banco real: débitos = créditos, e a taxa de entrega é receita da Webag
    expect(sql(`select coalesce(sum(case e.direction when 'debit' then e.amount_cents else -e.amount_cents end),0) from ledger_entries e join ledger_transactions t on t.id=e.transaction_id where t.order_id='${state.orderId}'`)).toBe('0');
    expect(Number(sql(`select coalesce(sum(e.amount_cents),0) from ledger_entries e join ledger_transactions t on t.id=e.transaction_id where t.order_id='${state.orderId}' and e.account='delivery_fee_revenue' and e.direction='credit'`))).toBeGreaterThan(0);
  });

  test('a loja aprova a troca de tamanho pedida (1 toque); a taxa passa a ser devida e só então; a variação nova fica reservada', async ({ page }) => {
    const [exchangeId, owner, feeCents] = sql(
      `select e.id, u.email, e.fee_cents from exchange_requests e join orders o on o.id=e.order_id join store_members m on m.store_id=o.store_id and m.role='owner' join users u on u.id=m.user_id where e.status='requested' and e.type='size_color' order by o.number limit 1`,
    ).split('|') as [string, string, string];
    await lojistaLogin(page, owner, SEED_PASSWORD);
    await page.goto('/lojista/trocas');
    await expect(page.getByTestId(`lojista.trocas.deadline-${exchangeId}`)).toContainText(/Responda em/, { timeout: 20_000 });
    expect(sql(`select count(*) from payment_attempts where external_reference='exchange:${exchangeId}'`)).toBe('0'); // nada cobrado ao solicitar
    await page.getByTestId(`lojista.trocas.approve-${exchangeId}`).click();
    await expect.poll(() => sql(`select status from exchange_requests where id='${exchangeId}'`), { timeout: 15_000 }).toMatch(/awaiting_fee|approved/);
    const status = sql(`select status from exchange_requests where id='${exchangeId}'`);
    expect(status).toBe(Number(feeCents) > 0 ? 'awaiting_fee' : 'approved');
    expect(sql(`select count(*) from deliveries where exchange_id='${exchangeId}'`)).toBe(Number(feeCents) > 0 ? '0' : '1'); // com taxa pendente não há corrida
  });
});
