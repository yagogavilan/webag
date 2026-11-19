import { decryptSecret, encryptSecret } from './crypto.js';
/**
 * Cifra do segredo TOTP (SEC-090): AES-256-GCM com a chave própria `MFA_ENC_KEY` (fora do banco), nonce aleatório
 * de 96 bits a cada cifragem e AAD = usuário + versão da chave. Trocar o texto cifrado entre contas falha na decifragem.
 */
export const MFA_KEY_VERSION = 'k1';
const aad = (userId) => `user:${userId}:${MFA_KEY_VERSION}`;
export const sealMfaSecret = (secret, userId, key) => encryptSecret(secret, key, 'mfa-totp', aad(userId));
export const openMfaSecret = (sealed, userId, key) => decryptSecret(sealed, key, 'mfa-totp', aad(userId));
//# sourceMappingURL=mfa-seal.js.map