import { z } from 'zod';
import { limitQuery } from '../../platform/http/pagination.js';

/** Corpos e consultas do admin de campanhas (WB-340, WB-349). Todos estritos: campo fora da lista é erro, e NÃO existe campo para majorar preço, frete ou taxa (DEC-088). */
const date = z.iso.datetime().transform((v) => new Date(v));
const reason = z.string().trim().min(3).max(200);
const target = z.strictObject({ kind: z.enum(['all', 'city', 'store', 'category']), cityId: z.uuid().nullish(), storeId: z.uuid().nullish(), categoryId: z.uuid().nullish() });

const base = {
  name: z.string().trim().min(2).max(80),
  fundingSource: z.enum(['webag', 'store', 'split', 'self_funded']),
  storeSharePct: z.number().int().min(1).max(99),
  kind: z.enum(['percent', 'fixed', 'free_shipping']),
  value: z.number().int().min(0).max(100_000_000),
  percentCapCents: z.number().int().min(1).nullable(),
  minOrderCents: z.number().int().min(0).max(1_000_000),
  audience: z.enum(['all', 'first_purchase', 'reactivation']),
  reactivationDays: z.number().int().min(7).max(365),
  target,
  startsAt: date,
  endsAt: date,
  budgetTotalCents: z.number().int().min(1).nullable(),
  budgetDailyCents: z.number().int().min(1).nullable(),
  maxUses: z.number().int().min(1).nullable(),
  perCustomerLimit: z.number().int().min(1).max(100),
  code: z.string().trim().toUpperCase().min(4).max(20).regex(/^[A-Z0-9]+$/).nullable(),
  codeVisibility: z.enum(['public', 'private']),
};

export const campaignCreate = z.strictObject({
  name: base.name,
  fundingSource: base.fundingSource,
  storeSharePct: base.storeSharePct.optional(),
  kind: base.kind,
  value: base.value.optional(),
  percentCapCents: base.percentCapCents.optional(),
  minOrderCents: base.minOrderCents.optional(),
  audience: base.audience,
  reactivationDays: base.reactivationDays.default(30),
  target,
  startsAt: base.startsAt.optional(),
  endsAt: base.endsAt.optional(),
  budgetTotalCents: base.budgetTotalCents.optional(),
  budgetDailyCents: base.budgetDailyCents.optional(),
  maxUses: base.maxUses.optional(),
  perCustomerLimit: base.perCustomerLimit.default(1),
  code: base.code.optional(),
  codeVisibility: base.codeVisibility.default('public'),
  reason,
});
export type CampaignCreateInput = z.infer<typeof campaignCreate>;

export const campaignPatch = z.strictObject({
  name: base.name.optional(),
  fundingSource: base.fundingSource.optional(),
  storeSharePct: base.storeSharePct.optional(),
  kind: base.kind.optional(),
  value: base.value.optional(),
  percentCapCents: base.percentCapCents.optional(),
  minOrderCents: base.minOrderCents.optional(),
  audience: base.audience.optional(),
  reactivationDays: base.reactivationDays.optional(),
  target: target.optional(),
  startsAt: base.startsAt.optional(),
  endsAt: base.endsAt.optional(),
  budgetTotalCents: base.budgetTotalCents.optional(),
  budgetDailyCents: base.budgetDailyCents.optional(),
  maxUses: base.maxUses.optional(),
  perCustomerLimit: base.perCustomerLimit.optional(),
  code: base.code.optional(),
  codeVisibility: base.codeVisibility.optional(),
  reason,
  expectedVersion: z.number().int().min(1),
});
export type CampaignPatchInput = z.infer<typeof campaignPatch>;

export const reasonBody = z.strictObject({ reason });
export const activateBody = z.strictObject({ reason, expectedVersion: z.number().int().min(1), acknowledgeLossRisk: z.boolean().optional() });

export const simulationBody = z.strictObject({
  fundingSource: base.fundingSource,
  storeSharePct: base.storeSharePct.optional(),
  kind: base.kind,
  value: base.value.optional(),
  percentCapCents: base.percentCapCents.optional(),
  minOrderCents: base.minOrderCents.optional(),
  target: target.optional(),
  budgetTotalCents: base.budgetTotalCents.optional(),
  budgetDailyCents: base.budgetDailyCents.optional(),
  maxUses: base.maxUses.optional(),
  referenceSubtotalCents: z.number().int().min(1000).max(1_000_000).optional(),
});

export const campaignList = z.strictObject({
  state: z.enum(['draft', 'scheduled', 'active', 'paused', 'ended']).optional(),
  fundingSource: z.enum(['webag', 'store', 'split', 'self_funded']).optional(),
  owner: z.enum(['webag', 'store']).optional(),
  cursor: z.string().max(300).optional(),
  limit: limitQuery,
});
export const pageQuery = z.strictObject({ cursor: z.string().max(300).optional(), limit: limitQuery });
export const suspectList = z.strictObject({ state: z.enum(['open', 'released']).default('open'), campaignId: z.uuid().optional(), cursor: z.string().max(300).optional(), limit: limitQuery });
