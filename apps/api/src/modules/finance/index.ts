// API pública do módulo finance (ADR-007 §2): comissão, taxa de serviço e ledger.
export { FinanceModule } from './finance.module.js';
export { CommissionService, type RateInput, type ResolvedCommission } from './commission.service.js';
export { LedgerService, type OrderBalances } from './ledger.service.js';
export { computeOrderFinance, estimateProviderFeeCents, MAX_COMMISSION_BP, type OrderFinance, type OrderFinanceInput, type CommissionSource } from './domain/commission.js';
export { applyBp, pctToBp, allocateProportional } from './domain/money.js';
