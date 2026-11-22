import type { OrderStatus } from './state.js';

/**
 * RN-15 (definição única): pedido "que chegou a RECEBIDO" = tem `paid_at`, e a data dele é a do pagamento.
 * GMV = soma de `total_cents` desses pedidos EXCETO os estados abaixo; cancelamento = `cancelled` + `refused` sobre os que chegaram a RECEBIDO.
 * Usada pela ficha 360 da loja (backoffice); o relatório (`reports.service.ts`) repete a lista em SQL e o teste `admin-store-360` garante que os dois batem.
 */
export const NON_GMV_STATUSES = ['cancelled', 'refused', 'expired'] as const satisfies readonly OrderStatus[];
export const CANCELLATION_STATUSES = ['cancelled', 'refused'] as const satisfies readonly OrderStatus[];
