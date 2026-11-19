import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaOf, batchesOf, etaBandText, etaLevel, etaLevelText, sortQueue, sortQueueByEta, waitLevel, waitText, type Delivery } from '@/lib/api/logistics';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { courierPhoneDigits } from './couriers-tab';
import { resultOf, summarize } from './history-tab';
import { batchError, batchFailMessage } from './batch-dialog';
import { LogisticsPage } from './logistics-page';
import { ApiError } from '@/lib/api/errors';
import { brasiliaToday, countdownText, lateAlertsSince, pendingLateCancel } from '@/lib/api/logistics';
import { deliveredAtProblem, timeToDate } from './delivery-dialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/logistica' }));

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const delivery = (over: Partial<Delivery> = {}): Delivery =>
  ({
    id: 'd1',
    kind: 'delivery',
    orderId: 'o1',
    orderNumber: 'WB-4K7P2',
    storeId: 's1',
    storeName: 'Casa Bela',
    status: 'ready_for_collection',
    readyAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    waitingMinutes: 12,
    sla: 'long',
    courier: null,
    volumes: 1,
    destination: 'Jardim Alvorada, Francisco Morato',
    fee: money(700),
    expectedCost: money(600),
    cost: null,
    attempts: 0,
    allowedActions: ['assign', 'cancel'],
    codeRequired: false,
    updatedAt: new Date().toISOString(),
    ...over,
  }) as Delivery;

afterEach(() => vi.unstubAllGlobals());

describe('fila de coleta', () => {
  it('nível de espera: 10 min atenção, 20 min atrasado, sempre em texto', () => {
    expect(waitLevel({ sla: 'ok', waitingMinutes: 4 })).toBe('normal');
    expect(waitLevel({ sla: 'long', waitingMinutes: 12 })).toBe('warning');
    expect(waitLevel({ sla: 'late', waitingMinutes: 22 })).toBe('late');
    expect(waitText({ sla: 'ok', waitingMinutes: 4 })).toBe('Esperando há 4 min');
    expect(waitText({ sla: 'late', waitingMinutes: 22 })).toBe('Atrasado · 22 min');
  });
  it('ordena por nível e depois pelo mais antigo', () => {
    const a = delivery({ id: 'a', sla: 'ok', waitingMinutes: 3, readyAt: '2026-11-19T10:10:00Z' });
    const b = delivery({ id: 'b', sla: 'late', waitingMinutes: 25, readyAt: '2026-11-19T10:00:00Z' });
    const c = delivery({ id: 'c', sla: 'ok', waitingMinutes: 8, readyAt: '2026-11-19T10:05:00Z' });
    expect(sortQueue([a, b, c]).map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });
  it('custo e resultado: taxa menos custo; sem custo não há resultado', () => {
    expect(resultOf(delivery({ cost: money(600) }))).toBe(100);
    expect(resultOf(delivery({ cost: money(900) }))).toBe(-200);
    expect(resultOf(delivery())).toBeNull();
    expect(summarize([delivery({ cost: money(600) }), delivery({ cost: null })])).toMatchObject({ count: 2, cost: 600, fee: 1400, result: 100, withoutCost: 1 });
  });
  it('celular do motoboy com DDD, com ou sem 55', () => {
    expect(courierPhoneDigits('(11) 91234-5678')).toBe('5511912345678');
    expect(courierPhoneDigits('5511912345678')).toBe('5511912345678');
    expect(courierPhoneDigits('1234')).toBeNull();
  });
});

describe('despachar motoboy (atribuir e enviar no WhatsApp)', () => {
  const couriers = { data: [{ id: 'c1', name: 'João', phone: '5511912345678', note: null, active: true, documentsCheckedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', busyNow: false, deliveriesLast7Days: 4 }], nextCursor: null };

  it('atribui e mostra o botão "Enviar no WhatsApp" com a mensagem pronta', async () => {
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: [delivery()], nextCursor: null });
        if (p === 'admin/logistics/couriers') return json(couriers);
        if (p === 'admin/logistics/deliveries/d1/assign' && init.method === 'POST') return json(delivery({ status: 'awaiting_courier', courier: { id: 'c1', name: 'João' } }));
        if (p === 'admin/logistics/deliveries/d1/whatsapp') return json({ courierPhone: '5511912345678', message: '*Webag · Entrega #WB-4K7P2*\nBuscar na loja: Casa Bela', link: 'https://wa.me/5511912345678?text=x', courierActiveDeliveries: 1 });
        if (p === 'admin/logistics/deliveries/d1/whatsapp-sent') {
          sent.push('sent');
          return json(null, 204);
        }
        return undefined;
      }).impl,
    );
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    expect(await screen.findByTestId('admin.logistica.wait')).toHaveTextContent('Esperando há 12 min');
    await user.click(await screen.findByTestId('admin.logistica.fila.row-d1-assign'));
    await user.click(await screen.findByTestId('admin.logistica.driver-option-c1'));
    await user.click(screen.getByTestId('admin.logistica.submit'));
    const link = await screen.findByTestId('admin.logistica.send-whatsapp');
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/5511912345678'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByTestId('admin.logistica.message-preview')).toHaveTextContent('Casa Bela');
    await user.click(link);
    await waitFor(() => expect(sent).toEqual(['sent']));
  });

  it('dois operadores: o primeiro vence e o segundo recebe a mensagem de conflito', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: [delivery()], nextCursor: null });
        if (p === 'admin/logistics/couriers') return json(couriers);
        if (p === 'admin/logistics/deliveries/d1/assign' && init.method === 'POST') return json({ type: 'x', title: 'Já atribuída', status: 409, code: 'DELIVERY_ALREADY_ASSIGNED' }, 409);
        return undefined;
      }).impl,
    );
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    await user.click(await screen.findByTestId('admin.logistica.fila.row-d1-assign'));
    await user.click(await screen.findByTestId('admin.logistica.driver-option-c1'));
    await user.click(screen.getByTestId('admin.logistica.submit'));
    expect(await screen.findByTestId('admin.logistica.assign-error')).toHaveTextContent('já foi atribuído por outra pessoa');
    expect(screen.queryByTestId('admin.logistica.send-whatsapp')).not.toBeInTheDocument();
  });

  it('suporte só consulta: sem botão "Atribuir"', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((url) => (url.pathname.endsWith('/deliveries') ? json({ data: [delivery()], nextCursor: null }) : undefined)).impl,
    );
    renderPanel(<LogisticsPage />, 'support');
    expect(await screen.findByText('Você pode ver, mas não despachar.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.logistica.fila.row-d1-assign')).not.toBeInTheDocument();
  });
});

