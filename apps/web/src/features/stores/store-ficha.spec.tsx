import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStoreDetail, AdminStoreOverview } from '@/lib/api/admin-stores';
import type { AdminProfile } from '@/lib/session-types';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { StoreCasePage } from './store-case-page';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), usePathname: () => '/admin/lojas/s1' }));

const detail = (): AdminStoreDetail => ({
  store: { id: 's1', status: 'approved', documentType: 'cnpj', document: '12345678000190', legalName: 'Casa Bela Comércio Ltda', name: 'Casa Bela', description: null, phone: null, whatsapp: '11987654321', mainCategoryId: 'c1', address: { cep: '07900-000', street: 'Rua A', number: '10', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' }, logo: null, cover: null, pendingReview: false, submittedAt: '2026-11-16T12:00:00Z', decisionReason: null, createdAt: '2026-11-15T12:00:00Z' },
  owner: { email: 'marcos@casabela.com.br', name: 'Marcos Silva' },
  documents: [{ id: 'd1', kind: 'id_front', uploadedAt: '2026-11-16T11:00:00Z', current: true }],
  reviewItems: [],
  history: [],
  paymentAccount: null,
  sameDocument: [],
});

const overview = (over: Partial<AdminStoreOverview> = {}): AdminStoreOverview => ({
  store: { id: 's1', name: 'Casa Bela', status: 'approved', city: 'Francisco Morato', ownerName: 'Marcos Silva', version: 7, live: true, phone: null, whatsapp: '11987654321', description: 'Casa e decoração' },
  operation: { openNow: true, closesAt: '2026-11-22T21:00:00Z', pause: null },
  commission: { pct: 12, source: 'category', sourceLabel: 'Categoria Casa: 12%' },
  indicators: { empty: false, activeProducts: 14, orders: 22, gmv: { amount: 482050, currency: 'BRL' }, cancellations: { count: 2, pct: 9.1 } },
  recentOrders: [{ id: 'o1', status: 'delivered', total: { amount: 9980, currency: 'BRL' }, createdAt: '2026-11-22T14:02:00Z' }],
  ...over,
});

const history = (data: unknown[] = []) => ({ data, nextCursor: null });
const entry = (id: number, over: Record<string, unknown> = {}) => ({ id, at: '2026-11-22T14:00:00Z', type: 'price', target: { type: 'product', id: 'p1', label: 'Camiseta básica preta' }, actor: { kind: 'admin', name: 'Ana Souza' }, summary: 'Preço alterado', before: { preço: 5200 }, after: { preço: 4990 }, reason: { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' }, restorable: false, restoredByEntryId: null, ...over });

function server(over: { overview?: () => Response; patch?: (body: Record<string, unknown>) => Response; pause?: () => Response; resume?: () => Response; history?: (type: string | null) => Response } = {}) {
  return mockFetch(
    (url) => (path(url) === 'admin/stores/s1' ? json(detail()) : undefined),
    (url) => (path(url) === 'admin/stores/s1/overview' ? (over.overview?.() ?? json(overview())) : undefined),
    (url, init) => (path(url) === 'admin/stores/s1/profile' && init.method === 'PATCH' ? (over.patch?.(JSON.parse(String(init.body))) ?? json({ storeVersion: 8, auditEntryId: 1, merchantNotified: 'now' })) : undefined),
    (url, init) => (path(url) === 'admin/stores/s1/pause' && init.method === 'POST' ? (over.pause?.() ?? json({ storeVersion: 8, auditEntryId: 2, merchantNotified: 'now' })) : undefined),
    (url, init) => (path(url) === 'admin/stores/s1/resume' && init.method === 'POST' ? (over.resume?.() ?? json({ storeVersion: 8, auditEntryId: 3, merchantNotified: 'now' })) : undefined),
    (url) => (path(url) === 'admin/stores/s1/history' ? (over.history?.(url.searchParams.get('type')) ?? json(history())) : undefined),
    (url) => (path(url) === 'view-as' ? undefined : undefined),
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROFILES: [AdminProfile, boolean][] = [
  ['super_admin', true],
  ['operations', true],
  ['finance', false],
  ['support', false],
];

describe('WB-355: o que cada perfil vê na ficha da loja', () => {
  it.each(PROFILES)('%s: edita=%s; todo perfil vê a ficha e "Ver como o lojista"', async (profile, edits) => {
    vi.stubGlobal('fetch', server().impl);
    renderPanel(<StoreCasePage storeId="s1" />, profile);
    expect(await screen.findByTestId('admin.loja.overview')).toBeInTheDocument();
    expect(screen.getByTestId('admin.loja.view-as')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.loja.edit-profile') !== null).toBe(edits);
    expect(screen.queryByTestId('admin.loja.read-only') !== null).toBe(!edits);
    if (!edits) expect(screen.getByText('Você pode ver, mas não editar.')).toBeInTheDocument();
    // Perfil que não edita não tem nenhum botão de escrita (nem desabilitado): pausar, reabrir, suspender.
    await userEvent.click(screen.getByRole('tab', { name: 'Horário e pausa' }));
    expect(screen.queryByTestId('admin.loja.pause') !== null).toBe(edits);
    expect(screen.queryByRole('button', { name: 'Mais ações' }) !== null).toBe(edits);
  });

  it('suporte e financeiro não veem a aba Documentos; super admin e operação veem', async () => {
    vi.stubGlobal('fetch', server().impl);
    const support = renderPanel(<StoreCasePage storeId="s1" />, 'support');
    await screen.findByTestId('admin.loja.overview');
    expect(screen.queryByRole('tab', { name: 'Documentos' })).not.toBeInTheDocument();
    support.unmount();
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    expect(await screen.findByRole('tab', { name: 'Documentos' })).toBeInTheDocument();
  });
});

describe('Resumo (WB-350 C1, C3, C4)', () => {
  it('mostra os 5 números, a comissão com a origem e a caixa de campos que só o lojista altera; não há campo fiscal editável', async () => {
    vi.stubGlobal('fetch', server().impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    const box = await screen.findByTestId('admin.loja.overview');
    expect(within(box).getByText('R$ 4.820,50')).toBeInTheDocument();
    expect(within(box).getByText('22')).toBeInTheDocument();
    expect(within(box).getByText('2 (9.1%)'.replace('.', ','))).toBeInTheDocument();
    expect(within(box).getByText('14')).toBeInTheDocument();
    expect(within(box).getByText('12%')).toBeInTheDocument();
    expect(within(box).getByText('Categoria Casa: 12%')).toBeInTheDocument();
    expect(screen.getByTestId('admin.loja.fixed-note')).toHaveTextContent('CNPJ, razão social, documentos e conta de recebimento só o lojista altera, pelo fluxo de análise.');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile'));
    const dialog = screen.getByTestId('admin.loja.edit-profile-dialog');
    for (const label of ['Nome de exibição', 'Descrição', 'Telefone', 'WhatsApp']) expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/cnpj|cpf|razão social|endereço/i)).not.toBeInTheDocument();
  });

  it('sem pedidos: "Sem pedidos nos últimos 30 dias." e a dica quando não há produto', async () => {
    vi.stubGlobal('fetch', server({ overview: () => json(overview({ indicators: { empty: true, activeProducts: 0, orders: 0, gmv: { amount: 0, currency: 'BRL' }, cancellations: { count: 0, pct: null } }, recentOrders: [] })) }).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    expect(await screen.findByTestId('admin.loja.overview-empty')).toHaveTextContent('Sem pedidos nos últimos 30 dias. A loja ainda não tem produto à venda');
  });

  it('erro e "tentar de novo"', async () => {
    let fail = true;
    vi.stubGlobal('fetch', server({ overview: () => (fail ? json({ code: 'X', title: 'x', status: 500 }, 500) : json(overview())) }).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    expect(await screen.findByText('Não conseguimos carregar esta loja agora')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('admin.loja.overview')).toBeInTheDocument();
  });

  it('a aba vai para a URL', async () => {
    vi.stubGlobal('fetch', server().impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(replace).toHaveBeenCalledWith('/admin/lojas/s1?aba=historico');
  });
});

describe('Editar dados (WB-351 C2, C4, C6, C7)', () => {
  async function openEdit(impl: typeof fetch) {
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.loja.edit-profile'));
  }

  it('motivo obrigatório: o botão fica ativo e diz "Informe o motivo."; "Solicitado pelo lojista" exige canal e data', async () => {
    const mock = server();
    await openEdit(mock.impl);
    await userEvent.clear(screen.getByLabelText('Nome de exibição'));
    await userEvent.type(screen.getByLabelText('Nome de exibição'), 'Casa Bela Decor');
    const save = screen.getByTestId('admin.loja.edit-profile-confirm');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(screen.getByText('Informe o motivo.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'requested_by_merchant');
    await userEvent.click(save);
    expect(screen.getByText('Informe o canal e a data.')).toBeInTheDocument();
    expect(mock.calls.some((c) => path(c.url).endsWith('/profile'))).toBe(false);
  });

  it('salva só o que mudou, com motivo e a versão da ficha; avisa o lojista e guarda o motivo da sessão', async () => {
    let sent: Record<string, unknown> | null = null;
    const mock = server({ patch: (body) => ((sent = body), json({ storeVersion: 8, auditEntryId: 1, merchantNotified: 'now' })) });
    await openEdit(mock.impl);
    await userEvent.clear(screen.getByLabelText('WhatsApp'));
    await userEvent.type(screen.getByLabelText('WhatsApp'), '11999998888');
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'requested_by_merchant');
    await userEvent.type(screen.getByLabelText('Canal e data (ex.: WhatsApp, 24/11)'), 'WhatsApp, 24/11');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    expect(await screen.findByText('Dados alterados. O lojista foi avisado.')).toBeInTheDocument();
    expect(sent).toEqual({ reason: { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' }, expectedVersion: 7, changes: { whatsapp: '11999998888' } });
    expect(window.sessionStorage.getItem('wb:admin:session-reason')).toContain('requested_by_merchant');
    await waitFor(() => expect(screen.queryByTestId('admin.loja.edit-profile')).toBeInTheDocument());
  });

  it('o motivo da sessão volta preenchido na próxima alteração', async () => {
    window.sessionStorage.setItem('wb:admin:session-reason', JSON.stringify({ code: 'requested_by_merchant', note: 'WhatsApp, 24/11' }));
    await openEdit(server().impl);
    expect(screen.getByLabelText('Motivo')).toHaveValue('requested_by_merchant');
    expect(screen.getByLabelText('Canal e data (ex.: WhatsApp, 24/11)')).toHaveValue('WhatsApp, 24/11');
  });

  it('nada mudou: não chama a API', async () => {
    const mock = server();
    await openEdit(mock.impl);
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'error_fix');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    expect(screen.getByText('Nada mudou. Altere um campo para salvar.')).toBeInTheDocument();
    expect(mock.calls.some((c) => path(c.url).endsWith('/profile'))).toBe(false);
  });

  it('409 de versão: avisa que o lojista alterou, nada é sobrescrito, "Recarregar" busca a versão nova e o próximo envio a usa', async () => {
    let version = 7;
    const bodies: Record<string, unknown>[] = [];
    const mock = server({
      overview: () => json(overview({ store: { ...overview().store, version } })),
      patch: (body) => {
        bodies.push(body);
        return body.expectedVersion === 7 ? json({ code: 'STORE_VERSION_CONFLICT', title: 'x', status: 409 }, 409) : json({ storeVersion: 10, auditEntryId: 1, merchantNotified: 'now' });
      },
    });
    await openEdit(mock.impl);
    await userEvent.clear(screen.getByLabelText('Nome de exibição'));
    await userEvent.type(screen.getByLabelText('Nome de exibição'), 'Casa Bela Decor');
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'error_fix');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    expect(await screen.findByTestId('admin.loja.conflict')).toHaveTextContent('O lojista alterou a loja agora');
    expect(screen.getByTestId('admin.loja.edit-profile-confirm')).toBeDisabled();
    version = 9;
    await userEvent.click(screen.getByTestId('admin.loja.conflict-reload'));
    await waitFor(() => expect(screen.getByTestId('admin.loja.edit-profile-confirm')).toBeEnabled());
    expect(screen.getByLabelText('Nome de exibição')).toHaveValue('Casa Bela Decor');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    await screen.findByText('Dados alterados. O lojista foi avisado.');
    expect(bodies.map((b) => b.expectedVersion)).toEqual([7, 9]);
  });

  it('422 de motivo não permitido (flag desligada): a mensagem da API aparece no campo e o texto digitado fica', async () => {
    const mock = server({ patch: () => json({ code: 'REASON_NOT_ALLOWED', title: 'x', status: 422, errors: [{ field: 'reason.code', message: 'Por enquanto a Webag só altera dados da loja a pedido do lojista.' }] }, 422) });
    await openEdit(mock.impl);
    await userEvent.clear(screen.getByLabelText('Nome de exibição'));
    await userEvent.type(screen.getByLabelText('Nome de exibição'), 'Casa Bela Decor');
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'moderation');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    expect(await screen.findByText('Por enquanto a Webag só altera dados da loja a pedido do lojista.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome de exibição')).toHaveValue('Casa Bela Decor');
  });

  it('falha do servidor: texto de falha fechada (nada mudou) e o diálogo continua aberto', async () => {
    const mock = server({ patch: () => json({ code: 'X', title: 'x', status: 500 }, 500) });
    await openEdit(mock.impl);
    await userEvent.clear(screen.getByLabelText('Nome de exibição'));
    await userEvent.type(screen.getByLabelText('Nome de exibição'), 'Casa Bela Decor');
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'error_fix');
    await userEvent.click(screen.getByTestId('admin.loja.edit-profile-confirm'));
    expect(await screen.findByText('Não foi possível registrar na auditoria. Por segurança, nada foi alterado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome de exibição')).toHaveValue('Casa Bela Decor');
  });

  it('sem conexão: botão inerte com o motivo escrito (admin não edita em fila local)', async () => {
    const mock = server();
    await openEdit(mock.impl);
    const spy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      window.dispatchEvent(new Event('offline'));
      await waitFor(() => expect(screen.getByTestId('admin.loja.edit-profile-confirm')).toBeDisabled());
      expect(within(screen.getByTestId('admin.loja.edit-profile-dialog')).getByText('Conecte-se para editar. Nada foi alterado.')).toBeInTheDocument();
    } finally {
      // O gerenciador de rede do TanStack também guarda "offline": volta ao normal para os próximos testes.
      spy.mockRestore();
      window.dispatchEvent(new Event('online'));
    }
  });
});

describe('Horário e pausa (WB-351 C1)', () => {
  it('loja aberta: "Pausar por 2 horas" é o padrão e o botão repete verbo e duração; envia kind, motivo e versão', async () => {
    let sent: Record<string, unknown> | null = null;
    const mock = server({ pause: () => json({ storeVersion: 8, auditEntryId: 2, merchantNotified: 'now' }) });
    const original = mock.impl;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).endsWith('/pause')) sent = JSON.parse(String(init.body));
      return original(input, init);
    });
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByRole('tab', { name: 'Horário e pausa' }));
    expect(screen.getByTestId('admin.loja.open-state')).toHaveTextContent('Loja aberta agora. Fecha às');
    await userEvent.click(screen.getByTestId('admin.loja.pause'));
    expect(screen.getByRole('button', { name: 'Pausar por 2 horas' })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Até reabrir'));
    expect(screen.getByRole('button', { name: 'Pausar até reabrir' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'operational_decision');
    await userEvent.click(screen.getByRole('button', { name: 'Pausar até reabrir' }));
    expect(await screen.findByText('Loja pausada. O lojista foi avisado no painel e por e-mail.')).toBeInTheDocument();
    expect(sent).toEqual({ reason: { code: 'operational_decision' }, expectedVersion: 7, kind: 'until_resume' });
  });

  it('loja pausada: mostra quem pausou e o motivo, só "Reabrir agora", que envia motivo e versão', async () => {
    let sent: Record<string, unknown> | null = null;
    const paused = overview({ operation: { openNow: false, closesAt: null, pause: { until: '2026-11-22T17:30:00Z', by: 'admin', reasonLabel: 'Decisão operacional' } } });
    const mock = server({ overview: () => json(paused), resume: () => json({ storeVersion: 8, auditEntryId: 3, merchantNotified: 'now' }) });
    const original = mock.impl;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).endsWith('/resume')) sent = JSON.parse(String(init.body));
      return original(input, init);
    });
    renderPanel(<StoreCasePage storeId="s1" />, 'super_admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Horário e pausa' }));
    expect(screen.getByTestId('admin.loja.paused')).toHaveTextContent('pela Webag');
    expect(screen.getByTestId('admin.loja.paused')).toHaveTextContent('Motivo: Decisão operacional');
    expect(screen.queryByTestId('admin.loja.pause')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.loja.resume'));
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'error_fix');
    await userEvent.click(within(screen.getByTestId('admin.loja.resume-dialog')).getByRole('button', { name: 'Reabrir agora' }));
    expect(await screen.findByText('Loja reaberta. O lojista foi avisado.')).toBeInTheDocument();
    expect(sent).toEqual({ reason: { code: 'error_fix' }, expectedVersion: 7 });
  });
});

describe('Histórico por loja (WB-350 C4)', () => {
  it('mostra quem, quando, antes e depois e o motivo; o filtro vai à API; não há "Restaurar" nem CSV nesta rodada', async () => {
    const types: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      server({
        history: (type) => {
          types.push(type);
          return json(history(type === 'access' ? [entry(2, { type: 'access', summary: 'Visualização aberta (somente leitura)', before: null, after: null, reason: { code: 'other', note: 'Suporte por telefone' } })] : [entry(1)]));
        },
      }).impl,
    );
    renderPanel(<StoreCasePage storeId="s1" />, 'support');
    await userEvent.click(await screen.findByRole('tab', { name: 'Histórico' }));
    const row = await screen.findByTestId('admin.loja.audit-1');
    expect(row).toHaveTextContent('Preço alterado');
    expect(row).toHaveTextContent('Ana Souza');
    expect(row).toHaveTextContent('Camiseta básica preta');
    expect(row).toHaveTextContent('Solicitado pelo lojista (WhatsApp, 24/11)');
    expect(within(row).getByText(/preço: antes 5200, depois 4990/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restaurar|exportar|csv/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.loja.audit-filter-access'));
    expect(await screen.findByTestId('admin.loja.audit-2')).toHaveTextContent('Visualização aberta');
    expect(types).toContain('access');
    expect(types[0]).toBeNull();
  });

  it('vazio, com a explicação; erro com tentar de novo', async () => {
    let fail = false;
    vi.stubGlobal('fetch', server({ history: () => (fail ? json({ code: 'X', title: 'x', status: 500 }, 500) : json(history())) }).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByTestId('admin.loja.audit-empty')).toHaveTextContent('Nenhuma alteração registrada');
    fail = true;
    await userEvent.click(screen.getByTestId('admin.loja.audit-filter-price'));
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('Ver como o lojista, da ficha', () => {
  it('abre o diálogo com motivo obrigatório e, ao abrir, vai para a visão em Pedidos', async () => {
    const mock = mockFetch(
      (url) => (path(url) === 'admin/stores/s1' ? json(detail()) : undefined),
      (url) => (path(url) === 'admin/stores/s1/overview' ? json(overview()) : undefined),
      (url) => (url.pathname === '/api/view-as/session' ? json({ active: true, id: 'v0', storeId: 'other', expiresAt: new Date(Date.now() + 600_000).toISOString() }) : undefined),
      (url, init) => (url.pathname === '/api/view-as/open' && init.method === 'POST' ? json({ id: 'v1', storeId: 's1', storeName: 'Casa Bela', expiresAt: new Date(Date.now() + 1_800_000).toISOString() }, 201) : undefined),
    );
    vi.stubGlobal('fetch', mock.impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'support');
    await userEvent.click(await screen.findByTestId('admin.loja.view-as'));
    expect(await screen.findByText('Você já tem uma visualização aberta. Abrir esta fecha a anterior.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    expect(screen.getByText('Escolha o motivo para abrir.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'merchant_support');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visualização' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/lojas/s1/ver-como?aba=ped'));
  });
});
