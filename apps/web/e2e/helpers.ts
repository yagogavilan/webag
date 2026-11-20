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

/** Base da API falsa (para semear lojas em análise sem depender de outro teste). */
export const FAKE_API = `http://localhost:${process.env.E2E_API_PORT ?? process.env.PORT ?? 3999}`;

export async function seedStoreInReview(name: string): Promise<{ id: string; name: string; documents: string[] }> {
  const response = await fetch(`${FAKE_API}/__test/seed-store`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) throw new Error(`seed falhou: ${response.status}`);
  return (await response.json()) as { id: string; name: string; documents: string[] };
}

/** Foto de documento de teste: JPEG gerado no navegador não é necessário; um PNG 160x120 legível basta para recorte e compressão. */
export function documentPhoto(): { name: string; mimeType: string; buffer: Buffer } {
  return { name: 'documento.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') };
}
// PNG 160x120 em tons de cinza claro, gerado uma vez com zlib (sem dependência nova).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAAAAABQyaazAAABSklEQVR4nO3ZtwHCAADEwN9/AKKNiTaYnPNuDPEFKr5Xcb3U6fb6g2FRjqrxZDqbL+pmuWrXm+1ufziezpfr7f54vt6f7786wX0dwX1dwX09wX19wX0DwX1DwX2F4L5ScN9IcF8luG8suG8iuG8quG8muG8uuG8huK8W3NcI7lsK7lsJ7msF960F920E920F9+0E9+0F9x0E9x0F950E950F910E910F990E990F9z0E9z0F970E970F930E9+WT2F0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7hdPonb5ZO4XT6J2+WTuF0+idvlk7gd/pP8AFs4q2CNGES1AAAAAElFTkSuQmCC';

export async function loginLojista(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/lojista/entrar');
  await page.getByTestId('lojista.login.email-input').fill(email);
  await page.getByTestId('lojista.login.password-input').fill(password);
  await page.getByTestId('lojista.login.submit').click();
  // Espera o painel abrir: navegar antes disso derrubaria o cookie de sessão que ainda está sendo gravado.
  await page.waitForURL((url) => !url.pathname.includes('/entrar'));
}

/** Semeia um lojista com loja APROVADA (o catálogo só abre depois da aprovação) e entra no painel. */
export async function seedMerchant(name = 'Casa Bela'): Promise<{ email: string; password: string; storeId: string }> {
  const response = await fetch(`${FAKE_API}/__test/seed-merchant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) throw new Error(`seed falhou: ${response.status}`);
  return (await response.json()) as { email: string; password: string; storeId: string };
}
