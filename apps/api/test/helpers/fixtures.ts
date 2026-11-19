import { eq, isNotNull } from 'drizzle-orm';
import sharp from 'sharp';
import { vi } from 'vitest';
import { GEOCODING_PROVIDER, type GeocodingProvider } from '../../src/modules/stores/index.js';
import { OBJECT_STORAGE } from '../../src/platform/storage/object-storage.js';
import { MemoryObjectStorage } from '../../src/platform/storage/memory.storage.js';
import { paymentAttempts, sessions } from '../../src/platform/database/schema.js';
import { generateTotpSecret } from '../../src/modules/identity/totp.js';
import { PasswordService } from '../../src/modules/identity/password.service.js';
import { sealMfaSecret } from '../../src/platform/crypto/mfa-seal.js';
import { DEV_MFA_ENC_KEY } from '../../src/platform/config/env.js';
import {
  cities,
  stores,
  storeSettings,
  storeMembers,
  adminProfiles,
  legalDocuments,
  userRoles,
  users,
  type AdminProfile,
} from '../../src/platform/database/schema.js';
import { bearer, randomIp, STRONG_PASSWORD, totpAt, uniqueEmail, type TestContext } from './app.js';

const passwords = new PasswordService();

/** Publica a versão 1 dos três documentos se ainda não houver (necessário para cadastrar). */
export async function ensureLegalDocs(ctx: TestContext): Promise<void> {
  for (const type of ['customer_terms', 'merchant_terms', 'privacy'] as const) {
    const [existing] = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, type)).limit(1);
    if (existing) continue;
    await ctx.db.insert(legalDocuments).values({
      type,
      version: 1,
      title: `Documento ${type}`,
      content: 'Texto de teste com mais de vinte caracteres.',
      effectiveAt: new Date(Date.now() - 86_400_000),
      relevantChange: false,
    });
  }
}

/** Versões vigentes dos documentos (os testes de termos publicam versões novas; nada de "versão 1" fixa). */
export async function currentDocs(ctx: TestContext, types: string[]): Promise<{ type: string; version: number }[]> {
  const docs: { type: string; version: number }[] = [];
  for (const type of types) {
    const res = await ctx.http.get(`/v1/legal/${type}`).expect(200);
    docs.push({ type, version: (res.body as { version: number }).version });
  }
  return docs;
}

export const acceptedCustomer = (ctx: TestContext) => currentDocs(ctx, ['customer_terms', 'privacy']);
export const acceptedMerchant = (ctx: TestContext) => currentDocs(ctx, ['merchant_terms']);

export interface RegisteredUser {
  email: string;
  password: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  ip: string;
}

/** Cadastra pela API (rota real). Usa IP próprio para não esbarrar no rate limit de outros testes. */
export async function registerUser(ctx: TestContext, overrides: Record<string, unknown> = {}): Promise<RegisteredUser> {
  const email = uniqueEmail();
  const ip = randomIp();
  const response = await ctx.http
    .post('/v1/auth/register')
    .set('X-Forwarded-For', ip)
    .send({
      name: 'Maria Teste',
      email,
      phone: '(11) 98888-7777',
      password: STRONG_PASSWORD,
      adultDeclaration: true,
      acceptedDocuments: await acceptedCustomer(ctx),
      ...overrides,
    });
  if (response.status !== 201) throw new Error(`Cadastro falhou: ${response.status} ${JSON.stringify(response.body)}`);
  const body = response.body as { user: { id: string; email: string }; tokens: { accessToken: string; refreshToken: string } };
  return {
    email: body.user.email,
    password: STRONG_PASSWORD,
    userId: body.user.id,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    ip,
  };
}

export async function verifyEmailOf(ctx: TestContext, user: RegisteredUser): Promise<void> {
  const code = ctx.mail.lastCode(user.email);
  await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code }).expect(204);
}

export interface TestAdmin {
  userId: string;
  email: string;
  password: string;
  profile: AdminProfile;
  /** Segredo TOTP em base32 (null se o admin foi criado sem TOTP). */
  totpSecret: string | null;
  accessToken: string;
  refreshToken: string;
}

/** Cria o admin direto no banco (o convite tem teste próprio) e faz o login real pela API. */
export async function createAdmin(ctx: TestContext, profile: AdminProfile, options: { totp?: boolean } = {}): Promise<TestAdmin> {
  const email = uniqueEmail('admin');
  const password = STRONG_PASSWORD;
  const [user] = await ctx.db
    .insert(users)
    .values({ email, name: `Admin ${profile}`, passwordHash: await passwords.hash(password), emailVerifiedAt: new Date() })
    .returning();
  if (!user) throw new Error('admin não criado');
  await ctx.db.insert(userRoles).values({ userId: user.id, role: 'customer' });
  const totpSecret = options.totp === false ? null : generateTotpSecret();
  await ctx.db.insert(adminProfiles).values({
    userId: user.id,
    profile,
    ...(totpSecret
      ? { totpSecretEnc: sealMfaSecret(totpSecret, user.id, DEV_MFA_ENC_KEY), totpConfirmedAt: new Date() }
      : {}),
  });
  const login = await loginAdmin(ctx, { email, password, totpSecret });
  return { userId: user.id, email, password, profile, totpSecret, ...login };
}

