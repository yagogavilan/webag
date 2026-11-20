// API pública do módulo cart (ADR-007 §2).
export { CartModule } from './cart.module.js';
export { CartService, PurchaseHistoryPort, type Blocker, type Notice } from './cart.service.js';
export { summarize, serviceFeeCents, commissionCents, type PricingInput, type PricingResult } from './domain/pricing.js';
