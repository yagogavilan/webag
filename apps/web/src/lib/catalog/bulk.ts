import type { BulkPreviewItem, BulkResult } from '@/lib/api/catalog';

/** Chave de idempotência (8 a 80 caracteres [A-Za-z0-9_-], regra do servidor e do BFF). */
export function newIdempotencyKey(): string {
  return `massa-${crypto.randomUUID()}`;
}

export type PriceUnit = 'percent' | 'amount';

export interface PriceAdjustIntent {
  productIds: string[];
  unit: PriceUnit;
  /** Já com o sinal: aumentar positivo, diminuir negativo (percentual ou centavos). */
  value: number;
}

/** Corpo da prévia (`dryRun`): o servidor calcula; a tela não repete a conta. */
export function priceAdjustPreviewBody(intent: PriceAdjustIntent) {
  return { productIds: intent.productIds, dryRun: true, action: { type: 'price_adjust' as const, mode: intent.unit, value: intent.value } };
}

/**
 * Corpo de aplicar: `expectedVersions` vêm do que o lojista VIU na prévia (uma por item, mesma lista de `productIds`);
 * `confirmLargeChange` só vai quando a prévia pediu a caixa "Conferi os valores novos" e ela foi marcada.
 */
export function priceAdjustApplyBody(intent: PriceAdjustIntent, preview: BulkResult, confirmed: boolean) {
  const items: BulkPreviewItem[] = preview.preview ?? [];
  return {
    productIds: items.map((item) => item.productId),
    dryRun: false,
    ...(preview.requiresConfirmation && confirmed ? { confirmLargeChange: true } : {}),
    expectedVersions: items.map((item) => ({ productId: item.productId, version: item.version })),
    action: { type: 'price_adjust' as const, mode: intent.unit, value: intent.value },
  };
}

/** A prévia só pode ser aplicada se nada foi bloqueado, há item e (se pediu) a caixa foi marcada. */
export function canApplyPreview(preview: BulkResult | undefined, confirmed: boolean): boolean {
  if (!preview || preview.blocked.length > 0 || (preview.preview?.length ?? 0) === 0) return false;
  return preview.requiresConfirmation ? confirmed : true;
}
