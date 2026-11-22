import { z } from 'zod';
import { limitQuery } from '../../platform/http/pagination.js';

/** Faixa de preço e estoque é validada no serviço (422 com código), não aqui: o painel mostra o motivo no campo. */
const money = z.number().int();
const isoDate = z.iso.datetime({ message: 'Data e hora inválidas (ISO 8601).' });
const attributeName = z.string().trim().min(1).max(30);
const attributeValue = z.string().trim().min(1).max(40);

export const createProductSchema = z.strictObject({
  /** Rascunho só exige o nome (R-38); o resto é obrigatório ao publicar. */
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  sectionId: z.uuid().nullable().optional(),
  basePriceCents: money.nullable().optional(),
});

export const updateProductSchema = z.strictObject({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  sectionId: z.uuid().nullable().optional(),
  basePriceCents: money.nullable().optional(),
  /** Promoção no PRODUTO (WB-062 C5). `null` nos três limpa a promoção. */
  promoPriceCents: money.nullable().optional(),
  promoStartsAt: isoDate.nullable().optional(),
  promoEndsAt: isoDate.nullable().optional(),
  /** Tabela de medidas (WB-246). */
  sizeChart: z.string().trim().max(2000).nullable().optional(),
  /** "Sem troca voluntária" (WB-244): sob medida, personalizado, íntimo ou higiene. */
  noVoluntaryExchange: z.boolean().optional(),
});

const variantSchema = z.strictObject({
  /** Presente = edita a variação existente; ausente = cria. Variação existente fora da lista é desativada. */
  id: z.uuid().optional(),
  attributes: z.record(attributeName, attributeValue),
  stock: z.number().int().optional(),
  priceCents: money.nullable().optional(),
  sku: z.string().trim().min(1).max(40).nullable().optional(),
});

export const setVariantsSchema = z.strictObject({
  /** Nomes dos atributos (até 3). Vazio = "sem variação": uma variação sem atributos, só com estoque. */
  attributes: z.array(attributeName).max(5),
  variants: z.array(variantSchema).min(1).max(300),
});

export const stockAdjustSchema = z.union([z.strictObject({ delta: z.number().int() }), z.strictObject({ set: z.number().int() })]);

export const setImagesSchema = z.strictObject({ imageIds: z.array(z.uuid()).max(20) });

export const sectionSchema = z.strictObject({ name: z.string().trim().min(1).max(40) });
export const sectionOrderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });

export const listProductsSchema = z.strictObject({
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  q: z.string().trim().max(80).optional(),
  sectionId: z.uuid().optional(),
  lowStock: z.enum(['true']).optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});

export const bulkSchema = z.strictObject({
  productIds: z.array(z.uuid()).min(1).max(200),
  /** B2 (D17): `version` de cada item, como veio em `preview[].version`. Obrigatória em `price_adjust` sem `dryRun` (o controller confere a cobertura de todos os `productIds`). */
  expectedVersions: z.array(z.strictObject({ productId: z.uuid(), version: z.number().int().min(1) })).max(200).optional(),
  /** WB-377 C3: confirma reajuste acima de `reajuste_max_pct` em algum item. */
  confirmLargeChange: z.boolean().default(false),
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('pause') }),
    z.strictObject({ type: z.literal('resume') }),
    z.strictObject({ type: z.literal('move_section'), sectionId: z.uuid().nullable() }),
    z.strictObject({ type: z.literal('price_adjust'), mode: z.enum(['percent', 'amount']), value: z.number().finite() }),
  ]),
  /** `true` só mostra o que mudaria e o que bloqueia (WB-066 C3). */
  dryRun: z.boolean().default(false),
});

export const importQuerySchema = z.strictObject({
  mode: z.enum(['preview', 'commit']).default('preview'),
  onExisting: z.enum(['skip', 'update']).default('skip'),
});

export const adminProductsQuerySchema = z.strictObject({
  storeId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  moderationStatus: z.enum(['ok', 'review', 'paused', 'removed']).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});

export const moderateSchema = z.strictObject({
  action: z.enum(['pause', 'remove', 'restore']),
  /** Motivo obrigatório para pausar e remover (WB-107 C1); vai por e-mail ao lojista. */
  reason: z.string().trim().min(5, 'Informe o motivo (mínimo 5 caracteres).').max(500).optional(),
});

