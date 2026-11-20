import { z } from 'zod';
import { t } from '../../i18n';
import { isValidCep } from '../../lib/masks';

/** Formulário de endereço (D2). Mensagens fixas do design. Número é obrigatório, a menos que marque "Sem número". */
export const addressSchema = z
  .object({
    cep: z.string().refine(isValidCep, { message: t('address.cepError') }),
    street: z.string().trim().min(1, t('address.streetError')),
    number: z.string().trim().max(10),
    noNumber: z.boolean(),
    complement: z.string().max(80),
    district: z.string().trim().min(1, t('address.districtError')),
    city: z.string().trim().min(1, t('address.cityError')),
    nickname: z.enum(['home', 'work', 'other']).nullable(),
  })
  .refine((v) => v.noNumber || v.number.length > 0, { path: ['number'], message: t('address.numberError') });

export type AddressForm = z.infer<typeof addressSchema>;
