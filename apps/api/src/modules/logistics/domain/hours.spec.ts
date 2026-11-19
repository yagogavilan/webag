import { endsBeforeClosing, isLogisticsOpen, nextLogisticsOpening, type LogisticsHours } from './hours.js';

const hours: LogisticsHours = { window: '09:00-20:00', days: 'seg_sab' };
// 2026-11-18 é quarta-feira; 2026-11-22 é domingo. Brasília = UTC-3.
const at = (iso: string) => new Date(iso);

describe('Horário da logística (BUG-016)', () => {
  it('abre de seg a sáb, 09:00 inclusive até 20:00 exclusive (horário de Brasília)', () => {
    expect(isLogisticsOpen(hours, at('2026-11-18T12:00:00Z'))).toBe(true); // 09:00 BRT
    expect(isLogisticsOpen(hours, at('2026-11-18T11:59:00Z'))).toBe(false); // 08:59
    expect(isLogisticsOpen(hours, at('2026-11-18T22:59:00Z'))).toBe(true); // 19:59
    expect(isLogisticsOpen(hours, at('2026-11-18T23:00:00Z'))).toBe(false); // 20:00
    expect(isLogisticsOpen(hours, at('2026-11-22T15:00:00Z'))).toBe(false); // domingo
    expect(isLogisticsOpen(hours, at('2026-11-21T15:00:00Z'))).toBe(true); // sábado
  });

  it('o dia civil é o de Brasília, não o UTC (23:30 BRT de terça ainda é terça)', () => {
    expect(isLogisticsOpen({ window: '09:00-23:59', days: 'seg_sex' }, at('2026-11-21T02:30:00Z'))).toBe(true); // sex 23:30 BRT = sáb 02:30 UTC
  });

  it('próxima abertura: hoje de manhã, amanhã ou segunda depois do domingo', () => {
    expect(nextLogisticsOpening(hours, at('2026-11-18T10:00:00Z')).toISOString()).toBe('2026-11-18T12:00:00.000Z'); // 07:00 BRT -> hoje 09:00
    expect(nextLogisticsOpening(hours, at('2026-11-18T23:30:00Z')).toISOString()).toBe('2026-11-19T12:00:00.000Z'); // depois do fechamento -> amanhã
    expect(nextLogisticsOpening(hours, at('2026-11-21T23:30:00Z')).toISOString()).toBe('2026-11-23T12:00:00.000Z'); // sábado à noite -> segunda
    expect(nextLogisticsOpening({ ...hours, days: 'seg_dom' }, at('2026-11-21T23:30:00Z')).toISOString()).toBe('2026-11-22T12:00:00.000Z');
  });

  it('fim da faixa antes do fechamento (BUG-021, RN-19 item 2): borda exclusiva, virou o dia = não, 24 h = só o dia da chegada', () => {
    const now = at('2026-11-18T22:40:00Z'); // 19:40 BRT
    expect(endsBeforeClosing(hours, at('2026-11-18T17:00:00Z'), at('2026-11-18T22:59:00Z'))).toBe(true); // 19:59
    expect(endsBeforeClosing(hours, at('2026-11-18T17:00:00Z'), at('2026-11-18T23:00:00Z'))).toBe(false); // 20:00
    expect(endsBeforeClosing(hours, now, at('2026-11-19T00:31:00Z'))).toBe(false); // 21:31
    expect(endsBeforeClosing({ window: '09:00-23:59', days: 'seg_dom' }, at('2026-11-19T01:30:00Z'), at('2026-11-19T03:30:00Z'))).toBe(false); // 22:30 -> 00:30 do dia seguinte
    const allDay: LogisticsHours = { window: '00:00-23:59', days: 'seg_sab' };
    expect(endsBeforeClosing(allDay, at('2026-11-19T01:30:00Z'), at('2026-11-19T03:30:00Z'))).toBe(true); // sem fechamento
    expect(endsBeforeClosing(allDay, at('2026-11-22T01:30:00Z'), at('2026-11-22T03:30:00Z'))).toBe(false); // chega no domingo (dia fechado)
  });
});
