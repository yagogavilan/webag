import { act, fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../src/api/problem';
import { OtpEntry } from '../src/features/auth/OtpEntry';
import { renderScreen } from '../src/test/render';

const props = { title: 'Confirme seu e-mail', text: 'Enviamos um código para maria@gmail.com.', onDone: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('Código por e-mail (E4)', () => {
  it('verifica sozinho no 6º dígito e segue depois do check', async () => {
    const onVerify = jest.fn().mockResolvedValue(undefined);
    await renderScreen(<OtpEntry {...props} onVerify={onVerify} />);
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '123456');
    expect(onVerify).toHaveBeenCalledWith('123456');
    expect(await screen.findByTestId('auth.otp-done')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(props.onDone).toHaveBeenCalled();
  });

  it('errado: conta tentativas restantes, limpa as caixas e bloqueia no 5º erro', async () => {
    const onVerify = jest.fn().mockRejectedValue(new ApiError({ kind: 'problem', status: 400, code: 'CODE_INVALID' }));
    await renderScreen(<OtpEntry {...props} onResend={jest.fn()} onVerify={onVerify} />);
    const field = () => screen.getByTestId('auth.otp-field');

    await fireEvent.changeText(field(), '111111');
    expect(await screen.findByText('Código incorreto. Restam 4 tentativas.')).toBeOnTheScreen();
    expect(field().props.value).toBe('');
    for (let i = 0; i < 3; i++) await fireEvent.changeText(field(), '111111');
    expect(await screen.findByText('Código incorreto. Resta 1 tentativa.')).toBeOnTheScreen();
    await fireEvent.changeText(field(), '111111');
    expect(await screen.findByText('Muitas tentativas. Peça um novo código.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviar novo código' })).toBeOnTheScreen();
  });

  it('vencido pede outro código', async () => {
    const onVerify = jest.fn().mockRejectedValue(new ApiError({ kind: 'problem', status: 400, code: 'CODE_EXPIRED' }));
    await renderScreen(<OtpEntry {...props} onVerify={onVerify} />);
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '222222');
    expect(await screen.findByText('Código vencido. Peça outro.')).toBeOnTheScreen();
  });

  it('reenvio só depois de 1:00 e a contagem recomeça', async () => {
    const onResend = jest.fn().mockResolvedValue(undefined);
    await renderScreen(<OtpEntry {...props} onResend={onResend} onVerify={jest.fn()} />);
    expect(screen.getByTestId('auth.otp-countdown', { includeHiddenElements: true })).toHaveTextContent('Reenviar código em 1:00');
    expect(screen.queryByRole('button', { name: 'Reenviar código' })).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    const resend = await screen.findByRole('button', { name: 'Reenviar código' });
    await fireEvent.press(resend);
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('auth.otp-countdown', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('falha de rede ao verificar mantém a tela e avisa', async () => {
    const onVerify = jest.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    await renderScreen(<OtpEntry {...props} onVerify={onVerify} />);
    await fireEvent.changeText(screen.getByTestId('auth.otp-field'), '333333');
    expect(await screen.findByText('Não conseguimos verificar. Tente de novo.')).toBeOnTheScreen();
  });
});
