import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortQueue, waitLevel, waitText, type Delivery } from '@/lib/api/logistics';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { courierPhoneDigits } from './couriers-tab';
import { resultOf, summarize } from './history-tab';
import { LogisticsPage } from './logistics-page';

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
