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
