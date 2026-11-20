import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStoreDetail, QueueRow } from '@/lib/api/admin-stores';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { buildCorrectionItems, EMPTY_CHECKS, sinceLabel, type Checks } from './catalog';
import { QueuePage } from './queue-page';
import { StoreCasePage } from './store-case-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/admin/lojas' }));

const row = (id: string, over: Partial<QueueRow> = {}): QueueRow => ({ id, name: `Loja ${id}`, status: 'in_review', documentMasked: '***.123.456-**', city: 'Francisco Morato', submittedAt: '2026-11-16T12:00:00Z', overdue: false, holderMismatch: false, ...over });

const detail = (over: Partial<AdminStoreDetail['store']> = {}, extra: Partial<AdminStoreDetail> = {}): AdminStoreDetail => ({
  store: {
    id: 's1',
    status: 'in_review',
    documentType: 'cpf',
    document: '12345678909',
    legalName: null,
    name: 'Casa Bela',
    description: null,
    phone: null,
    whatsapp: '11987654321',
    mainCategoryId: 'c1',
    address: { cep: '07900-000', street: 'Rua A', number: '10', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' },
    logo: null,
    cover: null,
    pendingReview: false,
    submittedAt: '2026-11-16T12:00:00Z',
    decisionReason: null,
    createdAt: '2026-11-15T12:00:00Z',
    ...over,
  },
  owner: { email: 'marcos@casabela.com.br', name: 'Marcos Silva' },
  documents: [{ id: 'd1', kind: 'id_front', uploadedAt: '2026-11-16T11:00:00Z', current: true }],
  reviewItems: [],
  history: [],
  paymentAccount: null,
  sameDocument: [],
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  push.mockClear();
  window.sessionStorage.clear();
});

describe('catalog', () => {
  it('agrupa os problemas por destino e usa o documento escolhido', () => {
    const checks: Checks = { ...EMPTY_CHECKS, legible: { value: 'problem', note: 'Verso cortado.', doc: 'id_back' }, address: { value: 'problem', note: 'CEP não confere.' }, contact: { value: 'problem', note: 'WhatsApp inválido.' } };
    expect(buildCorrectionItems(checks, [])).toEqual([
      { item: 'id_back', reason: 'Verso cortado.' },
      { item: 'store_data', reason: 'CEP não confere. WhatsApp inválido.' },
    ]);
  });
  it('formata há quanto tempo a loja espera', () => {
    const now = new Date('2026-11-18T16:00:00Z');
    expect(sinceLabel('2026-11-17T12:00:00Z', now)).toBe('há 1 d 4 h');
    expect(sinceLabel('2026-11-18T15:00:00Z', now)).toBe('há 1 h');
  });
});

describe('QueuePage (A1)', () => {
  const queue = (rows: QueueRow[], waiting: QueueRow[] = []) =>
    mockFetch((url) => {
      if (path(url) !== 'admin/stores') return undefined;
      return json({ data: url.searchParams.get('status') === 'in_review' ? rows : waiting, nextCursor: null });
    });

  it('mostra a fila com selo de prazo, abre a mais antiga e filtra as atrasadas', async () => {
    vi.stubGlobal('fetch', queue([row('a', { name: 'Casa Bela', overdue: true }), row('b', { name: 'Padaria Sol' })], [row('c', { status: 'correction_requested', name: 'Loja Espera' })]).impl);
    renderPanel(<QueuePage />, 'operations');
    expect(await screen.findByText('Casa Bela')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
    expect(screen.getByText('No prazo')).toBeInTheDocument();
    expect(screen.getByTestId('admin.fila.tab-waiting')).toHaveTextContent('Aguardando lojista (1)');
    expect(screen.getByTestId('admin.fila.analyze-oldest')).toHaveAttribute('href', '/admin/lojas/a');
    await userEvent.click(screen.getByTestId('admin.fila.filter-overdue'));
    expect(screen.queryByText('Padaria Sol')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.fila.tab-waiting'));
    expect(screen.getByText('Nenhuma loja neste filtro.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.fila.filter-all'));
    expect(await screen.findByText('Prazo pausado')).toBeInTheDocument();
  });

  it('busca por nome e oferece limpar quando não acha', async () => {
    vi.stubGlobal('fetch', queue([row('a', { name: 'Casa Bela' })]).impl);
    renderPanel(<QueuePage />, 'super_admin');
    await screen.findByText('Casa Bela');
    await userEvent.type(screen.getByTestId('admin.fila.search-input'), 'padaria');
    expect(screen.getByText('Nenhuma loja neste filtro.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Casa Bela')).toBeInTheDocument();
  });

  it('fila vazia: "Fila em dia"; erro: tentar de novo', async () => {
    vi.stubGlobal('fetch', queue([]).impl);
    const view = renderPanel(<QueuePage />, 'operations');
    expect(await screen.findByText('Fila em dia')).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<QueuePage />, 'operations');
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('suporte vê "Ver" e não tem "Analisar a mais antiga"; financeiro não acessa', async () => {
    vi.stubGlobal('fetch', queue([row('a', { name: 'Casa Bela' })]).impl);
    const view = renderPanel(<QueuePage />, 'support');
    await screen.findByText('Casa Bela');
    expect(screen.getByTestId('admin.fila.row-a-open')).toHaveTextContent('Ver');
    expect(screen.queryByTestId('admin.fila.analyze-oldest')).not.toBeInTheDocument();
    view.unmount();
    renderPanel(<QueuePage />, 'finance');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});

describe('Caso de aprovação (A2)', () => {
  function server(overrides: { approve?: () => Response; detail?: AdminStoreDetail } = {}) {
    return mockFetch(
      (url) => (path(url) === 'admin/stores/s1' ? json(overrides.detail ?? detail()) : undefined),
      (url) => (path(url) === 'admin/stores/s1/documents/d1/access' ? json({ url: 'https://files.test/d1.jpg?sig=1', expiresInSeconds: 300, contentType: 'image/jpeg' }) : undefined),
      (url) => (path(url) === 'admin/stores/s1/approve' ? (overrides.approve?.() ?? json({ id: 's1', status: 'approved' })) : undefined),
      (url) => (path(url) === 'admin/stores/s1/reject' ? json({ id: 's1', status: 'rejected' }) : undefined),
      (url) => (path(url) === 'admin/stores/s1/request-correction' ? json({ id: 's1', status: 'correction_requested' }) : undefined),
      (url) => (path(url) === 'admin/stores' ? json({ data: [row('s2', { name: 'Padaria Sol' })], nextCursor: null }) : undefined),
    );
  }

  it('abre o documento, mascara os dados, só libera "Aprovar" com os 6 itens e decide', async () => {
    const { impl, calls } = server();
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    expect(await screen.findByTestId('admin.caso.doc-image')).toHaveAttribute('src', 'https://files.test/d1.jpg?sig=1');
    const access = calls.find((c) => path(c.url).endsWith('/access'))!;
    expect(JSON.parse(String(access.init.body))).toEqual({ reason: 'initial_review' });
    expect(screen.getByTestId('admin.caso.value-document')).toHaveTextContent('•••••••8909');
    await userEvent.click(screen.getByTestId('admin.caso.reveal-document'));
    expect(screen.getByTestId('admin.caso.value-document')).toHaveTextContent('12345678909');

    const approve = screen.getByTestId('admin.caso.approve');
    expect(approve).toBeDisabled();
    expect(screen.getByText('Confira os 6 itens para aprovar.')).toBeInTheDocument();
    for (const id of ['legible', 'document', 'address', 'category', 'contact', 'duplicate']) await userEvent.click(screen.getByTestId(`admin.caso.check-${id}-ok`));
    expect(screen.getByText('Checklist completa. Aprovar liberado.')).toBeInTheDocument();
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    expect(screen.getByText('Aprovar Casa Bela?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.caso.confirm-approve'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/lojas/s2'));
    expect(calls.some((c) => path(c.url) === 'admin/stores/s1/approve' && c.init.method === 'POST')).toBe(true);
    expect(await screen.findByText('Casa Bela aprovada. Próxima loja da fila.')).toBeInTheDocument();
  });

  it('"Conferir tudo" marca os 6 itens em 1 toque depois de abrir o documento', async () => {
    vi.stubGlobal('fetch', server().impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'super_admin');
    await screen.findByTestId('admin.caso.doc-image');
    await waitFor(() => expect(screen.getByTestId('admin.caso.check-all')).toBeEnabled());
    await userEvent.click(screen.getByTestId('admin.caso.check-all'));
    expect(screen.getByTestId('admin.caso.approve')).toBeEnabled();
  });

  it('"Conferir tudo" fica desabilitado até os 3 documentos serem abertos (H-34)', async () => {
    const docs = ['d1', 'd2', 'd3'].map((id, i) => ({ id, kind: (['id_front', 'id_back', 'address_proof'] as const)[i]!, uploadedAt: '2026-11-16T11:00:00Z', current: true }));
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url) => (path(url) === 'admin/stores/s1' ? json(detail({}, { documents: docs })) : undefined),
        (url) => (/^admin\/stores\/s1\/documents\/d\d\/access$/.test(path(url)) ? json({ url: `https://files.test/${path(url).split('/')[4]}.jpg?sig=1`, expiresInSeconds: 300, contentType: 'image/jpeg' }) : undefined),
      ).impl,
    );
    renderPanel(<StoreCasePage storeId="s1" />, 'super_admin');
    await screen.findByTestId('admin.caso.doc-image');
    const all = screen.getByTestId('admin.caso.check-all');
    expect(all).toBeDisabled();
    expect(screen.getByTestId('admin.caso.check-all-help')).toHaveTextContent('Abra os 2 documentos que faltam');
    await userEvent.click(screen.getByTestId('admin.caso.doc-thumb-d2'));
    await waitFor(() => expect(screen.getByTestId('admin.caso.doc-image')).toHaveAttribute('src', expect.stringContaining('d2.jpg')));
    expect(all).toBeDisabled();
    await userEvent.click(screen.getByTestId('admin.caso.doc-thumb-d3'));
    await waitFor(() => expect(screen.getByTestId('admin.caso.doc-image')).toHaveAttribute('src', expect.stringContaining('d3.jpg')));
    await waitFor(() => expect(screen.getByTestId('admin.caso.check-all')).toBeEnabled(), { timeout: 3000 });
    expect(screen.queryByTestId('admin.caso.check-all-help')).not.toBeInTheDocument();
  });

  const threeDocs = ['d1', 'd2', 'd3'].map((id, i) => ({ id, kind: (['id_front', 'id_back', 'address_proof'] as const)[i]!, uploadedAt: '2026-11-16T11:00:00Z', current: true }));
  const accessOk = (url: string) => (/^admin\/stores\/s1\/documents\/d\d\/access$/.test(path(url)) ? json({ url: `https://files.test/${path(url).split('/')[4]}.jpg?sig=1`, expiresInSeconds: 300, contentType: 'image/jpeg' }) : undefined);

  it('"Aprovar" também espera a abertura de todos os documentos, mesmo com os 6 itens marcados à mão (SEC-188)', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/stores/s1' ? json(detail({}, { documents: threeDocs })) : undefined), accessOk).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await screen.findByTestId('admin.caso.doc-image');
    for (const id of ['legible', 'document', 'address', 'category', 'contact', 'duplicate']) await userEvent.click(screen.getByTestId(`admin.caso.check-${id}-ok`));
    expect(screen.getByTestId('admin.caso.approve')).toBeDisabled();
    expect(screen.getByTestId('admin.caso.approve-help')).toHaveTextContent('Abra os 2 documentos que faltam para aprovar.');
    for (const id of ['d2', 'd3']) {
      await userEvent.click(screen.getByTestId(`admin.caso.doc-thumb-${id}`));
      await waitFor(() => expect(screen.getByTestId('admin.caso.doc-image')).toHaveAttribute('src', expect.stringContaining(`${id}.jpg`)));
    }
    await waitFor(() => expect(screen.getByTestId('admin.caso.approve')).toBeEnabled(), { timeout: 3000 });
  });

  it('409 DOCUMENTS_NOT_REVIEWED: diz qual documento falta, reabre e foca o documento, e trava "Aprovar" até abrir', async () => {
    let blocked = true;
    const { impl, calls } = mockFetch(
      (url) => (path(url) === 'admin/stores/s1' ? json(detail({}, { documents: threeDocs })) : undefined),
      accessOk,
      (url) => (path(url) === 'admin/stores/s1/approve' && blocked ? json({ code: 'DOCUMENTS_NOT_REVIEWED', title: 'Documentos não conferidos', status: 409, detail: 'Abra cada documento antes de aprovar.', errors: [{ field: 'documents.address_proof', message: 'Documento não aberto por você.' }] }, 409) : undefined),
      (url) => (path(url) === 'admin/stores/s1/approve' ? json({ id: 's1', status: 'approved' }) : undefined),
      (url) => (path(url) === 'admin/stores' ? json({ data: [], nextCursor: null }) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await screen.findByTestId('admin.caso.doc-image');
    for (const id of ['d2', 'd3']) {
      await userEvent.click(screen.getByTestId(`admin.caso.doc-thumb-${id}`));
      await waitFor(() => expect(screen.getByTestId('admin.caso.doc-image')).toHaveAttribute('src', expect.stringContaining(`${id}.jpg`)));
    }
    for (const id of ['legible', 'document', 'address', 'category', 'contact', 'duplicate']) await userEvent.click(screen.getByTestId(`admin.caso.check-${id}-ok`));
    await waitFor(() => expect(screen.getByTestId('admin.caso.approve')).toBeEnabled(), { timeout: 3000 });
    const opensOfD3 = () => calls.filter((c) => path(c.url) === 'admin/stores/s1/documents/d3/access').length;
    const before = opensOfD3();
    await userEvent.click(screen.getByTestId('admin.caso.approve'));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-approve'));
    const banner = await screen.findByTestId('admin.caso.not-reviewed');
    expect(banner).toHaveTextContent('Comprovante de endereço');
    expect(banner).toHaveTextContent('A loja não foi aprovada');
    expect(screen.queryByTestId('admin.caso.approve-dialog')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('admin.caso.doc-viewer')).toHaveFocus());
    // a abertura é gravada de novo no servidor
    await waitFor(() => expect(opensOfD3()).toBe(before + 1));
    // com o registro refeito, aprovar volta a funcionar
    blocked = false;
    await waitFor(() => expect(screen.getByTestId('admin.caso.approve')).toBeEnabled());
    await userEvent.click(screen.getByTestId('admin.caso.approve'));
    expect(screen.queryByTestId('admin.caso.not-reviewed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.caso.confirm-approve'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/lojas'));
  });

  it('documento que não abre mostra a frase de leitura com "Tentar de novo" e mantém a conferência em bloco travada', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url) => (path(url) === 'admin/stores/s1' ? json(detail()) : undefined),
        (url) => (path(url) === 'admin/stores/s1/documents/d1/access' ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined),
      ).impl,
    );
    renderPanel(<StoreCasePage storeId="s1" />, 'super_admin');
    const error = await screen.findByTestId('admin.caso.doc-error');
    expect(error).toHaveTextContent('Não abriu o documento');
    expect(error).toHaveTextContent('Tente de novo.');
    expect(error).not.toHaveTextContent('dados estão salvos');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByTestId('admin.caso.check-all')).toBeDisabled();
  });

  it('problema exige o texto e vai ao lojista por item, com o documento certo', async () => {
    const { impl, calls } = server();
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await screen.findByTestId('admin.caso.approve');
    expect(screen.getByTestId('admin.caso.request-correction')).toBeDisabled();
    await userEvent.click(screen.getByTestId('admin.caso.check-legible-problem'));
    await userEvent.click(screen.getByTestId('admin.caso.request-correction'));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-correction'));
    expect(await screen.findByText('Escreva o que está errado em cada item com problema.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.caso.correction-note-legible'), 'O verso está cortado.');
    await userEvent.click(screen.getByTestId('admin.caso.confirm-correction'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const call = calls.find((c) => path(c.url).endsWith('request-correction'))!;
    expect(JSON.parse(String(call.init.body))).toEqual({ items: [{ item: 'id_front', reason: 'O verso está cortado.' }] });
  });

  it('recusar exige motivo', async () => {
    const { impl, calls } = server();
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.caso.reject'));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-reject'));
    expect(calls.some((c) => path(c.url).endsWith('/reject'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Documento inválido' }));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-reject'));
    await waitFor(() => expect(calls.some((c) => path(c.url).endsWith('/reject'))).toBe(true));
    expect(JSON.parse(String(calls.find((c) => path(c.url).endsWith('/reject'))!.init.body))).toEqual({ reason: 'Documento inválido' });
  });

  it('outro admin decidiu antes: mostra o conflito com "Voltar à fila"', async () => {
    vi.stubGlobal('fetch', server({ approve: () => json({ code: 'STORE_ALREADY_DECIDED', title: 'Loja já decidida', status: 409, detail: 'Já decidida por Ana.' }, 409) }).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.caso.check-all'));
    await userEvent.click(screen.getByTestId('admin.caso.approve'));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-approve'));
    expect(await screen.findByText('Já decidida por Ana.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.caso.conflict-back'));
    expect(push).toHaveBeenCalledWith('/admin/lojas');
  });

  it('falha ao salvar mantém o diálogo e a decisão', async () => {
    vi.stubGlobal('fetch', server({ approve: () => json({ code: 'INTERNAL', title: 'x', status: 500 }, 500) }).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByTestId('admin.caso.check-all'));
    await userEvent.click(screen.getByTestId('admin.caso.approve'));
    await userEvent.click(screen.getByTestId('admin.caso.confirm-approve'));
    expect(await screen.findByTestId('decision-error')).toBeInTheDocument();
    expect(screen.getByTestId('admin.caso.approve-dialog')).toBeInTheDocument();
  });

  it('suporte vê os dados sem a aba de documentos nem ações', async () => {
    const { impl, calls } = server();
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'support');
    expect(await screen.findByText('Você pode ver este caso, mas não decidir.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.caso.doc-viewer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.caso.approve')).not.toBeInTheDocument();
    expect(calls.some((c) => path(c.url).endsWith('/access'))).toBe(false);
  });

  it('documento que não abre: erro com tentar de novo', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        (url) => (path(url) === 'admin/stores/s1' ? json(detail()) : undefined),
        (url) => (path(url).endsWith('/access') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined),
      ).impl,
    );
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    expect(await screen.findByTestId('admin.caso.doc-error')).toBeInTheDocument();
  });
});

