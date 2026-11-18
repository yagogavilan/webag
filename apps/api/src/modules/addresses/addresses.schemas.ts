import { z } from 'zod';
import { ADDRESS_LABELS } from './db/schema.js';

const text = (max: number) => z.string().trim().min(1, 'Preencha este campo.').max(max);
const cep = z.string().regex(/^\d{5}-?\d{3}$/, 'Digite o CEP com 8 números.').transform((v) => v.replace('-', ''));
const coordinates = {
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
};
const bothOrNone = (v: { lat?: number | undefined; lng?: number | undefined }): boolean => (v.lat === undefined) === (v.lng === undefined);
const COORD_MESSAGE = { message: 'Informe latitude e longitude juntas.', path: ['lat'] };

/** `number` aceita "S/N" (WB-002 C4). Latitude e longitude vêm do GPS do aparelho; sem elas o servidor usa o CEP. */
export const createAddressSchema = z
  .strictObject({
    label: z.enum(ADDRESS_LABELS).nullish(),
    cep,
    street: text(120),
    number: text(20),
    complement: z.string().trim().max(80).nullish(),
    neighborhood: text(80),
    city: text(80),
    state: z.string().trim().length(2).default('SP'),
    ...coordinates,
    isDefault: z.boolean().optional(),
  })
  .refine(bothOrNone, COORD_MESSAGE);

export const updateAddressSchema = z
  .strictObject({
    label: z.enum(ADDRESS_LABELS).nullable().optional(),
    cep: cep.optional(),
    street: text(120).optional(),
    number: text(20).optional(),
    complement: z.string().trim().max(80).nullable().optional(),
    neighborhood: text(80).optional(),
    city: text(80).optional(),
    state: z.string().trim().length(2).optional(),
    ...coordinates,
    /** Só `true`: o padrão muda ao promover outro endereço (sempre existe um padrão quando há endereço). */
    isDefault: z.literal(true).optional(),
  })
  .refine(bothOrNone, COORD_MESSAGE)
  .refine((v) => Object.keys(v).length > 0, { message: 'Envie ao menos um campo.' });

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
