// API pública do módulo finance (ADR-007 §2): comissão, taxa de serviço e ledger.
export { FinanceModule } from './finance.module.js';
export { CommissionService } from './commission.service.js';
export { LedgerService } from './ledger.service.js';
export { computeOrderFinance, estimateProviderFeeCents, MAX_COMMISSION_BP } from './domain/commission.js';
export { applyBp, pctToBp, allocateProportional } from './domain/money.js';
//# sourceMappingURL=index.js.map