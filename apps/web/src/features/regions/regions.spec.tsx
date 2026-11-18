import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { parseBulk } from './city-detail';
import { RegionsPage } from './regions-page';

const city = (over: object = {}) => ({ id: 'c1', name: 'Caieiras', state: 'SP', slug: 'caieiras-sp', active: true, neighborhoods: [{ id: 'n1', cityId: 'c1', name: 'Centro', active: true }], ...over });

afterEach(() => vi.unstubAllGlobals());

describe('parseBulk', () => {
  it('ignora linhas vazias, repetidas e marca as que já existem', () => {
    const rows = parseBulk('Centro\n\n  Vila Rosa \nvila rosa\nJardim  Alegria', ['Centro']);
    expect(rows).toEqual([
      { name: 'Centro', duplicate: true },
      { name: 'Vila Rosa', duplicate: false },
      { name: 'vila rosa', duplicate: true },
      { name: 'Jardim Alegria', duplicate: false },
    ]);
  });
});

describe('RegionsPage (AD1)', () => {
  it('mostra skeleton e depois a tabela com as cidades', async () => {
    const { impl } = mockFetch((url) => (path(url) === 'admin/regions/cities' ? json({ data: [city(), city({ id: 'c2', name: 'Cajamar', active: false, neighborhoods: [] })], nextCursor: null }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderPanel(<RegionsPage />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(await screen.findByText('Caieiras (SP)')).toBeInTheDocument();
    expect(screen.getByText('1 de 1 ativos')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Caieiras, ativa' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Cajamar, inativa' })).not.toBeChecked();
  });

  it('estado vazio tem o próximo passo', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ data: [], nextCursor: null })).impl);
    renderPanel(<RegionsPage />);
    expect(await screen.findByText('Nenhuma cidade cadastrada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Adicionar cidade' }).length).toBeGreaterThan(0);
  });

  it('erro de carregamento oferece "Tentar de novo"', async () => {
    let fail = true;
    vi.stubGlobal('fetch', mockFetch(() => (fail ? json({ code: 'INTERNAL_ERROR', title: 'Erro', status: 500 }, 500) : json({ data: [city()], nextCursor: null }))).impl);
    renderPanel(<RegionsPage />);
    expect(await screen.findByText('Não conseguimos carregar agora')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Caieiras (SP)')).toBeInTheDocument();
  });

  it('fechar a cidade pede confirmação e só então chama a API', async () => {
    const { impl, calls } = mockFetch((url, init) => (path(url) === 'admin/regions/cities' && init.method === 'GET' ? json({ data: [city()], nextCursor: null }) : undefined), (url, init) => (init.method === 'PATCH' ? json(city({ active: false })) : undefined));
    vi.stubGlobal('fetch', impl);
    renderPanel(<RegionsPage />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Caieiras, ativa' }));
    const dialog = screen.getByRole('dialog', { name: 'Fechar Caieiras?' });
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
    await userEvent.click(within(dialog).getByTestId('admin.regioes.close-confirm'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PATCH')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'PATCH')!.init.body as string)).toEqual({ active: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('adicionar cidade repetida mostra o erro no campo', async () => {
    const { impl } = mockFetch((url, init) => (init.method === 'POST' ? json({ code: 'CITY_EXISTS', title: 'Cidade já cadastrada', status: 409 }, 409) : json({ data: [city()], nextCursor: null })));
    vi.stubGlobal('fetch', impl);
    renderPanel(<RegionsPage />);
    await userEvent.click(await screen.findByTestId('admin.regioes.add-city'));
    await userEvent.type(screen.getByLabelText('Nome'), 'Caieiras');
    await userEvent.click(screen.getByTestId('admin.regioes.city-submit'));
    expect(await screen.findByText('Essa cidade já está na lista.')).toBeInTheDocument();
  });

  it('nome vazio mostra o erro ao tocar, sem chamar a API', async () => {
    const { impl, calls } = mockFetch(() => json({ data: [city()], nextCursor: null }));
    vi.stubGlobal('fetch', impl);
    renderPanel(<RegionsPage />);
    await userEvent.click(await screen.findByTestId('admin.regioes.add-city'));
    await userEvent.click(screen.getByTestId('admin.regioes.city-submit'));
    expect(screen.getByText('Digite o nome da cidade.')).toBeInTheDocument();
    expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(0);
  });

  it('perfil sem acesso (financeiro) vê "Você não tem acesso a essa área"', () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ data: [], nextCursor: null })).impl);
    renderPanel(<RegionsPage />, 'finance');
    expect(screen.getByText('Você não tem acesso a essa área')).toBeInTheDocument();
  });

  it('falha de salvar (5xx) mostra o texto de falha fechada da auditoria', async () => {
    const { impl } = mockFetch((url, init) => (init.method === 'PATCH' ? json({ code: 'INTERNAL_ERROR', title: 'Erro', status: 500 }, 500) : json({ data: [city()], nextCursor: null })));
    vi.stubGlobal('fetch', impl);
    renderPanel(<RegionsPage />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Caieiras, ativa' }));
    await userEvent.click(screen.getByTestId('admin.regioes.close-confirm'));
    expect(await screen.findByText('Não foi possível registrar na auditoria. Por segurança, nada foi alterado.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