describe('promessa de entrega (DEC-053): faixa, alerta de atraso e lote', () => {
  const now = Date.parse('2026-11-19T18:00:00Z');
  const at = (min: number) => new Date(now + min * 60_000).toISOString();

  it('faixa inteira vira "Chega entre HH:MM e HH:MM"; só o fim (contrato de hoje) vira "Prometido até HH:MM"; horário de Brasília', () => {
    expect(etaBandText(delivery({ etaFromAt: '2026-11-19T18:40:00Z', etaToAt: '2026-11-19T19:40:00Z' }))).toBe('Chega entre 15:40 e 16:40');
    expect(etaBandText(delivery({ etaToAt: '2026-11-19T19:40:00Z' }))).toBe('Prometido até 16:40');
    expect(etaBandText(delivery())).toBeNull();
  });
  it('o alerta vem do fim da faixa: no prazo, perto do fim (10 min) e atrasado', () => {
    expect(etaLevel(delivery({ etaToAt: at(40) }), now)).toBe('on_time');
    expect(etaLevel(delivery({ etaToAt: at(8) }), now)).toBe('ending');
    expect(etaLevel(delivery({ etaToAt: at(-12) }), now)).toBe('late');
    expect(etaLevelText(delivery({ etaToAt: at(-12) }), now)).toBe('Atrasado há 12 min do fim da faixa');
    expect(etaLevelText(delivery({ etaToAt: at(8) }), now)).toBe('Faltam 8 min para o fim da faixa');
    expect(etaLevel(delivery({ etaToAt: at(-30), status: 'delivered' }), now)).toBeNull();
    expect(etaLevel(delivery(), now)).toBeNull();
    expect(etaLevel(delivery({ overdue: true }), now)).toBe('late');
    expect(etaLevelText(delivery({ overdue: true, overdueMinutes: 25 }), now)).toBe('Atrasado há 25 min do fim da faixa');
  });
  it('a fila põe primeiro o que passou do fim da faixa', () => {
    const a = delivery({ id: 'a', sla: 'late', waitingMinutes: 30, etaToAt: at(50) });
    const b = delivery({ id: 'b', sla: 'ok', waitingMinutes: 2, etaToAt: at(-5) });
    expect(sortQueueByEta([a, b], now).map((row) => row.id)).toEqual(['b', 'a']);
  });
  it('lote: só áreas com 2 ou mais entregas; troca não entra', () => {
    const rows = [delivery({ id: '1' }), delivery({ id: '2', destination: 'jardim alvorada, francisco morato' }), delivery({ id: '3', destination: 'Centro, Caieiras' }), delivery({ id: '4', kind: 'exchange_pickup' }), delivery({ id: '5', destination: 'Rua X, Cajamar', area: { key: 'b1', readyCount: 2 } }), delivery({ id: '6', destination: 'Rua Y, Cajamar', area: { key: 'b1', readyCount: 2 } })];
    expect(areaOf(rows[3]!)).toBeNull();
    const batches = batchesOf(rows);
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.rows.map((row) => row.id).join(','))).toContain('1,2');
    expect(batches.map((b) => b.rows.map((row) => row.id).join(','))).toContain('5,6');
  });

  it('mostra a faixa e o alerta na fila e atribui o lote ao mesmo motoboy', async () => {
    const assigned: string[] = [];
    const rows = [
      delivery({ id: 'd1', orderNumber: 'WB-1', etaToAt: at(-10) }),
      delivery({ id: 'd2', orderNumber: 'WB-2', etaToAt: at(50) }),
    ];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: rows, nextCursor: null });
        if (p === 'admin/logistics/couriers') return json({ data: [{ id: 'c1', name: 'João', phone: '5511912345678', note: null, active: true, documentsCheckedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', busyNow: false, deliveriesLast7Days: 4 }], nextCursor: null });
        if (p === 'admin/logistics/deliveries/assign-batch' && init.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { deliveryIds: string[] };
          assigned.push(...body.deliveryIds);
          return json({ assigned: body.deliveryIds.map((id) => delivery({ id, status: 'awaiting_courier' })), failed: [] });
        }
        if (/\/whatsapp$/.test(p)) return json({ courierPhone: '5511912345678', message: 'm', link: 'https://wa.me/5511912345678?text=x', courierActiveDeliveries: 2 });
        return undefined;
      }).impl,
    );
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    const etas = await screen.findAllByTestId('admin.logistica.eta');
    expect(etas[0]).toHaveAttribute('data-level', 'late');
    expect(etas[0]).toHaveTextContent('Atrasado há 10 min do fim da faixa');
    expect(screen.getByTestId('admin.logistica.summary-late')).toHaveTextContent('1');
    await user.click(screen.getByTestId('admin.logistica.batch-d1'));
    await user.click(await screen.findByTestId('admin.logistica.batch-driver-c1'));
    await user.click(screen.getByTestId('admin.logistica.batch-submit'));
    expect(await screen.findByTestId('admin.logistica.batch-result-d1')).toHaveTextContent('atribuído');
    expect(screen.getByTestId('admin.logistica.batch-result-d2')).toHaveTextContent('atribuído');
    expect(assigned.sort()).toEqual(['d1', 'd2']);
    expect(rows).toHaveLength(2);
    vi.restoreAllMocks();
  });
});

