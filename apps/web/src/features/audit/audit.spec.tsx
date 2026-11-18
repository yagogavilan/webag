import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, path, renderPanel } from '../../../test/render';
import { AuditPage } from './audit-page';
import { periodRange } from './catalog';

const row = (id: number, over: object = {}) => ({ id, at: '2026-11-18T13:42:00Z', actorId: 'u1', actorRole: 'super_admin', action: 'parameter.update', targetType: 'parameter', targetId: 'pix_expiracao_min', before: { value: 15 }, after: { value: 20 }, ip: '10.0.0.1', requestId: 'r', reason: 'Feriado com muita demora', ...over });
const admins = { data: [{ userId: 'u1', name: 'Ana Souza', email: 'a@w.br', profile: 'super_admin', active: true, totpConfigured: true }], nextCursor: null };

afterEach(() => vi.unstubAllGlobals());

describe('periodRange', () => {
  it('hoje começa à meia-noite de Brasília e 7 dias volta 6 dias', () => {
    const now = new Date('2026-11-18T15:00:00Z');
    expect(periodRange('today', { from: '', to: '' }, now).from).toBe('2026-11-18T03:00:00.000Z');
    expect(periodRange('7d', { from: '', to: '' }, now).from).toBe('2026-11-12T03:00:00.000Z');
    expect(periodRange('all', { from: '', to: '' }, now)).toEqual({});
  });
});

describe('AuditPage (AD6)', () => {
  it('lista, traduz a ação e abre o detalhe com antes e depois, sem botão de editar', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/admins' ? json(admins) : json({ data: [row(7)], nextCursor: null }))).impl);
    renderPanel(<AuditPage />);
    expect(await screen.findByText('Parâmetro alterado')).toBeInTheDocument();
    expect(await screen.findByText(/Ana Souza · Super admin/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('admin.auditoria.row-7-open'));
    expect(screen.getByTestId('admin.auditoria.detail')).toHaveTextContent('Feriado com muita demora');
    expect(screen.getByTestId('admin.auditoria.detail-diff')).toHaveTextContent('15');
    expect(screen.getByText('Este registro não pode ser editado nem apagado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|excluir|apagar/i })).not.toBeInTheDocument();
  });

  it('filtro por alvo vai para a API e vazio oferece limpar filtros', async () => {
    const { impl, calls } = mockFetch((url) => (path(url) === 'admin/admins' ? json(admins) : json({ data: [], nextCursor: null })));
    vi.stubGlobal('fetch', impl);
    renderPanel(<AuditPage initial={{ targetType: 'parameter', targetId: 'pix_expiracao_min' }} />);
    expect(await screen.findByText('Nenhum registro neste período')).toBeInTheDocument();
    const audit = calls.find((c) => path(c.url) === 'admin/audit-log')!;
    expect(audit.url.searchParams.get('targetType')).toBe('parameter');
    expect(audit.url.searchParams.get('targetId')).toBe('pix_expiracao_min');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByTestId('admin.auditoria.filter-target')).toHaveValue('');
  });

  it('paginação por cursor e erro com tentar de novo', async () => {
    let n = 0;
    const { impl, calls } = mockFetch((url) => {
      if (path(url) === 'admin/admins') return json(admins);
      n += 1;
      return n === 1 ? json({ data: [row(2)], nextCursor: 'abc' }) : json({ data: [row(1)], nextCursor: null });
    });
    vi.stubGlobal('fetch', impl);
    renderPanel(<AuditPage />);
    await userEvent.click(await screen.findByTestId('admin.auditoria.load-more'));
    expect(await screen.findByTestId('admin.auditoria.row-1')).toBeInTheDocument();
    expect(calls.filter((c) => path(c.url) === 'admin/audit-log').at(-1)!.url.searchParams.get('cursor')).toBe('abc');
  });

  it('falha na carga mostra erro com ação', async () => {
    vi.stubGlobal('fetch', mockFetch((url) => (path(url) === 'admin/admins' ? json(admins) : json({ code: 'X', title: 'x', status: 500 }, 500))).impl);
    renderPanel(<AuditPage />);
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('outros perfis não veem a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ data: [], nextCursor: null })).impl);
    renderPanel(<AuditPage />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
