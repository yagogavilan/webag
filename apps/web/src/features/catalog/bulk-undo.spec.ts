import { describe, expect, it } from 'vitest';
import { announcement, secondsLeft, undoOutcome, UNDO_WINDOW_MS } from './bulk-undo';

describe('UndoNotice: contagem (WB-377 C4)', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');
  it('conta os segundos até o `undoUntil` do servidor', () => {
    expect(secondsLeft('2026-11-22T12:09:41.000Z', now)).toBe(581);
  });
  it('nunca passa de 10 minutos (relógio do aparelho atrasado não estica o prazo) nem fica negativo', () => {
    expect(secondsLeft('2026-11-22T13:00:00.000Z', now)).toBe(UNDO_WINDOW_MS / 1000);
    expect(secondsLeft('2026-11-22T11:00:00.000Z', now)).toBe(0);
    expect(secondsLeft('lixo', now)).toBe(0);
  });
});

describe('UndoNotice: texto do resultado', () => {
  it('tudo voltou', () => {
    expect(undoOutcome({ batchId: 'b', alreadyUndone: false, reverted: 8, skipped: [] })).toBe('Preços voltaram ao valor anterior.');
  });
  it('parcial: diz quantos voltaram e nomeia até 3 dos que foram editados depois', () => {
    const skipped = ['A', 'B', 'C', 'D'].map((name, i) => ({ productId: `p${i}`, name, reason: 'CHANGED_AFTER' as const }));
    const text = undoOutcome({ batchId: 'b', alreadyUndone: false, reverted: 2, skipped });
    expect(text).toContain('2 preços voltaram ao valor anterior');
    expect(text).toContain('4 produtos foram editados depois do reajuste e não mudou: A, B, C e mais 1.');
  });
});

describe('UndoNotice: anúncio para leitor de tela (design §4)', () => {
  it('só avisa em 5:00, 1:00 e ao expirar; nunca a cada segundo', () => {
    expect(announcement(581)).toBe('');
    expect(announcement(301)).toBe('');
    expect(announcement(300)).toBe('Faltam 5 minutos para desfazer o reajuste.');
    expect(announcement(120)).toBe('Faltam 5 minutos para desfazer o reajuste.');
    expect(announcement(60)).toBe('Falta 1 minuto para desfazer o reajuste.');
    expect(announcement(1)).toBe('Falta 1 minuto para desfazer o reajuste.');
    expect(announcement(0)).toBe('O prazo para desfazer acabou.');
  });
});
