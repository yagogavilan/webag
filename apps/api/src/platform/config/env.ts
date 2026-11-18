import { z } from 'zod';

/** Valores de desenvolvimento (infra/env.example). Em produção o boot falha se algum deles for usado (SEC-080). */
export const DEV_JWT_ACCESS_SECRET = 'dev-only-insecure-change-me-0123456789abcdef';
export const DEV_AUTH_HMAC_KEY = 'dev-only-insecure-hmac-key-0123456789abcdef-change-me';
export const DEV_FAKE_WEBHOOK_SECRET = 'dev-only-fake-webhook-secret';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const optionalBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/**
 * Variáveis de ambiente da API, validadas no boot (skill padroes-backend).
 * A aplicação não sobe com env inválida. Novas variáveis entram aqui junto com o módulo que as usa.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    CORS_ORIGINS: csv,
    /** Quantos proxies confiáveis existem na frente da API (nginx = 1). 0 = usa o IP do socket. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    /** Caminho do contrato OpenAPI servido em /docs. Padrão: procura docs/arquitetura/api/openapi.yaml subindo a partir do cwd. */
    OPENAPI_SPEC_PATH: z.string().optional(),
    /** /docs ligado por padrão fora de produção. */
    API_DOCS_ENABLED: optionalBool,

    // --- Autenticação (ADR-003, SEC-010/011) ---
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    /** Chave do servidor para HMAC de códigos, derivação de refresh e cifra do segredo TOTP. */
    AUTH_HMAC_KEY: z.string().min(32).default(DEV_AUTH_HMAC_KEY),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
    /** Janela em que o reuso do refresh devolve o mesmo par (retry em 3G, SEC-011). */
    REFRESH_REUSE_WINDOW_SECONDS: z.coerce.number().int().min(0).max(120).default(30),
    /** Prefixo de links enviados por e-mail (convite de admin, etc.). */
    ADMIN_WEB_URL: z.url().default('http://localhost:3001'),

    // --- E-mail (Mailpit no dev) ---
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('Webag <nao-responda@webag.local>'),

    // --- Pagamentos (ADR-002) ---
    PAYMENT_PROVIDER: z.enum(['fake', 'mercadopago']).default('fake'),
    FAKE_PAYMENT_WEBHOOK_SECRET: z.string().min(16).default(DEV_FAKE_WEBHOOK_SECRET),
    MP_ACCESS_TOKEN: z.string().optional(),
    MP_WEBHOOK_SECRET: z.string().optional(),
    PAYMENT_TOKEN_ENC_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // SEC-080 / SEC-036: configuração insegura em produção derruba o boot. Nunca imprime valores.
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (env.JWT_ACCESS_SECRET === DEV_JWT_ACCESS_SECRET)
      fail('JWT_ACCESS_SECRET', 'valor de desenvolvimento não é aceito em produção');
    if (env.AUTH_HMAC_KEY === DEV_AUTH_HMAC_KEY)
      fail('AUTH_HMAC_KEY', 'valor de desenvolvimento não é aceito em produção');
    if (env.CORS_ORIGINS.length === 0 || env.CORS_ORIGINS.includes('*'))
      fail('CORS_ORIGINS', 'em produção precisa listar origens exatas (sem vazio nem "*")');
    if (env.API_DOCS_ENABLED === true) fail('API_DOCS_ENABLED', '/docs não pode ficar ligado em produção');
    if (env.PAYMENT_PROVIDER === 'fake')
      fail('PAYMENT_PROVIDER', 'o provedor fake não sobe em produção');
    if (env.PAYMENT_PROVIDER === 'mercadopago') {
      if (!env.MP_WEBHOOK_SECRET) fail('MP_WEBHOOK_SECRET', 'obrigatório com Mercado Pago ativo');
      if (!env.MP_ACCESS_TOKEN) fail('MP_ACCESS_TOKEN', 'obrigatório com Mercado Pago ativo');
      if (env.MP_ACCESS_TOKEN?.startsWith('TEST-'))
        fail('MP_ACCESS_TOKEN', 'credencial de teste não é aceita em produção');
      if (!env.PAYMENT_TOKEN_ENC_KEY || Buffer.from(env.PAYMENT_TOKEN_ENC_KEY, 'base64').length !== 32)
        fail('PAYMENT_TOKEN_ENC_KEY', 'obrigatória em produção: 32 bytes em base64');
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Lista só os nomes e motivos; nunca imprime valores (podem ser segredos).
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return result.data;
}
