import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@/lib/api/store-settings';
import { parseCents, centsInput, parseDecimal } from '@/lib/money';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { DeliveryPage } from './delivery-page';
import { ExchangePage } from './exchange-page';
import { HoursPage, maskTime, validateDay } from './hours-page';
import { StoreMenu, hoursSummary } from './store-menu';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/loja' }));

const settings = (over: Partial<StoreSettings> = {}): StoreSettings => ({
  isOpenNow: true,
  hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, intervals: [{ start: '09:00', end: '18:00' }] })),
  holidays: [],
  pause: { active: false, until: null, indefinitely: false },
  delivery: { acceptsDelivery: true, radiusKm: 5, feeMode: 'fixed', feeFixedCents: 500, tiers: [], minOrderCents: 3000, freeAboveCents: 0, etaMinMinutes: 30, etaMaxMinutes: 45, prepMinutes: 25, prepMinutesIsDefault: false },
  pickup: { enabled: false, useStoreAddress: true, address: null, instructions: null, prepMinMinutes: 15, prepMaxMinutes: 30 },
  exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 0, version: 1, legalFloor: { withdrawalDays: 7, defectDays: 90 } },
  lowStockThreshold: 5,
  ...over,
});

/** Loja aprovada + `GET stores/s1/settings`; as escritas ficam registradas em `calls`. */
function server(current: StoreSettings = settings(), onWrite?: (url: URL, init: RequestInit) => Response | undefined) {
  const store = fakeStore({ status: 'approved', step: 4, name: 'Casa Bela', payout: { status: 'connected', maskedAccount: 'Titular ***.982.247-**', simulated: true } });
  return mockFetch(
    ...(onWrite ? [onWrite] : []),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/settings' ? json(current) : undefined),
    ...storeHandlers(store),
  );
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => push.mockClear());

describe('formatação', () => {
  it('converte reais digitados em centavos e volta', () => {
    expect(parseCents('7,50')).toBe(750);
    expect(parseCents('R$ 1.250,00')).toBe(125000);
    expect(parseCents('7')).toBe(700);
    expect(parseCents('abc')).toBeNull();
    expect(centsInput(500)).toBe('5,00');
    expect(parseDecimal('2,5')).toBe(2.5);
  });
  it('máscara de horário e validação do dia (C3)', () => {
    expect(maskTime('0930')).toBe('09:30');
    expect(validateDay([{ start: '09:00', end: '08:00' }])).toBe('O horário de fechar precisa ser depois do de abrir.');
    expect(validateDay([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '18:00' }])).toBe('Os dois horários não podem se sobrepor.');
    expect(validateDay([{ start: '9:0', end: '18:00' }])).toBe('Confira o horário (ex.: 09:00).');
    expect(validateDay([{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }])).toBeNull();
  });
  it('resumo dos horários', () => {
    expect(hoursSummary(settings().hours)).toBe('Seg a sex, 9h às 18h');
    expect(hoursSummary([])).toBeNull();
  });
});

