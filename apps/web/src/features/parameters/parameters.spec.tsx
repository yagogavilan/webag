import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { parseInput, groupOf, formatParamValue } from './catalog';
import { ParametersPage } from './parameters-page';

const param = (key: string, value: number | string, over: object = {}) => ({ key, value, default: value, type: 'int', min: 5, max: 60, values: null, description: `Desc ${key}`, ref: 'RN-02', legalFloor: false, updatedAt: null, ...over });
const list = (items: object[]) => ({ data: items, nextCursor: null });

afterEach(() => vi.unstubAllGlobals());

describe('catálogo de parâmetros', () => {
  it('agrupa pela chave e mostra centavos em reais', () => {
    expect(groupOf('pix_expiracao_min')).toBe('pedido');
    expect(groupOf('troca_defeito_dias')).toBe('trocas');
    expect(formatParamValue('pedido_min_cents', 200000)).toMatch(/2\.000,00/);
    expect(formatParamValue('pix_expiracao_min', 15)).toBe('15 min');
  });
  it('valida faixa e inteiro com as mensagens da spec', () => {
    const p = { ...param('pix_expiracao_min', 15) } as never;
    expect(parseInput(p, '')).toEqual({ error: 'Digite um valor.' });
    expect(parseInput(p, '70')).toEqual({ error: 'O valor vai de 5 a 60.' });
    expect(parseInput(p, '10,5')).toEqual({ error: 'Use um número inteiro.' });
    expect(parseInput(p, '20')).toEqual({ value: 20 });
  });
});

describe('ParametersPage (AD3)', () => {
  const rows = list([param('pix_expiracao_min', 15, { updatedAt: '2026-11-18T13:00:00Z' }), param('troca_defeito_dias', 90, { legalFloor: true, min: 90 })]);

  it('busca sem resultado mostra o vazio com ação', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<ParametersPage />);
    await userEvent.type(await screen.findByLabelText('Buscar parâmetro'), 'zzz');
    expect(screen.getByText('Nenhum parâmetro com esse nome.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByTestId('admin.parametros.param-pix_expiracao_min')).toBeInTheDocument();
  });

  it('piso legal abre travado com o aviso de lei e sem botão de salvar', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<ParametersPage />);
    await userEvent.click(await screen.findByTestId('admin.parametros.param-troca_defeito_dias-edit'));
    expect(screen.getByTestId('admin.parametros.legal-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('admin.parametros.submit')).not.toBeInTheDocument();
  });

  it('exige motivo e salva com valor e motivo', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'PUT' ? json(param('pix_expiracao_min', 20)) : json(rows)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ParametersPage />);
    await userEvent.click(await screen.findByTestId('admin.parametros.param-pix_expiracao_min-edit'));
    const value = screen.getByTestId('admin.parametros.value-input');
    await userEvent.clear(value);
    await userEvent.type(value, '20');
    await userEvent.click(screen.getByTestId('admin.parametros.submit'));
    expect(await screen.findByText('Escreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.parametros.reason-input'), 'Pagamentos demoram em feriado');
    await userEvent.click(screen.getByTestId('admin.parametros.submit'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PUT')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'PUT')!.init.body as string)).toEqual({ value: 20, reason: 'Pagamentos demoram em feriado' });
    expect(await screen.findByText('Parâmetro salvo. Registrado na auditoria.')).toBeInTheDocument();
  });

  it('conflito: se outra pessoa alterou antes, não grava e oferece ver o valor atual', async () => {
    let served = 0;
    const { impl, calls } = mockFetch((url, init) => {
      if (init.method === 'PUT') return json(param('pix_expiracao_min', 20));
      served += 1;
      return json(list([param('pix_expiracao_min', 15, { updatedAt: served === 1 ? '2026-11-18T13:00:00Z' : '2026-11-18T13:42:00Z' })]));
    });
    vi.stubGlobal('fetch', impl);
    renderPanel(<ParametersPage />);
    await userEvent.click(await screen.findByTestId('admin.parametros.param-pix_expiracao_min-edit'));
    await userEvent.type(screen.getByTestId('admin.parametros.reason-input'), 'Ajuste de teste do tempo');
    await userEvent.click(screen.getByTestId('admin.parametros.submit'));
    expect(await screen.findByTestId('admin.parametros.conflict')).toHaveTextContent('Veja o valor atual antes de salvar');
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it('409 do servidor também vira o aviso de conflito', async () => {
    const { impl } = mockFetch((url, init) => (init.method === 'PUT' ? json({ code: 'CONFLICT', title: 'Conflito', status: 409 }, 409) : json(rows)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<ParametersPage />);
    await userEvent.click(await screen.findByTestId('admin.parametros.param-pix_expiracao_min-edit'));
    await userEvent.type(screen.getByTestId('admin.parametros.reason-input'), 'Ajuste de teste do tempo');
    await userEvent.click(screen.getByTestId('admin.parametros.submit'));
    expect(await screen.findByTestId('admin.parametros.conflict')).toBeInTheDocument();
  });

  it('perfil sem acesso não vê a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<ParametersPage />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
