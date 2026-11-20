import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleGuard, announced } from './idle-guard';

const MIN = 60_000;

describe('IdleGuard (AC5b)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());

  it('avisa aos 28 minutos e encerra aos 30', () => {
    const onTimeout = vi.fn();
    render(<IdleGuard onTimeout={onTimeout} />);
    act(() => void vi.advanceTimersByTime(27 * MIN));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1 * MIN + 1000));
    expect(screen.getByRole('alertdialog', { name: 'Sua sessão vai terminar' })).toBeInTheDocument();
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2 * MIN));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('"Continuar conectado" zera o relógio', () => {
    const onTimeout = vi.fn();
    render(<IdleGuard onTimeout={onTimeout} />);
    act(() => void vi.advanceTimersByTime(28 * MIN + 1000));
    fireEvent.click(screen.getByTestId('admin.session.keep'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(20 * MIN));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('atividade do usuário adia o aviso', () => {
    render(<IdleGuard onTimeout={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(20 * MIN));
    act(() => void window.dispatchEvent(new Event('keydown')));
    act(() => void vi.advanceTimersByTime(20 * MIN));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('o texto lido só muda em 1:00 e 0:30', () => {
    expect(announced(119_000)).toBe('2 minutos');
    expect(announced(60_000)).toBe('1 minuto');
    expect(announced(30_000)).toBe('30 segundos');
  });
});
