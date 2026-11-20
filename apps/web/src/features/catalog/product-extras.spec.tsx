import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VALUES, type ProductFormValues } from '@/lib/catalog/form';
import { json, mockFetch } from '../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../test/lojista';
import { ExchangeSection, ReceiveLines, SizeChartSection } from './product-extras';

afterEach(() => vi.unstubAllGlobals());

function serve(over: Parameters<typeof fakeStore>[0]) {
  vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/never') ? json({}) : undefined), ...storeHandlers(fakeStore({ id: 's1', status: 'live', step: 4, ...over }))).impl);
}

function Harness({ commission }: { commission: number | null }) {
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY_VALUES });
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  void commission;
  return (
    <>
      <ReceiveLines priceCents={8990} promoCents={7990} onUsePrice={() => undefined} />
      <ExchangeSection values={values} set={set} />
      <SizeChartSection values={values} set={set} hasSize={false} />
    </>
  );
}

describe('produto: Você recebe, troca e tabela de medidas', () => {
  it('sem o percentual da loja a linha avisa e não bloqueia', async () => {
    serve({ commissionPct: null });
    renderLojista(<Harness commission={null} />);
    expect(await screen.findByTestId('lojista.produto.receive-unavailable')).toHaveTextContent('Não conseguimos calcular agora');
  });

  it('com o percentual, mostra quanto recebe e a promoção', async () => {
    serve({ commissionPct: 15 });
    renderLojista(<Harness commission={15} />);
    await screen.findByTestId('lojista.produto.receive-line');
    expect(await screen.findByText(/Você recebe R\$\s*76,41/)).toBeInTheDocument();
    expect(screen.getByTestId('lojista.produto.receive-promo-line')).toHaveTextContent("67,91");
  });

  it('com a tarifa do provedor, desconta a do meio mais caro e explica que é estimativa (DEC-074e)', async () => {
    serve({ commissionPct: 15, providerFeePct: { pix: 0.99, card: 4.98 } });
    renderLojista(<Harness commission={15} />);
    // 8990 - 1349 (15%) - 448 (4,98%) = 7193
    expect(await screen.findByText(/Você recebe R\$\s*71,93/)).toBeInTheDocument();
    expect(screen.getByTestId('lojista.produto.receive-commission')).toHaveTextContent('Comissão da Webag: 15% (R$ 13,49)');
    expect(screen.getByTestId('lojista.produto.receive-fee')).toHaveTextContent('Tarifa do Mercado Pago: até 4,98% (R$ 4,48)');
    expect(screen.getByTestId('lojista.produto.receive-promo-line')).toHaveTextContent('63,93'); // 7990 - 1199 - 398 (arredonda cada parcela)
    expect(screen.getByTestId('lojista.produto.receive-estimate-note')).toHaveTextContent('Valor estimado');
  });

  it('sem a tarifa na API mantém só a comissão e o aviso de que a tarifa sai à parte', async () => {
    serve({ commissionPct: 15, providerFeePct: null });
    renderLojista(<Harness commission={15} />);
    expect(await screen.findByText(/Você recebe R\$\s*76,41/)).toBeInTheDocument();
    expect(screen.getByTestId('lojista.produto.receive-fee')).toHaveTextContent('descontada à parte');
  });

  it('funcionário sem `vendas_valores` não vê valor nem percentual', async () => {
    serve({ role: 'staff', permissions: ['catalog'], commissionPct: 15 });
    renderLojista(<Harness commission={15} />);
    expect(await screen.findByTestId('lojista.produto.price-hint')).toHaveTextContent('O preço deve incluir a comissão da Webag.');
    expect(screen.queryByTestId('lojista.produto.receive-line')).not.toBeInTheDocument();
  });

  it('"sem troca por tamanho ou cor": desligar mostra a prévia e a lei continua valendo', async () => {
    serve({ commissionPct: 15 });
    const user = userEvent.setup();
    renderLojista(<Harness commission={15} />);
    expect(screen.getByTestId('lojista.produto.exchange-legal-card')).toHaveTextContent('Desistência em 7 dias e defeito continuam valendo por lei');
    await user.click(screen.getByTestId('lojista.produto.exchange-switch'));
    expect(screen.getByTestId('lojista.produto.exchange-preview')).toHaveTextContent('Sem troca por tamanho ou cor');
    expect(screen.getByTestId('lojista.produto.sizechart-disabled-note')).toBeInTheDocument();
  });
});
