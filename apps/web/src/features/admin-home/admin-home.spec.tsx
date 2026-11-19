import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { AdminHome } from './admin-home';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin' }));
afterEach(() => vi.unstubAllGlobals());

const pending = (over: object = {}) => ({ stores: { inReview: 3 }, disputes: { inMediation: 2 }, refunds: { needingAction: 1 }, dataRequests: { open: 4, dueSoon: 1 }, ...over });
const server = (body: object, status = 200) => mockFetch((url) => (url.pathname.endsWith('/admin/overview/pending') ? json(body, status) : undefined), (url) => (url.pathname.endsWith('/admin/logistics/deliveries') ? json({ data: [], nextCursor: null }) : undefined));

describe('Início do admin (W.7)', () => {
  it('mostra as contagens por área, com o prazo dos titulares em texto', async () => {
    vi.stubGlobal('fetch', server(pending()).impl);
    renderPanel(<AdminHome />);
    expect(await screen.findByTestId('admin.home.pending-lojas')).toHaveTextContent('Lojas em análise');
    expect(screen.getByTestId('admin.home.pending-lojas')).toHaveTextContent('3');
    expect(screen.getByTestId('admin.home.pending-disputas')).toHaveTextContent('Disputas em mediação');
    expect(screen.getByTestId('admin.home.pending-estornos')).toHaveTextContent('Estornos que pedem ação');
    expect(screen.getByTestId('admin.home.pending-titulares')).toHaveTextContent('1 vence em até 5 dias');
    expect(screen.getByTestId('admin.home.pending-lojas')).toHaveAttribute('href', '/admin/lojas');
  });

  it('B3: card de alertas abertos com os críticos em texto; sem críticos, sem aviso extra', async () => {
    vi.stubGlobal('fetch', server(pending({ alerts: { open: 5, critical: 2 } })).impl);
    const first = renderPanel(<AdminHome />);
    expect(await screen.findByTestId('admin.home.pending-alertas')).toHaveTextContent('Alertas abertos');
    expect(screen.getByTestId('admin.home.pending-alertas')).toHaveTextContent('2 críticos: agir hoje');
    expect(screen.getByTestId('admin.home.pending-alertas')).toHaveAttribute('href', '/admin/alertas');
    first.unmount();
    vi.stubGlobal('fetch', server(pending({ alerts: { open: 0, critical: 0 } })).impl);
    renderPanel(<AdminHome />);
    expect(await screen.findByTestId('admin.home.pending-alertas')).not.toHaveTextContent('críticos');
  });

  it('área nula (sem permissão) ou fora do menu do perfil não aparece; erro da API deixa só os atalhos', async () => {
    vi.stubGlobal('fetch', server(pending({ refunds: null, dataRequests: null })).impl);
    const first = renderPanel(<AdminHome />, 'operations');
    await screen.findByTestId('admin.home.pending-lojas');
    expect(screen.queryByTestId('admin.home.pending-estornos')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin.home.pending-titulares')).not.toBeInTheDocument();
    first.unmount();
    vi.stubGlobal('fetch', server({ code: 'X', title: 'x', status: 500 }, 500).impl);
    renderPanel(<AdminHome />);
    await screen.findByTestId('admin.home.link-lojas');
    expect(screen.queryByTestId('admin.home.pending')).not.toBeInTheDocument();
  });
});
