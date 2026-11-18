import { z } from 'zod';
import { LEGAL_DOCUMENT_TYPES } from '../admin/index.js';

/** E-mail: normalizado em minúsculas, sem espaços; limite do RFC 5321. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'E-mail inválido.' }));

/** Celular brasileiro: (11) 99999-9999 → 11999999999. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, '').replace(/^\+?55/, ''))
  .pipe(z.string().regex(/^[1-9]{2}9\d{8}$/, 'Celular inválido. Use DDD + 9 dígitos.'));

/** Só tamanho máximo aqui (anti-DoS); a política de senha (422) fica no PasswordService. */
export const passwordSchema = z.string().min(1).max(1_000);

export const codeSchema = z.string().trim().regex(/^\d{6}$/, 'O código tem 6 dígitos.');

/** O cliente informa as versões que exibiu; o servidor confere com as vigentes (WB-210 C2). */
export const acceptedDocumentsSchema = z
  .array(z.strictObject({ type: z.enum(LEGAL_DOCUMENT_TYPES), version: z.number().int().positive() }))
  .min(1)
  .max(5);

export type AcceptedDocuments = z.infer<typeof acceptedDocumentsSchema>;

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  adultDeclaration: z.literal(true, { message: 'É preciso declarar ter 18 anos ou mais.' }),
  acceptedDocuments: acceptedDocumentsSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  /** Step-up por e-mail (SEC-004). */
  code: codeSchema.optional(),
});

export const refreshSchema = z.strictObject({ refreshToken: z.string().min(20).max(200) });
export const emailExistsSchema = z.strictObject({ email: emailSchema });
export const verifyEmailSchema = z.strictObject({ code: codeSchema });
export const correctEmailSchema = z.strictObject({ newEmail: emailSchema, password: passwordSchema });
export const forgotPasswordSchema = z.strictObject({ email: emailSchema });
export const resetPasswordSchema = z.strictObject({
  email: emailSchema,
  code: codeSchema,
  newPassword: passwordSchema,
});
export const mfaVerifySchema = z.strictObject({
  mfaToken: z.string().min(20).max(200),
  /** TOTP de 6 dígitos ou código de recuperação. */
  code: z.string().trim().min(6).max(32),
});
export const completeResetSchema = z.strictObject({
  resetTicket: z.string().min(20).max(200),
  /** TOTP de 6 dígitos ou código de recuperação. */
  totpCode: z.string().trim().min(6).max(32),
  newPassword: passwordSchema,
});
export const resetAdminAccessSchema = z.strictObject({
  reason: z.string().trim().min(20, 'Descreva o motivo (mínimo 20 caracteres).').max(500),
  verifiedChannel: z.enum(['video_call', 'in_person', 'registered_phone']),
});
export const changePasswordSchema = z.strictObject({ currentPassword: passwordSchema, newPassword: passwordSchema });
export const reauthSchema = z.strictObject({
  password: passwordSchema.optional(),
  totpCode: z.string().trim().min(6).max(32).optional(),
});
export const merchantRoleSchema = z.strictObject({ acceptedDocuments: acceptedDocumentsSchema });
export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const inviteAdminSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  profile: z.enum(['super_admin', 'operations', 'finance', 'support']),
});
export const updateAdminSchema = z.strictObject({
  profile: z.enum(['super_admin', 'operations', 'finance', 'support']).optional(),
  active: z.boolean().optional(),
});
export const totpConfirmSchema = z.strictObject({ code: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 dígitos.') });
