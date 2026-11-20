import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './otp-input';

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />;
}

describe('OtpInput', () => {
  it('avança sozinho e completa no 6º dígito', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('aceita colar o código inteiro e ignora o que não é dígito', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.click(screen.getByLabelText('Dígito 1 de 6'));
    await userEvent.paste('12 34-56');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('Backspace volta para a caixa anterior', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Dígito 1 de 6'), '12');
    await userEvent.keyboard('{Backspace}');
    expect(screen.getByLabelText('Dígito 2 de 6')).toHaveValue('');
    await userEvent.keyboard('{Backspace}');
    expect(screen.getByLabelText('Dígito 1 de 6')).toHaveFocus();
  });

  it('expõe o autocomplete one-time-code na primeira caixa', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Dígito 1 de 6')).toHaveAttribute('autocomplete', 'one-time-code');
  });
});
