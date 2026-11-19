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
