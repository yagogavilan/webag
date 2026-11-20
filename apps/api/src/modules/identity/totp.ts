import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 (HOTP) com HMAC-SHA1, truncamento dinâmico. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export const totpStep = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

export const generateTotp = (secretBase32: string, nowMs: number): string =>
  hotp(base32Decode(secretBase32), totpStep(nowMs));

/**
 * RFC 6238. Aceita ±1 passo (relógio do celular). `lastStep` impede reusar o mesmo código ou um mais antigo
 * (anti-replay). Devolve o passo aceito para o chamador persistir.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastStep: number | null,
): { ok: true; step: number } | { ok: false } {
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  for (const delta of [0, -1, 1]) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    if (hotp(secret, step) === code) return { ok: true, step };
  }
  return { ok: false };
}

export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export function otpauthUri(accountEmail: string, secretBase32: string, issuer = 'Webag'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

/** Código de recuperação: 16 caracteres base32 em 4 grupos (80 bits). */
export function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(10));
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export const normalizeRecoveryCode = (code: string): string => code.toUpperCase().replace(/[^A-Z2-7]/g, '');