describe('lote: falha parcial e erros', () => {
  it('mensagens por código; o lote inteiro recusado não atribui nada', () => {
    expect(batchFailMessage('DELIVERY_ALREADY_ASSIGNED')).toContain('Outra pessoa');
    expect(batchError(new ApiError({ status: 422, title: 'x', code: 'BATCH_DIFFERENT_AREA' }))).toContain('mesma cidade');
    expect(batchError(new ApiError({ status: 0, title: 'x', code: 'NETWORK' }))).toContain('Nada foi alterado');
  });
  it('respeita o limite do lote do admin (`entrega_lote_max`): o que passa fica para o próximo', async () => {
    const rows = ['d1', 'd2', 'd3'].map((id, i) => delivery({ id, orderNumber: `WB-${i + 1}` }));
    let sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: rows, nextCursor: null });
        if (p === 'admin/parameters') return json({ data: [{ key: 'entrega_lote_max', value: 2, default: 4, type: 'int', min: 2, max: 10, values: null, description: 'x', ref: 'DEC-053', legalFloor: false, updatedAt: null }], nextCursor: null });
        if (p === 'admin/logistics/couriers') return json({ data: [{ id: 'c1', name: 'João', phone: '5511912345678', note: null, active: true, documentsCheckedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', busyNow: false, deliveriesLast7Days: 4 }], nextCursor: null });
        if (p === 'admin/logistics/deliveries/assign-batch' && init.method === 'POST') {
          sent = (JSON.parse(String(init.body)) as { deliveryIds: string[] }).deliveryIds;
          return json({ assigned: [], failed: [] });
        }
        return undefined;
      }).impl,
    );
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    await user.click(await screen.findByTestId('admin.logistica.batch-d1'));
    expect(await screen.findByText(/Mais 1 ficam para o próximo lote/)).toBeInTheDocument();
    await user.click(await screen.findByTestId('admin.logistica.batch-driver-c1'));
    await user.click(screen.getByTestId('admin.logistica.batch-submit'));
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it('uma corrida que perdeu a disputa aparece como "não atribuído" e as outras seguem', async () => {
    const rows = [delivery({ id: 'd1', orderNumber: 'WB-1' }), delivery({ id: 'd2', orderNumber: 'WB-2' })];
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: rows, nextCursor: null });
        if (p === 'admin/logistics/couriers') return json({ data: [{ id: 'c1', name: 'João', phone: '5511912345678', note: null, active: true, documentsCheckedAt: '2026-11-01T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', busyNow: false, deliveriesLast7Days: 4 }], nextCursor: null });
        if (p === 'admin/logistics/deliveries/assign-batch' && init.method === 'POST') return json({ assigned: [delivery({ id: 'd1', status: 'awaiting_courier' })], failed: [{ deliveryId: 'd2', code: 'DELIVERY_ALREADY_ASSIGNED' }] });
        if (/\/whatsapp$/.test(p)) return json({ courierPhone: '5511912345678', message: 'm', link: 'https://wa.me/5511912345678?text=x', courierActiveDeliveries: 1 });
        return undefined;
      }).impl,
    );
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    await user.click(await screen.findByTestId('admin.logistica.batch-d1'));
    await user.click(await screen.findByTestId('admin.logistica.batch-driver-c1'));
    await user.click(screen.getByTestId('admin.logistica.batch-submit'));
    expect(await screen.findByTestId('admin.logistica.batch-result-d1')).toHaveTextContent('atribuído');
    expect(screen.getByTestId('admin.logistica.batch-result-d2')).toHaveTextContent('não atribuído');
    expect(screen.getByTestId('admin.logistica.batch-result-d2')).toHaveTextContent('Outra pessoa já atribuiu');
  });
});

