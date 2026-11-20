import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, renderPanel } from '../../../test/render';
import { FlagsPage } from './flags-page';

const flag = (key: string, enabled: boolean) => ({ key, enabled, description: key, updatedAt: null });
const page = (items: object[]) => ({ data: items, nextCursor: null });

afterEach(() => vi.unstubAllGlobals());

describe('FlagsPage (AD4)', () => {
  it('desligar pede confirmação e grava só depois de confirmar', async () => {
    const { impl, calls } = mockFetch((url, init) => (init.method === 'PUT' ? json(flag('cartao', false)) : json(page([flag('cartao', true), flag('pix', true)]))));
    vi.stubGlobal('fetch', impl);
    renderPanel(<FlagsPage />);
    await userEvent.click(await screen.findByTestId('admin.flags.flag-cartao-switch'));
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
    expect(screen.getByText('Desligar pagamento com cartão?')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm'));
    await waitFor(() => expect(calls.find((c) => c.init.method === 'PUT')).toBeTruthy());
    expect(JSON.parse(calls.find((c) => c.init.method === 'PUT')!.init.body as string)).toEqual({ enabled: false });
    expect(await screen.findByText('Chega ao app em até 1 minuto.')).toBeInTheDocument();
  });

  it('avisa quando desligar PIX deixa o app sem meio de pagamento', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([flag('cartao', false), flag('pix', true)]))).impl);
    renderPanel(<FlagsPage />);
    await userEvent.click(await screen.findByTestId('admin.flags.flag-pix-switch'));
    expect(screen.getByTestId('admin.flags.last-payment-warning')).toHaveTextContent('Sem PIX e sem cartão, ninguém consegue pagar.');
    expect(screen.getByTestId('confirm')).toHaveTextContent('Desligar mesmo assim');
  });

  it('erro ao gravar mantém a flag como estava e explica', async () => {
    vi.stubGlobal('fetch', mockFetch((url, init) => (init.method === 'PUT' ? json({ code: 'X', title: 'x', status: 500 }, 500) : json(page([flag('retirada', true)])))).impl);
    renderPanel(<FlagsPage />);
    await userEvent.click(await screen.findByTestId('admin.flags.flag-retirada-switch'));
    await userEvent.click(screen.getByTestId('confirm'));
    expect(await screen.findByText('Não foi possível alterar. A flag continua ligada.')).toBeInTheDocument();
    expect(screen.getByTestId('admin.flags.flag-retirada-switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('operação não vê a tela', async () => {
    vi.stubGlobal('fetch', mockFetch(() => json(page([]))).impl);
    renderPanel(<FlagsPage />, 'operations');
    expect(await screen.findByTestId('no-access')).toBeInTheDocument();
  });
});
