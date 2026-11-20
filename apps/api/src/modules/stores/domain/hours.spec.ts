import { isOpenNow, pauseUntil, validateDayIntervals, type OpenState, type WeeklyHours } from './hours.js';

const wed = 3; // 2026-11-18 é quarta
const hours: WeeklyHours = { 0: [], 1: [], 2: [], [wed]: [{ startMin: 9 * 60, endMin: 12 * 60 }, { startMin: 14 * 60, endMin: 18 * 60 }], 4: [], 5: [], 6: [] };
const base: OpenState = { hours, holidays: new Set(), pausedUntil: null, pausedIndefinitely: false };
// BRT = UTC-3: 2026-11-18T12:00:00Z é 09:00 local
const at = (h: number, m = 0, s = 0): Date => new Date(Date.UTC(2026, 10, 18, h + 3, m, s));

describe('isOpenNow (RN-03, R-16, O2-HOR-02)', () => {
  it('08:59:59 fechada, 09:00:00 aberta, fim EXCLUSIVO: 12:00:00 fechada, pausa do almoço, 14:00 aberta, 18:00 fechada', () => {
    expect(isOpenNow(base, at(8, 59, 59))).toBe(false);
    expect(isOpenNow(base, at(9, 0, 0))).toBe(true);
    expect(isOpenNow(base, at(11, 59, 59))).toBe(true);
    expect(isOpenNow(base, at(12, 0, 0))).toBe(false);
    expect(isOpenNow(base, at(13, 30))).toBe(false);
    expect(isOpenNow(base, at(14, 0))).toBe(true);
    expect(isOpenNow(base, at(18, 0))).toBe(false);
  });

  it('o horário usa o fuso local: 23:30 UTC é 20:30 em São Paulo (fechada) e 12:30 UTC é 09:30 (aberta)', () => {
    expect(isOpenNow(base, new Date('2026-11-18T23:30:00Z'))).toBe(false);
    expect(isOpenNow(base, new Date('2026-11-18T12:30:00Z'))).toBe(true);
  });

  it('feriado só afeta o próprio dia', () => {
    const holiday = { ...base, holidays: new Set(['2026-11-18']) };
    expect(isOpenNow(holiday, at(10))).toBe(false);
    expect(isOpenNow({ ...base, holidays: new Set(['2026-11-17', '2026-11-19']) }, at(10))).toBe(true);
  });

  it('pausa com prazo reabre sozinha 1 s depois do fim; "até reabrir" só reabre por ação', () => {
    const now = at(10);
    const { pausedUntil } = pauseUntil('1h', now);
    const paused = { ...base, pausedUntil };
    expect(isOpenNow(paused, new Date(now.getTime() + 59 * 60_000))).toBe(false);
    expect(isOpenNow(paused, new Date(pausedUntil!.getTime() + 1000))).toBe(true);
    expect(isOpenNow({ ...base, pausedIndefinitely: true }, at(10))).toBe(false);
    expect(pauseUntil('until_resume', now)).toEqual({ pausedUntil: null, pausedIndefinitely: true });
  });

  it('"até o fim do dia" vence às 23:59:59.999 local', () => {
    const { pausedUntil } = pauseUntil('end_of_day', at(10));
    expect(pausedUntil?.toISOString()).toBe('2026-11-19T02:59:59.999Z');
  });
});

describe('validateDayIntervals (WB-056 C1)', () => {
  it('até 2 intervalos, fim depois do início, sem sobreposição, último fim 23:59', () => {
    expect(validateDayIntervals([{ startMin: 540, endMin: 720 }, { startMin: 840, endMin: 1080 }])).toBeNull();
    expect(validateDayIntervals([{ startMin: 540, endMin: 540 }])).not.toBeNull();
    expect(validateDayIntervals([{ startMin: 600, endMin: 540 }])).not.toBeNull();
    expect(validateDayIntervals([{ startMin: 540, endMin: 800 }, { startMin: 700, endMin: 900 }])).toMatch(/sobrepor/);
    expect(validateDayIntervals([{ startMin: 0, endMin: 60 }, { startMin: 100, endMin: 200 }, { startMin: 300, endMin: 400 }])).toMatch(/2 intervalos/);
    expect(validateDayIntervals([{ startMin: 1200, endMin: 1439 }])).toBeNull();
    expect(validateDayIntervals([{ startMin: 1200, endMin: 1440 }])).not.toBeNull();
  });
});