/**
 * Login em 2 passos do admin (SEC-090): `/auth/login` devolve o `mfaToken` e `/auth/mfa/verify` abre a sessão.
 * Sem `code`, devolve a resposta do 1º passo. Com o mesmo IP nos dois passos (`ip`), como faz o BFF.
 */
export type LoginCall = Promise<import('supertest').Response> & { expect: (status: number) => Promise<import('supertest').Response> };

export function loginWithMfa(ctx: TestContext, input: { email: string; password: string; code?: string; ip?: string }): LoginCall {
  const call = runLogin(ctx, input);
  return Object.assign(call, {
    expect: async (status: number) => {
      const res = await call;
      if (res.status !== status) throw new Error(`esperado ${status}, veio ${res.status}: ${JSON.stringify(res.body)}`);
      return res;
    },
  });
}

async function runLogin(ctx: TestContext, input: { email: string; password: string; code?: string; ip?: string }): Promise<import('supertest').Response> {
  const ip = input.ip ?? randomIp();
  const first = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: input.email, password: input.password });
  if (input.code === undefined || first.status !== 200 || !(first.body as { mfaRequired?: boolean }).mfaRequired) return first;
  return ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', ip).send({ mfaToken: (first.body as { mfaToken: string }).mfaToken, code: input.code });
}

/** Login de admin. Zera o anti-replay do TOTP antes (vários logins no mesmo passo de 30 s nos testes). */
export async function loginAdmin(
  ctx: TestContext,
  input: { email: string; password: string; totpSecret: string | null },
): Promise<{ accessToken: string; refreshToken: string }> {
  await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(
    eq(adminProfiles.userId, (await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)))[0]?.id ?? ''),
  );
  const response = await loginWithMfa(ctx, { email: input.email, password: input.password, code: input.totpSecret ? totpAt(input.totpSecret) : undefined });
  if (response.status !== 200) throw new Error(`Login admin falhou: ${response.status} ${JSON.stringify(response.body)}`);
  const tokens = (response.body as { tokens: { accessToken: string; refreshToken: string } }).tokens;
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

