import { base32Decode, base32Encode, generateRecoveryCode, generateTotp, hotp, verifyTotp } from './totp.js';

describe('TOTP (RFC 4226 / 6238)', () => {
  const asciiSecret = Buffer.from('12345678901234567890');

  it('HOTP bate com os vetores da RFC 4226', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(asciiSecret, counter)).toBe(code));
  });

  it('TOTP bate com o vetor da RFC 6238 (t = 59 s, 6 dígitos)', () => {
    expect(generateTotp(base32Encode(asciiSecret), 59_000)).toBe('287082');
  });

  it('base32 faz ida e volta', () => {
    const secret = base32Encode(asciiSecret);
    expect(base32Decode(secret).equals(asciiSecret)).toBe(true);
  });

  it('aceita ±1 passo, recusa fora da janela e recusa reuso (anti-replay)', () => {
    const secret = base32Encode(asciiSecret);
    const now = 1_700_000_000_000;
    const code = generateTotp(secret, now);

    const first = verifyTotp(secret, code, now, null);
    expect(first.ok).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000, null).ok).toBe(true);
    expect(verifyTotp(secret, code, now + 90_000, null).ok).toBe(false);
    if (first.ok) expect(verifyTotp(secret, code, now, first.step).ok).toBe(false);
    expect(verifyTotp(secret, '12345', now, null).ok).toBe(false);
  });

  it('código de recuperação tem 16 caracteres em 4 grupos', () => {
    expect(generateRecoveryCode()).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  });
});
