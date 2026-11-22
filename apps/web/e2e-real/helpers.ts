import { createHash, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Helpers dos E2E contra a API REAL (sem API falsa). Ver `playwright.real.config.ts`. */
export const API = (process.env.REAL_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const MAIL = (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '');
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@webag.local';
/** Valor de uma chave no `.env` da raiz (os testes rodam de `apps/web`); vazio se não houver `.env` ou a chave. */
function rootEnvValue(key: string): string | undefined {
  try {
    const raw = readFileSync(resolve(process.cwd(), '../../.env'), 'utf8');
    const line = raw.split(/\r?\n/).findLast((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    return line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2') || undefined;
  } catch {
    return undefined;
  }
}
/** Ordem: `ADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD` do `.env` da raiz (aleatória, gerada pelo `pnpm run setup`) e o padrão fixo de CI/dev. */
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? rootEnvValue('SEED_ADMIN_PASSWORD') ?? 'Webag-Admin-Dev-2026';
export const MERCHANT_PASSWORD = 'Webag-Lojista-2026!';

/**
 * Banco lido pelo psql nos testes 04 e 05. Ordem: `REAL_DB_URL`, `DATABASE_URL` do ambiente, `DATABASE_URL` do `.env` da raiz
 * (o banco do `pnpm run setup`; os testes rodam de `apps/web`) e, por fim, o banco padrão do setup em localhost:5432.
 */
function resolveDbUrl(): string {
  if (process.env.REAL_DB_URL) return process.env.REAL_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const raw = readFileSync(resolve(process.cwd(), '../../.env'), 'utf8');
    const line = raw.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  } catch {
    // sem .env: cai no padrão
  }
  return 'postgresql://webag:webag_dev_only@localhost:5432/webag';
}
export const REAL_DB_URL = resolveDbUrl();

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** TOTP RFC 6238 (SHA-1, 30 s, 6 dígitos). */
export function totpAt(secret: string, at: number = Date.now()): string {
  let bits = '';
  for (const ch of secret.toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

// ------------------------------------------------------------------ e-mail (API HTTP do Mailpit)

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/** Espera chegar e-mail ao endereço (que satisfaça `match`) e devolve assunto e texto. */
export async function waitForMail(to: string, match: (subject: string) => boolean = () => true, timeoutMs = 15_000): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (search.ok) {
      const body = (await search.json()) as { messages?: MailpitMessage[] };
      const found = (body.messages ?? []).find((m) => match(m.Subject));
      if (found) {
        const detail = (await (await fetch(`${MAIL}/api/v1/message/${found.ID}`)).json()) as { Text?: string; Subject: string };
        return { subject: detail.Subject, text: detail.Text ?? '' };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum e-mail para ${to} em ${timeoutMs} ms (Mailpit em ${MAIL})`);
}

/** Código de 6 dígitos do e-mail de confirmação (o assunto traz o código, como nos testes da API). */
export async function emailCode(to: string): Promise<string> {
  const mail = await waitForMail(to, (s) => /\b\d{6}\b/.test(s));
  return /\b(\d{6})\b/.exec(mail.subject)![1]!;
}

// ------------------------------------------------------------------ admin: TOTP matriculado pela API

interface AdminState {
  secret: string;
  lastStep: number;
}
// Fora de `test-results/` (o Playwright apaga essa pasta a cada execução) e fora do repositório; uma pasta por API.
const STATE = resolve(tmpdir(), 'webag-e2e-real', createHash('sha1').update(API).digest('hex').slice(0, 8), 'real-admin-totp.json');

function readState(): AdminState | null {
  return existsSync(STATE) ? (JSON.parse(readFileSync(STATE, 'utf8')) as AdminState) : null;
}
function writeState(state: AdminState): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state));
}

/** Matricula o TOTP do super admin semeado (uma vez) e devolve o segredo. */
export async function adminSecret(): Promise<string> {
  const known = readState();
  if (known) return known.secret;
  const login = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
  const body = (await login.json()) as { tokens?: { accessToken: string }; mfaRequired?: boolean };
  if (!body.tokens) throw new Error('O super admin já tem TOTP e o segredo não está salvo (diretório temporário webag-e2e-real): recrie o banco do QA (ambiente descartável).');
  const auth = { authorization: `Bearer ${body.tokens.accessToken}`, 'content-type': 'application/json' };
  const setup = (await (await fetch(`${API}/v1/admin/totp/setup`, { method: 'POST', headers: auth })).json()) as { secret: string };
  const confirm = await fetch(`${API}/v1/admin/totp/confirm`, { method: 'POST', headers: auth, body: JSON.stringify({ code: totpAt(setup.secret) }) });
  expect(confirm.status, 'matricular o TOTP do super admin').toBe(200);
  writeState({ secret: setup.secret, lastStep: Math.floor(Date.now() / 30_000) });
  return setup.secret;
}

/** Próximo código TOTP que o servidor ainda não viu (anti-replay SEC-015: o mesmo passo de 30 s não vale duas vezes). */
async function freshAdminCode(): Promise<string> {
  const secret = await adminSecret();
  const state = readState()!;
  let step = Math.floor(Date.now() / 30_000);
  if (step <= state.lastStep) {
    await new Promise((r) => setTimeout(r, ((state.lastStep + 1) * 30_000 - Date.now()) + 500));
    step = Math.floor(Date.now() / 30_000);
  }
  writeState({ secret, lastStep: step });
  return totpAt(secret);
}

/** Login do super admin pela interface (senha + TOTP em 2 passos). */
export async function adminLogin(page: Page): Promise<void> {
  const code = await freshAdminCode();
  await page.goto('/admin/entrar');
  await page.getByTestId('admin.login.email-input').fill(ADMIN_EMAIL);
  await page.getByTestId('admin.login.password-input').fill(ADMIN_PASSWORD);
  await page.getByTestId('admin.login.submit').click();
  await expect(page.getByTestId('admin.login.totp-input')).toBeVisible();
  await page.getByLabel('Dígito 1 de 6').pressSequentially(code);
  await expect(page.getByTestId('user-name')).toBeVisible();
}

export async function lojistaLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/lojista/entrar');
  await page.getByTestId('lojista.login.email-input').fill(email);
  await page.getByTestId('lojista.login.password-input').fill(password);
  await page.getByTestId('lojista.login.submit').click();
  await page.waitForURL((url) => !url.pathname.includes('/entrar'));
}

/** PNG válido (gradiente 800x600) gerado em runtime, sem dependência: o navegador recorta e comprime antes do envio. */
export function documentPhoto(): { name: string; mimeType: string; buffer: Buffer } {
  return { name: 'documento.png', mimeType: 'image/png', buffer: makePng(800, 600) };
}

function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = (x * 255) / width;
      raw[row + 2 + x * 3] = (y * 255) / height;
      raw[row + 3 + x * 3] = (x * y) % 256;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ preparação pela API (não é o que se testa; só monta o cenário)

/** Login do lojista pela API (sem MFA) e devolve o token de acesso. */
export async function merchantToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = (await response.json()) as { tokens?: { accessToken: string } };
  if (!body.tokens) throw new Error(`Login do lojista falhou: ${response.status}`);
  return body.tokens.accessToken;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo de resposta livre do teste
async function call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Cria e publica um produto (categoria, preço, 1 variação com estoque, 1 foto enviada ao S3 pelo fluxo real de upload). */
export async function publishProduct(token: string, storeId: string, name: string, categoryId: string): Promise<string> {
  const created = await call(token, 'POST', `/v1/stores/${storeId}/products`, { name, categoryId, basePriceCents: 4990 });
  if (created.status !== 201) throw new Error(`criar produto: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.id as string;
  const variants = await call(token, 'PUT', `/v1/stores/${storeId}/products/${id}/variants`, { attributes: [], variants: [{ attributes: {}, stock: 10 }] });
  if (variants.status !== 200) throw new Error(`variações: ${variants.status} ${JSON.stringify(variants.body)}`);
  const png = documentPhoto().buffer;
  const upload = await call(token, 'POST', '/v1/uploads', { storeId, purpose: 'product_image', contentType: 'image/png', sizeBytes: png.length });
  if (upload.status !== 201) throw new Error(`upload: ${upload.status} ${JSON.stringify(upload.body)}`);
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.body.upload.fields as Record<string, string>)) form.append(key, value);
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'produto.png');
  const stored = await fetch(upload.body.upload.url as string, { method: 'POST', body: form });
  if (stored.status !== 204 && stored.status !== 201 && stored.status !== 200) throw new Error(`POST ao armazenamento: ${stored.status}`);
  const done = await call(token, 'POST', `/v1/uploads/${upload.body.id}/complete`, {});
  if (done.status !== 200) throw new Error(`complete: ${done.status} ${JSON.stringify(done.body)}`);
  const images = await call(token, 'PUT', `/v1/stores/${storeId}/products/${id}/images`, { imageIds: [done.body.id] });
  if (images.status !== 200) throw new Error(`fotos: ${images.status} ${JSON.stringify(images.body)}`);
  const published = await call(token, 'POST', `/v1/stores/${storeId}/products/${id}/publish`, {});
  if (published.status !== 200) throw new Error(`publicar: ${published.status} ${JSON.stringify(published.body)}`);
  return id;
}

/** Categoria "Mercado" do seed. */
export async function categoryId(token: string, name = 'Mercado'): Promise<string> {
  const response = await call(token, 'GET', '/v1/categories');
  const found = (response.body.data as { id: string; name: string }[]).find((c) => c.name === name);
  if (!found) throw new Error(`categoria ${name} não encontrada`);
  return found.id;
}

export const apiCall = call;