describe('revelar contato (SEC-144)', () => {
  it('suporte vê o telefone mascarado, informa o motivo e só então vê o contato', async () => {
    let body: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        const p = url.pathname.replace('/api/proxy/admin/', '');
        if (p === 'admin/logistics/deliveries') return json({ data: [delivery()], nextCursor: null });
        if (p === 'admin/logistics/deliveries/d1') return json({ ...delivery(), customerPhoneMasked: '(11) 9****-7777', contactRevealable: true, timeline: [] });
        if (p === 'admin/logistics/deliveries/d1/contact-reveal' && init.method === 'POST') {
          body = JSON.parse(String(init.body));
          return json({ contact: { pickupAddress: 'Rua A, 1', storePhone: null, dropoffAddress: 'Rua B, 2', customerFirstName: 'Maria', customerPhone: '11988887777' } });
        }
        return undefined;
      }).impl,
    );
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'support');
    await user.click(await screen.findByRole('button', { name: /pedido WB-4K7P2/ }));
    expect(await screen.findByTestId('admin.logistica.masked-phone')).toHaveTextContent('(11) 9****-7777');
    await user.click(screen.getByTestId('admin.logistica.reveal'));
    await user.click(screen.getByTestId('admin.logistica.reveal-confirm'));
    expect(screen.queryByTestId('admin.logistica.customer-block')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('admin.logistica.reveal-reason'), 'Cliente não atende o motoboy');
    await user.click(screen.getByTestId('admin.logistica.reveal-confirm'));
    expect(await screen.findByTestId('admin.logistica.customer-block')).toHaveTextContent('Rua B, 2');
    expect(body).toEqual({ reason: 'Cliente não atende o motoboy' });
    expect(screen.getByTestId('admin.logistica.revealed-note')).toBeInTheDocument();
  });
});

