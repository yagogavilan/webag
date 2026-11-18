import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ImportPage } from './import-page';
import { SectionsPage } from './sections-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/produtos' }));

type Handler = Parameters<typeof mockFetch>[0];
const store = storeHandlers(fakeStore({ status: 'approved', step: 4 }));
const csvText = 'nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo\r\nCamiseta;Roupas;;49,90;;;;Tamanho: P;;10;CAM-P\r\nBoné;Acessórios;;;;;;;;5;BON\r\n';

afterEach(() => vi.unstubAllGlobals());

describe('Seções (K4)', () => {
  const sections = [
    { id: 'a', name: 'Camisetas', position: 0, productCount: 12 },
    { id: 'b', name: 'Promoções', position: 1, productCount: 0 },
  ];
  const list: Handler = (url, init) => (url.pathname.endsWith('/sections') && (init.method ?? 'GET') === 'GET' ? json({ data: sections, nextCursor: null }) : undefined);

  it('lista com contagem, selo de escondida e "Outros" fixa no fim', async () => {
    vi.stubGlobal('fetch', mockFetch(list, ...store).impl);
    renderLojista(<SectionsPage />);
    const row = await screen.findByTestId('lojista.secoes.section-a');
    expect(row).toHaveTextContent('12 produtos');
    expect(screen.getByTestId('lojista.secoes.section-b')).toHaveTextContent('Escondida: sem produto ativo');
    expect(screen.getByTestId('lojista.secoes.list').lastElementChild).toHaveTextContent('Produtos sem seção ficam aqui.');
    expect(screen.getByTestId('lojista.secoes.section-a-up')).toBeDisabled();
  });

  it('vazio oferece criar seção', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/sections') ? json({ data: [], nextCursor: null }) : undefined), ...store).impl);
    renderLojista(<SectionsPage />);
    expect(await screen.findByText('Nenhuma seção ainda')).toBeInTheDocument();
  });

  it('descer salva a nova ordem', async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const { impl } = mockFetch(list, (url, init) => (url.pathname.endsWith('/sections/order') && init.method === 'PUT' ? (calls.push({ url, init }), json(null, 204)) : undefined), ...store);
    vi.stubGlobal('fetch', impl);
    renderLojista(<SectionsPage />);
    await userEvent.click(await screen.findByTestId('lojista.secoes.section-a-down'));
    expect(await screen.findByText('Ordem salva.')).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ids: ['b', 'a'] });
  });

  it('criar: nome obrigatório, cria a seção e move os produtos marcados', async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const { impl } = mockFetch(
      list,
      (url, init) => (url.pathname.endsWith('/sections') && init.method === 'POST' ? (calls.push({ url, init }), json({ id: 'n', name: 'Bonés', position: 2, productCount: 0 }, 201)) : undefined),
      (url) => (url.pathname.endsWith('/products') ? json({ data: [{ id: 'p1', name: 'Boné Azul', status: 'active', sectionId: null }], nextCursor: null }) : undefined),
      (url, init) => (url.pathname.endsWith('/products/bulk') && init.method === 'POST' ? (calls.push({ url, init }), json({ dryRun: false, willChange: 1, changed: 1, blocked: [] })) : undefined),
      ...store,
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<SectionsPage />);
    await userEvent.click(await screen.findByTestId('lojista.secoes.create'));
    await userEvent.click(screen.getByTestId('lojista.secoes.submit'));
    expect(await screen.findByText('Escreva o nome da seção.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.secoes.name-input'), 'Bonés');
    await userEvent.click(await screen.findByTestId('lojista.secoes.product-p1-check'));
    await userEvent.click(screen.getByTestId('lojista.secoes.submit'));
    expect(await screen.findByText('Seção salva.')).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: 'Bonés' });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ productIds: ['p1'], action: { type: 'move_section', sectionId: 'n' } });
  });

  it('excluir avisa que os produtos vão para Outros', async () => {
    const { impl, calls } = mockFetch(list, (url, init) => (url.pathname.endsWith('/sections/a') && init.method === 'DELETE' ? json(null, 204) : undefined), ...store);
    vi.stubGlobal('fetch', impl);
    renderLojista(<SectionsPage />);
    await userEvent.click(await screen.findByTestId('lojista.secoes.section-a-delete'));
    expect(screen.getByText('Excluir a seção Camisetas?')).toBeInTheDocument();
    expect(screen.getByText('Os 12 produtos vão para Outros.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.secoes.delete-confirm'));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true));
  });
});

