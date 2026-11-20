import { businessDeadline, isOverdue, localParts } from './business-days.js';

describe('dias úteis em America/Sao_Paulo (R-15a, O2-APR-02)', () => {
  // Sexta 2026-11-20 17:00 BRT = 20:00 UTC
  const friday = new Date('2026-11-20T20:00:00Z');

  it('enviada sexta 17:00 vence terça 17:00 (SLA de 2 dias úteis), não domingo', () => {
    expect(businessDeadline(friday, 2).toISOString()).toBe('2026-11-24T20:00:00.000Z');
    expect(isOverdue(friday, 2, new Date('2026-11-22T20:00:00Z'))).toBe(false); // domingo
    expect(isOverdue(friday, 2, new Date('2026-11-24T19:59:00Z'))).toBe(false);
    expect(isOverdue(friday, 2, new Date('2026-11-24T20:01:00Z'))).toBe(true);
  });

  it('enviada segunda vence quarta; o fuso converte o dia local (23:30 UTC é 20:30 do mesmo dia)', () => {
    expect(businessDeadline(new Date('2026-11-23T12:00:00Z'), 2).toISOString()).toBe('2026-11-25T12:00:00.000Z');
    expect(localParts(new Date('2026-11-18T02:30:00Z')).isoDate).toBe('2026-11-17');
    expect(localParts(new Date('2026-11-18T23:30:00Z'))).toMatchObject({ isoDate: '2026-11-18', minuteOfDay: 20 * 60 + 30, weekday: 3 });
  });
});
