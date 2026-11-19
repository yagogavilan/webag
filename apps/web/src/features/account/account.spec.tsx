import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { json, mockFetch } from '../../../test/render';
import { renderLojista } from '../../../test/lojista';
import { MerchantAccountPage, accountError, safeDownloadUrl } from './account-page';
import { deletionEffects, hoursText } from './legal-copy';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/conta' }));
afterEach(() => vi.unstubAllGlobals());

const overview = (over: object = {}) => ({ canDelete: true, blockers: [], hasPassword: true, ownsStore: true, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72, ...over });
const problem = (status: number, code: string) => json({ type: 'x', title: 'x', status, code }, status);

describe('textos legais e erros', () => {
  it('os prazos vêm da API, não do texto', () => {
    const lines = deletionEffects({ regretHours: 72, anonymizationDays: 30, fiscalRetentionYears: 5, ownsStore: true });
    expect(lines.join(' ')).toContain('72 horas (3 dias)');
    expect(lines.join(' ')).toContain('30 dias');
    expect(lines.join(' ')).toContain('5 anos');
    expect(lines.join(' ')).toContain('A sua loja é encerrada');
    const immediate = deletionEffects({ regretHours: 0, anonymizationDays: 1, fiscalRetentionYears: 1, ownsStore: false });
    expect(immediate.join(' ')).toContain('A exclusão é imediata');
    expect(immediate.join(' ')).not.toContain('loja');
    expect(hoursText(24)).toBe('24 horas');
    expect(hoursText(1)).toBe('1 hora');
  });
  it('mensagem por código estável', () => {
    expect(accountError(new ApiError({ status: 429, title: 'x', code: 'EXPORT_DAILY_LIMIT' } as never))).toContain('amanhã');
    expect(accountError(new ApiError({ status: 409, title: 'x', code: 'DELETION_BLOCKED' } as never))).toContain('em aberto');
  });
  it('só segue link http(s)', () => {
    expect(safeDownloadUrl('https://api.webag.example/v1/data-exports/download/abc')).toContain('https://');
    expect(safeDownloadUrl('javascript:alert(1)')).toBeNull();
    expect(safeDownloadUrl('nao é url')).toBeNull();
  });
});

describe('exportar dados (WB-212)', () => {
  it('nunca pediu: pede com a senha e avisa; senha errada fica no campo', async () => {
    let status: unknown = { latest: null, nextRequestAt: null };
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/me/data-exports') && init.method === 'POST') {
          attempts += 1;
          if (attempts === 1) return problem(403, 'INVALID_PASSWORD');
          status = { latest: { id: 'e1', status: 'queued', requestedAt: '2026-11-19T12:00:00Z', readyAt: null, expiresAt: null, sizeBytes: null }, nextRequestAt: '2099-01-01T00:00:00Z' };
          return json(status, 202);
        }
        if (url.pathname.endsWith('/me/data-exports')) return json(status);
        if (url.pathname.endsWith('/me/deletion')) return json(overview());
        return undefined;
      }).impl,
    );
    renderLojista(<MerchantAccountPage />);
    expect(await screen.findByTestId('lojista.conta.export-never')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.conta.export-open'));
    await userEvent.type(screen.getByTestId('lojista.conta.export-password'), 'errada123');
    await userEvent.click(screen.getByTestId('lojista.conta.export-confirm'));
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument();
    await userEvent.clear(screen.getByTestId('lojista.conta.export-password'));
    await userEvent.type(screen.getByTestId('lojista.conta.export-password'), 'certa12345');
    await userEvent.click(screen.getByTestId('lojista.conta.export-confirm'));
    expect(await screen.findByText(/Estamos preparando o arquivo/)).toBeInTheDocument();
    expect(screen.getByTestId('lojista.conta.export-open')).toBeDisabled();
    expect(screen.getByTestId('lojista.conta.export-wait')).toBeInTheDocument();
  });

  it('pronta: gera o link de uso único e mostra "Baixar agora"', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch((url, init) => {
        if (url.pathname.endsWith('/download-link') && init.method === 'POST') return json({ url: 'https://api.webag.example/v1/data-exports/download/tok', expiresAt: '2026-11-19T12:05:00Z' });
        if (url.pathname.endsWith('/me/data-exports')) return json({ latest: { id: 'e1', status: 'ready', requestedAt: '2026-11-18T12:00:00Z', readyAt: '2026-11-18T12:10:00Z', expiresAt: '2026-11-25T12:10:00Z', sizeBytes: 2048 }, nextRequestAt: null });
        if (url.pathname.endsWith('/me/deletion')) return json(overview());
        return undefined;
      }).impl,
    );
    renderLojista(<MerchantAccountPage />);
    await userEvent.click(await screen.findByTestId('lojista.conta.export-link'));
    const link = await screen.findByTestId('lojista.conta.export-download');
    expect(link).toHaveAttribute('href', 'https://api.webag.example/v1/data-exports/download/tok');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('erro ao carregar o status tem nova tentativa', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/me/data-exports') ? problem(500, 'X') : url.pathname.endsWith('/me/deletion') ? json(overview()) : undefined)).impl);
    renderLojista(<MerchantAccountPage />);
    expect((await screen.findAllByRole('button', { name: /tentar de novo/i })).length).toBeGreaterThan(0);
  });
});

