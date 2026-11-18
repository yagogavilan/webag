import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export const hmacHex = (key: string, message: string): string =>
  createHmac('sha256', key).update(message).digest('hex');

/** Token opaco de `bytes` bytes aleatórios (256 bits por padrão), em base64url. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Comparação em tempo constante (strings de tamanhos diferentes retornam false sem vazar o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function deriveKey(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'webag-v1', info, 32));
}

/** AES-256-GCM com chave derivada do segredo do servidor (HKDF, contexto `info`). Formato: v1.iv.tag.ct (base64url). */
export function encryptSecret(plaintext: string, secret: string, info: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, info), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, secret: string, info: string, aad: string): string {
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Formato de segredo cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, info), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