let documentSeq = 0;
/** CPF válido e único por chamada (dígitos verificadores calculados) para criar lojas nos testes. */
export function uniqueCpf(): string {
  documentSeq += 1;
  const base = String((Date.now() % 1_000_000) * 1000 + documentSeq).padStart(9, '0').slice(-9);
  const digits = base.split('').map(Number);
  const dv = (list: number[]): number => {
    const sum = list.reduce((acc, d, i) => acc + d * (list.length + 1 - i), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = dv(digits);
  const d2 = dv([...digits, d1]);
  const cpf = [...digits, d1, d2].join('');
  return /^(\d)\1{10}$/.test(cpf) ? uniqueCpf() : cpf;
}

/** Insere uma loja direto no banco (atalho para testes que não exercitam o onboarding). */
export async function insertStoreRow(
  ctx: TestContext,
  ownerUserId: string,
  over: Partial<typeof stores.$inferInsert> = {},
): Promise<typeof stores.$inferSelect> {
  const [store] = await ctx.db
    .insert(stores)
    .values({ ownerUserId, documentType: 'cpf', documentNumber: uniqueCpf(), ...over })
    .returning();
  if (!store) throw new Error('loja não criada');
  await ctx.db.insert(storeSettings).values({ storeId: store.id });
  await ctx.db.insert(storeMembers).values({ storeId: store.id, userId: ownerUserId, role: 'owner', permissions: [] });
  return store;
}

// ------------------------------------------------------------------ Onda 2

export const memoryStorage = (ctx: TestContext): MemoryObjectStorage => ctx.app.get<MemoryObjectStorage>(OBJECT_STORAGE);

export async function jpegBuffer(width = 800, height = 800, color = '#cc3344'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

export async function pngBuffer(width = 64, height = 64): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#223344' } }).png().toBuffer();
}

/** PDF mínimo válido (cabeçalho `%PDF-` + trailer). */
export const pdfBuffer = (): Buffer => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

export interface TestMerchant extends RegisteredUser {
  storeId?: string;
}

/** Lojista: cadastra, confirma o e-mail e pede o papel de lojista (rotas reais). */
export async function createMerchant(ctx: TestContext): Promise<TestMerchant> {
  const user = await registerUser(ctx);
  await verifyEmailOf(ctx, user);
  await ctx.http.post('/v1/me/merchant-role').set(bearer(user.accessToken)).send({ acceptedDocuments: await acceptedMerchant(ctx) }).expect(204);
  await reauth(ctx, user); // senha digitada agora (janela de 5 min do SEC-016)
  return user;
}

/** Reautentica o usuário (janela de 5 min do SEC-016) pela API. */
export async function reauth(ctx: TestContext, user: RegisteredUser): Promise<void> {
  await ctx.http.post('/v1/auth/reauth').set(bearer(user.accessToken)).send({ password: user.password }).expect(204);
}

/** Envia um arquivo pelo fluxo real (POST pré-assinado simulado + complete). Devolve o asset concluído. */
export async function uploadFile(
  ctx: TestContext,
  user: RegisteredUser,
  input: { storeId: string; purpose: string; contentType: string; body: Buffer; declaredSize?: number },
) {
  const created = await ctx.http
    .post('/v1/uploads')
    .set(bearer(user.accessToken))
    .send({ storeId: input.storeId, purpose: input.purpose, contentType: input.contentType, sizeBytes: input.declaredSize ?? input.body.length });
  if (created.status !== 201) return { created, completed: null };
  const key = (created.body as { upload: { fields: { key: string } } }).upload.fields.key;
  const status = memoryStorage(ctx).upload('private', key, input.body, input.contentType);
  if (status !== 204) return { created, completed: null, storageStatus: status };
  const completed = await ctx.http.post(`/v1/uploads/${(created.body as { id: string }).id}/complete`).set(bearer(user.accessToken)).send({});
  return { created, completed, storageStatus: status };
}

export const CPF_DOCS = ['id_front', 'id_back', 'address_proof'] as const;

/** Loja de CPF pelo onboarding real até o ponto pedido. */
export async function createStoreViaApi(
  ctx: TestContext,
  merchant: TestMerchant,
  options: { complete?: boolean; submit?: boolean; cep?: string; name?: string; categoryId?: string } = {},
): Promise<{ id: string; documentNumber: string }> {
  const documentNumber = uniqueCpf();
  const created = await ctx.http.post('/v1/stores').set(bearer(merchant.accessToken)).send({ documentType: 'cpf', documentNumber });
  if (created.status !== 201) throw new Error(`createStore ${created.status} ${JSON.stringify(created.body)}`);
  const storeId = (created.body as { id: string }).id;
  merchant.storeId = storeId;
  if (options.complete || options.submit) {
    const categoryId = options.categoryId ?? (await ensureCategory(ctx));
    const profile = await ctx.http
      .patch(`/v1/stores/${storeId}/profile`)
      .set(bearer(merchant.accessToken))
      .send({ name: options.name ?? 'Loja do Marcos', mainCategoryId: categoryId, whatsapp: '(11) 98888-7777', address: { cep: options.cep ?? '07900-100', number: '120' } });
    if (profile.status !== 200) throw new Error(`profile ${profile.status} ${JSON.stringify(profile.body)}`);
    for (const kind of CPF_DOCS) {
      const sent = await uploadFile(ctx, merchant, { storeId, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(600, 400) });
      if (sent.completed?.status !== 200) throw new Error(`upload ${JSON.stringify(sent.completed?.body)}`);
      await ctx.http.post(`/v1/stores/${storeId}/documents`).set(bearer(merchant.accessToken)).send({ kind, uploadId: (sent.completed.body as { id: string }).id }).expect(204);
    }
    await connectFakeAccount(ctx, merchant, storeId);
  }
  if (options.submit) await ctx.http.post(`/v1/stores/${storeId}/submit`).set(bearer(merchant.accessToken)).send({}).expect(200);
  return { id: storeId, documentNumber };
}

export async function connectFakeAccount(ctx: TestContext, merchant: RegisteredUser, storeId: string, code = 'fake-ok') {
  await reauth(ctx, merchant);
  const start = await ctx.http.post(`/v1/stores/${storeId}/payment-account/connect`).set(bearer(merchant.accessToken)).send({}).expect(200);
  return ctx.http.post(`/v1/stores/${storeId}/payment-account/callback`).set(bearer(merchant.accessToken)).send({ code, state: (start.body as { state: string }).state });
}

let categorySeq = 0;
export async function ensureCategory(ctx: TestContext, name?: string): Promise<string> {
  const { categories } = await import('../../src/platform/database/schema.js');
  categorySeq += 1;
  const [row] = await ctx.db
    .insert(categories)
    .values({ name: name ?? `Cat ${Date.now() % 100000}-${categorySeq}`.slice(0, 30), icon: 'storefront' })
    .returning();
  return row!.id;
}

/** Cidades ativas dos testes (Francisco Morato etc.), como no seed da Onda 1. */
export async function ensureCities(ctx: TestContext): Promise<void> {
  const { cities } = await import('../../src/platform/database/schema.js');
  for (const [name, slug] of [['Francisco Morato', 'francisco-morato-sp'], ['Franco da Rocha', 'franco-da-rocha-sp'], ['Caieiras', 'caieiras-sp'], ['Campo Limpo Paulista', 'campo-limpo-paulista-sp']] as const) {
    await ctx.db.insert(cities).values({ name, state: 'SP', slug, active: true }).onConflictDoNothing();
  }
}

/** Marca a reautenticação antiga (para provar o 403 REAUTH_REQUIRED). */
export async function expireReauth(ctx: TestContext, userId: string): Promise<void> {
  await ctx.db.update(sessions).set({ reauthAt: new Date(Date.now() - 6 * 60_000) }).where(eq(sessions.userId, userId));
}

// ------------------------------------------------------------------ Onda 3

/** Cidade ativa por nome (cria se faltar). Os testes compartilham o banco: nunca assumem que está vazio. */
/**
 * A conciliação de pagamentos olha só os 200 pagamentos mais antigos (por `updated_at`) com `provider_payment_id`. O banco de teste é
 * COMPARTILHADO entre os arquivos de uma execução: quanto mais testes rodam antes, mais pagamentos antigos empurram os do teste para fora dos
 * 200 e a conciliação devolve `synced: 0` (só na suíte inteira). Chame em `beforeAll` de quem chama `reconcile()`: retira da conciliação os
 * pagamentos de arquivos anteriores (as linhas seguem no banco; só perdem o id do provedor).
 */
export async function retirePreviousPaymentAttempts(ctx: TestContext): Promise<void> {
  await ctx.db.update(paymentAttempts).set({ providerPaymentId: null }).where(isNotNull(paymentAttempts.providerPaymentId));
}

/**
 * SEC-169: o município do CEP agora é SEMPRE conferido com a cidade informada. Testes que isolam coortes em cidades próprias (nome
 * aleatório) fazem o provedor de CEP simulado responder essa cidade, em vez de a do prefixo do CEP.
 */
export function fakeCepCityIs(ctx: TestContext, city: string): void {
  const provider = ctx.app.get<GeocodingProvider>(GEOCODING_PROVIDER);
  const real = provider.lookupCep.bind(provider);
  vi.spyOn(provider, 'lookupCep').mockImplementation(async (cep) => {
    const info = await real(cep);
    return info ? { ...info, city } : info;
  });
}

export async function ensureCity(ctx: TestContext, name: string, active = true): Promise<{ id: string; name: string }> {
  const slug = `${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-sp`;
  const [existing] = await ctx.db.select().from(cities).where(eq(cities.slug, slug));
  if (existing) {
    if (existing.active !== active) await ctx.db.update(cities).set({ active }).where(eq(cities.id, existing.id));
    return { id: existing.id, name: existing.name };
  }
  const [city] = await ctx.db.insert(cities).values({ name, state: 'SP', slug, active }).returning();
  if (!city) throw new Error('cidade não criada');
  return { id: city.id, name: city.name };
}

/** Cliente cadastrado e com e-mail confirmado. */
export async function createCustomer(ctx: TestContext): Promise<RegisteredUser> {
  const user = await registerUser(ctx);
  await verifyEmailOf(ctx, user);
  return user;
}

/** Imagem 2:1 enviada pelo fluxo real de upload do admin (`purpose: banner`, sem loja). */
export async function uploadBannerImage(ctx: TestContext, admin: { accessToken: string }, size: { width?: number; height?: number } = {}): Promise<string> {
  const body = await jpegBuffer(size.width ?? 1200, size.height ?? 600);
  const created = await ctx.http.post('/v1/uploads').set(bearer(admin.accessToken)).send({ purpose: 'banner', contentType: 'image/jpeg', sizeBytes: body.length });
  if (created.status !== 201) throw new Error(`upload banner ${created.status} ${JSON.stringify(created.body)}`);
  const id = (created.body as { id: string }).id;
  memoryStorage(ctx).upload('private', (created.body as { upload: { fields: { key: string } } }).upload.fields.key, body, 'image/jpeg');
  const done = await ctx.http.post(`/v1/uploads/${id}/complete`).set(bearer(admin.accessToken)).send({});
  if (done.status !== 200) throw new Error(`complete banner ${done.status} ${JSON.stringify(done.body)}`);
  return id;
}
