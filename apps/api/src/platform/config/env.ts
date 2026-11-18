import { z } from 'zod';
import { parseTrustProxy } from '../http/client-ip.js';

/** Valores de desenvolvimento (infra/env.example). Em produção o boot falha se algum deles for usado (SEC-080). */
export const DEV_JWT_ACCESS_SECRET = 'dev-only-insecure-change-me-0123456789abcdef';
export const DEV_AUTH_HMAC_KEY = 'dev-only-insecure-hmac-key-0123456789abcdef-change-me';
export const DEV_FAKE_WEBHOOK_SECRET = 'dev-only-fake-webhook-secret';
export const DEV_CODE_HMAC_KEY = 'dev-only-insecure-code-hmac-key-0123456789abcdef-change-me';
export const DEV_RECOVERY_HMAC_KEY = 'dev-only-insecure-recovery-hmac-key-0123456789abcdef-change-me';
/** 32 bytes em base64 (só desenvolvimento): cifra dos tokens OAuth do provedor (SEC-046). */
export const DEV_PAYMENT_TOKEN_ENC_KEY = Buffer.alloc(32, 9).toString('base64');
export const DEV_MFA_ENC_KEY = 'dev-only-insecure-mfa-key-0123456789abcdef-change-me';

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
    /**
     * Proxies confiáveis na frente da API: número de saltos (nginx = 1; 0 = IP do socket) OU lista de IP/CIDR
     * ("127.0.0.1,10.0.0.0/8"), preferível porque só quem está na lista pode declarar o IP (SEC-114). Em produção NÃO tem
     * padrão: sem ele todo `req.ip` vira o IP do proxy e o limite por conta+IP passa a valer para o mundo inteiro
     * (review I8). Fora de produção, o padrão é 0.
     */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        const parsed = parseTrustProxy(raw);
        if (parsed.error) ctx.addIssue({ code: 'custom', message: parsed.error });
        return parsed.value;
      }),
    /** SEC-114: segredo que o BFF do painel manda com `X-Webag-Client-IP`. Sem ele, o IP vindo do BFF é ignorado. */
    BFF_SHARED_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    /** Caminho do contrato OpenAPI servido em /docs. Padrão: procura docs/arquitetura/api/openapi.yaml subindo a partir do cwd. */
    OPENAPI_SPEC_PATH: z.string().optional(),
    /** /docs ligado por padrão fora de produção. */
    API_DOCS_ENABLED: optionalBool,

    // --- Autenticação (ADR-003, SEC-010/011) ---
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    /** HMAC da derivação do refresh token (ADR-009 #1). Cada finalidade tem a sua chave (review I10). */
    AUTH_HMAC_KEY: z.string().min(32).default(DEV_AUTH_HMAC_KEY),
    /** HMAC dos códigos de 6 dígitos enviados por e-mail (SEC-002). */
    CODE_HMAC_KEY: z.string().min(32).default(DEV_CODE_HMAC_KEY),
    /** HMAC dos códigos de recuperação do TOTP (SEC-092). */
    RECOVERY_HMAC_KEY: z.string().min(32).default(DEV_RECOVERY_HMAC_KEY),
    /** Chave própria da cifra do segredo TOTP (AES-256-GCM, SEC-090). Separada da AUTH_HMAC_KEY e guardada fora do banco e dos backups dele. */
    MFA_ENC_KEY: z.string().min(32).default(DEV_MFA_ENC_KEY),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
    /** Janela em que o reuso do refresh devolve o mesmo par (retry em 3G, SEC-011). */
    REFRESH_REUSE_WINDOW_SECONDS: z.coerce.number().int().min(0).max(120).default(30),
    /** URL pública da API (base do `redirect_uri` do OAuth de pagamentos; vem de configuração, SEC-045). */
    API_PUBLIC_URL: z.url().default('http://localhost:3000'),
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
    /** App do Mercado Pago (painel de desenvolvedores): `client_id` e `client_secret` do OAuth do split (WB-155). */
    MP_CLIENT_ID: z.string().optional(),
    MP_CLIENT_SECRET: z.string().optional(),
    /** URL cadastrada no app do MP para o retorno do OAuth; a página que a recebe repassa `code` e `state` à API. */
    MP_OAUTH_REDIRECT_URI: z.url().optional(),
    /** `true` se o provedor exigir o CPF do pagador no PIX [confirmar no sandbox]. */
    MP_PAYER_DOCUMENT_REQUIRED: optionalBool,
    PAYMENT_TOKEN_ENC_KEY: z.string().default(DEV_PAYMENT_TOKEN_ENC_KEY),

    // --- Armazenamento S3 (ADR-005): RustFS no dev, R2/S3 em produção. `memory` só para testes. ---
    STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().default('webag-dev'),
    S3_SECRET_KEY: z.string().default('webag-dev-secret-only'),
    S3_BUCKET_PUBLIC: z.string().default('webag-public'),
    S3_BUCKET_PRIVATE: z.string().default('webag-private'),
    S3_PUBLIC_URL: z.string().default('http://localhost:9000/webag-public'),
    S3_FORCE_PATH_STYLE: optionalBool,

    // --- Geocodificação de CEP (ADR-008) ---
    GEOCODING_PROVIDER: z.enum(['fake', 'http']).default('fake'),
  })
  .superRefine((env, ctx) => {
    // WB-160 C3: Mercado Pago ativo sem as chaves derruba o boot em QUALQUER ambiente (não no meio do pedido).
    if (env.PAYMENT_PROVIDER === 'mercadopago') {
      const required: [string, unknown][] = [
        ['MP_ACCESS_TOKEN', env.MP_ACCESS_TOKEN],
        ['MP_WEBHOOK_SECRET', env.MP_WEBHOOK_SECRET],
        ['MP_CLIENT_ID', env.MP_CLIENT_ID],
        ['MP_CLIENT_SECRET', env.MP_CLIENT_SECRET],
        ['MP_OAUTH_REDIRECT_URI', env.MP_OAUTH_REDIRECT_URI],
      ];
      for (const [name, value] of required) if (!value) ctx.addIssue({ code: 'custom', path: [name], message: 'obrigatório com PAYMENT_PROVIDER=mercadopago (ver apps/api/README.md, seção Mercado Pago)' });
    }
    if (env.NODE_ENV !== 'production') return;
    // SEC-080 / SEC-036: configuração insegura em produção derruba o boot. Nunca imprime valores.
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (env.JWT_ACCESS_SECRET === DEV_JWT_ACCESS_SECRET)
      fail('JWT_ACCESS_SECRET', 'valor de desenvolvimento não é aceito em produção');
    if (env.AUTH_HMAC_KEY === DEV_AUTH_HMAC_KEY)
      fail('AUTH_HMAC_KEY', 'valor de desenvolvimento não é aceito em produção');
    if (env.CODE_HMAC_KEY === DEV_CODE_HMAC_KEY) fail('CODE_HMAC_KEY', 'valor de desenvolvimento não é aceito em produção');
    if (env.RECOVERY_HMAC_KEY === DEV_RECOVERY_HMAC_KEY) fail('RECOVERY_HMAC_KEY', 'valor de desenvolvimento não é aceito em produção');
    if (env.MFA_ENC_KEY === DEV_MFA_ENC_KEY)
      fail('MFA_ENC_KEY', 'valor de desenvolvimento não é aceito em produção');
    // Um vazamento não pode servir para outra finalidade (SEC-090, review I10): todas as chaves são distintas.
    const keys: [string, string][] = [
      ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
      ['AUTH_HMAC_KEY', env.AUTH_HMAC_KEY],
      ['CODE_HMAC_KEY', env.CODE_HMAC_KEY],
      ['RECOVERY_HMAC_KEY', env.RECOVERY_HMAC_KEY],
      ['MFA_ENC_KEY', env.MFA_ENC_KEY],
    ];
    for (const [i, [name, value]] of keys.entries()) {
      const other = keys.slice(0, i).find(([, v]) => v === value);
      if (other) fail(name, `precisa ser diferente de ${other[0]} (uma chave por finalidade)`);
    }
    if (env.TRUST_PROXY === undefined)
      fail('TRUST_PROXY', 'obrigatório em produção (nginx na frente = 1; sem proxy = 0). Sem ele o IP do cliente é perdido');
    // SEC-129: sem o segredo do BFF, todos os usuários do painel web compartilham o IP do BFF (limites por IP viram globais).
    if (!env.BFF_SHARED_SECRET) fail('BFF_SHARED_SECRET', 'obrigatório em produção (o painel web declara o IP do cliente com ele; mínimo 32 caracteres)');
    else if (keys.some(([, value]) => value === env.BFF_SHARED_SECRET)) fail('BFF_SHARED_SECRET', 'precisa ser diferente das demais chaves (uma chave por finalidade)');
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
    }
    if (env.PAYMENT_TOKEN_ENC_KEY === DEV_PAYMENT_TOKEN_ENC_KEY || Buffer.from(env.PAYMENT_TOKEN_ENC_KEY, 'base64').length !== 32)
      fail('PAYMENT_TOKEN_ENC_KEY', 'obrigatória em produção, diferente da de desenvolvimento: 32 bytes em base64');
    if (env.STORAGE_DRIVER === 'memory') fail('STORAGE_DRIVER', 'o armazenamento em memória não sobe em produção');
    if (env.S3_ACCESS_KEY === 'webag-dev' || env.S3_SECRET_KEY === 'webag-dev-secret-only')
      fail('S3_SECRET_KEY', 'credencial de desenvolvimento não é aceita em produção');
    if (env.GEOCODING_PROVIDER === 'fake') fail('GEOCODING_PROVIDER', 'o geocodificador fake não sobe em produção');
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
