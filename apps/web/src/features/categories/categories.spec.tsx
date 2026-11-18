import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { CategoriesPage, moveWithin } from './categories-page';

const cat = (id: string, name: string, position: number, over: object = {}) => ({ id, name, icon: 'tag', parentId: null, position, active: true, ...over });
const tree = { data: [{ ...cat('a', 'Calçados', 0), children: [cat('a1', 'Tênis', 0, { parentId: 'a', icon: 'sneaker' })] }, { ...cat('b', 'Mercado', 1), children: [] }], icons: ['tag', 'sneaker', 'basket'], nextCursor: null };

afterEach(() => vi.unstubAllGlobals());

describe('moveWithin', () => {
  it('troca com o vizinho e não passa das pontas', () => {
    expect(moveWithin(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveWithin(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveWithin(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });
});

describe('CategoriesPage (AD2)', () => {
  it('lista a árvore e expande subcategorias', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(tree)).impl);
    renderPanel(<CategoriesPage />);
    expect(await screen.findByText('Calçados')).toBeInTheDocument();
    expect(screen.queryByText('Tênis')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Calçados' }));
    expect(screen.getByText('Tênis')).toBeInTheDocument();
  });

  it('reordenar com os botões envia a nova ordem dos irmãos', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'PUT' ? json(undefined, 204) : json(tree)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<CategoriesPage />);
    await userEvent.click(await screen.findByTestId('admin.categorias.category-b-up'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PUT')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'PUT')!.init.body as string)).toEqual({ ids: ['b', 'a'] });
    expect(await screen.findByText('Ordem salva.')).toBeInTheDocument();
  });

  it('o primeiro item não sobe e o último não desce (sem item inerte sem motivo: o rótulo explica)', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(tree)).impl);
    renderPanel(<CategoriesPage />);
    expect(await screen.findByTestId('admin.categorias.category-a-up')).toBeDisabled();
    expect(screen.getByTestId('admin.categorias.category-b-down')).toBeDisabled();
  });

  it('nova categoria exige nome e ícone e mostra a prévia', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(tree)).impl);
    renderPanel(<CategoriesPage />);
    await userEvent.click(await screen.findByTestId('admin.categorias.new-category'));
    await userEvent.click(screen.getByTestId('admin.categorias.submit'));
    expect(screen.getByText('Digite o nome da categoria.')).toBeInTheDocument();
    expect(screen.getByText('Escolha um ícone.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nome'), 'Brinquedos');
    expect(screen.getByText('10 de 30')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.categorias.icon-basket'));
    expect(screen.getByTestId('admin.categorias.icon-basket')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('admin.categorias.preview')).toHaveTextContent('Brinquedos');
  });

  it('nome repetido no mesmo nível mostra o erro no campo', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (init.method === 'POST' ? json({ code: 'CATEGORY_NAME_TAKEN', title: 'x', status: 409 }, 409) : json(tree))).impl);
    renderPanel(<CategoriesPage />);
    await userEvent.click(await screen.findByTestId('admin.categorias.new-category'));
    await userEvent.type(screen.getByLabelText('Nome'), 'Mercado');
    await userEvent.click(screen.getByTestId('admin.categorias.icon-tag'));
    await userEvent.click(screen.getByTestId('admin.categorias.submit'));
    expect(await screen.findByText('Já existe uma categoria com esse nome aqui.')).toBeInTheDocument();
  });

  it('excluir categoria com subcategorias explica e oferece inativar, sem chamar a API', async () => {
    const { impl, calls } = mockFetch(() => json(tree));
    vi.stubGlobal('fetch', impl);
    renderPanel(<CategoriesPage />);
    await userEvent.click(await screen.findByTestId('admin.categorias.category-a-menu'));
    await userEvent.click(screen.getByTestId('admin.categorias.category-a-delete'));
    expect(screen.getByTestId('admin.categorias.delete-blocked')).toHaveTextContent('Não dá para excluir Calçados.');
    expect(calls.some((c) => c.init.method === 'DELETE')).toBe(false);
  });

  it('se a API recusar a exclusão por vínculos (409), cai no mesmo aviso', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (init.method === 'DELETE' ? json({ code: 'CATEGORY_IN_USE', title: 'x', status: 409 }, 409) : json(tree))).impl);
    renderPanel(<CategoriesPage />);
    await userEvent.click(await screen.findByTestId('admin.categorias.category-b-menu'));
    await userEvent.click(screen.getByTestId('admin.categorias.category-b-delete'));
    await userEvent.click(screen.getByTestId('admin.categorias.delete-confirm'));
    expect(await screen.findByTestId('admin.categorias.delete-blocked')).toBeInTheDocument();
  });

  it('estado vazio oferece "Nova categoria"', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ data: [], icons: [], nextCursor: null })).impl);
    renderPanel(<CategoriesPage />);
    expect(await screen.findByText('Nenhuma categoria ainda')).toBeInTheDocument();
  });
});
