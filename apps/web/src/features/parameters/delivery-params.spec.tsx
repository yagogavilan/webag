import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { DeliveryParametersPage, crossErrors, etaFromForm } from './delivery-params-page';

const p = (key: string, value: number | string, over: object = {}) => ({ key, value, default: value, type: 'int', min: 0, max: 500, values: null, description: key, ref: 'DEC-053', legalFloor: false, updatedAt: null, ...over });
const rows = {
  data: [
    p('entrega_preparo_padrao_min', 20, { min: 5, max: 120 }),
    p('entrega_despacho_min', 15, { max: 60 }),
    p('entrega_rota_fator_pct', 130, { min: 100, max: 250 }),
    p('entrega_min_por_km', 6, { type: 'decimal', min: 1, max: 30 }),
    p('entrega_faixa_min', 15, { max: 60 }),
    p('entrega_max_min', 120, { min: 30, max: 240 }),
    p('raio_max_km', 15, { min: 1, max: 50 }),
    p('entrega_atraso_tolerancia_min', 15, { max: 60 }),
    p('entrega_cancel_resposta_min', 10, { min: 3, max: 30 }),
    p('entrega_compensacao_tipo', 'frete_gratis_proximo', { type: 'enum', values: ['frete_gratis_proximo', 'cupom_valor', 'nenhuma'] }),
    p('entrega_compensacao_cents', 1000, { max: 5000 }),
    p('entrega_lote_max', 4, { min: 2, max: 10 }),
    p('logistica_horario', '09:00-20:00', { type: 'window', min: null, max: null }),
    p('logistica_dias', 'seg_sab', { type: 'enum', values: ['seg_sab', 'seg_sex', 'seg_dom'] }),
  ],
  nextCursor: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('validação cruzada da conta da faixa (WB-258)', () => {
  const map = new Map(rows.data.map((item) => [item.key, item as never]));
  const form = (over: Record<string, string> = {}) => ({ entrega_preparo_padrao_min: '20', entrega_despacho_min: '15', entrega_rota_fator_pct: '130', entrega_min_por_km: '6', entrega_faixa_min: '15', entrega_max_min: '120', ...over });

  it('valores de partida fecham a conta', () => {
    expect(crossErrors(etaFromForm(map as never, form()))).toEqual([]);
  });
  it('teto menos folga menor que preparo + despacho + 5 e folga maior que um quarto do teto geram os avisos do desenho', () => {
    expect(crossErrors(etaFromForm(map as never, form({ entrega_max_min: '50', entrega_faixa_min: '15' })))).toEqual(['O teto menos a folga precisa ser pelo menos preparo + despacho + 5 min.', 'A folga pode ser no máximo um quarto do teto (12 min).']);
    expect(crossErrors(etaFromForm(map as never, form({ entrega_faixa_min: '40' })))[0]).toBe('A folga pode ser no máximo um quarto do teto (30 min).');
  });
  it('campo inválido não gera aviso cruzado (o erro do campo aparece ao salvar)', () => {
    expect(etaFromForm(map as never, form({ entrega_faixa_min: 'abc' }))).toBeNull();
  });
});

describe('Parâmetros de entrega (WB-258)', () => {
  it('mostra 4 grupos, alcance de 9,0 km com os valores de partida e a prévia no estilo do checkout', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<DeliveryParametersPage />);
    for (const group of ['faixa', 'teto', 'atraso', 'operacao']) expect(await screen.findByTestId(`admin.params.group-${group}`)).toBeInTheDocument();
    expect(screen.getByTestId('admin.params.reach')).toHaveTextContent('8,9 km');
    expect(screen.getByTestId('admin.params.radius-warning')).toHaveTextContent('Raio máximo de 15 km: faixas de taxa acima de 8,9 km não serão usadas.');
    expect(screen.getByTestId('admin.params.preview-band')).toHaveTextContent('O cliente vê: 59 a 89 min');
    expect(screen.queryByTestId('admin.params.field-entrega_compensacao_cents')).toBeNull();
  });

  it('prévia fora do alcance avisa e a mudança do teto recalcula ao digitar', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<DeliveryParametersPage />);
    const km = await screen.findByTestId('admin.params.preview-km');
    await userEvent.clear(km);
    await userEvent.type(km, '14');
    expect(await screen.findByTestId('admin.params.preview-outside')).toHaveTextContent('passa do teto de 120 min');
  });

  it('exige motivo, bloqueia a conta que não fecha e salva só o que mudou, com o mesmo motivo', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'PUT' ? json(p('entrega_faixa_min', 10)) : json(rows)));
    vi.stubGlobal('fetch', impl);
    renderPanel(<DeliveryParametersPage />);
    const band = await screen.findByTestId('admin.params.field-entrega_faixa_min');
    await userEvent.clear(band);
    await userEvent.type(band, '40');
    expect(await screen.findByTestId('admin.params.cross-error')).toHaveTextContent('A folga pode ser no máximo um quarto do teto (30 min).');
    expect(screen.getByTestId('admin.params.save')).toBeDisabled();
    await userEvent.clear(band);
    await userEvent.type(band, '10');
    await userEvent.click(screen.getByTestId('admin.params.save'));
    expect(await screen.findByText('Escreva o motivo (mínimo 10 caracteres).')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('admin.params.reason'), 'Calibrando com os dados do piloto');
    await userEvent.click(screen.getByTestId('admin.params.save'));
    await waitFor(() => expect(calls.filter((c) => c.init.method === 'PUT')).toHaveLength(1));
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url.pathname).toContain('/admin/parameters/entrega_faixa_min');
    expect(JSON.parse(String(put.init.body))).toEqual({ value: 10, reason: 'Calibrando com os dados do piloto' });
  });

  it('compensação em cupom mostra o valor em reais', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json({ ...rows, data: rows.data.map((item) => (item.key === 'entrega_compensacao_tipo' ? { ...item, value: 'cupom_valor' } : item)) })).impl);
    renderPanel(<DeliveryParametersPage />);
    expect(await screen.findByTestId('admin.params.field-entrega_compensacao_cents')).toHaveValue('10,00');
  });

  it('sem perfil de super admin mostra "sem acesso"', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(rows)).impl);
    renderPanel(<DeliveryParametersPage />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
