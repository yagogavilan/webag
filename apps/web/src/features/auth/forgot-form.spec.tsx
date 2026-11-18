import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotForm } from './forgot-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const fetchMock = vi.fn();
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const call = (n: number) => ({ url: String(fetchMock.mock.calls[n]![0]), body: JSON.parse((fetchMock.mock.calls[n]![1] as RequestInit).body as string) });

beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

async function toResetStage() {
  fetchMock.mockResolvedValueOnce(ok({}, 202));
  render(<ForgotForm />);
  await userEvent.type(screen.getByLabelText('E-mail'), 'admin@webag.local');
  await userEvent.click(screen.getByTestId('admin.forgot.email-submit'));
  await userEvent.type(await screen.findByLabelText('Dígito 1 de 6'), '123456');
  await userEvent.type(screen.getByLabelText('Nova senha'), 'Nova-Senha-2026-xyz');
  await userEvent.type(screen.getByLabelText(/Confirmar|Repita|Confirme/i), 'Nova-Senha-2026-xyz');
}

describe('ForgotForm do admin (SEC-095, SEC-115)', () => {
  it('admin com TOTP: depois do código do e-mail pede o 2º fator e conclui em reset/complete sem expor o ticket', async () => {
    await toResetStage();
    fetchMock.mockResolvedValueOnce(ok({ mfaRequired: true })).mockResolvedValueOnce(ok({ tokens: null }));
    await userEvent.click(screen.getByTestId('admin.forgot.submit'));
    await userEvent.type(await screen.findByTestId('admin.forgot.factor-input'), '654321');
    await userEvent.click(screen.getByTestId('admin.forgot.factor-submit'));
    expect(await screen.findByRole('heading', { name: 'Senha redefinida' })).toBeInTheDocument();
    expect(call(2).url).toBe('/api/proxy/admin/auth/password/reset/complete');
    expect(call(2).body).toEqual({ totpCode: '654321', newPassword: 'Nova-Senha-2026-xyz' });
    expect(JSON.stringify(call(2).body)).not.toContain('resetTicket');
  });

  it('código de 2º fator errado mostra a mensagem e não conclui', async () => {
    await toResetStage();
    fetchMock.mockResolvedValueOnce(ok({ mfaRequired: true })).mockResolvedValueOnce(ok({ status: 401, code: 'MFA_INVALID', title: 'x' }, 401));
    await userEvent.click(screen.getByTestId('admin.forgot.submit'));
    await userEvent.type(await screen.findByTestId('admin.forgot.factor-input'), '000000');
    await userEvent.click(screen.getByTestId('admin.forgot.factor-submit'));
    await waitFor(() => expect(screen.getByTestId('admin.forgot.factor-error')).toHaveTextContent('Código incorreto ou vencido.'));
  });
});
