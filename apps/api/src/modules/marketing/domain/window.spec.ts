import { isInWindow, nextWindowStart } from './window.js';

const sp = (iso: string): Date => new Date(`${iso}-03:00`);

describe('janela de marketing (9h às 20h, Brasília)', () => {
  const window = '09:00-20:00';
  it('dentro da janela vale o próprio instante', () => {
    expect(isInWindow(sp('2026-11-19T09:00:00'), window)).toBe(true);
    expect(isInWindow(sp('2026-11-19T19:59:59'), window)).toBe(true);
    expect(nextWindowStart(sp('2026-11-19T12:30:00'), window).toISOString()).toBe(sp('2026-11-19T12:30:00').toISOString());
  });
  it('antes de abrir vai para hoje às 9h; depois de fechar, para amanhã às 9h ("Será enviado amanhã às 9:00")', () => {
    expect(isInWindow(sp('2026-11-19T20:00:00'), window)).toBe(false);
    expect(nextWindowStart(sp('2026-11-19T07:10:00'), window).toISOString()).toBe(sp('2026-11-19T09:00:00').toISOString());
    expect(nextWindowStart(sp('2026-11-19T20:00:00'), window).toISOString()).toBe(sp('2026-11-20T09:00:00').toISOString());
    expect(nextWindowStart(sp('2026-11-19T23:59:00'), window).toISOString()).toBe(sp('2026-11-20T09:00:00').toISOString());
    expect(nextWindowStart(sp('2026-12-31T22:00:00'), window).toISOString()).toBe(sp('2027-01-01T09:00:00').toISOString());
  });
});
