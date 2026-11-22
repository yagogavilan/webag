import type { BulkPreviewItem, BulkRequest, BulkResult, BulkUndoResult, CatalogQuickStart, CategoryTemplate, CategoryTemplateList, CreateProductDraftRequest, CreateProductDraftsBatchRequest, CreateProductDraftsBatchResult, ImportResult, Product, ProductDraftPage, ProductDraftSummary, ProductPage, ProductSummary, ProductTablePage, ProductTableRow, QuickPublishRequest, Section, SectionList, SetVariantsRequest, StockAdjustBody, StockAdjustResult, UpdateProductRequest } from '@webag/shared';
import { apiRequest } from './client';
import { ApiError } from './errors';
import { saveErrorMessage } from './messages';

/**
 * Catálogo do lojista (Onda 2B, WB-060 a 066). Os tipos vêm do cliente gerado em `@webag/shared` (openapi.yaml); a chamada
 * passa pelo BFF (`/api/proxy/lojista/...`), que guarda o token no cookie HttpOnly, como o resto do painel.
 */
export type { BulkPreviewItem, BulkResult, BulkUndoResult, CatalogQuickStart, CategoryTemplate, CreateProductDraftsBatchResult, ImportResult, Product, ProductDraftPage, ProductDraftSummary, ProductSummary, ProductTablePage, ProductTableRow, QuickPublishRequest, Section };
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
  adjustStock: (storeId: string, productId: string, variantId: string, body: StockAdjustBody, ifMatch?: number) =>
    apiRequest<StockAdjustResult>(L, `${base(storeId)}/products/${productId}/variants/${variantId}/stock`, { method: 'POST', body, ...(ifMatch !== undefined ? { ifMatch } : {}) }),
  setImages: (storeId: string, productId: string, imageIds: string[]) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/images`, { method: 'PUT', body: { imageIds } }),
  publish: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/publish`, { method: 'POST' }),
  pause: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/pause`, { method: 'POST' }),
  resume: (storeId: string, productId: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/resume`, { method: 'POST' }),
  /**
   * Ação em massa. `price_adjust` sem `dryRun` EXIGE `idempotencyKey` (uma por intenção, reaproveitada na retentativa) e
   * `expectedVersions` da prévia (contrato R1.2, tech-lead B2); pausar, reativar e mover de seção são estados absolutos e dispensam.
   */
  bulk: (storeId: string, body: BulkRequest, idempotencyKey?: string) =>
    apiRequest<BulkResult>(L, `${base(storeId)}/products/bulk`, { method: 'POST', body, ...(idempotencyKey ? { idempotencyKey } : {}) }),
  /** Desfaz um reajuste por até 10 min (`undoUntil`). Idempotente no servidor (repetir devolve `alreadyUndone`): a tela pode tentar de novo sem risco. */
  undoBulk: (storeId: string, batchId: string) => apiRequest<BulkUndoResult>(L, `${base(storeId)}/products/bulk/${batchId}/undo`, { method: 'POST' }),
  /** Cadastro rápido (R1.2, ADR-018). Toda escrita leva `Idempotency-Key` estável por intenção; `quickPublish` e `update` levam `If-Match`. */
  quickStart: (storeId: string) => apiRequest<CatalogQuickStart>(L, `${base(storeId)}/catalog/quick-start`),
  drafts: (storeId: string, cursor?: string, limit = 25) => apiRequest<ProductDraftPage>(L, `${base(storeId)}/product-drafts`, { query: { cursor, limit } }),
  createDraft: (storeId: string, body: CreateProductDraftRequest, idempotencyKey: string) => apiRequest<Product>(L, `${base(storeId)}/product-drafts`, { method: 'POST', body, idempotencyKey }),
  createDraftsBatch: (storeId: string, body: CreateProductDraftsBatchRequest, idempotencyKey: string) =>
    apiRequest<CreateProductDraftsBatchResult>(L, `${base(storeId)}/product-drafts/batch`, { method: 'POST', body, idempotencyKey }),
  duplicate: (storeId: string, productId: string, idempotencyKey: string) => apiRequest<Product>(L, `${base(storeId)}/products/${productId}/duplicate`, { method: 'POST', idempotencyKey }),
  quickPublish: (storeId: string, productId: string, body: QuickPublishRequest, idempotencyKey: string, version: number, signal?: AbortSignal) =>
    apiRequest<Product>(L, `${base(storeId)}/products/${productId}/quick-publish`, { method: 'POST', body, idempotencyKey, ifMatch: version, signal }),
  table: (storeId: string, params: { q?: string; status?: 'active' | 'paused'; sectionId?: string; cursor?: string; limit?: number }) =>
    apiRequest<ProductTablePage>(L, `${base(storeId)}/products/table`, { query: params }),
  /** Preço em linha (tabela de preço e estoque): `If-Match` com a versão da linha. */
  updateIfMatch: (storeId: string, productId: string, body: UpdateProductRequest, version: number) =>
    apiRequest<Product>(L, `${base(storeId)}/products/${productId}`, { method: 'PATCH', body, ifMatch: version }),
  templates: () => apiRequest<CategoryTemplateList>(L, 'category-templates'),
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
  quickStart: (storeId: string) => ['lojista', 'catalog', 'quick-start', storeId] as const,
  drafts: (storeId: string) => ['lojista', 'catalog', 'drafts', storeId] as const,
  templates: ['lojista', 'catalog', 'templates'] as const,
  table: (storeId: string, q: string, status: string) => ['lojista', 'catalog', 'table', storeId, q, status] as const,
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
    case 'BULK_VERSION_CONFLICT':
      return bulkConflictMessage(error);
    case 'BULK_NEEDS_CONFIRMATION':
      return 'Algum preço muda muito. Confira os valores novos, marque "Conferi os valores novos" e aplique de novo. Nada foi alterado.';
    case 'UNDO_WINDOW_EXPIRED':
      return 'O prazo de 10 minutos para desfazer acabou. Os preços ficam como estão; edite na tabela se precisar.';
    case 'IDEMPOTENCY_IN_PROGRESS':
      return 'Esta ação ainda está sendo aplicada. Espere alguns segundos e toque em tentar de novo. Nada será aplicado duas vezes.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'Esta ação mudou depois da prévia. Conferimos os valores de novo; revise e aplique.';
    case 'IMPORT_FILE_INVALID':
      return detail ?? 'Use o modelo do Webag, em CSV.';
    case 'PRODUCT_INCOMPLETE':
      return detail ?? 'Faltam informações para publicar.';
    case 'DRAFT_LIMIT_REACHED':
      return 'Limite de 100 rascunhos. Publique ou apague algum para criar outro.';
    case 'DESCRIPTION_REQUIRED':
      return detail ?? 'Esta categoria pede uma descrição. Escreva ao menos 20 caracteres.';
    case 'QUICK_PUBLISH_NOT_APPLICABLE':
      return 'Este produto já está publicado.';
    case 'PRODUCT_VERSION_CONFLICT':
      return 'Este produto foi alterado em outro aparelho. Atualize e confira antes de publicar.';
    case 'REAUTH_REQUIRED':
      return 'Confirme sua senha para continuar.';
    default:
      return saveErrorMessage(error, fallback);
  }
}

/** 409 `BULK_VERSION_CONFLICT`: nomeia até 3 produtos que mudaram depois da prévia (a lista vem em `conflicts`). */
export function bulkConflictMessage(error: ApiError): string {
  const raw = error.problem['conflicts'];
  const names = Array.isArray(raw) ? raw.map((item) => (item && typeof item === 'object' ? (item as { name?: unknown }).name : null)).filter((name): name is string => typeof name === 'string') : [];
  const who = names.length === 0 ? 'Alguns produtos' : names.length === 1 ? names[0] : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` e mais ${names.length - 3}` : ''}`;
  const verb = names.length <= 1 && names.length !== 0 ? 'mudou' : 'mudaram';
  return `${who} ${verb} depois da prévia (outra pessoa ou outro aparelho editou). Nada foi aplicado. Atualizamos a prévia com os valores de agora; confira e aplique de novo.`;
}
