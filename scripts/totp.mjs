#!/usr/bin/env node
// Gera o código TOTP de 6 dígitos (RFC 6238) a partir do segredo que o painel mostra ao configurar o autenticador.
// Só para DESENVOLVIMENTO: em produção use um app autenticador de verdade (Google Authenticator, Authy, 1Password...).
// Uso: node scripts/totp.mjs <SEGREDO>        (espaços no segredo são aceitos)  |  pnpm totp <SEGREDO>
// O código vale ~30 s; se o painel recusar, rode de novo e use o código novo.
import { createHmac } from 'node:crypto';

const secret = process.argv.slice(2).join('');
if (!secret) {
  console.error('Uso: node scripts/totp.mjs <SEGREDO>   (o segredo aparece na tela de configurar o autenticador do painel admin)');
  process.exit(1);
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = 0;
let value = 0;
const bytes = [];
for (const char of secret.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
  value = (value << 5) | alphabet.indexOf(char);
  bits += 5;
  if (bits >= 8) {
    bytes.push((value >>> (bits - 8)) & 255);
    bits -= 8;
  }
}
const step = 30;
const now = Math.floor(Date.now() / 1000);
const message = Buffer.alloc(8);
message.writeBigUInt64BE(BigInt(Math.floor(now / step)));
const hmac = createHmac('sha1', Buffer.from(bytes)).update(message).digest();
const offset = hmac[hmac.length - 1] & 0x0f;
const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
console.log(String(binary % 1_000_000).padStart(6, '0'), `(vale por mais ${step - (now % step)} s)`);
