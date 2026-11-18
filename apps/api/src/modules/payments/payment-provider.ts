import type { PaymentMethod, PaymentStatus } from './db/schema.js';

/** Contrato único dos provedores (WB-150 C6): o domínio do pedido não sabe se o provedor é o `fake` ou o Mercado Pago. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreateProviderPaymentInput {
  /** ID da tentativa: vira o X-Idempotency-Key do provedor (SEC-031). */
  attemptId: string;
  method: PaymentMethod;
  amountCents: number;
  applicationFeeCents: number;
  externalReference: string;
  /** Loja recebedora. O token usado no provedor é resolvido por ela, nunca por campo da notificação (SEC-034). */
  storeId: string | null;
  installments: number;
  /** Token de cartão gerado pelo Brick/checkout do provedor. Nunca número de cartão (regra inviolável nº 2). */
  cardToken?: string;
  /** Dados do pagador pedidos pelo provedor (e-mail; CPF só quando exigido). Não são gravados pelo Webag. */
  payer?: { email: string; document?: string };
  /** Dados do cartão que o checkout do provedor informa junto do token (`payment_method_id`, `issuer_id`). */
  card?: { paymentMethodId?: string; issuerId?: string };
  expiresAt?: Date;
}

/** Visão do pagamento no provedor (fonte da verdade, ADR-002). */
export interface ProviderPayment {
  providerPaymentId: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  externalReference: string;
  applicationFeeCents: number;
  /** Quem recebeu o dinheiro (conta da loja no provedor). */
  receiverId: string | null;
  refundedCents: number;
  /** Tarifa cobrada pelo provedor (`fee_details`), quando já conhecida; alimenta o ledger. */
  providerFeeCents?: number;
  pixCopyPaste?: string;
  /** PNG do QR em base64 (o MP devolve `qr_code_base64`); a falta não impede o copia e cola. */
  pixQrBase64?: string;
  threeDsUrl?: string;
  declineReason?: string;
}

/** Notificação já autenticada (assinatura conferida), sem confiar no corpo além do `type`. */
export interface WebhookNotification {
  /** Chave de idempotência do evento (x-request-id). */
  eventKey: string;
  /** `data.id` da QUERY STRING (o corpo não é assinado). */
  providerPaymentId: string;
  type: string;
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'Tempo esgotado no provedor de pagamento') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export interface PaymentProvider {
  readonly name: 'fake' | 'mercadopago';
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPayment(providerPaymentId: string, context: { storeId: string | null }): Promise<ProviderPayment | null>;
  refund(
    providerPaymentId: string,
    amountCents: number,
    idempotencyKey: string,
    context: { storeId: string | null },
  ): Promise<{ providerRefundId: string; amountCents: number }>;
  /** O provedor exige o CPF do pagador neste método? (`PAYER_DOCUMENT_REQUIRED`). Ausente = não exige. */
  requiresPayerDocument?(method: PaymentMethod): boolean;
  /** Conta de recebimento esperada para a loja (conferida na re-consulta, SEC-034). */
  expectedReceiverId(storeId: string | null): string | null;
  /** Valida a assinatura e extrai o evento. Lança `AppError` 401 se inválida. */
  verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, unknown>;
  }): WebhookNotification;
}
