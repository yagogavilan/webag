import { applyAdjust, type StockAdjust } from './stock.js';

/**
 * Plano da ação em massa do admin (WB-353 C6): regras PURAS, sem banco, para a prévia e a execução usarem a mesma decisão por item.
 * Item bloqueado fica de FORA do lote (o resto é aplicado); "já está assim" não é alteração (sem versão nova nem linha de auditoria).
 */
export type AdminBulkAction = { type: 'pause' } | { type: 'resume' } | { type: 'stock_set'; value: number } | { type: 'stock_adjust'; value: number };
export type AdminBlockReason = 'STOCK_BELOW_RESERVED' | 'PRODUCT_MODERATED' | 'NOT_ACTIVE' | 'MULTIPLE_VARIANTS';

export interface PlanProduct {
  status: string;
  moderationStatus: string;
}
export interface PlanVariant {
  stock: number;
  reserved: number;
}

export type ItemPlan = { kind: 'noop' } | { kind: 'blocked'; reason: AdminBlockReason } | { kind: 'status'; to: 'active' | 'paused' } | { kind: 'stock'; from: number; to: number };

/** `variants` = só as variações ATIVAS do produto. */
export function planItem(action: AdminBulkAction, product: PlanProduct, variants: PlanVariant[]): ItemPlan {
  // Rascunho e arquivado estão fora da vitrine: nada a pausar, reativar nem ajustar.
  if (product.status !== 'active' && product.status !== 'paused') return { kind: 'blocked', reason: 'NOT_ACTIVE' };
  if (action.type === 'pause') return product.status === 'active' ? { kind: 'status', to: 'paused' } : { kind: 'noop' };
  if (action.type === 'resume') {
    if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') return { kind: 'blocked', reason: 'PRODUCT_MODERATED' };
    return product.status === 'paused' ? { kind: 'status', to: 'active' } : { kind: 'noop' };
  }
  // Estoque em massa só vale para produto de UMA variação: com grade, "estoque 10" não diz se é de P, de M ou de G.
  if (variants.length === 0) return { kind: 'blocked', reason: 'NOT_ACTIVE' };
  if (variants.length > 1) return { kind: 'blocked', reason: 'MULTIPLE_VARIANTS' };
  const variant = variants[0] as PlanVariant;
  const adjust: StockAdjust = action.type === 'stock_set' ? { set: action.value } : { delta: action.value };
  const next = applyAdjust(variant.stock, variant.reserved, adjust);
  if ('error' in next) return { kind: 'blocked', reason: 'STOCK_BELOW_RESERVED' };
  return next.stock === variant.stock ? { kind: 'noop' } : { kind: 'stock', from: variant.stock, to: next.stock };
}
