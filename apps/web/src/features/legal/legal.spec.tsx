import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBlocks, renderInline } from '@/lib/markdown-lite';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { effectiveIso, statusOf } from './catalog';
import { EditorPage } from './editor-page';
import { VersionsPage } from './versions-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/admin/termos' }));

const doc = (id: string, version: number, effectiveAt: string, relevantChange = false) => ({ id, type: 'customer_terms', version, title: 'T', content: '## Aceite\n\nTexto **forte**.', effectiveAt, relevantChange, createdAt: effectiveAt });
const page = (data: object[]) => ({ data, nextCursor: null });

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('markdown-lite', () => {
  it('separa títulos, parágrafos e listas', () => {
    expect(parseBlocks('## A\n\ntexto\ncontinua\n\n- x\n- y')).toEqual([
      { kind: 'h2', text: 'A' },
      { kind: 'p', text: 'texto continua' },
      { kind: 'ul', items: ['x', 'y'] },
    ]);
  });
  it('HTML cru vira texto e link só com http, https ou mailto', () => {
    const { container } = render(<p>{renderInline('<script>x</script> [ok](https://webag.com.br) [mau](javascript:alert(1))')}</p>);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.textContent).toContain('<script>x</script>');
  });
});

describe('versionamento', () => {
  it('vigente é a maior com vigência já iniciada; futura é agendada', () => {
    const all = [doc('c', 3, '2999-01-01T00:00:00Z'), doc('b', 2, '2026-01-01T00:00:00Z'), doc('a', 1, '2025-01-01T00:00:00Z')] as never[];
    expect(statusOf(all[0]!, all)).toBe('scheduled');
    expect(statusOf(all[1]!, all)).toBe('current');
    expect(statusOf(all[2]!, all)).toBe('previous');
  });
  it('a data escolhida começa à meia-noite de Brasília', () => {
    expect(effectiveIso('2026-11-20')).toBe('2026-11-20T03:00:00.000Z');
  });
});

describe('VersionsPage (AD5b)', () => {
  it('lista com status e abre a leitura; Operação não tem "Nova versão"', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([doc('b', 2, '2026-01-01T00:00:00Z', true), doc('a', 1, '2025-01-01T00:00:00Z')]))).impl);
    renderPanel(<VersionsPage slug="cliente" />, 'operations');
    expect(await screen.findByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.termos.new-version')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.termos.version-b-open'));
    expect(screen.getByRole('heading', { name: 'Aceite', level: 2 })).toBeInTheDocument();
  });
  it('sem versão: vazio com próximo passo', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<VersionsPage slug="cliente" />);
    expect(await screen.findByText('Nenhuma versão publicada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escrever versão 1' })).toBeInTheDocument();
  });
  it('erro mostra tentar de novo', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ code: 'X', title: 'x', status: 500 }, 500)).impl);
    renderPanel(<VersionsPage slug="cliente" />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('EditorPage (AD5c)', () => {
  it('não publica sem texto e sem data, com as mensagens da spec', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([doc('a', 1, '2025-01-01T00:00:00Z')]))).impl);
    renderPanel(<EditorPage slug="cliente" />);
    await userEvent.click(await screen.findByTestId('admin.termos.publish'));
    expect(screen.getByText('Escreva o texto antes de publicar.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a data de vigência.')).toBeInTheDocument();
  });

  it('botão da barra insere a sintaxe, a prévia renderiza e publicar envia ISO e mudança relevante', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'POST' ? json(doc('n', 2, '2999-01-01T03:00:00Z')) : json(page([doc('a', 1, '2025-01-01T00:00:00Z')]))));
    vi.stubGlobal('fetch', impl);
    renderPanel(<EditorPage slug="cliente" />);
    await userEvent.click(await screen.findByTestId('admin.termos.toolbar-h2'));
    expect(screen.getByTestId('admin.termos.editor-text')).toHaveValue('\n## Título\n');
    await userEvent.type(screen.getByTestId('admin.termos.editor-text'), 'Texto de exemplo com mais de vinte letras.');
    expect(screen.getByRole('heading', { name: 'Título', level: 2, hidden: true })).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.termos.effective-date'), '2999-01-01');
    await userEvent.click(screen.getByTestId('admin.termos.relevant-switch'));
    await userEvent.click(screen.getByTestId('admin.termos.publish'));
    expect(screen.getByText('Publicar a versão 2 de Termos de uso (cliente)?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.termos.publish-confirm'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/termos/cliente'));
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(JSON.parse(post.init.body as string)).toMatchObject({ effectiveAt: '2999-01-01T03:00:00.000Z', relevantChange: true });
    expect(window.localStorage.getItem('webag.admin.legal-draft.customer_terms')).toBeNull();
  });

  it('Operação (só leitura) não edita', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<EditorPage slug="cliente" />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