describe('excluir conta (WB-213, SEC-096)', () => {
  const exportsEmpty = (url: URL) => (url.pathname.endsWith('/me/data-exports') ? json({ latest: null, nextRequestAt: null }) : undefined);

  it('mostra "o que acontece" com os prazos da API e exclui só com a senha', async () => {
    let body: unknown = null;
    vi.stubGlobal(
      'fetch',
      mockFetch(exportsEmpty, (url, init) => {
        if (url.pathname.endsWith('/me/deletion') && init.method === 'POST') {
          body = JSON.parse(String(init.body));
          return json({ status: 'pending', effectiveAt: '2026-11-22T12:00:00Z', cancelableUntil: '2026-11-22T12:00:00Z' });
        }
        if (url.pathname.endsWith('/me/deletion')) return json(overview());
        return undefined;
      }).impl,
    );
    renderLojista(<MerchantAccountPage />);
    expect(await screen.findByTestId('lojista.conta.delete-effects')).toHaveTextContent('72 horas (3 dias)');
    await userEvent.click(screen.getByTestId('lojista.conta.delete-open'));
    await userEvent.click(screen.getByTestId('lojista.conta.delete-confirm'));
    expect(await screen.findByText('Digite a sua senha.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.conta.delete-password'), 'minhasenha1');
    await userEvent.click(screen.getByTestId('lojista.conta.delete-confirm'));
    expect(await screen.findByTestId('lojista.conta.deleted')).toHaveTextContent('Você pode desistir até');
    expect(body).toEqual({ password: 'minhasenha1' });
    expect(screen.getByTestId('lojista.conta.deleted-cancel-link')).toHaveAttribute('href', '/lojista/desistir-da-exclusao');
  });

  it('com pedido em aberto lista os impedimentos e não oferece o botão', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(exportsEmpty, (url) => (url.pathname.endsWith('/me/deletion') ? json(overview({ canDelete: false, blockers: [{ kind: 'store_order', id: 'o1', number: '4821', status: 'saiu para entrega' }] })) : undefined)).impl,
    );
    renderLojista(<MerchantAccountPage />);
    expect(await screen.findByTestId('lojista.conta.delete-blocked')).toHaveTextContent('Pedido da loja #4821 · saiu para entrega');
    expect(screen.queryByTestId('lojista.conta.delete-open')).not.toBeInTheDocument();
  });

  it('conta só com login social: explica e desabilita', async () => {
    vi.stubGlobal('fetch', mockFetch(exportsEmpty, (url) => (url.pathname.endsWith('/me/deletion') ? json(overview({ hasPassword: false })) : undefined)).impl);
    renderLojista(<MerchantAccountPage />);
    expect(await screen.findByTestId('lojista.conta.delete-no-password')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.conta.delete-open')).toBeDisabled();
  });

  it('bloqueio que aparece na hora de confirmar (409) mostra o motivo e mantém o diálogo', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(exportsEmpty, (url, init) => {
        if (url.pathname.endsWith('/me/deletion') && init.method === 'POST') return problem(409, 'DELETION_BLOCKED');
        if (url.pathname.endsWith('/me/deletion')) return json(overview());
        return undefined;
      }).impl,
    );
    renderLojista(<MerchantAccountPage />);
    await userEvent.click(await screen.findByTestId('lojista.conta.delete-open'));
    await userEvent.type(screen.getByTestId('lojista.conta.delete-password'), 'minhasenha1');
    await userEvent.click(screen.getByTestId('lojista.conta.delete-confirm'));
    expect(await screen.findByTestId('lojista.conta.delete-error')).toHaveTextContent('em aberto');
    await waitFor(() => expect(screen.getByTestId('lojista.conta.delete-dialog')).toBeInTheDocument());
  });
});
