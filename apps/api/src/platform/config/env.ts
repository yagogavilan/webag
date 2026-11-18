import { z } from 'zod';

/**
 * Variáveis de ambiente da API, validadas no boot (skill padroes-backend).
 * A aplicação não sobe com env inválida. Novas variáveis entram aqui junto com o módulo que as usa.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Caminho do contrato OpenAPI servido em /docs. Padrão: procura docs/arquitetura/api/openapi.yaml subindo a partir do cwd. */
  OPENAPI_SPEC_PATH: z.string().optional(),
  /** /docs ligado por padrão fora de produção. */
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
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
