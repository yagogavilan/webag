import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { BannersPage, bannerStatus } from './banners-page';
import { CouponsPage } from './coupons-page';
import { PushPage } from './push-page';

afterEach(() => vi.unstubAllGlobals());
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();
const page = (data: object[]) => ({ data, nextCursor: null });
const city = { id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'fm', active: true, neighborhoods: [{ id: 'n1', cityId: 'c1', name: 'Centro', active: true }] };
const banner = (over: object) => ({ id: 'b1', title: 'Semana do Tênis', image: { urls: { '320': 'https://files.test/b.webp' } }, destination: { type: 'store', id: 's1', code: null }, position: 0, cityId: null, startsAt: PAST, endsAt: FUTURE, active: true, live: true, impressions: 1240, clicks: 86, ctrPct: 6.9, ...over });

describe('status do banner (MK1)', () => {
  it('cada estado em texto: encerrado, pausado, agendado, no ar e destino indisponível', () => {
    const base = { active: true, live: true, startsAt: PAST, endsAt: FUTURE };
    expect(bannerStatus(base)).toBe('live');
    expect(bannerStatus({ ...base, live: false })).toBe('unavailable');
    expect(bannerStatus({ ...base, active: false })).toBe('inactive');
    expect(bannerStatus({ ...base, startsAt: FUTURE, endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() })).toBe('scheduled');
    expect(bannerStatus({ ...base, endsAt: PAST })).toBe('ended');
  });
});

