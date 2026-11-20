import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NewPasswordPair, passwordStrength } from './password-field';

describe('passwordStrength', () => {
  it.each([
    ['abc', 'weak'],
    ['abcdefgh', 'weak'],
    ['abcd1234', 'medium'],
    ['Abcdefgh1234!', 'strong'],
  ])('%s é %s', (value, expected) => expect(passwordStrength(value)).toBe(expected));
});

function Pair() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  return <NewPasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />;
}

describe('NewPasswordPair (DEC-012)', () => {
  it('mostra o medidor em texto, nunca só cor', async () => {
    render(<Pair />);
    await userEvent.type(screen.getByLabelText('Senha'), 'abcd1234');
    expect(screen.getByText('Força da senha: Média')).toBeInTheDocument();
  });

  it('um único olho controla as duas senhas e o toggle é anunciado', async () => {
    render(<Pair />);
    const [toggle] = screen.getAllByRole('button', { name: 'Mostrar senha' });
    await userEvent.click(toggle!);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirmar senha')).toHaveAttribute('type', 'text');
  });

  it('valida a confirmação ao igualar o tamanho', async () => {
    render(<Pair />);
    await userEvent.type(screen.getByLabelText('Senha'), 'abcd1234');
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'abcd1235');
    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Confirmar senha'));
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'abcd1234');
    expect(screen.getByText('As senhas são iguais.')).toBeInTheDocument();
  });

  it('usa new-password nos dois campos (gerenciador de senhas)', () => {
    render(<Pair />);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirmar senha')).toHaveAttribute('autocomplete', 'new-password');
  });
});
