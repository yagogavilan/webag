import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { MerchantHelpPage, whatsappLink } from './merchant-help-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/ajuda' }));
afterEach(() => vi.unstubAllGlobals());

const help = (over: object = {}) => ({ audience: 'merchant', contacts: { whatsapp: '11999990000', email: 'ajuda@webag.example', hours: 'Seg a sex, 9h às 18h' }, privacy: { officerName: 'Ana', officerEmail: 'dados@webag.example' }, groups: [{ id: 'g1', label: 'Pedidos', items: [{ id: 'q1', question: 'Como aceito um pedido?', answer: 'Toque em Aceitar.\nVocê tem 10 minutos.' }] }], ...over });

describe('ajuda do lojista (WB-034)', () => {
  it('link do WhatsApp só com dígitos e DDI', () => {
    expect(whatsappLink('11999990000')).toBe('https://wa.me/5511999990000');
    expect(whatsappLink('5511999990000')).toBe('https://wa.me/5511999990000');
    expect(whatsappLink('123')).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
  it('mostra contatos, perguntas do admin e o encarregado; pede audience=merchant', async () => {
    const { impl, calls } = mockFetch((url) => (url.pathname.endsWith('/help') ? json(help()) : undefined), ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4 })));
    vi.stubGlobal('fetch', impl);
    renderLojista(<MerchantHelpPage />);
    expect(await screen.findByTestId('lojista.ajuda.whatsapp')).toHaveAttribute('href', 'https://wa.me/5511999990000');
    expect(screen.getByTestId('lojista.ajuda.hours')).toHaveTextContent('Seg a sex');
    expect(screen.getByText('Como aceito um pedido?')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.ajuda.privacy')).toHaveTextContent('dados@webag.example');
    expect(calls.find((c) => c.url.pathname.endsWith('/help'))!.url.searchParams.get('audience')).toBe('merchant');
  });
  it('sem perguntas publicadas mostra o vazio; erro tem nova tentativa', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/help') ? json(help({ groups: [] })) : undefined)).impl);
    const first = renderLojista(<MerchantHelpPage />);
    expect(await screen.findByTestId('lojista.ajuda.empty')).toBeInTheDocument();
    first.result.unmount();
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/help') ? json({ type: 'x', title: 'x', status: 500 }, 500) : undefined)).impl);
    renderLojista(<MerchantHelpPage />);
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });
});
