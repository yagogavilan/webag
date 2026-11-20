import type { BulkRequest, BulkResult, ImportResult, Product, ProductPage, ProductSummary, Section, SectionList, SetVariantsRequest, StockAdjustBody, UpdateProductRequest } from '@webag/shared';
import { apiRequest } from './client';
import { ApiError } from './errors';
import { saveErrorMessage } from './messages';

/**
 * Catálogo do lojista (Onda 2B, WB-060 a 066). Os tipos vêm do cliente gerado em `@webag/shared` (openapi.yaml); a chamada
 * passa pelo BFF (`/api/proxy/lojista/...`), que guarda o token no cookie HttpOnly, como o resto do painel.
 */
export type { BulkResult, ImportResult, Product, ProductSummary, Section };
export type ProductStatus = ProductSummary['status'];
export type ModerationStatus = ProductSummary['moderationStatus'];
export type ProductVariantView = Product['variants'][number];

export type ProductFilter = 'all' | 'active' | 'paused' | 'low' | 'draft';

export interface ProductQuery {
  filter: ProductFilter;
  q: string;
  sectionId?: string | undefined;
}

export interface CreateProductBody {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  sectionId?: string | null;
  basePriceCents?: number | null;
}

const L = 'lojista' as const;
const base = (storeId: string) => `stores/${storeId}`;

export function listParams(query: ProductQuery): Record<string, string | undefined> {
  return {
    status: query.filter === 'active' || query.filter === 'paused' || query.filter === 'draft' ? query.filter : undefined,
    lowStock: query.filter === 'low' ? 'true' : undefined,
    q: query.q.trim() || undefined,
    sectionId: query.sectionId,
  };
}

export const catalogApi = {
  list: (storeId: string, query: ProductQuery, cursor?: string, limit = 25) => apiRequest<ProductPage>(L, `${base(storeId)}/products`, { query: { ...listParams(query), cursor, limit } }),
  get: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}`),
  /** `idempotencyKey` fixa por formulário: repetir o envio (rede ruim) devolve o mesmo produto, nunca um segundo. */
  create: (storeId: string, body: CreateProductBody, idempotencyKey: string) => apiRequest<Product>(L, `${base(storeId)}/products`, { method: 'POST', body, idempotencyKey }),
  update: (storeId: string, productId: string, body: UpdateProductRequest) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}`, { method: 'PATCH', body }),
  archive: (storeId: string, productId: string) => apiRequest<void>(L, `${base(storeId)}/products/${productId}`, { method: 'DELETE' }),
  setVariants: (storeId: string, productId: string, body: SetVariantsRequest) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/variants`, { method: 'PUT', body }),
  adjustStock: (storeId: string, productId: string, variantId: string, body: StockAdjustBody) => apiRequest<ProductVariantView>(L, `${base(storeId)}/products/${productId}/variants/${variantId}/stock`, { method: 'POST', body }),
  setImages: (storeId: string, productId: string, imageIds: string[]) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/images`, { method: 'PUT', body: { imageIds } }),
  publish: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/publish`, { method: 'POST' }),
  pause: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/pause`, { method: 'POST' }),
  resume: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/resume`, { method: 'POST' }),
  bulk: (storeId: string, body: BulkRequest) => apiRequest<BulkResult>(L, `${base(storeId)}/products/bulk`, { method: 'POST', body }),
  sections: (storeId: string) => apiRequest<SectionList>(L, `${base(storeId)}/sections`),
  createSection: (storeId: string, name: string) => apiRequest<Section>(L, `${base(storeId)}/sections`, { method: 'POST', body: { name } }),
  renameSection: (storeId: string, sectionId: string, name: string) => apiRequest<Section>(L, `${base(storeId)}/sections/${sectionId}`, { method: 'PATCH', body: { name } }),
  deleteSection: (storeId: string, sectionId: string) => apiRequest<void>(L, `${base(storeId)}/sections/${sectionId}`, { method: 'DELETE' }),
  orderSections: (storeId: string, ids: string[]) => apiRequest<void>(L, `${base(storeId)}/sections/order`, { method: 'PUT', body: { ids } }),
  importCsv: (storeId: string, csv: string, mode: 'preview' | 'commit', onExisting: 'skip' | 'update', signal?: AbortSignal) =>
    apiRequest<ImportResult>(L, `${base(storeId)}/products/import`, { method: 'POST', csv, query: { mode, onExisting }, signal }),
  /** Link direto (GET com o cookie da sessão): o navegador baixa o CSV de modelo. */
  templateHref: (storeId: string) => `/api/proxy/lojista/${base(storeId)}/products/import/template`,
};

export const catalogKeys = {
  all: ['lojista', 'catalog'] as const,
  list: (storeId: string, query: ProductQuery) => ['lojista', 'catalog', 'list', storeId, query.filter, query.q, query.sectionId ?? ''] as const,
  product: (storeId: string, productId: string) => ['lojista', 'catalog', 'product', storeId, productId] as const,
  sections: (storeId: string) => ['lojista', 'catalog', 'sections', storeId] as const,
};

/** Mensagens do servidor para os códigos do catálogo que a tela explica com texto próprio (onda-2 K1 a K6). */
export function catalogErrorMessage(error: unknown, fallback = 'Não foi possível salvar. O que você digitou continua aqui.'): string {
  if (!(error instanceof ApiError)) return fallback;
  const code = error.code;
  const detail = error.detail ?? null;
  switch (code) {
    case 'STORE_NOT_APPROVED':
      return 'O catálogo abre quando a sua loja for aprovada.';
    case 'STOCK_BELOW_RESERVED':
      return detail ?? 'Há unidades reservadas em pedidos. O estoque não pode ficar abaixo delas.';
    case 'OPEN_ORDERS':
      return 'Há pedidos em andamento com esse produto. Pause o produto e arquive depois.';
    case 'PRODUCT_MODERATED':
      return 'A moderação do Webag pausou ou removeu este produto. Só o Webag pode reativar.';
    case 'CATEGORY_FORBIDDEN':
      return 'Esse tipo de produto não é permitido no Webag.';
    case 'CATEGORY_INACTIVE':
      return 'Essa categoria não está mais disponível. Escolha outra.';
    case 'PRICE_OUT_OF_RANGE':
      return 'O preço precisa estar entre R$ 0,01 e R$ 99.999,99.';
    case 'PROMOTION_INVALID':
      return detail ?? 'Confira a promoção: o preço precisa ser menor que o normal e o fim depois do início.';
    case 'SKU_IN_USE':
      return detail ?? 'Esse código já está em uso em outro produto da loja.';
    case 'TOO_MANY_IMAGES':
      return 'O máximo é 8 fotos por produto.';
    case 'BULK_BLOCKED':
      return detail ?? 'Algum preço sairia da faixa permitida. Nada foi alterado. Ajuste o valor e tente de novo.';
    case 'IMPORT_FILE_INVALID':
      return detail ?? 'Use o modelo do Webag, em CSV.';
    case 'PRODUCT_INCOMPLETE':
      return detail ?? 'Faltam informações para publicar.';
    case 'REAUTH_REQUIRED':
      return 'Confirme sua senha para continuar.';
    default:
      return saveErrorMessage(error, fallback);
  }
}
