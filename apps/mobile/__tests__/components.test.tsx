import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AsyncBoundary } from '../src/components/AsyncBoundary';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { OtpInput } from '../src/components/OtpInput';
import { PasswordField } from '../src/components/PasswordField';
import { EmptyState } from '../src/components/StateViews';
import { Text } from '../src/components/Text';
import { TextField } from '../src/components/TextField';
import { maskPhone } from '../src/lib/masks';

describe('Button', () => {
  it('chama onPress e fica inerte enquanto carrega', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Entrar" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<Button label="Entrar" loading loadingLabel="Entrando…" onPress={onPress} />);
    const busy = screen.getByRole('button', { name: 'Entrando…' });
    expect(busy).toBeBusy();
    expect(busy).toBeDisabled();
    await fireEvent.press(busy);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('garante alvo de toque de 48', async () => {
    await render(<Button label="Entrar" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveStyle({ minHeight: 48 });
  });
});

describe('TextField', () => {
  it('aplica a máscara e mostra o erro ligado ao campo', async () => {
    function Harness() {
      const [value, setValue] = useState('');
      return <TextField error="Confira o celular com DDD." label="Celular" mask={maskPhone} onChangeText={setValue} value={value} />;
    }
    await render(<Harness />);
    const input = screen.getByLabelText('Celular');
    await fireEvent.changeText(input, '11999998888');
    expect(input.props.value).toBe('(11) 99999-8888');
    expect(input.props.accessibilityHint).toBe('Confira o celular com DDD.');
    expect(screen.getByRole('alert')).toHaveTextContent('Confira o celular com DDD.');
  });
});

describe('PasswordField', () => {
  it('alterna a visibilidade com rótulo e mostra o medidor em texto', async () => {
    function Harness() {
      const [visible, setVisible] = useState(false);
      return <PasswordField label="Senha" mode="new" onChangeText={() => undefined} onToggleVisible={() => setVisible((v) => !v)} showMeter value="Cachorro-Azul-2024!" visible={visible} />;
    }
    await render(<Harness />);
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Força da senha: forte')).toBeOnTheScreen();
    expect(screen.getByText('Forte')).toBeOnTheScreen();
  });
});

describe('OtpInput', () => {
  it('aceita colar os 6 dígitos de uma vez e completa sozinho', async () => {
    const onComplete = jest.fn();
    function Harness() {
      const [value, setValue] = useState('');
      return <OtpInput onChange={setValue} onComplete={onComplete} value={value} />;
    }
    await render(<Harness />);
    const field = screen.getByTestId('auth.otp-field');
    await fireEvent.changeText(field, '12a34');
    expect(onComplete).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '123 456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(screen.getByTestId('auth.otp-digit-6', { includeHiddenElements: true })).toHaveTextContent('6');
  });
});

describe('Checkbox e Banner', () => {
  it('expõe estado marcado e anuncia o erro', async () => {
    const onChange = jest.fn();
    await render(<Checkbox checked={false} error="Marque a caixa para continuar." label="Aceito os termos" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Aceito os termos' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('alert')).toHaveTextContent('Marque a caixa para continuar.');
  });

  it('banner de erro é um alerta com ação', async () => {
    const onAction = jest.fn();
    await render(<Banner actionLabel="Tentar de novo" onAction={onAction} text="Não conseguimos agora." tone="danger" />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('AsyncBoundary: carregando, vazio, erro e conteúdo', () => {
  const base = { onRetry: jest.fn(), skeleton: <Text>skeleton</Text> };

  it('mostra o skeleton ao carregar', async () => {
    await render(<AsyncBoundary {...base} isError={false} isLoading><Text>conteúdo</Text></AsyncBoundary>);
    expect(screen.getByText('skeleton')).toBeOnTheScreen();
    expect(screen.queryByText('conteúdo')).toBeNull();
  });

  it('mostra erro com ação de tentar de novo', async () => {
    const onRetry = jest.fn();
    await render(<AsyncBoundary {...base} isError isLoading={false} onRetry={onRetry}><Text>conteúdo</Text></AsyncBoundary>);
    expect(screen.getByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('mostra o vazio com próximo passo e o conteúdo quando há dados', async () => {
    const { rerender } = await render(
      <AsyncBoundary {...base} empty={<EmptyState actionLabel="Adicionar endereço" onAction={() => undefined} title="Nenhum endereço salvo" />} isEmpty isError={false} isLoading={false}>
        <Text>conteúdo</Text>
      </AsyncBoundary>,
    );
    expect(screen.getByText('Nenhum endereço salvo')).toBeOnTheScreen();
    await rerender(<AsyncBoundary {...base} isError={false} isLoading={false}><Text>conteúdo</Text></AsyncBoundary>);
    expect(screen.getByText('conteúdo')).toBeOnTheScreen();
  });

  it('sem conexão mostra o estado offline', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValueOnce({ isConnected: false, isInternetReachable: false });
    await render(<AsyncBoundary {...base} isError isLoading={false}><Text>conteúdo</Text></AsyncBoundary>);
    expect(screen.getByText('Sem conexão')).toBeOnTheScreen();
  });
});