describe('Minha loja (C1)', () => {
  it('mostra o estado, os resumos e a pendência do horário', async () => {
    vi.stubGlobal('fetch', server(settings({ hours: [] })).impl);
    renderLojista(<StoreMenu />);
    expect(await screen.findByText('Loja aberta')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.minha-loja.item-delivery')).toHaveTextContent('Entrega pela Webag · preparo 25 min');
    expect(screen.getByTestId('lojista.minha-loja.item-hours')).toHaveTextContent('Falta o horário');
    expect(screen.getByTestId('lojista.minha-loja.item-exchange')).toHaveTextContent('Troca em até 7 dias');
    expect(screen.getByTestId('lojista.minha-loja.item-payout')).toHaveTextContent('Titular');
  });

  it('pausar: pede confirmação e manda o tempo escolhido; pausada mostra "Reabrir agora"', async () => {
    const { impl, calls } = server(settings(), (url, init) => (url.pathname.endsWith('/stores/s1/pause') && init.method === 'POST' ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<StoreMenu />);
    await userEvent.click(await screen.findByTestId('lojista.minha-loja.pause-chip-2h'));
    await userEvent.click(screen.getByTestId('lojista.minha-loja.pause-open'));
    expect(screen.getByText('Pausar a loja?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.minha-loja.pause-submit'));
    await waitFor(() => expect(JSON.parse(String(calls.find((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/pause'))!.init.body))).toEqual({ kind: '2h' }));
  });

  it('loja pausada oferece reabrir', async () => {
    vi.stubGlobal('fetch', server(settings({ pause: { active: true, until: '2026-11-18T18:30:00Z', indefinitely: false } })).impl);
    renderLojista(<StoreMenu />);
    expect(await screen.findByTestId('lojista.minha-loja.reopen')).toBeInTheDocument();
  });

  it('funcionário não tem acesso', async () => {
    const staff = fakeStore({ status: 'approved', role: 'staff' });
    vi.stubGlobal('fetch', mockFetch(...storeHandlers(staff)).impl);
    renderLojista(<StoreMenu />);
    expect(await screen.findByText('Peça ao dono da loja para liberar.')).toBeInTheDocument();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const store = fakeStore({ status: 'approved', step: 4 });
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/settings') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined), ...storeHandlers(store)).impl);
    renderLojista(<StoreMenu />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('Horários (C3)', () => {
  it('valida o horário e salva horários e feriados', async () => {
    const { impl, calls } = server(settings(), (url, init) => (init.method === 'PUT' && /hours|holidays/.test(url.pathname) ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<HoursPage />);
    const close = await screen.findByTestId('lojista.horarios.day-1-close-1');
    await userEvent.clear(close);
    await userEvent.type(close, '0800');
    await userEvent.click(screen.getByTestId('lojista.horarios.submit'));
    expect(await screen.findByText('O horário de fechar precisa ser depois do de abrir.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);

    await userEvent.clear(close);
    await userEvent.type(close, '1900');
    await userEvent.type(screen.getByTestId('lojista.horarios.holiday-date'), '2026-12-25');
    await userEvent.type(screen.getByTestId('lojista.horarios.holiday-label'), 'Natal');
    await userEvent.click(screen.getByTestId('lojista.horarios.holiday-add'));
    await userEvent.click(screen.getByTestId('lojista.horarios.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/loja'));
    const hours = JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/hours'))!.init.body));
    expect(hours.days).toHaveLength(7);
    expect(hours.days.find((d: { weekday: number }) => d.weekday === 1).intervals).toEqual([{ start: '09:00', end: '19:00' }]);
    expect(hours.days.find((d: { weekday: number }) => d.weekday === 0).intervals).toEqual([]);
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/holidays'))!.init.body))).toEqual({ holidays: [{ date: '2026-12-25', label: 'Natal' }] });
  });

  it('sem horário: aviso e atalhos', async () => {
    vi.stubGlobal('fetch', server(settings({ hours: [] })).impl);
    renderLojista(<HoursPage />);
    expect(await screen.findByText('Sua loja está sem horário e aparece como fechada.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.horarios.preset-all'));
    expect(screen.getByTestId('lojista.horarios.day-0-open-1')).toHaveValue('09:00');
  });

  it('sair com alteração pede confirmação', async () => {
    vi.stubGlobal('fetch', server().impl);
    renderLojista(<HoursPage />);
    await userEvent.click(await screen.findByTestId('lojista.horarios.preset-all'));
    await userEvent.click(screen.getByTestId('lojista.horarios.back'));
    expect(screen.getByText('Sair sem salvar?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.horarios.leave-stay'));
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Entrega e retirada (C4)', () => {
  it('não deixa desligar a única opção ligada', async () => {
    vi.stubGlobal('fetch', server().impl);
    renderLojista(<DeliveryPage />);
    await userEvent.click(await screen.findByRole('switch', { name: /Entregar em casa/ }));
    expect(screen.getByText('Ligue a entrega ou a retirada. A loja precisa de ao menos uma.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Entregar em casa/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('valida o preparo (5 a 120 min) e salva entrega e retirada com o tempo de preparo da loja', async () => {
    const { impl, calls } = server(settings(), (url, init) => (init.method === 'PUT' && /delivery|pickup/.test(url.pathname) ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<DeliveryPage />);
    const prep = await screen.findByTestId('lojista.entrega.prep-input');
    expect(prep).toHaveValue('25');
    expect(screen.getByTestId('lojista.entrega.webag-delivers')).toHaveTextContent('A Webag cuida do motoboy');
    expect(screen.queryByTestId('lojista.entrega.radius-input')).not.toBeInTheDocument();
    await userEvent.clear(prep);
    await userEvent.type(prep, '3');
    await userEvent.click(screen.getByTestId('lojista.entrega.submit'));
    expect(await screen.findByText('Digite os minutos de preparo, de 5 a 120.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
    await userEvent.clear(prep);
    await userEvent.type(prep, '35');
    await userEvent.click(screen.getByRole('switch', { name: /Retirada na loja/ }));
    await userEvent.click(screen.getByTestId('lojista.entrega.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/loja'));
    const body = JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/delivery') && c.init.method === 'PUT')!.init.body));
    expect(body).toEqual({ acceptsDelivery: true, prepMinutes: 35 });
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/pickup'))!.init.body))).toMatchObject({ enabled: true, useStoreAddress: true });
  });

  it('quando vale o padrão da Webag o campo vem vazio e a dica diz quanto é', async () => {
    vi.stubGlobal('fetch', server(settings({ delivery: { ...settings().delivery, prepMinutes: 20, prepMinutesIsDefault: true } })).impl);
    renderLojista(<DeliveryPage />);
    expect(await screen.findByTestId('lojista.entrega.prep-input')).toHaveValue('');
    expect(screen.getByText(/Hoje vale o padrão da Webag, 20 min/)).toBeInTheDocument();
  });

  it('preparo vazio volta ao padrão da Webag (null)', async () => {
    const { impl, calls } = server(settings(), (url, init) => (init.method === 'PUT' ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<DeliveryPage />);
    await userEvent.clear(await screen.findByTestId('lojista.entrega.prep-input'));
    await userEvent.click(screen.getByTestId('lojista.entrega.submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/delivery'))!.init.body)).prepMinutes).toBeNull();
  });

  const etaPreview = (over: object = {}) => ({
    available: true,
    reason: null,
    distanceM: 5000,
    eta: { estimateMin: 61, fromMin: 46, toMin: 76, prepMin: 30, dispatchMin: 15, travelMin: 16, bandMin: 15, withinCeiling: true },
    etaRange: { minMinutes: 46, maxMinutes: 76, fromAt: '2026-11-19T15:00:00Z', toAt: '2026-11-19T16:00:00Z' },
    fee: { amount: 690, currency: 'BRL' },
    prepMin: 30,
    reachKm: 9,
    maxPrepMin: 70,
    radiusKm: 10,
    ...over,
  });

  it('prévia (W.5): a conta vem do servidor com o preparo do campo e a distância escolhida; sem CEP', async () => {
    const bodies: unknown[] = [];
    const { impl } = server(settings(), (url, init) => {
      if (!url.pathname.endsWith('/delivery-preview')) return undefined;
      bodies.push(JSON.parse(String(init.body)));
      return json(etaPreview());
    });
    vi.stubGlobal('fetch', impl);
    renderLojista(<DeliveryPage />);
    expect(await screen.findByTestId('lojista.entrega.preview-band')).toHaveTextContent('Chega em 46 a 76 min');
    expect(screen.getByTestId('lojista.entrega.preview-sum')).toHaveTextContent(/paga R\$\s6,90 de entrega\. Conta: preparo 30 \+ espera do motoboy 15 \+ trajeto 16 min, com folga de 15 para mais e para menos/);
    expect(screen.getByTestId('lojista.entrega.preview-reach')).toHaveTextContent('alcança até 9 km');
    expect(screen.queryByTestId('lojista.entrega.preview-cep')).not.toBeInTheDocument();
    expect(bodies[0]).toEqual({ distanceKm: 3, prepMin: 25 });
    await userEvent.click(screen.getByTestId('lojista.entrega.preview-km-8'));
    await waitFor(() => expect(bodies.at(-1)).toEqual({ distanceKm: 8, prepMin: 25 }));
  });

  it('prévia: fora do alcance usa a frase da spec; preparo acima do máximo avisa; sem entrega ligada não consulta', async () => {
    let out = true;
    const calls: string[] = [];
    const withPickup = settings({ pickup: { enabled: true, useStoreAddress: true, address: null, instructions: null, prepMinMinutes: 15, prepMaxMinutes: 30 } });
    const { impl } = server(withPickup, (url) => {
      if (!url.pathname.endsWith('/delivery-preview')) return undefined;
      calls.push(url.pathname);
      return json(out ? etaPreview({ available: false, reason: 'OUT_OF_RANGE', eta: null, etaRange: null, fee: null, maxPrepMin: 20 }) : etaPreview());
    });
    vi.stubGlobal('fetch', impl);
    renderLojista(<DeliveryPage />);
    expect(await screen.findByTestId('lojista.entrega.preview-out')).toHaveTextContent('Fora da área de entrega da loja. 3 km fica longe demais para o pedido chegar no prazo. A loja não aparece para quem mora lá; a retirada continua.');
    expect(screen.getByTestId('lojista.entrega.preview-max-prep')).toHaveTextContent('não alcança nenhum endereço');
    expect(document.body).not.toHaveTextContent(/2 h/);
    out = false;
    await userEvent.click(screen.getByTestId('lojista.entrega.delivery-switch'));
    expect(await screen.findByTestId('lojista.entrega.preview-off')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});

describe('Política de trocas (C5)', () => {
  it('salva prazo e taxa; o cartão legal é fixo', async () => {
    const { impl, calls } = server(settings(), (url, init) => (init.method === 'PUT' && url.pathname.endsWith('/exchange-policy') ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<ExchangePage />);
    expect(await screen.findByTestId('lojista.trocas.legal-card')).toHaveTextContent('arrependimento em até 7 dias');
    await userEvent.click(screen.getByTestId('lojista.trocas.days-plus'));
    await userEvent.type(screen.getByTestId('lojista.trocas.pickup-fee-input'), '5');
    expect(screen.getByTestId('lojista.trocas.preview')).toHaveTextContent('Troca por tamanho ou cor em até 8 dias. Coleta em casa: R$');
    await userEvent.click(screen.getByTestId('lojista.trocas.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/loja'));
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/exchange-policy'))!.init.body))).toEqual({ voluntaryDays: 8, collectionFeeCents: 500 });
  });

  it('taxa acima de R$ 30,00 é recusada; desligar manda prazo zero', async () => {
    const { impl, calls } = server(settings(), (url, init) => (init.method === 'PUT' ? json(null, 204) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<ExchangePage />);
    await userEvent.type(await screen.findByTestId('lojista.trocas.pickup-fee-input'), '40');
    await userEvent.click(screen.getByTestId('lojista.trocas.submit'));
    expect(await screen.findByText('A taxa vai até R$ 30,00.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Aceito troca/ }));
    expect(screen.getByTestId('lojista.trocas.legal-card')).toHaveTextContent('continuam valendo por lei');
    await userEvent.click(screen.getByTestId('lojista.trocas.submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/exchange-policy'))!.init.body))).toEqual({ voluntaryDays: 0, collectionFeeCents: 0 });
  });
});