describe('Loja no admin (A3)', () => {
  it('suspender pede motivo e avisa; reativar volta a loja', async () => {
    const { impl, calls } = mockFetch(
      (url) => (path(url) === 'admin/stores/s1' ? json(detail({ status: 'approved' })) : undefined),
      (url) => (path(url) === 'admin/stores/s1/suspend' ? json({ id: 's1', status: 'suspended' }) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByRole('button', { name: 'Mais ações' }));
    await userEvent.click(screen.getByTestId('admin.loja.suspend'));
    expect(screen.getByText('Suspender Casa Bela?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.loja.suspend-confirm'));
    expect(calls.some((c) => path(c.url).endsWith('/suspend'))).toBe(false);
    await userEvent.type(screen.getByTestId('admin.loja.suspend-reason'), 'Denúncias repetidas de clientes');
    await userEvent.click(screen.getByTestId('admin.loja.suspend-confirm'));
    await waitFor(() => expect(calls.some((c) => path(c.url).endsWith('/suspend'))).toBe(true));
  });

  it('loja suspensa mostra o motivo e "Reativar loja"; suporte não vê ações', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/stores/s1' ? json(detail({ status: 'suspended', decisionReason: 'Produto proibido' })) : undefined)).impl);
    const view = renderPanel(<StoreCasePage storeId="s1" />, 'super_admin');
    expect(await screen.findByTestId('admin.loja.reactivate')).toBeInTheDocument();
    expect(screen.getByText(/Produto proibido/)).toBeInTheDocument();
    view.unmount();
    renderPanel(<StoreCasePage storeId="s1" />, 'support');
    await screen.findByText('Você pode ver esta loja, mas não alterá-la.');
    expect(screen.queryByTestId('admin.loja.reactivate')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Documentos' })).not.toBeInTheDocument();
  });

  it('histórico vazio e com eventos', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/stores/s1' ? json(detail({ status: 'approved' }, { history: [{ from: 'in_review', to: 'approved', at: '2026-11-17T12:00:00Z', reason: null }] })) : undefined)).impl);
    renderPanel(<StoreCasePage storeId="s1" />, 'operations');
    await userEvent.click(await screen.findByRole('tab', { name: 'Histórico' }));
    expect(screen.getByTestId('admin.loja.history')).toHaveTextContent('Aprovada');
  });
});
