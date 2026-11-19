import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { AlertDetailPage, resolveError } from './alert-detail-page';
import { AlertsPage } from './alerts-page';
import { ageText } from './common';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/alertas' }));
afterEach(() => vi.unstubAllGlobals());

const alert = (over: object = {}) => ({
  id: 'a1', kind: 'refund_exhausted', label: 'Estorno recusado pelo provedor', area: 'payments', severity: 'critical', hint: 'Tente de novo ou cubra o estorno.', status: 'open', attemptId: null,
  details: { amountCents: 4590, failures: 5 }, links: { orderId: 'o1', storeId: null, deliveryId: null, exchangeId: null }, createdAt: '2026-11-19T12:00:00Z', resolvedAt: null, resolvedByName: null, resolutionNote: null, ...over,
});
const summary = { open: 3, bySeverity: { critical: 1, warning: 2, info: 0 }, byArea: { payments: 1, orders: 2 }, byKind: [], oldestOpenAt: '2026-11-17T12:00:00Z' };
const kinds = { data: [{ kind: 'refund_exhausted', label: 'Estorno recusado pelo provedor', area: 'payments', severity: 'critical', hint: 'x' }, { kind: 'delivery_late', label: 'Entrega atrasada', area: 'logistics', severity: 'warning', hint: 'y' }], nextCursor: null };

describe('Alertas (B3)', () => {
  it('lista com resumo, gravidade em texto e filtros por estado e tipo enviados à API', async () => {
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url) => {
        if (path(url) === 'admin/alerts/summary') return json(summary);
        if (path(url) === 'admin/alerts/kinds') return json(kinds);
        if (path(url) === 'admin/alerts') {
          queries.push(url.search);
          return json({ data: [alert(), alert({ id: 'a2', label: 'Entrega atrasada', area: 'logistics', severity: 'warning', hint: 'Despache.' })], nextCursor: null });
        }
        return undefined;
      }).impl,
    );
    renderPanel(<AlertsPage />);
    expect(await screen.findByTestId('admin.alertas.row-a1')).toHaveTextContent('Crítico');
    expect(screen.getByTestId('admin.alertas.row-a2')).toHaveTextContent('Atenção');
    expect(screen.getByTestId('admin.alertas.kpi-open')).toHaveTextContent('3');
    expect(screen.getByTestId('admin.alertas.kpi-oldest')).toHaveTextContent('2 dias');
    expect(queries[0]).toContain('status=open');
    await userEvent.click(screen.getByTestId('admin.alertas.filter-resolved'));
    await waitFor(() => expect(queries.some((q) => q.includes('status=resolved'))).toBe(true));
    await userEvent.selectOptions(screen.getByTestId('admin.alertas.kind'), 'delivery_late');
    await waitFor(() => expect(queries.some((q) => q.includes('kind=delivery_late') && q.includes('status=resolved'))).toBe(true));
  });

  it('vazio com próximo passo e erro com tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/alerts' ? json({ data: [], nextCursor: null }) : path(url) === 'admin/alerts/summary' ? json({ ...summary, open: 0, bySeverity: { critical: 0, warning: 0, info: 0 }, oldestOpenAt: null }) : path(url) === 'admin/alerts/kinds' ? json(kinds) : undefined)).impl);
    const first = renderPanel(<AlertsPage />);
    expect(await screen.findByTestId('admin.alertas.empty')).toHaveTextContent('Nenhum alerta aberto');
    first.unmount();
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/alerts' ? json({ code: 'X', title: 'x', status: 500 }, 500) : path(url) === 'admin/alerts/kinds' ? json(kinds) : json({ code: 'X', title: 'x', status: 500 }, 500))).impl);
    renderPanel(<AlertsPage />);
    expect(await screen.findByTestId('admin.alertas.error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('paginação por cursor: "Ver mais" pede a próxima página', async () => {
    const cursors: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      mockFetch((url) => {
        if (path(url) === 'admin/alerts/summary') return json(summary);
        if (path(url) === 'admin/alerts/kinds') return json(kinds);
        if (path(url) === 'admin/alerts') {
          cursors.push(url.searchParams.get('cursor'));
          return url.searchParams.get('cursor') ? json({ data: [alert({ id: 'a9' })], nextCursor: null }) : json({ data: [alert()], nextCursor: 'c1' });
        }
        return undefined;
      }).impl,
    );
    renderPanel(<AlertsPage />);
    await userEvent.click(await screen.findByTestId('admin.alertas.more'));
    expect(await screen.findByTestId('admin.alertas.row-a9')).toBeInTheDocument();
    expect(cursors).toEqual([null, 'c1']);
  });
});

