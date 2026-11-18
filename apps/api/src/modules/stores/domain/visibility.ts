import type { StoreStatus } from './state.js';

export interface VisibilityInput {
  status: StoreStatus;
  paymentAccountActive: boolean;
  activeProducts: number;
}

/** RN-03 / HIP-030: aprovada, conta de recebimento ativa e 1+ produto ativo (suspensa nunca aparece). */
export function isStoreVisible(input: VisibilityInput): boolean {
  return input.status === 'approved' && input.paymentAccountActive && input.activeProducts >= 1;
}
