import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReplyReviews, visibleLojistaNav } from '@/lib/lojista-access';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ReviewsPage, replyError, stars } from './reviews-page';
import { ApiError } from '@/lib/api/errors';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/avaliacoes' }));

afterEach(() => vi.unstubAllGlobals());

const review = (over: object = {}) => ({ id: 'r1', rating: 4, comment: 'Chegou bem embalado.', fit: null, reviewer: 'Joana L.', target: { type: 'store', id: 's1', name: 'Casa Bela' }, createdAt: '2026-11-18T12:00:00Z', storeReply: null, storeRepliedAt: null, ...over });
const live = () => storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, name: 'Casa Bela' }));

describe('permissão e menu', () => {
  it('dono e funcionário com "Avaliações" respondem; sem a permissão, não', () => {
    expect(canReplyReviews(fakeStore({ role: 'owner' }))).toBe(true);
    expect(canReplyReviews(fakeStore({ role: 'staff', permissions: ['orders'] }))).toBe(false);
    expect(canReplyReviews(fakeStore({ role: 'staff', permissions: ['orders', 'reviews'] }))).toBe(true);
    expect(visibleLojistaNav(fakeStore({ role: 'staff', permissions: ['orders'] })).some((i) => i.section === 'avaliacoes')).toBe(false);
    expect(visibleLojistaNav(fakeStore({ role: 'owner' })).find((i) => i.section === 'avaliacoes')?.bottomPriority).toBe(5);
  });
  it('estrelas em texto e erros por código', () => {
    expect(stars(4)).toBe('4 de 5 estrelas');
    expect(replyError(new ApiError({ status: 404, title: 'x', code: 'NOT_FOUND' } as never))).toContain('não está mais disponível');
  });
});

describe('avaliações do lojista (WB-195)', () => {
  it('lista com a nota em texto, responde e a lista é relida', async () => {
    let replied: unknown = null;
    let reply: string | null = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/reviews/r1/reply') && init.method === 'PUT') {
          replied = JSON.parse(String(init.body));
          reply = (replied as { text: string }).text;
          return json({ id: 'r1', storeReply: reply, storeRepliedAt: '2026-11-19T10:00:00Z' });
        }
        if (url.pathname.endsWith('/stores/s1/reviews')) return json({ data: [review({ storeReply: reply, storeRepliedAt: reply ? '2026-11-19T10:00:00Z' : null })], nextCursor: null });
        return undefined;
      }, ...live()).impl,
    );
    renderLojista(<ReviewsPage />);
    expect(await screen.findByRole('img', { name: '4 de 5 estrelas' })).toBeInTheDocument();
    expect(screen.getByText('Chegou bem embalado.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.reply-open-r1'));
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.reply-submit-r1'));
    expect(await screen.findByText('Escreva a resposta.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.avaliacoes.reply-input-r1'), 'Obrigado pela avaliação!');
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.reply-submit-r1'));
    expect(await screen.findByTestId('lojista.avaliacoes.reply-r1')).toHaveTextContent('Obrigado pela avaliação!');
    expect(replied).toEqual({ text: 'Obrigado pela avaliação!' });
  });

  it('erro ao publicar mantém o texto e mostra a causa; apagar a resposta pede confirmação', async () => {
    let removed = false;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/reviews/r2/reply') && init.method === 'PUT') return json({ type: 'x', title: 'Limite', status: 429, code: 'RATE_LIMITED' }, 429);
        if (url.pathname.endsWith('/reviews/r3/reply') && init.method === 'DELETE') {
          removed = true;
          return json(null, 204);
        }
        if (url.pathname.endsWith('/stores/s1/reviews')) return json({ data: [review({ id: 'r2' }), review({ id: 'r3', storeReply: 'Valeu!', storeRepliedAt: '2026-11-19T10:00:00Z' })], nextCursor: null });
        return undefined;
      }, ...live()).impl,
    );
    renderLojista(<ReviewsPage />);
    await userEvent.click(await screen.findByTestId('lojista.avaliacoes.reply-open-r2'));
    await userEvent.type(screen.getByTestId('lojista.avaliacoes.reply-input-r2'), 'Oi');
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.reply-submit-r2'));
    expect(await screen.findByTestId('lojista.avaliacoes.reply-error-r2')).toHaveTextContent('Muitas respostas');
    expect(screen.getByTestId('lojista.avaliacoes.reply-input-r2')).toHaveValue('Oi');
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.reply-delete-r3'));
    await userEvent.click(screen.getByTestId('lojista.avaliacoes.delete-confirm'));
    await waitFor(() => expect(removed).toBe(true));
  });

  it('vazio, erro com nova tentativa e sem acesso', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/stores/s1/reviews') ? json({ data: [], nextCursor: null }) : undefined), ...live()).impl);
    const first = renderLojista(<ReviewsPage />);
    expect(await screen.findByTestId('lojista.avaliacoes.empty')).toHaveTextContent('Ainda não há avaliações');
    first.result.unmount();
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/stores/s1/reviews') ? json({ type: 'x', title: 'x', status: 500 }, 500) : undefined), ...live()).impl);
    const second = renderLojista(<ReviewsPage />);
    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    second.result.unmount();
    vi.stubGlobal('fetch', mockFetch(...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, role: 'staff', permissions: ['orders'], name: 'Casa Bela' }))).impl);
    renderLojista(<ReviewsPage />);
    expect(await screen.findByText(/não tem acesso/i)).toBeInTheDocument();
  });
});
