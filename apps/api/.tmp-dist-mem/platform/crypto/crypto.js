import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual, } from 'node:crypto';
export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
export const hmacHex = (key, message) => createHmac('sha256', key).update(message).digest('hex');
/** Token opaco de `bytes` bytes aleatórios (256 bits por padrão), em base64url. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
/** Comparação em tempo constante (strings de tamanhos diferentes retornam false sem vazar o tamanho). */
export function safeEqual(a, b) {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
}
function deriveKey(secret, info) {
    return Buffer.from(hkdfSync('sha256', secret, 'webag-v1', info, 32));
}
/** AES-256-GCM com chave derivada do segredo do servidor (HKDF, contexto `info`). Formato: v1.iv.tag.ct (base64url). */
export function encryptSecret(plaintext, secret, info, aad) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, info), iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decryptSecret(payload, secret, info, aad) {
    const [version, iv, tag, ct] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !ct)
        throw new Error('Formato de segredo cifrado inválido');
    // SEC-139: a tag GCM tem SEMPRE 16 bytes; tag curta (que o Node aceitaria) reduz a segurança da autenticação.
    const tagBytes = Buffer.from(tag, 'base64url');
    if (tagBytes.length !== 16)
        throw new Error('Formato de segredo cifrado inválido');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, info), Buffer.from(iv, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
//# sourceMappingURL=crypto.js.map