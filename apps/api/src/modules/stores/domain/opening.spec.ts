import { hoursToday, nextOpening, type OpeningInput } from './opening.js';

// 2026-11-18 é quarta-feira (weekday 3). 12:00 UTC = 09:00 em São Paulo.
const at = (iso: string): Date => new Date(iso);
const base = (over: Partial<OpeningInput> = {}): OpeningInput => ({
  hours: { 1: [{ startMin: 480, endMin: 1080 }], 3: [{ startMin: 480, endMin: 720 }, { startMin: 840, endMin: 1080 }], 4: [{ startMin: 480, endMin: 1080 }] },
  holidays: new Set(),
  pausedUntil: null,
  pausedIndefinitely: false,
  ...over,
});

describe('próxima abertura e horários de hoje (RN-03, WB-016 C3)', () => {
  it('fechada no intervalo do almoço: abre às 14:00 do mesmo dia', () => {
    expect(nextOpening(base(), at('2026-11-18T15:30:00Z'))?.toISOString()).toBe('2026-11-18T17:00:00.000Z');
  });
  it('depois do último intervalo: abre no próximo dia com horário (quinta 08:00)', () => {
    expect(nextOpening(base(), at('2026-11-18T22:00:00Z'))?.toISOString()).toBe('2026-11-19T11:00:00.000Z');
  });
  it('feriado marcado pula o dia', () => {
    expect(nextOpening(base({ holidays: new Set(['2026-11-19']) }), at('2026-11-18T22:00:00Z'))?.toISOString()).toBe('2026-11-23T11:00:00.000Z');
  });
  it('pausa indefinida não tem previsão; pausa com prazo empurra a abertura', () => {
    expect(nextOpening(base({ pausedIndefinitely: true }), at('2026-11-18T12:00:00Z'))).toBeNull();
    expect(nextOpening(base({ pausedUntil: at('2026-11-18T20:00:00Z') }), at('2026-11-18T12:00:00Z'))?.toISOString()).toBe('2026-11-18T20:00:00.000Z');
  });
  it('sem horário nenhum nos próximos 7 dias: null', () => {
    expect(nextOpening(base({ hours: {} }), at('2026-11-18T12:00:00Z'))).toBeNull();
  });
  it('horários de hoje em HH:MM e vazio em feriado', () => {
    expect(hoursToday(base(), at('2026-11-18T12:00:00Z'))).toEqual([{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }]);
    expect(hoursToday(base({ holidays: new Set(['2026-11-18']) }), at('2026-11-18T12:00:00Z'))).toEqual([]);
  });
});
