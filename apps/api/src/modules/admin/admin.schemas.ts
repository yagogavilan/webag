import { z } from 'zod';

/** Texto de modelo de categoria: puro (sem caracteres de controle) e aparado. */
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/\p{Cc}/u.test(value), 'Caractere de controle não é aceito.');

/** WB-375 (Could): `PUT /v1/admin/category-templates/{categoryId}`. Até 12 atributos e 30 valores por atributo (contrato `SetCategoryTemplateRequest`). */
export const categoryTemplateSchema = z.strictObject({
  attributes: z.array(z.strictObject({ name: text(30), values: z.array(text(40)).max(30) })).max(12),
  sizeChartHint: z.boolean(),
  noVoluntaryExchangeHint: z.boolean(),
  descriptionRequired: z.boolean(),
  descriptionMinChars: z.number().int().min(1).max(200).default(20),
});
