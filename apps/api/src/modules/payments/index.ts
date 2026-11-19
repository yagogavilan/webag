// API pública do módulo payments (ADR-007 §2): o domínio do pedido (Onda 4) só conhece isto.
export { PaymentsModule } from './payments.module.js';
export { devModulesFor } from './payments.dev.js';
export { PaymentsService, ADMIN_REFUND_KEY_PREFIX, canTransition, type ManualRefundCap, type CreatePaymentInput, type PaymentAttempt, type PaymentListener } from './payments.service.js';
export {
  PAYMENT_PROVIDER,
  ProviderTimeoutError,
  type PaymentProvider,
  type ProviderPayment,
  type CreateProviderPaymentInput,
} from './payment-provider.js';
export { SellerCredentialsRegistry, type SellerCredentials } from './seller-credentials.js';
