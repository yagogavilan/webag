import { describe, expect, it } from 'vitest';
import type { StoreSettings } from '@/lib/api/store-settings';
import { closesAt, nextOpening, storeStatus } from './store-status';

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, intervals: [{ start: '09:00', end: '18:00' }] }));
const base = (over: Partial<StoreSettings> = {}): StoreSettings => ({ isOpenNow: true, hours: week, holidays: [], pause: { active: false, until: null, indefinitely: false }, ...over }) as StoreSettings;
// 2026-11-18 é quarta-feira. 15:00Z = 12:00 em São Paulo.
const wedNoon = new Date('2026-11-18T15:00:00Z');
const wedNight = new Date('2026-11-18T23:00:00Z');
const friNight = new Date('2026-11-20T23:00:00Z');

describe('storeStatus (V8.5)', () => {
  it('aberta: diz quando fecha e é o único estado que oferece pausar', () => {
    expect(storeStatus(base(), wedNoon)).toEqual({ state: 'open', text: 'Aberta · fecha às 18:00' });
    expect(storeStatus(base({ hours: [] }), wedNoon)).toEqual({ state: 'open', text: 'Aberta' });
  });
  it('fechada pelo horário: diz quando abre', () => {
    expect(storeStatus(base({ isOpenNow: false }), wedNight)).toEqual({ state: 'closed_by_hours', text: 'Fechada pelo horário · abre amanhã às 09:00' });
    expect(storeStatus(base({ isOpenNow: false }), friNight)).toEqual({ state: 'closed_by_hours', text: 'Fechada pelo horário · abre segunda às 09:00' });
    expect(storeStatus(base({ isOpenNow: false, hours: [] }), wedNight)).toEqual({ state: 'closed_by_hours', text: 'Fechada pelo horário' });
  });
  it('pausada ganha da hora: com prazo ou até voltar a vender', () => {
    const until = '2026-11-18T18:30:00Z';
    expect(storeStatus(base({ pause: { active: true, until, indefinitely: false } }), wedNoon)).toEqual({ state: 'paused', text: 'Pausada até 15:30' });
    expect(storeStatus(base({ isOpenNow: false, pause: { active: true, until: null, indefinitely: true } }), wedNoon).state).toBe('paused');
  });
  it('próxima abertura antes do expediente é hoje e pula feriado', () => {
    const early = new Date('2026-11-18T10:00:00Z'); // 07:00 em SP
    expect(nextOpening({ hours: week, holidays: [] }, early)).toBe('às 09:00');
    expect(nextOpening({ hours: week, holidays: [{ date: '2026-11-19', label: null }] }, wedNight)).toBe('sexta às 09:00');
  });
  it('closesAt usa o fuso de São Paulo', () => {
    expect(closesAt(week, wedNoon)).toBe('18:00');
    expect(closesAt(week, wedNight)).toBeNull();
  });
});
