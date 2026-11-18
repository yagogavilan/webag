import { z } from 'zod';
import { STORE_DOCUMENT_KINDS } from './db/schema.js';
import { MAX_FIXED_FEE_CENTS } from './domain/delivery.js';

export const cents = (max: number) => z.number().int().min(0).max(max);

/** WhatsApp: celular brasileiro com DDD (11 dígitos); aceita máscara e +55. */
export const whatsappSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, '').replace(/^\+?55/, ''))
  .pipe(z.string().regex(/^[1-9]{2}9\d{8}$/, 'WhatsApp inválido. Use DDD + 9 dígitos.'));

/** Telefone fixo ou celular com DDD (10 ou 11 dígitos). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, '').replace(/^\+?55/, ''))
  .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, 'Telefone inválido. Use DDD + número.'));

/** Descrição conta caracteres Unicode (`ã` e emoji contam 1): até 300. */
const unicodeMax = (max: number, label: string) => z.string().trim().refine((value) => [...value].length <= max, `${label}: no máximo ${max} caracteres.`);

export const createStoreSchema = z.strictObject({
  documentType: z.enum(['cpf', 'cnpj']),
  documentNumber: z.string().trim().min(11).max(20),
  /** CNPJ: razão social e aceite da responsabilidade fiscal (WB-051 C5). */
  legalName: z.string().trim().min(3).max(160).optional(),
  fiscalResponsibilityAccepted: z.boolean().optional(),
});

export const addressSchema = z.strictObject({
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido.'),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  /** Preenchidos pelo servidor a partir do CEP; o painel manda quando o serviço de CEP está fora (preenchimento manual). */
  street: z.string().trim().min(2).max(120).optional(),
  neighborhood: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().length(2).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const profileSchema = z.strictObject({
  name: z.string().trim().min(2).max(80).optional(),
  legalName: z.string().trim().min(3).max(160).optional(),
  fiscalResponsibilityAccepted: z.boolean().optional(),
  mainCategoryId: z.uuid().optional(),
  extraCategoryIds: z.array(z.uuid()).max(2).optional(),
  description: unicodeMax(300, 'Descrição').optional(),
  phone: phoneSchema.optional(),
  whatsapp: whatsappSchema.optional(),
  address: addressSchema.optional(),
  logoAssetId: z.uuid().nullable().optional(),
  coverAssetId: z.uuid().nullable().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const attachDocumentSchema = z.strictObject({ kind: z.enum(STORE_DOCUMENT_KINDS), uploadId: z.uuid() });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
export const hoursSchema = z.strictObject({
  days: z
    .array(
      z.strictObject({
        weekday: z.number().int().min(0).max(6),
        intervals: z.array(z.strictObject({ start: hhmm, end: hhmm })).max(3),
      }),
    )
    .max(7),
});

export const holidaysSchema = z.strictObject({
  holidays: z
    .array(z.strictObject({ date: z.iso.date(), label: z.string().trim().max(60).optional() }))
    .max(366),
});

export const pauseSchema = z.strictObject({ kind: z.enum(['30m', '1h', '2h', 'end_of_day', 'until_resume']) });

export const deliverySchema = z.strictObject({
  acceptsDelivery: z.boolean(),
  /** Em km, até 2 casas (0,9 e 15,01 são recusados). */
  radiusKm: z.number().min(0.01).max(1000).multipleOf(0.01),
  feeMode: z.enum(['fixed', 'by_distance']),
  feeFixedCents: cents(10_000).default(0),
  tiers: z
    .array(z.strictObject({ fromKm: z.number().min(0).multipleOf(0.01), toKm: z.number().min(0).multipleOf(0.01), feeCents: cents(10_000) }))
    .max(10)
    .default([]),
  minOrderCents: cents(10_000_000),
  freeAboveCents: cents(10_000_000).default(0),
  etaMinMinutes: z.number().int().min(1).max(1440),
  etaMaxMinutes: z.number().int().min(1).max(1440),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;
export { MAX_FIXED_FEE_CENTS };

export const pickupSchema = z.strictObject({
  enabled: z.boolean(),
  useStoreAddress: z.boolean().default(true),
  address: z.string().trim().max(200).optional(),
  instructions: unicodeMax(200, 'Instruções').optional(),
  prepMinMinutes: z.number().int().min(1).max(1440),
  prepMaxMinutes: z.number().int().min(1).max(1440),
});

/** Piso legal (arrependimento e defeito) NÃO é campo: payload com ele é 400 (strictObject, DEC-011). */
export const exchangePolicySchema = z.strictObject({
  voluntaryDays: z.number().int().min(0).max(30),
  collectionFeeCents: cents(100_000).default(0),
  /** Religar a troca confirma o prazo (R-26). */
  confirmDefault: z.boolean().optional(),
});

export const lowStockSchema = z.strictObject({ threshold: z.number().int().min(0).max(100).nullable() });

export const previewSchema = z.strictObject({
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido.').optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  subtotalCents: cents(10_000_000).default(0),
});

export const inviteStaffSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  name: z.string().trim().min(2).max(120),
  permissions: z.array(z.string().max(30)).max(10),
});
export const memberPermissionsSchema = z.strictObject({ permissions: z.array(z.string().max(30)).max(10) });
export const acceptStaffSchema = z.strictObject({ token: z.string().min(20).max(200), password: z.string().min(1).max(1000) });

export const connectCallbackSchema = z.strictObject({ code: z.string().min(1).max(200), state: z.string().min(20).max(200) });

// ---- admin
const reason = z.string().trim().min(5, 'Informe o motivo (mínimo 5 caracteres).').max(500);
export const decisionReasonSchema = z.strictObject({ reason });
export const correctionSchema = z.strictObject({
  items: z
    .array(z.strictObject({ item: z.string().trim().min(2).max(40), reason: z.string().trim().min(3, 'Informe o motivo de cada item.').max(500) }))
    .min(1)
    .max(10),
});
export const documentAccessSchema = z.strictObject({ reason: z.enum(['initial_review', 'doubt', 'report']) });
export const adminStorePatchSchema = z.strictObject({
  reason,
  profile: profileSchema.optional(),
});
export const releaseAccountSchema = z.strictObject({ reason: z.string().trim().min(10, 'Informe o motivo (mínimo 10 caracteres).').max(500) });
