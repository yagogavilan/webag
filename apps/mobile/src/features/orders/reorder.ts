import type { Order } from '@webag/shared';
import { putCartItem, type CartParams } from '../../api/cart-api';

export interface ReorderResult {
  added: number;
  missing: string[];
}

/**
 * "Pedir de novo" e "Gerar novo código": devolve os itens do pedido à sacola (o servidor decide preço e estoque, RN-05). O primeiro item
 * troca a sacola de outra loja, se houver; item que o servidor recusa (esgotado, indisponível) entra em `missing`.
 */
export async function reorderItems(order: Pick<Order, 'items'>, params: CartParams): Promise<ReorderResult> {
  let added = 0;
  const missing: string[] = [];
  for (const item of order.items) {
    try {
      await putCartItem(item.variantId, item.quantity, params, added === 0);
      added += 1;
    } catch {
      missing.push(item.name);
    }
  }
  return { added, missing };
}
