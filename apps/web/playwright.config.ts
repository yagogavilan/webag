import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do painel admin contra a API falsa (`e2e/fake-api/server.mjs`), sem Postgres/Redis.
 * Local sem browsers do Playwright: `PW_CHANNEL=chrome pnpm test:e2e` usa o Chrome instalado.
 * O app roda em produção (`next build` + `next start`) para exercitar a CSP com nonce de verdade.
 */
const WEB_PORT = 3101;
const API_PORT = 3999;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: [
    {
      command: 'node e2e/fake-api/server.mjs',
      port: API_PORT,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm build && pnpm exec next start --port ${WEB_PORT}`,
      port: WEB_PORT,
      timeout: 300_000,
      env: { API_URL: `http://localhost:${API_PORT}`, COOKIE_SECURE: 'false', WEBAG_ALLOW_LOCAL_ORIGINS: 'true', ADMIN_HOST: `localhost:${WEB_PORT}`, LOJISTA_HOST: `localhost:${WEB_PORT}`, PUBLIC_HOST: `localhost:${WEB_PORT}`, STORAGE_ORIGIN: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
