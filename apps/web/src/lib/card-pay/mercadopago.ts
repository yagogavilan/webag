/**
 * MercadoPago.js v2 + Card Payment Brick (SEC-106, regra inviolável nº 2). Os campos de cartão vivem em iframes do Mercado Pago:
 * este código NUNCA lê número, validade ou CVV. Só recebe o `token` do cartão que o MP gera no `onSubmit`.
 */
export const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2';

export interface BrickFormData {
  token: string;
  installments: number;
  payment_method_id?: string;
  issuer_id?: string | number;
}

export interface BrickController {
  unmount: () => void;
}

interface BricksBuilder {
  create: (
    brick: 'cardPayment',
    containerId: string,
    settings: {
      initialization: { amount: number };
      customization?: { paymentMethods?: { minInstallments?: number; maxInstallments?: number }; visual?: { hidePaymentButton?: boolean } };
      locale?: string;
      callbacks: { onReady?: () => void; onSubmit: (data: BrickFormData) => Promise<void>; onError?: (error: unknown) => void };
    },
  ) => Promise<BrickController>;
}

export interface MercadoPagoInstance {
  bricks: () => BricksBuilder;
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;
  }
}

let loading: Promise<void> | null = null;

/** Carrega o SDK uma vez. Rejeita se a rede ou um bloqueador impedir (a tela mostra "Tentar de novo"). */
export function loadMercadoPago(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.MercadoPago) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MP_SDK_URL;
    script.async = true;
    script.onload = () => (window.MercadoPago ? resolve() : reject(new Error('sdk-missing')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('sdk-load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
