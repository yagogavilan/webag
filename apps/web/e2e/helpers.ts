import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** Segredo TOTP semeado do super admin na API falsa (`SUPER_SECRET`). */
export const SUPER_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const PASSWORD = 'Webag-Admin-Dev-2026';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** TOTP de 6 dígitos (RFC 6238, 30 s, SHA-1), igual ao da API falsa. */
export function totp(secret: string = SUPER_SECRET, at: number = Date.now()): string {
  let bits = '';
  for (const ch of secret.toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  return (((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)).toString().padStart(6, '0');
}

export async function login(page: Page, email: string, password: string = PASSWORD): Promise<void> {
  await page.goto('/admin/entrar');
  await page.getByTestId('admin.login.email-input').fill(email);
  await page.getByTestId('admin.login.password-input').fill(password);
  await page.getByTestId('admin.login.submit').click();
  await expect(page.getByTestId('admin.login.totp-input')).toBeVisible();
  await page.getByLabel('Dígito 1 de 6').pressSequentially(totp());
  await expect(page.getByTestId('user-name')).toBeVisible();
}
