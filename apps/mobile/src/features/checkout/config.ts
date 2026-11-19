/**
 * Ambiente do app e liberação do checkout (DEC-043: liberado em produção). Provedor `fake`/sandbox fora de produção.
 * Tudo aqui é público (EXPO_PUBLIC_*): nenhum segredo.
 *
 * `production` é o padrão para qualquer valor desconhecido: errar para o lado fechado.
 */
export type AppEnv = 'development' | 'staging' | 'production';
export type PaymentMode = 'fake' | 'mercadopago';

export function resolveAppEnv(raw: string | undefined, isDev: boolean): AppEnv {
  if (raw === 'development' || raw === 'staging' || raw === 'production') return raw;
  return isDev ? 'development' : 'production';
}

export const APP_ENV: AppEnv = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);

/** Pagamento liberado? Sim em todos os ambientes: o Security reverificou e liberou o checkout em produção (DEC-043, DEC-033 fechada). */
export const isCheckoutEnabled = (_env: AppEnv = APP_ENV): boolean => true;

/** `fake`: cartões de teste do provedor simulado (sem digitar cartão). `mercadopago`: campos seguros do Mercado Pago. */
export function resolvePaymentMode(raw: string | undefined, env: AppEnv): PaymentMode {
  if (raw === 'mercadopago') return 'mercadopago';
  // `fake` nunca é aceito em produção: lá só vale o Mercado Pago real
  return env === 'production' ? 'mercadopago' : 'fake';
}

export const PAYMENT_MODE: PaymentMode = resolvePaymentMode(process.env.EXPO_PUBLIC_PAYMENT_MODE, APP_ENV);

/** Chave PÚBLICA do Mercado Pago (a de teste no sandbox). Nunca o access token. */
export const MP_PUBLIC_KEY: string = process.env.EXPO_PUBLIC_MP_PUBLIC_KEY ?? '';

/** PIX vale 15 min (RN, WB-024): só para a contagem de fallback; o valor oficial é `pix.expiresAt` do servidor. */
export const PIX_ALERT_SECONDS = 120;

/**
 * Site público do Webag (página segura do cartão). `EXPO_PUBLIC_WEB_URL` por ambiente; tudo aqui é público.
 * O app só abre `WEB_PUBLIC_URL/pagar/cartao?i=<token>`: a URL que vem da API é conferida contra este endereço antes de abrir.
 */
export const WEB_PUBLIC_URL: string = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

/** A URL da intenção é da página segura do Webag (mesma origem, rota fixa, token `i`)? Qualquer outra coisa nunca é aberta (SEC-126). */
export function isSecureCardUrl(raw: string, base: string = WEB_PUBLIC_URL): boolean {
  try {
    const url = new URL(raw);
    const origin = new URL(base);
    return url.origin === origin.origin && url.pathname === '/pagar/cartao' && (url.searchParams.get('i') ?? '').length >= 16 && !url.username && !url.password;
  } catch {
    return false;
  }
}
