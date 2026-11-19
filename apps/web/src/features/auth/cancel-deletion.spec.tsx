import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../test/render';
import { CancelDeletionForm } from './cancel-deletion-form';

afterEach(() => vi.unstubAllGlobals());

describe('desistir da exclusão', () => {
  it('valida os campos, reativa a conta e usa uma única mensagem para qualquer falha', async () => {
    let attempts = 0;
    const { impl, calls } = mockFetch((url, init) => {
      if (url.pathname.endsWith('/auth/account-deletion/cancel') && init.method === 'POST') {
        attempts += 1;
        return attempts === 1 ? json({ type: 'x', title: 'x', status: 401, code: 'INVALID_CREDENTIALS' }, 401) : json(null, 204);
      }
      return undefined;
    });
    vi.stubGlobal('fetch', impl);
    render(<CancelDeletionForm />);
    await userEvent.click(screen.getByTestId('lojista.desistir.submit'));
    expect(await screen.findByText('Digite seu e-mail.')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.desistir.email'), 'marcos@casabela.com.br');
    await userEvent.type(screen.getByTestId('lojista.desistir.password'), 'errada');
    await userEvent.click(screen.getByTestId('lojista.desistir.submit'));
    expect(await screen.findByTestId('lojista.desistir.error')).toHaveTextContent('prazo para desistir já passou');
    await userEvent.click(screen.getByTestId('lojista.desistir.submit'));
    expect(await screen.findByTestId('lojista.desistir.done')).toBeInTheDocument();
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ email: 'marcos@casabela.com.br', password: 'errada' });
  });
});
