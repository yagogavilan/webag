import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { ViewAsBanner } from './banner';
import { clockLabel, clockText, phaseOf } from './clock';
import { OpenViewAsDialog } from './open-dialog';
import { ViewAsPage } from './view-as-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/admin/lojas/s1/ver-como' }));

const STORE = '11111111-1111-4111-8111-111111111111';
const VIEW = '22222222-2222-4222-8222-222222222222';
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const route = (url: URL) => url.pathname.replace('/api/view-as/', '');

/** Dado que a API NUNCA manda na visão: se um dia chegar por engano, a tela ainda não pode desenhá-lo (defesa em profundidade). */
const FORBIDDEN = ['(11) 98765-4321', '11987654321', '123.456.789-09', '12.345.678/0001-90', 'Rua das Flores', 'Sobrenome Silva', 'Razão Social Ltda', 'comissao-secreta', 'youReceive'];

const ORDER_LIST = {
  data: [
    { id: 'o1', number: 'WB-AB123', status: 'received', mode: 'delivery', createdAt: '2026-11-22T14:02:00Z', paidAt: '2026-11-22T14:02:00Z', acceptDeadlineAt: null, customerFirstName: 'Mariana', itemCount: 2, firstItemName: 'Camiseta básica preta', total: { amount: 9980, currency: 'BRL' }, allowedActions: [], customerPhone: '(11) 98765-4321', customerLastName: 'Sobrenome Silva', cpf: '123.456.789-09', street: 'Rua das Flores' },
    { id: 'o2', number: 'WB-CD456', status: 'out_for_delivery', mode: 'delivery', createdAt: '2026-11-22T13:20:00Z', paidAt: '2026-11-22T13:21:00Z', acceptDeadlineAt: null, customerFirstName: 'Carla', itemCount: 1, firstItemName: 'Vestido floral midi', total: { amount: 12990, currency: 'BRL' }, allowedActions: [] },
  ],
  nextCursor: null,
};

function session(over: Record<string, unknown> = {}) {
  return { active: true, id: VIEW, storeId: STORE, storeName: 'Moda Morato', expiresAt: inMinutes(28), ...over };
}

function viewFetch(handlers: Record<string, () => Response> = {}, state: Record<string, unknown> = session()) {
  return mockFetch((url) => {
    const r = route(url);
    if (r === 'session') return json(state);
    for (const [key, make] of Object.entries(handlers)) if (r === `read/stores/${STORE}${key}`) return make();
    return undefined;
  });
}

