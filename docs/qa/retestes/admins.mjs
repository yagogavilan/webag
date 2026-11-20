// Perfis de admin dos retestes (G4 RC): convida os 3 perfis (operação, financeiro, suporte) pelo convite de verdade (e-mail, aceite, TOTP),
// guarda e-mail e segredo num arquivo (QA_PROFILES_FILE) para reaproveitar entre execuções, e faz login/reautenticação por perfil.
// O super admin é o `adminCall` do lib.mjs. Um passo TOTP de 30 s só vale uma vez por usuário (por isso o `lastStep` de cada admin).
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, adminCall, sleep } from './lib.mjs';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const ADMIN_PASSWORD = 'Webag-Admin-Qa-2026-xK9!';
const FILE = process.env.QA_PROFILES_FILE ?? join(tmpdir(), 'webag-qa-profiles.json');

export function totp(secret, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}

export async function mailTo(email, pattern, { tries = 30, minCreatedAfter = 0 } = {}) {
  for (let i = 0; i < tries; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json().catch(() => ({}));
    for (const m of found.messages ?? []) {
      if (new Date(m.Created).getTime() < minCreatedAfter) continue;
      const detail = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const text = `${detail.Text ?? ''} ${detail.HTML ?? ''}`;
      const hit = text.match(pattern);
      if (hit) return { match: hit, text, subject: detail.Subject, id: m.ID };
    }
    await sleep(500);
  }
  return null;
}

async function enroll(profile) {
  const email = `qa9.${profile}.${Date.now()}@seed.webag.local`;
  const inv = await adminCall('POST', '/v1/admin/admins', { name: `Admin QA ${profile}`, email, profile });
  if (inv.status !== 201) throw new Error(`convite ${profile}: ${inv.status} ${JSON.stringify(inv.data).slice(0, 160)}`);
  const mail = await mailTo(email, /convite\?token=([A-Za-z0-9_-]{20,})/);
  const token = mail?.match?.[1];
  const accepted = await api('POST', '/v1/auth/invitations/accept', { body: { token, password: ADMIN_PASSWORD } });
  if (accepted.status !== 200) throw new Error(`aceitar convite ${profile}: ${accepted.status} ${JSON.stringify(accepted.data).slice(0, 160)}`);
  const limited = accepted.data.tokens.accessToken;
  const setup = await api('POST', '/v1/admin/totp/setup', { token: limited });
  const confirm = await api('POST', '/v1/admin/totp/confirm', { token: limited, body: { code: totp(setup.data.secret) } });
  if (confirm.status !== 200) throw new Error(`totp ${profile}: ${confirm.status}`);
  return { profile, email, secret: setup.data.secret, lastStep: Math.floor(Date.now() / 30000), inviteLink: mail.text.match(/https?:\/\/[^\s"<]*convite\?token=[A-Za-z0-9_-]+/)?.[0] ?? null };
}

/** Os três perfis não super (cria uma vez, guarda em arquivo). */
export async function profiles() {
  let all = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  for (const p of ['operations', 'finance', 'support']) {
    if (!all[p]) {
      all[p] = await enroll(p);
      writeFileSync(FILE, JSON.stringify(all, null, 2));
    }
  }
  return all;
}
const save = (all) => writeFileSync(FILE, JSON.stringify(all, null, 2));

export async function session(a, all) {
  while (Math.floor(Date.now() / 30000) <= a.lastStep) await sleep(1500);
  const first = await api('POST', '/v1/auth/login', { body: { email: a.email, password: ADMIN_PASSWORD } });
  const step = Math.floor(Date.now() / 30000);
  const verify = await api('POST', '/v1/auth/mfa/verify', { body: { mfaToken: first.data?.mfaToken, code: totp(a.secret) } });
  a.lastStep = step;
  if (all) save(all);
  if (verify.status !== 200) throw new Error(`login ${a.profile}: ${first.status}/${verify.status} ${JSON.stringify(verify.data).slice(0, 120)}`);
  a.token = verify.data.tokens.accessToken;
  return a.token;
}

/** Chamada como o perfil, com reautenticação (TOTP) quando a API pedir. */
export async function as(a, method, path, body, headers, all) {
  let r = await api(method, path, { body, token: a.token, headers });
  if (r.status === 403 && r.data?.code === 'REAUTH_REQUIRED') {
    while (Math.floor(Date.now() / 30000) <= a.lastStep) await sleep(1500);
    const step = Math.floor(Date.now() / 30000);
    const re = await api('POST', '/v1/auth/reauth', { token: a.token, body: { totpCode: totp(a.secret) } });
    a.lastStep = step;
    if (all) save(all);
    if (![200, 204].includes(re.status)) throw new Error(`reauth ${a.profile}: ${re.status}`);
    r = await api(method, path, { body, token: a.token, headers });
  }
  return r;
}
