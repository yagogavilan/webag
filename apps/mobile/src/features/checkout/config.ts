/**
 * Ambiente do app e liberação do checkout. DEC-033: o Security vetou o pagamento em PRODUÇÃO; o checkout só roda em
 * desenvolvimento e staging (provedor `fake` ou sandbox). Tudo aqui é público (EXPO_PUBLIC_*): nenhum segredo.
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

/** Pagamento liberado? Produção só depois da reverificação do Security (DEC-033), com mudança explícita aqui. */
export const isCheckoutEnabled = (env: AppEnv = APP_ENV): boolean => env !== 'production';

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