const statsBody = (over: object = {}) => ({ period: { from: '2026-11-19', to: '2026-11-19' }, delivered: 12, onTime: { count: 11, of: 12, pct: 91.7 }, withinCeiling: { count: 12, of: 12, pct: 100, ceilingMinutes: 120 }, precisionMedianMinutes: 8, lateCancellations: 0, compensations: { granted: 0, redeemed: 0, cost: money(0), abdicatedFee: money(0) }, prepByStore: [], ...over });
const lateCancel = (over: object = {}) => ({ id: 'c1', status: 'pending', reason: 'Atraso na entrega', requestedAt: new Date().toISOString(), respondBy: new Date(Date.now() + 7 * 60_000).toISOString(), decidedAt: null, decidedBy: null, decisionNote: null, ...over });

describe('Logística v3: dados da onda 7 (W.3, W.4, Y.2)', () => {
  it('4º número "No prazo hoje" vem de /admin/logistics/stats; suporte (403) fica com "Maior espera"', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', mockFetch((url) => {
      const p = url.pathname.replace('/api/proxy/admin/', '');
      if (p === 'admin/logistics/deliveries') return json({ data: [delivery()], nextCursor: null });
      if (p === 'admin/logistics/stats') { calls.push(url.search); return json(statsBody()); }
      return undefined;
    }).impl);
    const first = renderPanel(<LogisticsPage />, 'operations');
    expect(await screen.findByTestId('admin.logistica.summary-ontime')).toHaveTextContent('No prazo hoje');
    expect(screen.getByTestId('admin.logistica.summary-ontime')).toHaveTextContent('91,7%');
    expect(screen.getByTestId('admin.logistica.summary-ontime')).toHaveTextContent('11 de 12 entregas');
    expect(calls[0]).toBe(`?from=${brasiliaToday(Date.now())}&to=${brasiliaToday(Date.now())}`);
    first.unmount();
    vi.stubGlobal('fetch', mockFetch((url) => {
      const p = url.pathname.replace('/api/proxy/admin/', '');
      if (p === 'admin/logistics/deliveries') return json({ data: [delivery()], nextCursor: null });
      if (p === 'admin/logistics/stats') return json({ code: 'FORBIDDEN', title: 'x', status: 403 }, 403);
      return undefined;
    }).impl);
    renderPanel(<LogisticsPage />, 'support');
    expect(await screen.findByTestId('admin.logistica.summary-longest')).toHaveTextContent('Maior espera');
    expect(screen.queryByTestId('admin.logistica.summary-ontime')).not.toBeInTheDocument();
  });

  it('pedido de cancelamento por atraso: faixa com contagem, "Chego em até 10 min" e "Aceitar" com confirmação', async () => {
    const bodies: unknown[] = [];
    const row = delivery({ id: 'd9', orderId: 'o9', orderNumber: 'WB-E2026', status: 'out_for_delivery', allowedActions: ['delivered', 'not_delivered'], lateCancelRequest: lateCancel() } as Partial<Delivery>);
    vi.stubGlobal('fetch', mockFetch((url, init) => {
      const p = url.pathname.replace('/api/proxy/admin/', '');
      if (p === 'admin/logistics/deliveries') return json({ data: [row], nextCursor: null });
      if (p === 'admin/logistics/stats') return json(statsBody());
      if (p === 'admin/orders/o9/late-cancel/respond' && init.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return json({ status: 'ok' }); }
      return undefined;
    }).impl);
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    expect(await screen.findByTestId('admin.logistica.late-alert')).toHaveTextContent('1 pedido de cancelamento');
    await user.click(screen.getByTestId('admin.logistica.late-alert-open'));
    const strip = await screen.findByTestId('admin.logistica.cancel-request-d9');
    expect(strip).toHaveTextContent('O cliente pediu cancelamento por atraso');
    expect(screen.getByTestId('admin.logistica.cancel-request-d9-countdown')).toHaveTextContent(/0[67]:\d\d/);
    await user.click(screen.getByTestId('admin.logistica.cancel-request-d9-arrive'));
    await waitFor(() => expect(bodies).toEqual([{ action: 'arrive_soon' }]));
    expect(await screen.findByText(/O cliente foi avisado: chega em até 10 min/)).toBeInTheDocument();
    await user.click(screen.getByTestId('admin.logistica.cancel-request-d9-accept'));
    expect(await screen.findByTestId('admin.logistica.cancel-request-d9-confirm')).toHaveTextContent('Não dá para desfazer');
    await user.click(screen.getByTestId('admin.logistica.cancel-request-d9-accept-confirm'));
    await waitFor(() => expect(bodies).toEqual([{ action: 'arrive_soon' }, { action: 'accept' }]));
  });

  it('suporte vê a faixa do pedido de cancelamento mas não os botões; pedido já respondido não mostra faixa', async () => {
    const rows = [delivery({ id: 'd1', status: 'out_for_delivery', lateCancelRequest: lateCancel() } as Partial<Delivery>), delivery({ id: 'd2', orderNumber: 'WB-2', status: 'out_for_delivery', lateCancelRequest: lateCancel({ id: 'c2', status: 'approved' }) } as Partial<Delivery>)];
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/logistics/deliveries') ? json({ data: rows, nextCursor: null }) : undefined)).impl);
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'support');
    await user.click(await screen.findByTestId('admin.logistica.tab-andamento'));
    expect(await screen.findByTestId('admin.logistica.cancel-request-d1')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.logistica.cancel-request-d1-arrive')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.logistica.cancel-request-d2')).not.toBeInTheDocument();
  });

  it('alerta de atraso: som só para corrida que ganhou `lateAlertedAt` depois da primeira leitura, uma vez cada', () => {
    const a = { id: 'a', lateAlertedAt: null as string | null };
    const first = lateAlertsSince(null, [a, { id: 'b', lateAlertedAt: '2026-11-19T15:00:00Z' }]);
    expect(first.fresh).toEqual([]);
    const second = lateAlertsSince(first.ids, [{ ...a, lateAlertedAt: '2026-11-19T15:05:00Z' }, { id: 'b', lateAlertedAt: '2026-11-19T15:00:00Z' }]);
    expect(second.fresh).toEqual(['a']);
    expect(lateAlertsSince(second.ids, [{ id: 'a', lateAlertedAt: '2026-11-19T15:05:00Z' }, { id: 'b', lateAlertedAt: '2026-11-19T15:00:00Z' }]).fresh).toEqual([]);
  });

  it('pino não conferido (dropoffPinVerified=false) aparece na linha, em texto', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/logistics/deliveries') ? json({ data: [delivery({ dropoffPinVerified: false } as Partial<Delivery>), delivery({ id: 'd2', dropoffPinVerified: true } as Partial<Delivery>)], nextCursor: null }) : undefined)).impl);
    renderPanel(<LogisticsPage />, 'operations');
    expect(await screen.findByTestId('admin.logistica.row-d1-pin')).toHaveTextContent('Pino do endereço não conferido');
    expect(screen.queryByTestId('admin.logistica.row-d2-pin')).not.toBeInTheDocument();
  });

  it('cronômetro e fila de resposta: formato mm:ss e só pedido pendente', () => {
    const now = Date.parse('2026-11-19T15:00:00Z');
    expect(countdownText('2026-11-19T15:06:58Z', now)).toBe('06:58');
    expect(countdownText('2026-11-19T14:59:00Z', now)).toBe('00:00');
    expect(pendingLateCancel({ lateCancelRequest: null })).toBeNull();
    expect(pendingLateCancel({ lateCancelRequest: lateCancel({ status: 'superseded' }) as never })).toBeNull();
  });
});

