import { eq } from 'drizzle-orm';
import { generateTotpSecret } from '../../src/modules/identity/totp.js';
import { PasswordService } from '../../src/modules/identity/password.service.js';
import { encryptSecret } from '../../src/platform/crypto/crypto.js';
import { DEV_AUTH_HMAC_KEY } from '../../src/platform/config/env.js';
import {
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

export const ACCEPTED_CUSTOMER = [
  { type: 'customer_terms', version: 1 },
  { type: 'privacy', version: 1 },
];

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
      acceptedDocuments: ACCEPTED_CUSTOMER,
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
      ? { totpSecretEnc: encryptSecret(totpSecret, DEV_AUTH_HMAC_KEY, 'totp', `user:${user.id}`), totpConfirmedAt: new Date() }
      : {}),
  });
  const login = await loginAdmin(ctx, { email, password, totpSecret });
  return { userId: user.id, email, password, profile, totpSecret, ...login };
}

/** Login de admin. Zera o anti-replay do TOTP antes (vários logins no mesmo passo de 30 s nos testes). */
export async function loginAdmin(
  ctx: TestContext,
  input: { email: string; password: string; totpSecret: string | null },
): Promise<{ accessToken: string; refreshToken: string }> {
  await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(
    eq(adminProfiles.userId, (await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)))[0]?.id ?? ''),
  );
  const response = await ctx.http
    .post('/v1/auth/login')
    .set('X-Forwarded-For', randomIp())
    .send({ email: input.email, password: input.password, ...(input.totpSecret ? { totpCode: totpAt(input.totpSecret) } : {}) });
  if (response.status !== 200) throw new Error(`Login admin falhou: ${response.status} ${JSON.stringify(response.body)}`);
  const tokens = (response.body as { tokens: { accessToken: string; refreshToken: string } }).tokens;
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}
