import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../src/api/problem';
import { CancelDeletionForm } from '../src/features/privacy/CancelDeletionForm';
import { renderScreen } from '../src/test/render';

const mockCancel = jest.fn();
jest.mock('../src/api/privacy-api', () => ({ cancelMyDeletion: (...a: unknown[]) => mockCancel(...a) }));
jest.mock('../src/lib/minDuration', () => ({ withMinDuration: <T,>(p: Promise<T>) => p }));

const needCode = () => new ApiError({ kind: 'problem', status: 403, code: 'LOGIN_CODE_REQUIRED' });
const fill = async () => {
  await fireEvent.changeText(screen.getByTestId('account.undo-email-input'), 'Maria@Gmail.com');
  await fireEvent.changeText(screen.getByTestId('account.undo-password-input'), 'Segredo123');
  await fireEvent.press(screen.getByTestId('account.undo-submit'));
};

beforeEach(() => jest.clearAllMocks());

describe('Desistir da exclusão (SEC-176, M.2)', () => {
  it('sem ataque: reativa só com e-mail e senha', async () => {
    mockCancel.mockResolvedValue(undefined);
    const onDone = jest.fn();
    await renderScreen(<CancelDeletionForm onDone={onDone} />);
    await fill();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockCancel).toHaveBeenCalledWith('Maria@Gmail.com', 'Segredo123');
  });

  it('403 LOGIN_CODE_REQUIRED: pede o código com o e-mail mascarado e reenvia com `code`', async () => {
    mockCancel.mockRejectedValueOnce(needCode());
    const onDone = jest.fn();
    await renderScreen(<CancelDeletionForm onDone={onDone} />);
    await fill();

    expect(await screen.findByText('Para reativar a conta, digite o código de 6 dígitos que enviamos para m***@gmail.com.')).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();

    mockCancel.mockResolvedValueOnce(undefined);
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '482913');
    await waitFor(() => expect(mockCancel).toHaveBeenLastCalledWith('maria@gmail.com', 'Segredo123', '482913'));
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('código errado: avisa e deixa tentar de novo sem voltar ao formulário', async () => {
    mockCancel.mockRejectedValueOnce(needCode());
    await renderScreen(<CancelDeletionForm onDone={jest.fn()} />);
    await fill();
    await screen.findByTestId('account.undo-code');

    mockCancel.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 400, code: 'CODE_INVALID' }));
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '000000');
    expect(await screen.findByTestId('auth.otp-error')).toBeOnTheScreen();
    expect(screen.getByTestId('account.undo-code')).toBeOnTheScreen();
  });

  it('401 com o código: volta ao formulário com a frase única', async () => {
    mockCancel.mockRejectedValueOnce(needCode());
    await renderScreen(<CancelDeletionForm onDone={jest.fn()} />);
    await fill();
    await screen.findByTestId('account.undo-code');

    mockCancel.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 401, code: 'INVALID_CREDENTIALS' }));
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '123456');
    expect(await screen.findByText('E-mail ou senha incorretos, ou o prazo já acabou.')).toBeOnTheScreen();
    expect(screen.getByTestId('account.undo-form')).toBeOnTheScreen();
  });

  it('senha errada: a mesma frase do login, sem pedir código', async () => {
    mockCancel.mockRejectedValue(new ApiError({ kind: 'problem', status: 401, code: 'INVALID_CREDENTIALS' }));
    await renderScreen(<CancelDeletionForm onDone={jest.fn()} />);
    await fill();
    expect(await screen.findByTestId('account.undo-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('account.undo-code')).toBeNull();
  });
});