describe('BannersPage (MK1)', () => {
  it('lista com impressões, cliques e taxa em texto; pausar manda PATCH e avisa', async () => {
    let live = true;
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([city])) : undefined),
      (url, init) => (init.method === 'PATCH' ? ((live = false), json(banner({ active: false, live: false }))) : undefined),
      (url) => (url.pathname.endsWith('/admin/banners') ? json(page([banner({ live })])) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<BannersPage />);
    const row = await screen.findByTestId('admin.banners.row-b1');
    expect(within(row).getByText('No ar')).toBeInTheDocument();
    expect(row).toHaveTextContent('1240 impressões · 86 cliques · taxa 6,9%');
    await userEvent.click(screen.getByTestId('admin.banners.row-b1-switch'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PATCH')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'PATCH')!.init.body as string)).toEqual({ active: false });
    expect(await screen.findByText('Banner pausado.')).toBeInTheDocument();
  });

  it('sem banner no ar mostra o aviso; lista vazia tem próximo passo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/banners') ? json(page([banner({ live: false })])) : json(page([])))).impl);
    const first = renderPanel(<BannersPage />);
    expect(await screen.findByTestId('admin.banners.none-live')).toHaveTextContent('Nenhum banner no ar agora');
    first.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<BannersPage />);
    expect(await screen.findByTestId('admin.banners.empty')).toHaveTextContent('Banners aparecem no topo da Início do app.');
  });

  it('formulário: sem imagem, destino e datas não envia e mostra as mensagens do design', async () => {
    const { impl, calls } = mockFetch(() => json(page([])));
    vi.stubGlobal('fetch', impl);
    renderPanel(<BannersPage />);
    await userEvent.click(await screen.findByTestId('admin.banners.new-banner'));
    await userEvent.click(screen.getByTestId('admin.banners.submit'));
    expect(await screen.findByText('Escolha uma imagem.')).toBeInTheDocument();
    expect(screen.getByText('Escreva o título do banner.')).toBeInTheDocument();
    expect(screen.getByText('Escolha onde o banner leva.')).toBeInTheDocument();
    expect(screen.getByText('Informe quando começa.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });

  it('financeiro e suporte não têm a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<BannersPage />, 'finance');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});

const estimate = (over: object = {}) => ({ eligible: 412, excludedByCap: 38, belowMinimum: false, minimum: 20, marketingEnabled: true, nextSendAt: new Date(Date.now() + 1000).toISOString(), ...over });

async function pickCity() {
  await screen.findByRole('option', { name: 'Francisco Morato' });
  await userEvent.selectOptions(screen.getByTestId('admin.push.segment-value'), 'c1');
}

async function fillCampaign() {
  await pickCity();
  await userEvent.type(screen.getByTestId('admin.push.title-input'), 'Ofertas da semana');
  await userEvent.type(screen.getByTestId('admin.push.body-input'), 'Frete grátis hoje');
}

describe('PushPage (MK2)', () => {
  it('mostra a estimativa, pede confirmação com o N e envia com Idempotency-Key e expectedRecipients', async () => {
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([city])) : undefined),
      (url) => (url.pathname.endsWith('/admin/categories') ? json({ data: [], nextCursor: null, icons: [] }) : undefined),
      (url) => (url.pathname.endsWith('/admin/push/estimate') ? json(estimate()) : undefined),
      (url, init) => (url.pathname.endsWith('/admin/push/campaigns') && init.method === 'POST' ? json({ id: 'p1', status: 'sending' }, 201) : undefined),
      (url) => (url.pathname.endsWith('/admin/push/campaigns') ? json(page([])) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<PushPage />);
    await fillCampaign();
    expect(await screen.findByText('412 pessoas')).toBeInTheDocument();
    expect(screen.getByTestId('admin.push.excluded-note')).toHaveTextContent('38 ficam de fora');
    expect(screen.getByTestId('admin.push.preview')).toHaveTextContent('Ofertas da semana');
    await userEvent.click(screen.getByTestId('admin.push.submit'));
    expect(screen.getByText('Enviar para 412 pessoas?')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/campaigns'))).toBe(false);
    await userEvent.click(screen.getByTestId('admin.push.send-confirm'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/campaigns'))).toBeTruthy());
    const post = calls.find((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/campaigns'))!;
    expect(JSON.parse(post.init.body as string)).toMatchObject({ title: 'Ofertas da semana', segment: { kind: 'city', cityId: 'c1' }, destination: { type: 'home' }, expectedRecipients: 412 });
    expect(new Headers(post.init.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Push enviado para 412 pessoas.')).toBeInTheDocument();
  });

  it('segmento pequeno: número vira "Poucas pessoas" e o botão fica inerte com o motivo no rótulo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([city])) : url.pathname.endsWith('/admin/push/estimate') ? json(estimate({ eligible: null, excludedByCap: null, belowMinimum: true })) : json(page([])))).impl);
    renderPanel(<PushPage />);
    await pickCity();
    expect(await screen.findByText('Poucas pessoas')).toBeInTheDocument();
    expect(screen.getByTestId('admin.push.submit')).toBeDisabled();
    expect(screen.getByTestId('admin.push.submit')).toHaveTextContent('Mínimo de 20 pessoas');
  });

  it('flag desligada: aviso e botão "Push desligado"', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([city])) : url.pathname.endsWith('/admin/push/estimate') ? json(estimate({ marketingEnabled: false })) : json(page([])))).impl);
    renderPanel(<PushPage />);
    await pickCity();
    expect(await screen.findByTestId('admin.push.flag-off-banner')).toHaveTextContent('O push de marketing está desligado. Nada será enviado.');
    expect(screen.getByTestId('admin.push.submit')).toHaveTextContent('Push desligado');
  });

  it('ESTIMATE_CHANGED: explica, recalcula e não fecha o envio como feito', async () => {
    let post = 0;
    vi.stubGlobal('fetch', mockFetch(
      (url) => (url.pathname.endsWith('/admin/regions/cities') ? json(page([city])) : undefined),
      (url) => (url.pathname.endsWith('/admin/categories') ? json({ data: [], nextCursor: null, icons: [] }) : undefined),
      (url) => (url.pathname.endsWith('/admin/push/estimate') ? json(estimate()) : undefined),
      (url, init) => (url.pathname.endsWith('/campaigns') && init.method === 'POST' ? ((post += 1), json({ code: 'ESTIMATE_CHANGED', title: 'x', status: 409 }, 409)) : json(page([]))),
    ).impl);
    renderPanel(<PushPage />);
    await fillCampaign();
    await screen.findByText('412 pessoas');
    await userEvent.click(screen.getByTestId('admin.push.submit'));
    await userEvent.click(screen.getByTestId('admin.push.send-confirm'));
    expect(await screen.findByTestId('admin.push.send-error')).toHaveTextContent('O número de pessoas mudou');
    expect(post).toBe(1);
  });

  it('suporte e financeiro não veem a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<PushPage />, 'support');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});

const coupon = (over: object = {}) => ({ id: 'k1', code: 'BEMVINDO10', kind: 'percent', value: 10, percentCapCents: 2000, minOrderCents: 5000, startsAt: PAST, endsAt: FUTURE, maxUses: 100, perCustomerLimit: 1, firstPurchaseOnly: true, active: true, status: 'live', uses: 12, discountTotal: { amount: 9800, currency: 'BRL' }, orders: 12, notice: 'O desconto é pago pelo Webag.', createdAt: PAST, ...over });

describe('CouponsPage (WB-116)', () => {
  it('mostra o teto de custo (maxCost) e, em "Ver uso por loja", o uso por loja (DT-059, WB-116 C5)', async () => {
    const detail = { ...coupon(), maxCost: { amount: 200000, currency: 'BRL' }, usesByStore: [{ storeId: 's1', storeName: 'Casa Bela', uses: 8, discount: { amount: 7000, currency: 'BRL' }, sharePct: 66.7 }, { storeId: 's2', storeName: null, uses: 4, discount: { amount: 2800, currency: 'BRL' }, sharePct: 33.3 }] };
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/admin/coupons/k1') ? json(detail) : json(page([coupon({ maxCost: { amount: 200000, currency: 'BRL' } }), coupon({ id: 'k2', code: 'ANTIGO', maxUses: null, maxCost: null })])))).impl);
    renderPanel(<CouponsPage />, 'finance');
    expect(await screen.findByTestId('admin.cupons.row-k1-maxcost')).toHaveTextContent('até R$');
    expect(screen.getByTestId('admin.cupons.row-k2')).toHaveTextContent('Sem limite de usos (cupom antigo)');
    expect(screen.getByTestId('admin.cupons.row-k2-maxcost')).toHaveTextContent('Sem teto');
    await userEvent.click(screen.getByTestId('admin.cupons.row-k1-usage'));
    expect(await screen.findByTestId('admin.cupons.usage-s1')).toHaveTextContent('Casa Bela');
    expect(screen.getByTestId('admin.cupons.usage-s1')).toHaveTextContent('66,7%');
    expect(screen.getByTestId('admin.cupons.usage-s2')).toHaveTextContent('Loja sem nome');
  });

  it('lista com custo e uso; financeiro lê sem editar', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([coupon()]))).impl);
    renderPanel(<CouponsPage />, 'finance');
    const row = await screen.findByTestId('admin.cupons.row-k1');
    expect(row).toHaveTextContent('10% de desconto, até R$');
    expect(row).toHaveTextContent('12 de');
    expect(screen.queryByTestId('admin.cupons.new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.cupons.row-k1-switch')).not.toBeInTheDocument();
  });

  it('criar valida o código e o percentual; envia centavos', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'POST' ? json(coupon(), 201) : json(page([]))));
    vi.stubGlobal('fetch', impl);
    renderPanel(<CouponsPage />);
    await userEvent.click(await screen.findByTestId('admin.cupons.new'));
    await userEvent.click(screen.getByTestId('admin.cupons.submit'));
    expect(await screen.findByText('Use de 4 a 20 letras ou números, sem espaço.')).toBeInTheDocument();
    expect(screen.getByText('Digite o percentual de 1 a 100.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.cupons.code-input'), 'frete10');
    await userEvent.selectOptions(screen.getByTestId('admin.cupons.kind-select'), 'fixed');
    await userEvent.type(screen.getByTestId('admin.cupons.value-input'), '10,50');
    await userEvent.type(screen.getByLabelText('Começa em'), '2030-01-01T09:00');
    await userEvent.type(screen.getByLabelText('Termina em'), '2030-02-01T09:00');
    // DT-059: o limite de usos é obrigatório; sem ele nada é enviado
    await userEvent.click(screen.getByTestId('admin.cupons.submit'));
    expect(await screen.findByText('Informe o limite de usos. Todo cupom da plataforma precisa de um teto.')).toBeInTheDocument();
    expect(calls.find((c) => c.init.method === 'POST')).toBeUndefined();
    await userEvent.type(screen.getByLabelText(/Limite de usos/), '200');
    await userEvent.click(screen.getByTestId('admin.cupons.submit'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'POST')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'POST')!.init.body as string)).toMatchObject({ code: 'FRETE10', kind: 'fixed', value: 1050, maxUses: 200, perCustomerLimit: 1 });
  });
});
