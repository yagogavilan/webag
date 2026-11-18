import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ProfilePage } from './profile-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lojista/loja/perfil' }));

const profile = { id: 's1', name: 'Casa Bela', description: 'Roupas e acessórios', whatsapp: '11987654321', mainCategoryId: 'c1', extraCategoryIds: [], logo: null, cover: null, pendingReview: false, document: '12345678909', documentType: 'cpf' };
const categories = { data: [{ id: 'c1', name: 'Moda', icon: 'tag', parentId: null, position: 0, active: true, children: [] }, { id: 'c2', name: 'Casa', icon: 'house', parentId: null, position: 1, active: true, children: [] }], nextCursor: null };

function setup(pendingReview = false) {
  const store = fakeStore({ status: 'approved', step: 4, name: 'Casa Bela' });
  return mockFetch(
    (url, init) => (url.pathname === '/api/proxy/lojista/stores/s1/profile' && init.method === 'PATCH' ? json({ ...profile, pendingReview }) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1/settings' ? json({ isOpenNow: true, hours: [], holidays: [], pause: { active: false, until: null, indefinitely: false }, delivery: {}, pickup: {}, exchangePolicy: {}, lowStockThreshold: 5 }) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/stores/s1' ? json(profile) : undefined),
    (url) => (url.pathname === '/api/proxy/lojista/categories' ? json(categories) : undefined),
    ...storeHandlers(store),
  );
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => push.mockClear());

describe('Perfil da loja (C2)', () => {
  it('mostra o CPF mascarado, atualiza a prévia ao digitar e salva sem pedir análise', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProfilePage />);
    expect(await screen.findByTestId('lojista.perfil.document')).toHaveTextContent('•••••••8909');
    const description = screen.getByTestId('lojista.perfil.description-input');
    await userEvent.clear(description);
    await userEvent.type(description, 'Moda feminina');
    expect(screen.getByTestId('lojista.perfil.preview')).toHaveTextContent('Moda feminina');
    await userEvent.click(screen.getByTestId('lojista.perfil.submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/loja'));
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init.body))).toMatchObject({ name: 'Casa Bela', description: 'Moda feminina', mainCategoryId: 'c1', whatsapp: '11987654321' });
    expect(screen.queryByTestId('lojista.perfil.rename-dialog')).not.toBeInTheDocument();
  });

  it('mudar o nome de loja aprovada pede confirmação de nova análise', async () => {
    const { impl, calls } = setup(true);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProfilePage />);
    const name = await screen.findByTestId('lojista.perfil.name-input');
    await userEvent.clear(name);
    await userEvent.type(name, 'Casa Bela Moda');
    await userEvent.click(screen.getByTestId('lojista.perfil.submit'));
    expect(await screen.findByText('Mudar o nome precisa de nova análise.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
    await userEvent.click(screen.getByTestId('lojista.perfil.rename-confirm'));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
  });

  it('valida nome e WhatsApp antes de enviar; arquivo grande é recusado antes do recorte', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    renderLojista(<ProfilePage />);
    const whatsapp = await screen.findByTestId('lojista.perfil.whatsapp-input');
    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, '119');
    await userEvent.click(screen.getByTestId('lojista.perfil.submit'));
    expect(await screen.findByText('Digite o WhatsApp com DDD e 9 dígitos.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);

    const big = new File([new Uint8Array(8 * 1024 * 1024)], 'capa.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('lojista.perfil.cover-file'), big);
    expect(await screen.findByTestId('lojista.perfil.image-error')).toHaveTextContent('Esse arquivo tem 8 MB. O máximo é 5 MB.');
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
    await userEvent.upload(screen.getByTestId('lojista.perfil.logo-file'), gif, { applyAccept: false });
    expect(screen.getByTestId('lojista.perfil.image-error')).toHaveTextContent('Use uma foto JPG, PNG ou WebP.');
  });
});