describe('Importar planilha (K5)', () => {
  const preview = { totalLines: 2, valid: 1, invalid: 1, errors: [{ line: 3, message: 'preço vazio' }], productsToCreate: 1, alreadyExist: 1, committed: false, created: 0, updated: 0, skipped: 0 };
  const file = () => new File([csvText], 'produtos.csv', { type: 'text/csv' });

  it('confere antes de criar, mostra o erro por linha, pergunta dos duplicados e importa como rascunho', async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const { impl } = mockFetch(
      (url, init) => {
        if (!url.pathname.endsWith('/products/import') || init.method !== 'POST') return undefined;
        calls.push({ url, init });
        return json(url.searchParams.get('mode') === 'commit' ? { ...preview, committed: true, created: 1, updated: 1, skipped: 0 } : preview);
      },
      ...store,
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<ImportPage />);
    expect(await screen.findByTestId('lojista.importar.template-csv')).toHaveAttribute('href', '/api/proxy/lojista/stores/s1/products/import/template');
    await userEvent.upload(screen.getByTestId('lojista.importar.file-input'), file());
    expect(await screen.findByTestId('lojista.importar.summary-valid')).toHaveTextContent('1 válida');
    expect(screen.getByTestId('lojista.importar.summary-errors')).toHaveTextContent('1 com erro');
    expect(within(screen.getByTestId('lojista.importar.error-row-3')).getByText('preço vazio')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get('mode')).toBe('preview');
    expect((calls[0]!.init.headers as Record<string, string>)['content-type']).toContain('text/csv');
    expect(screen.getByTestId('lojista.importar.duplicates-skip')).toBeChecked();
    expect(screen.getByTestId('lojista.importar.import-submit')).toHaveTextContent('Importar 1 produto');
    await userEvent.click(screen.getByTestId('lojista.importar.duplicates-update'));
    expect(screen.getByTestId('lojista.importar.import-submit')).toHaveTextContent('Importar 2 produtos');
    await userEvent.click(screen.getByTestId('lojista.importar.import-submit'));
    expect(await screen.findByTestId('lojista.importar.result')).toHaveTextContent('2 produtos importados como rascunho.');
    expect(calls[1]!.url.searchParams.get('mode')).toBe('commit');
    expect(calls[1]!.url.searchParams.get('onExisting')).toBe('update');
    expect(String(calls[1]!.init.body)).toContain('CAM-P');
    expect(screen.getByTestId('lojista.importar.errors-download')).toHaveTextContent('Baixar a linha com erro (CSV)');
    expect(screen.getByTestId('lojista.importar.view-drafts')).toHaveAttribute('href', '/lojista/produtos?filtro=draft');
  });

  it('arquivo grande ou que não é CSV é recusado sem chamar a API', async () => {
    const { impl, calls } = mockFetch(...store);
    vi.stubGlobal('fetch', impl);
    renderLojista(<ImportPage />);
    const input = await screen.findByTestId('lojista.importar.file-input');
    await userEvent.upload(input, new File(['x'], 'produtos.xlsx', { type: 'application/vnd.ms-excel' }), { applyAccept: false });
    expect(await screen.findByText('Use o modelo do Webag, em CSV.')).toBeInTheDocument();
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'grande.csv', { type: 'text/csv' });
    await userEvent.upload(input, big);
    expect(await screen.findByText('Esse arquivo tem 2 MB. O máximo é 1 MB.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/import'))).toBe(false);
  });

  it('planilha inválida mostra o motivo do servidor e nada é criado', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/products/import') ? json({ code: 'IMPORT_FILE_INVALID', title: 'x', status: 422, detail: 'Cabeçalho inválido. Use o modelo.' }, 422) : undefined), ...store).impl);
    renderLojista(<ImportPage />);
    await userEvent.upload(await screen.findByTestId('lojista.importar.file-input'), file());
    expect(await screen.findByTestId('lojista.importar.error')).toHaveTextContent('Cabeçalho inválido. Use o modelo.');
    expect(screen.queryByTestId('lojista.importar.import-submit')).not.toBeInTheDocument();
  });

  it('a conferência pode ser cancelada', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => (String(url).includes('/products/import') ? new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))) : mockFetch(...store).impl(url, init))));
    renderLojista(<ImportPage />);
    await userEvent.upload(await screen.findByTestId('lojista.importar.file-input'), file());
    await userEvent.click(await screen.findByTestId('lojista.importar.check-cancel'));
    expect(await screen.findByTestId('lojista.importar.choose')).toBeInTheDocument();
  });
});