beforeEach(() => push.mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('relógio da visão', () => {
  it('minutos cheios, selo de atenção aos 5 min e segundos no último minuto', () => {
    expect(clockText(28 * 60_000)).toBe('Restam 28 min');
    expect(clockText(27 * 60_000 + 1)).toBe('Restam 28 min');
    expect(clockText(45_000)).toBe('Restam 0:45');
    expect(clockLabel(12 * 60_000)).toBe('Tempo restante da visualização: 12 minutos');
    expect(clockLabel(1)).toBe('Tempo restante da visualização: 1 segundo');
    expect(phaseOf(10 * 60_000)).toBe('normal');
    expect(phaseOf(5 * 60_000)).toBe('attention');
    expect(phaseOf(59_000)).toBe('last-minute');
    expect(phaseOf(0)).toBe('ended');
  });
});

describe('banner permanente', () => {
  it('é uma região rotulada com o relógio em role=timer; avisa uma vez aos 5 min e uma vez a 1 min', () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T15:00:00Z') });
    render(<ViewAsBanner storeName="Moda Morato" expiresAt="2026-11-22T15:06:00Z" exiting={false} onExit={() => undefined} />);
    const region = screen.getByRole('region', { name: 'Visualização do admin' });
    expect(within(region).getByText('Visualizando como Moda Morato (somente leitura)')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('Restam 6 min');
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Tempo restante da visualização: 6 minutos');
    expect(screen.getByTestId('admin.ver-como.live')).toHaveTextContent('');

    act(() => void vi.advanceTimersByTime(61_000));
    expect(screen.getByTestId('admin.ver-como.live')).toHaveTextContent('A visualização fecha em 5 minutos.');
    expect(screen.getByRole('timer')).toHaveTextContent('Restam 5 min');

    act(() => void vi.advanceTimersByTime(4 * 60_000));
    expect(screen.getByTestId('admin.ver-como.live')).toHaveTextContent('A visualização fecha em 1 minuto.');
    expect(screen.getByRole('timer')).toHaveTextContent('Restam 0:');
    // O leitor de tela não é interrompido pelo relógio: ele não é uma região viva.
    expect(screen.getByRole('timer')).not.toHaveAttribute('aria-live', 'polite');
  });

  it('"Sair da visualização" chama o callback e trava enquanto sai', async () => {
    const onExit = vi.fn();
    const { rerender } = render(<ViewAsBanner storeName="Loja" expiresAt={inMinutes(20)} exiting={false} onExit={onExit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sair da visualização' }));
    expect(onExit).toHaveBeenCalledOnce();
    rerender(<ViewAsBanner storeName="Loja" expiresAt={inMinutes(20)} exiting onExit={onExit} />);
    expect(screen.getByRole('button', { name: 'Saindo…' })).toBeDisabled();
  });
});

describe('diálogo de abertura', () => {
  const open = (props: Partial<Parameters<typeof OpenViewAsDialog>[0]> = {}) => {
    const onOpened = vi.fn();
    const onClose = vi.fn();
    renderPanel(<OpenViewAsDialog storeId={STORE} storeName="Moda Morato" hasOpen={false} onOpened={onOpened} onClose={onClose} {...props} />);
    return { onOpened, onClose };
  };

  it('motivo obrigatório: sem escolher não chama a API e avisa no campo', async () => {
    const mock = mockFetch();
    vi.stubGlobal('fetch', mock.impl);
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    expect(screen.getByText('Escolha o motivo para abrir.')).toBeInTheDocument();
    expect(mock.calls).toHaveLength(0);
  });

  it('"Outro" pede descrição; manda só código e nota e nunca recebe a credencial', async () => {
    const mock = mockFetch((url, init) => (route(url) === 'open' && init.method === 'POST' ? json({ id: VIEW, storeId: STORE, storeName: 'Moda Morato', expiresAt: inMinutes(30) }, 201) : undefined));
    vi.stubGlobal('fetch', mock.impl);
    const { onOpened } = open();
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    expect(screen.getByText('Descreva o motivo em poucas palavras.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Descreva o motivo (até 200 caracteres)'), 'Lojista sem acesso ao pedido');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledOnce());
    const call = mock.calls.find((c) => route(c.url) === 'open')!;
    expect(JSON.parse(String(call.init.body))).toEqual({ storeId: STORE, reason: { code: 'other', note: 'Lojista sem acesso ao pedido' } });
    expect(JSON.stringify(onOpened.mock.calls)).not.toContain('vas_');
  });

  it.each([
    [429, 'Muitas aberturas. Tente em alguns minutos.'],
    [403, 'Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil.'],
    [500, 'Não conseguimos abrir a visualização agora. Tente de novo em instantes.'],
  ])('erro %i: texto da spec, diálogo aberto e botão volta a funcionar', async (status, text) => {
    vi.stubGlobal('fetch', mockFetch((url) => (route(url) === 'open' ? json({ code: 'X', title: 'x', status }, status) : undefined)).impl);
    const { onOpened } = open();
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'merchant_support');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(onOpened).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abrir visualização' })).toBeEnabled();
    expect(screen.getByLabelText('Motivo')).toHaveValue('merchant_support');
  });

  it('avisa que abrir fecha a visão anterior e reabre com o motivo anterior preenchido', async () => {
    window.sessionStorage.setItem('wb:view-as:last-reason', JSON.stringify({ code: 'investigate_issue' }));
    open({ hasOpen: true, reopen: true });
    expect(screen.getByText('Você já tem uma visualização aberta. Abrir esta fecha a anterior.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveValue('investigate_issue');
    expect(screen.getByText('Mesmo motivo da visualização anterior. Troque se mudou.')).toBeInTheDocument();
  });

  it('Esc fecha o diálogo', async () => {
    const { onClose } = open();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('telas da visão', () => {
  it('Pedidos: primeiro nome, ações do lojista só como etiqueta, itens fora da lista fechada inertes, ficha em outra aba', async () => {
    const mock = viewFetch({ '/orders': () => json(ORDER_LIST) });
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />, 'support');
    expect(await screen.findByText('Pedido WB-AB123')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Visualização do admin' })).toBeInTheDocument();
    expect(screen.getByText('Mariana')).toBeInTheDocument();
    expect(screen.getByText('Aceitar e recusar: só o lojista')).toBeInTheDocument();
    expect(screen.getByText('Marcar como entregue: só o lojista')).toBeInTheDocument();
    // Nada que altera dado é botão: sem Aceitar, Recusar, Entregar, Pausar...
    expect(screen.queryByRole('button', { name: /aceitar|recusar|entreg|pausar|salvar|alterar/i })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Abrir a ficha do pedido WB-AB123 na Webag, em outra aba' });
    expect(link).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // Início e Financeiro: texto inerte com a etiqueta, sem link e sem foco.
    expect(screen.queryByRole('link', { name: /Início|Financeiro/ })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('admin.ver-como.nav-off')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page');
    // O que a API nunca manda não é desenhado, mesmo que chegasse por engano.
    const text = document.body.textContent ?? '';
    for (const bait of FORBIDDEN) expect(text).not.toContain(bait);
  });

  it('Pedidos: detalhes sob demanda mostram bairro, itens e linha do tempo, sem endereço', async () => {
    const detail = { id: 'o1', number: 'WB-AB123', status: 'received', mode: 'delivery', customer: { firstName: 'Mariana', lastName: 'Sobrenome Silva', phone: '11987654321' }, delivery: { neighborhood: 'Centro', street: 'Rua das Flores', etaMinMinutes: 30, etaMaxMinutes: 50 }, items: [{ name: 'Camiseta básica preta', attributes: { Tamanho: 'M' }, quantity: 2, unitPrice: { amount: 4990, currency: 'BRL' }, lineTotal: { amount: 9980, currency: 'BRL' } }], timeline: [{ status: 'received', at: '2026-11-22T14:02:00Z', actor: 'system' }] };
    vi.stubGlobal('fetch', viewFetch({ '/orders': () => json(ORDER_LIST), '/orders/o1': () => json(detail) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    await userEvent.click(await screen.findByTestId('admin.ver-como.order-WB-AB123-toggle'));
    expect(await screen.findByText('Bairro: Centro')).toBeInTheDocument();
    expect(screen.getByText(/2x Camiseta básica preta \(M\)/)).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const bait of FORBIDDEN) expect(text).not.toContain(bait);
  });

  it('Pedidos vazio: texto próprio e o banner continua', async () => {
    vi.stubGlobal('fetch', viewFetch({ '/orders': () => json({ data: [], nextCursor: null }) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    expect(await screen.findByText('Nenhum pedido nesta loja ainda')).toBeInTheDocument();
    expect(screen.getByText('Quando a loja receber pedidos, eles aparecem aqui.')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('erro: mensagem da spec, relógio visível, "Tentar de novo" refaz a leitura', async () => {
    let fail = true;
    const mock = viewFetch({ '/orders': () => (fail ? json({ code: 'X', title: 'x', status: 500 }, 500) : json(ORDER_LIST)) });
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    expect(await screen.findByText('Não conseguimos carregar esta tela')).toBeInTheDocument();
    expect(screen.getByText(/O tempo da visualização continua correndo/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Pedido WB-AB123')).toBeInTheDocument();
  });

  it('rota fora da lista (VIEW_AS_READ_ONLY) vira "Esta parte é só do lojista.", nunca tela de erro', async () => {
    vi.stubGlobal('fetch', viewFetch({ '/orders': () => json({ code: 'VIEW_AS_READ_ONLY', title: 'x', status: 403 }, 403) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    expect(await screen.findByText('Esta parte é só do lojista.')).toBeInTheDocument();
    expect(screen.queryByText('VIEW_AS_READ_ONLY')).not.toBeInTheDocument();
  });

  it('VIEW_AS_EXPIRED: some o banner e todo dado, aparece "A visualização terminou" com foco no título', async () => {
    const mock = viewFetch({ '/orders': () => json({ code: 'VIEW_AS_EXPIRED', title: 'x', status: 403 }, 403) });
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    // a API encerrou: o cookie some, e a próxima leitura do estado volta inativa
    mock.calls.length = 0;
    const heading = await screen.findByRole('heading', { name: 'A visualização terminou' });
    expect(heading).toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('region', { name: 'Visualização do admin' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pedido WB-AB123')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a ficha da loja' })).toHaveAttribute('href', `/admin/lojas/${STORE}`);
    expect(screen.getByRole('button', { name: 'Abrir de novo' })).toBeInTheDocument();
  });

  it('visão inexistente ou de outra loja: "A visualização terminou", sem nenhuma leitura de dados', async () => {
    const mock = viewFetch({}, { active: false });
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="prod" />);
    expect(await screen.findByRole('heading', { name: 'A visualização terminou' })).toBeInTheDocument();
    expect(mock.calls.some((c) => route(c.url).startsWith('read/'))).toBe(false);
  });

  it('visão aberta em outra aba: avisa "Você abriu outra visualização."', async () => {
    let current: Record<string, unknown> = session();
    const mock = mockFetch((url) => (route(url) === 'session' ? json(current) : route(url).startsWith('read/') ? json({ data: [], nextCursor: null }) : undefined));
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="prod" />);
    expect(await screen.findByRole('region', { name: 'Visualização do admin' })).toBeInTheDocument();
    current = session({ id: '33333333-3333-4333-8333-333333333333', storeId: '44444444-4444-4444-8444-444444444444' });
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Você abriu outra visualização.')).toBeInTheDocument();
  });

  it('Produtos: preço e estoque sem "você recebe" nem comissão; ações do lojista como etiqueta', async () => {
    const products = { data: [{ id: 'p1', name: 'Camiseta básica preta', status: 'active', moderationStatus: 'ok', sectionId: null, basePriceCents: 4990, fromPriceCents: 4990, cover: null, availableTotal: 15, low: false, soldOut: false, variantCount: 1, updatedAt: '2026-11-22T10:00:00Z', youReceiveCents: 4000, commissionPct: 12 }], nextCursor: null };
    vi.stubGlobal('fetch', viewFetch({ '/products': () => json(products) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="prod" />);
    expect(await screen.findByText('Camiseta básica preta')).toBeInTheDocument();
    expect(screen.getByText(/15 em estoque/)).toBeInTheDocument();
    expect(screen.getByText('Alterar preço e estoque: só o lojista.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /alterar|estoque|preço|pausar/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/você recebe|comiss|youReceive|40,00/i);
  });

  it('Trocas: motivo por código e prazo; nunca o texto nem as fotos do cliente', async () => {
    const exchanges = { data: [{ id: 'e1', number: 'T-118', orderId: 'o9', orderNumber: 'WB-ZZ999', status: 'requested', type: 'size_color', reasonCode: 'size', method: 'drop_at_store', resolution: 'replace', quantity: 1, item: { name: 'Camiseta básica branca' }, fee: { amount: 0, currency: 'BRL' }, difference: { amount: 0, currency: 'BRL' }, totalDue: { amount: 0, currency: 'BRL' }, answerDeadlineAt: '2026-11-24T10:00:00Z', windowEndsAt: '2026-11-29T10:00:00Z', createdAt: '2026-11-22T10:00:00Z', updatedAt: '2026-11-22T10:00:00Z', description: 'TextoIscaTroca', photos: ['https://x/foto.jpg'] }], nextCursor: null };
    vi.stubGlobal('fetch', viewFetch({ '/exchanges': () => json(exchanges) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="troca" />);
    expect(await screen.findByText('Troca T-118')).toBeInTheDocument();
    expect(screen.getByText(/Tamanho ou cor: Tamanho/)).toBeInTheDocument();
    expect(screen.getByText('O texto e as fotos do cliente não aparecem nesta visualização.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('TextoIscaTroca');
    expect(document.querySelector('img')).toBeNull();
  });

  it('Dados da loja: só o que a API manda; sem CNPJ, razão social, comissão nem contato', async () => {
    const store = { id: STORE, status: 'approved', name: 'Moda Morato', extraCategoryIds: [], pendingReview: false, reviewItems: [], createdAt: '2026-10-01T10:00:00Z', document: '12.345.678/0001-90', legalName: 'Razão Social Ltda', commissionPct: 12, commissionSource: 'comissao-secreta' };
    const settings = { isOpenNow: true, hours: [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }], holidays: [], pause: { active: false, until: null, indefinitely: false }, delivery: { acceptsDelivery: true }, pickup: { enabled: true }, exchangePolicy: { voluntaryDays: 7 }, lowStockThreshold: 3, notifications: { email: 'lojista@exemplo.com' } };
    vi.stubGlobal('fetch', viewFetch({ '': () => json(store), '/settings': () => json(settings) }).impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="loja" />);
    expect(await screen.findByText('Aberta agora', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('segunda: 09:00 às 18:00')).toBeInTheDocument();
    expect(screen.getByText('Entrega e Retirada na loja')).toBeInTheDocument();
    expect(screen.getByText(/CNPJ, razão social, comissão, conta de recebimento e contatos de notificação não aparecem/)).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const bait of [...FORBIDDEN, 'lojista@exemplo.com']) expect(text).not.toContain(bait);
  });

  it('Mais: Trocas, Avaliações e Dados da loja abrem; o resto é linha inerte "Só o lojista"', async () => {
    vi.stubGlobal('fetch', viewFetch().impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="mais" />);
    expect(await screen.findByRole('link', { name: 'Trocas' })).toHaveAttribute('href', `/admin/lojas/${STORE}/ver-como?aba=troca`);
    expect(screen.getByRole('link', { name: 'Avaliações' })).toBeInTheDocument();
    for (const label of ['Equipe e convites', 'Cupons', 'Conversa com clientes', 'Documentos', 'Comanda', 'Notificações da loja', 'Exportações']) {
      expect(screen.getByText(label).closest('a,button')).toBeNull();
    }
    expect(screen.getAllByTestId('admin.ver-como.closed-item')).toHaveLength(7);
  });

  it('"Sair da visualização" encerra, limpa os dados, avisa e volta à ficha da loja', async () => {
    const mock = mockFetch(
      (url) => (route(url) === 'session' ? json(session()) : undefined),
      (url, init) => (route(url) === 'end' && init.method === 'POST' ? json(null, 204) : undefined),
      (url) => (route(url).startsWith('read/') ? json({ data: [], nextCursor: null }) : undefined),
    );
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="prod" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair da visualização' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/lojas/${STORE}`));
    expect(mock.calls.some((c) => route(c.url) === 'end')).toBe(true);
    expect(await screen.findByText('Visualização encerrada.')).toBeInTheDocument();
  });
});

describe('a credencial não vaza (WB-352, ADR-018 D8)', () => {
  it('nenhuma chamada do navegador leva cabeçalho de credencial, `vas_` em URL ou corpo; nada em localStorage ou sessionStorage', async () => {
    const mock = viewFetch({ '/orders': () => json(ORDER_LIST), '/products': () => json({ data: [], nextCursor: null }) });
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<ViewAsPage storeId={STORE} tab="ped" />);
    await screen.findByText('Pedido WB-AB123');
    for (const { url, init } of mock.calls) {
      expect(url.pathname.startsWith('/api/view-as/')).toBe(true);
      expect(url.href).not.toContain('vas_');
      const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      expect(headers).not.toHaveProperty('x-view-as');
      expect(headers).not.toHaveProperty('authorization');
      expect(String(init.body ?? '')).not.toContain('vas_');
    }
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) expect(`${store.key(i)}=${store.getItem(store.key(i)!)}`).not.toContain('vas_');
    }
    expect(document.documentElement.outerHTML).not.toContain('vas_');
  });
});