describe('"Marcar entregue" com hora real (WB-262)', () => {
  const NOW = Date.parse('2026-11-19T15:30:00');
  it('hora em branco = agora; até 5 min não pede motivo; acima pede; futuro e mais de 60 min são recusados', () => {
    expect(deliveredAtProblem('', null, '', NOW)).toEqual({ error: null, at: null, needsReason: false });
    expect(deliveredAtProblem('15:27', null, '', NOW)).toMatchObject({ error: null, needsReason: false });
    expect(deliveredAtProblem('15:20', null, '', NOW)).toMatchObject({ needsReason: true, error: expect.stringContaining('diga por que') });
    expect(deliveredAtProblem('15:20', 'no_signal', '', NOW)).toMatchObject({ error: null, needsReason: true });
    expect(deliveredAtProblem('15:20', 'other', '', NOW).error).toBe('Escreva o motivo.');
    expect(deliveredAtProblem('15:20', 'other', 'Sem sinal na rua', NOW).error).toBeNull();
    expect(deliveredAtProblem('15:40', null, '', NOW).error).toBe('A hora da entrega não pode ser no futuro.');
    expect(deliveredAtProblem('14:00', 'no_signal', '', NOW).error).toContain('até 60 minutos');
    expect(deliveredAtProblem('9h', null, '', NOW).error).toContain('formato 14:32');
  });
  it('virada da meia-noite: 23:50 às 00:10 é ontem', () => {
    const at = timeToDate('23:50', Date.parse('2026-11-20T00:10:00'))!;
    expect(at.getDate()).toBe(19);
    expect(at.getHours()).toBe(23);
  });

  it('envia deliveredAt, motivo e nota ao marcar entregue e mostra a hora real na linha do tempo', async () => {
    let sent: Record<string, unknown> | null = null;
    const running = delivery({ id: 'd1', status: 'out_for_delivery', allowedActions: ['delivered', 'not_delivered'], codeRequired: false });
    vi.stubGlobal('fetch', mockFetch((url, init) => {
      const p = url.pathname.replace('/api/proxy/admin/', '');
      if (p === 'admin/logistics/deliveries') return json({ data: [running], nextCursor: null });
      if (p === 'admin/logistics/deliveries/d1' && init.method !== 'POST') return json({ ...running, timeline: [{ id: 't1', to: 'delivered', at: new Date().toISOString(), deliveredAt: new Date(Date.now() - 12 * 60_000).toISOString(), deliveredAtReason: 'no_signal' }] });
      if (p === 'admin/logistics/deliveries/d1/status' && init.method === 'POST') { sent = JSON.parse(String(init.body)); return json({ ...running, status: 'delivered' }); }
      return undefined;
    }).impl);
    const user = userEvent.setup();
    renderPanel(<LogisticsPage />, 'operations');
    await user.click(await screen.findByTestId('admin.logistica.tab-andamento'));
    await user.click(await screen.findByTestId('admin.logistica.andamento.row-d1-next'));
    expect(await screen.findByText(/entregue de fato às/)).toHaveTextContent('Ele ficou sem sinal');
    await user.click(await screen.findByTestId('admin.logistica.next-action'));
    const time = new Date(Date.now() - 12 * 60_000);
    await user.type(screen.getByTestId('admin.logistica.delivered-time'), `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
    await user.click(screen.getByTestId('admin.logistica.delivered-confirm'));
    expect(await screen.findByText(/diga por que/)).toBeInTheDocument();
    expect(sent).toBeNull();
    await user.click(screen.getByTestId('admin.logistica.delivered-reason-no_signal'));
    await user.click(screen.getByTestId('admin.logistica.delivered-confirm'));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ action: 'delivered', deliveredAtReason: 'no_signal' });
    expect(typeof sent!.deliveredAt).toBe('string');
  });
});
