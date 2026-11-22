// Segredos aleatórios do ambiente de desenvolvimento, gerados pelo `pnpm run setup` ao criar o .env pela primeira vez (SEC-190, SEC-192).
// Motivo: com `pnpm iphone` o ambiente local fica visível no Wi-Fi, e as senhas de desenvolvimento do repositório são públicas.
// Funções puras (sem E/S) para poder testar: node --test scripts/setup-secrets.test.mjs
import { randomBytes } from 'node:crypto';

/** CI e quem pedir de propósito mantêm os valores fixos do infra/env.example (testes e pipelines dependem deles). */
export function useFixedDevSecrets(environment = process.env) {
  return environment.CI === 'true' || environment.CI === '1' || environment.WEBAG_FIXED_DEV_SECRETS === '1';
}

const token = (bytes) => randomBytes(bytes).toString('base64url'); // só A-Z a-z 0-9 - _ : seguro em URL, .env e shell

export function generateDevSecrets() {
  return {
    postgresPassword: token(24),
    redisPassword: token(24),
    s3AccessKey: `webag-${randomBytes(6).toString('hex')}`,
    s3SecretKey: token(32),
    // Senha do admin de desenvolvimento (SEC-192): maiúscula, minúscula, dígito e símbolo garantidos, 28 caracteres.
    adminPassword: `Wb-${token(18)}-7`,
  };
}

function setKey(text, key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  return line.test(text) ? text.replace(line, () => `${key}=${value}`) : `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

/** Aplica os segredos num texto de .env novo (cópia do infra/env.example). Não é chamada para um .env já existente. */
export function applyDevSecrets(envText, secrets) {
  let text = envText;
  text = setKey(text, 'POSTGRES_PASSWORD', secrets.postgresPassword);
  // DATABASE_URL: troca só a senha (usuário, host, porta e banco ficam como estão)
  text = text.replace(/^(DATABASE_URL=postgres(?:ql)?:\/\/[^:@/\s]+:)[^@\s]*(@.*)$/m, (_all, head, tail) => `${head}${secrets.postgresPassword}${tail}`);
  text = setKey(text, 'REDIS_PASSWORD', secrets.redisPassword);
  text = text.replace(/^REDIS_URL=redis:\/\/(?:[^@/\s]*@)?(.*)$/m, (_all, rest) => `REDIS_URL=redis://:${secrets.redisPassword}@${rest}`);
  text = setKey(text, 'S3_ACCESS_KEY', secrets.s3AccessKey);
  text = setKey(text, 'S3_SECRET_KEY', secrets.s3SecretKey);
  text = setKey(text, 'SEED_ADMIN_PASSWORD', secrets.adminPassword);
  return text;
}
