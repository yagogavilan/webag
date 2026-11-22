import { describe, expect, it } from 'vitest';
import { ADMIN_REASON_CODES, cleanNote, PRICE_REASON_CODES, validateAdminReason } from './admin-reason.js';

describe('motivo das alterações do admin (WB-351 C7, D7)', () => {
  it('são 8 códigos e 4 valem para preço', () => {
    expect(ADMIN_REASON_CODES).toHaveLength(8);
    expect([...PRICE_REASON_CODES].sort()).toEqual(['agreed_campaign', 'legal_or_inspection_order', 'obvious_price_error', 'requested_by_merchant']);
  });

  it.each([
    ['sem motivo', undefined],
    ['sem código', {}],
    ['código desconhecido', { code: 'porque_sim' }],
    ['código não é texto', { code: 7 }],
  ])('%s = REASON_REQUIRED', (_n, reason) => {
    expect(validateAdminReason(reason, { flagOn: true })).toMatchObject({ ok: false, problem: { code: 'REASON_REQUIRED', field: 'reason.code' } });
  });

  it('"solicitado pelo lojista" e "outro" exigem a nota; os demais não', () => {
    expect(validateAdminReason({ code: 'requested_by_merchant' }, { flagOn: false })).toMatchObject({ ok: false, problem: { code: 'REASON_REQUIRED', field: 'reason.note' } });
    expect(validateAdminReason({ code: 'requested_by_merchant', note: '   ' }, { flagOn: false })).toMatchObject({ ok: false });
    expect(validateAdminReason({ code: 'other' }, { flagOn: true })).toMatchObject({ ok: false, problem: { field: 'reason.note' } });
    expect(validateAdminReason({ code: 'error_fix' }, { flagOn: true })).toEqual({ ok: true, reason: { code: 'error_fix' } });
  });

  it('a nota tem até 200 caracteres e vira texto puro', () => {
    expect(validateAdminReason({ code: 'other', note: 'x'.repeat(201) }, { flagOn: true })).toMatchObject({ ok: false });
    expect(validateAdminReason({ code: 'other', note: 'x'.repeat(200) }, { flagOn: true })).toMatchObject({ ok: true });
    expect(cleanNote('  WhatsApp,\n24/11\t\u0000  ')).toBe('WhatsApp, 24/11');
    expect(cleanNote('   ')).toBeUndefined();
  });

  it('flag J27 desligada: só "solicitado pelo lojista"; ligada: os 5 gerais', () => {
    for (const code of ADMIN_REASON_CODES.filter((c) => c !== 'requested_by_merchant')) {
      expect(validateAdminReason({ code, note: 'texto' }, { flagOn: false }), code).toMatchObject({ ok: false, problem: { code: 'REASON_NOT_ALLOWED' } });
    }
    expect(validateAdminReason({ code: 'requested_by_merchant', note: 'WhatsApp, 24/11' }, { flagOn: false })).toMatchObject({ ok: true });
    for (const code of ['error_fix', 'moderation', 'operational_decision', 'other'] as const) expect(validateAdminReason({ code, note: 'texto' }, { flagOn: true }), code).toMatchObject({ ok: true });
  });

  it('preço só aceita os 4 motivos (mesmo com a flag ligada)', () => {
    for (const code of ['error_fix', 'moderation', 'operational_decision', 'other'] as const) expect(validateAdminReason({ code, note: 'texto' }, { flagOn: true, price: true }), code).toMatchObject({ ok: false, problem: { code: 'REASON_NOT_ALLOWED' } });
    for (const code of PRICE_REASON_CODES) expect(validateAdminReason({ code, note: 'canal e data' }, { flagOn: true, price: true }), code).toMatchObject({ ok: true });
  });
});