describe('detalhe do alerta e "marcar como resolvido" (WB-113 C2)', () => {
  const server = (state: { body?: unknown; current: object }) =>
    mockFetch((url, init) => {
      if (path(url) === 'admin/alerts/a1/resolve' && init.method === 'POST') {
        state.body = JSON.parse(String(init.body));
        state.current = alert({ status: 'resolved', resolvedAt: '2026-11-19T15:00:00Z', resolvedByName: 'Ana Souza', resolutionNote: 'Cobri o estorno.' });
        return json(state.current);
      }
      if (path(url) === 'admin/alerts/a1') return json(state.current);
      return undefined;
    });

  it('mostra o que fazer, o atalho ao pedido, os dados técnicos e exige a nota antes de enviar', async () => {
    const state: { body?: unknown; current: object } = { current: alert() };
    vi.stubGlobal('fetch', server(state).impl);
    renderPanel(<AlertDetailPage id="a1" />, 'finance');
    expect(await screen.findByTestId('admin.alertas.hint')).toHaveTextContent('Tente de novo ou cubra o estorno.');
    expect(screen.getByTestId('admin.alertas.link-order')).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(screen.getByTestId('admin.alertas.technical')).toHaveTextContent('amountCents');
    await userEvent.click(screen.getByTestId('admin.alertas.resolve'));
    await userEvent.click(screen.getByTestId('admin.alertas.resolve-confirm'));
    expect(await screen.findByText(/Escreva a nota/)).toBeInTheDocument();
    expect(state.body).toBeUndefined();
    await userEvent.type(screen.getByTestId('admin.alertas.resolve-note'), 'Cobri o estorno.');
    await userEvent.click(screen.getByTestId('admin.alertas.resolve-confirm'));
    await waitFor(() => expect(state.body).toEqual({ note: 'Cobri o estorno.' }));
    expect(await screen.findByTestId('admin.alertas.note')).toHaveTextContent('Cobri o estorno.');
    expect(screen.queryByTestId('admin.alertas.resolve')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin.alertas.status')).toHaveTextContent('Resolvido');
  });

  it('suporte só consulta: sem botão, com o motivo em texto; atalho some se o perfil não abre o destino', async () => {
    vi.stubGlobal('fetch', server({ current: alert({ links: { orderId: null, storeId: null, deliveryId: null, exchangeId: 'x1' } }) }).impl);
    renderPanel(<AlertDetailPage id="a1" />, 'support');
    expect(await screen.findByTestId('admin.alertas.read-only')).toHaveTextContent('só consulta');
    expect(screen.queryByTestId('admin.alertas.resolve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.alertas.link-exchange')).not.toBeInTheDocument();
  });

  it('outra pessoa encerrou antes (409) e alerta que o perfil não vê (404) têm texto próprio', async () => {
    expect(resolveError(new ApiError({ status: 409, title: 'x', code: 'ALERT_ALREADY_RESOLVED' }))).toContain('já encerrou');
    expect(resolveError(new ApiError({ status: 404, title: 'x', code: 'NOT_FOUND' }))).toContain('não está mais disponível');
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/alerts/zz' ? json({ code: 'NOT_FOUND', title: 'x', status: 404 }, 404) : undefined)).impl);
    renderPanel(<AlertDetailPage id="zz" />);
    expect(await screen.findByTestId('admin.alertas.not-found')).toBeInTheDocument();
  });
});

describe('idade do alerta', () => {
  it('em minutos, horas e dias', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(ageText('2026-11-19T11:30:00Z', now)).toBe('30 min');
    expect(ageText('2026-11-19T07:00:00Z', now)).toBe('5 h');
    expect(ageText('2026-11-16T12:00:00Z', now)).toBe('3 dias');
  });
});
