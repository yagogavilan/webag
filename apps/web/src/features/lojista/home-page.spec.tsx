import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import type { MerchantStore } from '@/lib/api/lojista';
import { LojistaHome } from './home-page';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), usePathname: () => '/lojista' }));

const T = (id: string) => screen.getByTestId(`lojista.inicio.${id}`);

function setup(store: MerchantStore | null, extra: Parameters<typeof mockFetch> = []) {
  const { impl, calls } = mockFetch(...extra, ...storeHandlers(store));
  vi.stubGlobal('fetch', impl);
  renderLojista(<LojistaHome />);
  return calls;
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('L8: acompanhar a aprovação', () => {
  it('em análise: linha do tempo de 3 passos, prazo da configuração e data de envio', async () => {
    setup(fakeStore({ status: 'in_review', step: 4, name: 'Casa Bela', legalType: 'cpf', document: '52998224725', submittedAt: '2026-11-18T13:15:00Z', slaBusinessDays: 2 }));
    expect(await screen.findByRole('heading', { name: 'Sua loja está em análise' })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Andamento da análise' });
    expect(steps).toHaveTextContent('Enviada');
    expect(steps).toHaveTextContent('Em análise');
    expect(steps).toHaveTextContent('Resposta');
    expect(screen.getByText('Respondemos em até 2 dias úteis.')).toBeInTheDocument();
    expect(screen.getByText(/Enviado em 18 nov, 10:15\./)).toBeInTheDocument();
    expect(T('summary')).toBeInTheDocument();
  });

  it('rascunho ou sem loja: leva direto à etapa em que parou', async () => {
    setup(fakeStore({ status: 'draft', step: 2 }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/onboarding/3'));
  });

  it('funcionário vê o status mas não o resumo do cadastro', async () => {
    setup(fakeStore({ status: 'in_review', role: 'staff', step: 4 }));
    await screen.findByRole('heading', { name: 'Sua loja está em análise' });
    expect(screen.queryByTestId('lojista.inicio.summary')).toBeNull();
  });

  it('correção pedida: motivo por item, "Corrigir" em cada um; reenviar com item pendente rola ao primeiro e diz o que falta', async () => {
    const calls = setup(
      fakeStore({
        status: 'correction_requested',
        step: 4,
        corrections: [
          { id: 'c1', target: { type: 'document', kind: 'id_back' }, message: 'A foto do verso está cortada. Tire outra foto.', fixed: false },
          { id: 'c2', target: { type: 'store_data' }, message: 'O WhatsApp não funciona.', fixed: true },
        ],
      }),
    );
    expect(await screen.findByText('Precisamos de uma correção.')).toBeInTheDocument();
    expect(T('correction-c1')).toHaveTextContent('A foto do verso está cortada.');
    expect(screen.queryByTestId('lojista.inicio.correction-c2')).toBeNull();
    await userEvent.click(T('resubmit'));
    expect(T('missing')).toHaveTextContent('Falta corrigir: A foto do verso está cortada.');
    expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }));
    expect(push).toHaveBeenCalledWith('/lojista/correcao');
  });

  it('correção toda feita (a API não lista mais itens abertos): avisa e reenvia para análise', async () => {
    const calls = setup(
      fakeStore({ status: 'correction_requested', step: 4, corrections: [{ id: 'c1', target: { type: 'document', kind: 'id_back' }, message: 'x', fixed: true }] }),
      [(url) => (url.pathname.endsWith('/submit') ? json(null, 204) : undefined)],
    );
    await userEvent.click(await screen.findByTestId('lojista.inicio.resubmit'));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(true));
  });

  it('recusada: motivo do admin e suporte', async () => {
    setup(fakeStore({ status: 'rejected', step: 4, decisionReason: 'Documento inválido.' }));
    expect(await screen.findByRole('heading', { name: 'Sua loja não foi aprovada.' })).toBeInTheDocument();
    expect(screen.getByText('Documento inválido.')).toBeInTheDocument();
    expect(T('support-link')).toHaveTextContent('Falar com o suporte');
  });

  it('aprovada, ainda fora do ar: 3 verificações e as tarefas com progresso', async () => {
    setup(fakeStore({ status: 'approved', step: 4, hasActiveProduct: false, hasHours: true, payout: { status: 'not_connected', maskedAccount: null, simulated: true } }));
    expect(await screen.findByRole('heading', { name: 'Sua loja foi aprovada.' })).toBeInTheDocument();
    expect(screen.getByText('Falta pouco para aparecer no app')).toBeInTheDocument();
    expect(screen.getByText('Loja aprovada (feito)')).toBeInTheDocument();
    expect(screen.getByText('Cadastre 1 produto')).toBeInTheDocument();
    expect(screen.getByText('Conecte o Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Primeiros passos · 1 de 3')).toBeInTheDocument();
    expect(T('no-product')).toHaveTextContent('Cadastre 1 produto para aparecer no app.');
  });

  it('no ar: faixa de destaque com "Para fazer agora" e as vendas só para quem vê valores', async () => {
    setup(fakeStore({ status: 'live', step: 4, name: 'Casa Bela', hasHours: true, payout: { status: 'connected', maskedAccount: 'x', simulated: true } }));
    expect(await screen.findByTestId('lojista.inicio.hero')).toHaveTextContent('Loja aberta');
    expect(await screen.findByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite), Marcos$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para fazer agora' })).toBeInTheDocument();
    expect(await screen.findByTestId('lojista.inicio.all-clear')).toHaveTextContent('Tudo em dia.');
  });

  it('no ar: cartão de avaliação e ranking "Mais vendidos" com "Você recebe" vêm da API (W.6)', async () => {
    const calls: string[] = [];
    setup(fakeStore({ status: 'live', step: 4, name: 'Casa Bela', hasHours: true, payout: { status: 'connected', maskedAccount: 'x', simulated: true } }), [
      (url) => {
        calls.push(url.pathname + url.search);
        if (url.pathname.endsWith('/reviews/summary')) return json({ average: 4.7, total: 12, distribution: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 8 }, withoutReply: 2 });
        if (url.pathname.endsWith('/sales/top-products')) return json({ period: { from: '2026-11-13', to: '2026-11-19' }, data: [{ productId: 'p1', name: 'Camiseta Básica', image: { urls: {} }, units: 14, youReceive: { amount: 28450, currency: 'BRL' } }, { productId: 'p2', name: 'Calça Jeans', image: { urls: {} }, units: 1, youReceive: { amount: 9000, currency: 'BRL' } }] });
        if (/\/finance\/sales/.test(url.pathname)) return json({ gross: { amount: 0, currency: 'BRL' }, orders: 0, averageTicket: { amount: 0, currency: 'BRL' } });
        return undefined;
      },
    ]);
    expect(await screen.findByTestId('lojista.home.reviews')).toHaveTextContent('4,7');
    expect(screen.getByTestId('lojista.home.reviews')).toHaveTextContent('12 avaliações · 2 sem resposta');
    expect(screen.getByTestId('lojista.home.reviews')).toHaveAttribute('href', '/lojista/avaliacoes');
    expect(await screen.findByTestId('lojista.inicio.top-p1')).toHaveTextContent('Camiseta Básica');
    expect(screen.getByTestId('lojista.inicio.top-p1')).toHaveTextContent('14 unidades');
    expect(screen.getByTestId('lojista.inicio.top-p1')).toHaveTextContent('Você recebe');
    expect(screen.getByTestId('lojista.inicio.top-p1')).toHaveTextContent(/R\$\s284,50/);
    expect(screen.getByTestId('lojista.inicio.top-p2')).toHaveTextContent('1 unidade');
    expect(calls.find((c) => c.includes('top-products'))).toMatch(/limit=5/);
  });

  it('no ar, funcionário sem "vendas_valores" e sem "avaliações" não vê ranking nem avaliação', async () => {
    const calls: string[] = [];
    setup(fakeStore({ status: 'live', step: 4, role: 'staff', permissions: ['orders'], name: 'Casa Bela', hasHours: true, payout: { status: 'connected', maskedAccount: 'x', simulated: true } }), [(url) => { calls.push(url.pathname); return undefined; }]);
    await screen.findByTestId('lojista.inicio.hero');
    expect(screen.queryByTestId('lojista.home.reviews')).not.toBeInTheDocument();
    expect(calls.some((c) => c.includes('top-products') || c.includes('reviews/summary'))).toBe(false);
  });

  it('a API manda `approved`: com produto e conta de recebimento conectada o painel do dia ocupa o lugar do passo a passo', async () => {
    setup(fakeStore({ status: 'approved', step: 4, name: 'Casa Bela', hasHours: true, payout: { status: 'connected', maskedAccount: 'x', simulated: true } }), [(url) => (url.pathname.endsWith('/stores/s1/products') ? json({ data: [{ id: 'p1', name: 'Camiseta' }], nextCursor: null }) : undefined)]);
    expect(await screen.findByTestId('lojista.inicio.hero')).toHaveTextContent('Loja no ar');
    expect(screen.queryByText('Falta pouco para aparecer no app')).toBeNull();
  });

  it('aprovada sem produto ou sem conta de recebimento segue no passo a passo', async () => {
    setup(fakeStore({ status: 'approved', step: 4, name: 'Casa Bela', payout: { status: 'not_connected', maskedAccount: null, simulated: true } }), [(url) => (url.pathname.endsWith('/stores/s1/products') ? json({ data: [{ id: 'p1', name: 'Camiseta' }], nextCursor: null }) : undefined)]);
    expect(await screen.findByText('Falta pouco para aparecer no app')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.inicio.hero')).toBeNull();
  });

  it('suspensa: banner de erro com o motivo e suporte', async () => {
    setup(fakeStore({ status: 'suspended', step: 4, decisionReason: 'Muitas reclamações.' }));
    expect(await screen.findByText('Sua loja foi suspensa.')).toBeInTheDocument();
    expect(screen.getByText(/Muitas reclamações\./)).toBeInTheDocument();
  });

  it('erro de rede: "Tentar de novo" e sem acesso (403) usa o estado de acesso', async () => {
    const { impl } = mockFetch((url) => (url.pathname.endsWith('/stores/mine') ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<LojistaHome />);
    expect(await screen.findByText('Não conseguimos carregar agora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('carregando: skeleton acessível', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderLojista(<LojistaHome />);
    expect(screen.getByRole('status', { name: 'Carregando o andamento' })).toBeInTheDocument();
  });
});
