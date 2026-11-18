import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do painel (lojista e admin) contra a API REAL (Postgres, Redis, armazenamento S3 e SMTP reais), sem a API falsa.
 * Specs em `e2e-real/`. Diferente de `playwright.config.ts` (API falsa, roda no CI sem infraestrutura).
 *
 * Pré-requisitos (README da API): `docker compose up` (Postgres+PostGIS, Redis, RustFS, Mailpit), migrações e seed
 * (`pnpm run setup`), API no ar. Variáveis lidas pelos testes:
 *   REAL_API_URL   base da API              (padrão http://localhost:3000)
 *   MAILPIT_URL    API HTTP do Mailpit      (padrão http://localhost:8025) — os códigos de e-mail vêm daqui
 *   ADMIN_EMAIL / ADMIN_PASSWORD do super admin semeado (padrões admin@webag.local / Webag-Admin-Dev-2026)
 * O primeiro uso matricula o TOTP do super admin pela API e guarda o segredo no diretório temporário do sistema (`webag-e2e-real/`)
 * (ambiente descartável: se o admin já tem TOTP e o arquivo não existe, recrie o banco).
 * Rodar: `PW_CHANNEL=chrome pnpm exec playwright test -c playwright.real.config.ts` (PW_CHANNEL só se os browsers do Playwright não baixarem).
 */
const WEB_PORT = Number(process.env.REAL_WEB_PORT ?? 3101);
const API_URL = process.env.REAL_API_URL ?? 'http://localhost:3000';
const STORAGE_ORIGIN = process.env.REAL_STORAGE_ORIGIN ?? 'http://localhost:9000';

export default defineConfig({
  testDir: './e2e-real',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${WEB_PORT}`,
    port: WEB_PORT,
    timeout: 300_000,
    env: { API_URL, COOKIE_SECURE: 'false', ADMIN_HOST: `localhost:${WEB_PORT}`, LOJISTA_HOST: `localhost:${WEB_PORT}`, STORAGE_ORIGIN },
    reuseExistingServer: true,
  },
});