export const moderationTermSchema = z.strictObject({
  kind: z.enum(['forbidden_category', 'suspect_word']),
  value: z.string().trim().min(1).max(80),
});

// ------------------------------------------------------------------ v1.1 R1.2 (ADR-018)

const via = z.enum(['camera', 'duplicate', 'paste', 'spreadsheet', 'form']);

/** `If-Match` e `Idempotency-Key` vão em cabeçalho; o corpo só leva o que o contrato lista. */
export const createDraftSchema = z.strictObject({
  via,
  /** Opcional: "" ou ausente = ainda sem nome. O texto passa por `cleanLine` no serviço (C-CAD-04). */
  name: z.string().max(80).optional(),
  categoryId: z.uuid().nullable().optional(),
  basePriceCents: money.nullable().optional(),
});

const draftVariantSchema = z.strictObject({
  attributes: z.record(attributeName, z.string().max(40)),
  stock: z.number().int().min(0).max(99_999).default(1),
  priceCents: money.nullable().optional(),
});

/**
 * Item do lote colado (WB-376). A leitura do texto é LOCAL, no aparelho (D3); aqui só chegam itens já revisados. O nome aceita até 200 caracteres para o servidor
 * devolver `NAME_TOO_LONG` NA LINHA (o contrato diz 80: o servidor é mais permissivo na borda, nunca mais restritivo), e a faixa de preço e de estoque
 * também é por linha (`rejected`), para uma linha ruim não derrubar as 99 boas.
 */
const draftBatchItemSchema = z.strictObject({
  clientRef: z.string().min(1).max(40),
  name: z.string().max(200),
  basePriceCents: z.number().int().nullable().optional(),
  quantity: z.number().int().optional(),
  variantAttributes: z.array(attributeName).max(3).optional(),
  variants: z.array(draftVariantSchema).max(100).optional(),
  categoryId: z.uuid().nullable().optional(),
});

export const draftsBatchSchema = z.strictObject({
  via: z.enum(['paste', 'spreadsheet']),
  items: z.array(draftBatchItemSchema).min(1).max(100),
});

export const quickPublishSchema = z.strictObject({
  name: z.string().min(2).max(80),
  basePriceCents: money,
  categoryId: z.uuid().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  stock: z.number().int().min(0).max(99_999).default(1),
  imageIds: z.array(z.uuid()).min(1).max(8),
});

export const draftsQuerySchema = z.strictObject({ cursor: z.string().max(200).optional(), limit: limitQuery });

export const bulkBatchesQuerySchema = draftsQuerySchema;

export const tableQuerySchema = z.strictObject({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'paused']).optional(),
  sectionId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});

export const productMetricsQuerySchema = z.strictObject({
  days: z.enum(['7', '30', '90']).default('30').transform((v) => Number(v) as 7 | 30 | 90),
  groupBy: z.enum(['via', 'store']).default('via'),
  storeId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});

/**
 * `bulkAdminStoreProducts` (WB-353 C6, D7): sem reajuste de PREÇO (o admin não tem prévia por item de dinheiro de terceiros na R1). O corpo aceita mais itens que o teto
 * (200) só para o servidor responder 422 `BULK_TOO_LARGE` (e não 400); o motivo é validado por `validateAdminReason` (422 `REASON_REQUIRED`/`REASON_NOT_ALLOWED`).
 */
export const adminBulkSchema = z.strictObject({
  reason: z.strictObject({ code: z.string().max(40).optional(), note: z.string().max(400).optional() }).optional(),
  productIds: z.array(z.uuid()).min(1).max(1000),
  dryRun: z.boolean().default(false),
  expectedVersions: z.array(z.strictObject({ productId: z.uuid(), version: z.number().int().min(1) })).max(1000).optional(),
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('pause') }),
    z.strictObject({ type: z.literal('resume') }),
    z.strictObject({ type: z.literal('stock_set'), value: z.number().int().min(0).max(99_999) }),
    z.strictObject({ type: z.literal('stock_adjust'), value: z.number().int().min(-99_999).max(99_999) }),
  ]),
});
