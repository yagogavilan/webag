import { describe, expect, it } from 'vitest';
import { groupSecret, qrPath } from './totp-setup';

describe('TotpSetup helpers', () => {
  it('agrupa o segredo em blocos de 4', () => {
    expect(groupSecret('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
  });

  it('desenha o QR como caminho SVG (sem HTML injetado)', () => {
    const qr = qrPath('otpauth://totp/Webag:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=Webag');
    expect(qr.size).toBeGreaterThan(20);
    expect(qr.path).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(qr.path).not.toContain('<');
  });
});
