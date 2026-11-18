import { z } from 'zod';
import { t } from '../../i18n';
import { isEmail } from '../../lib/email';
import { isValidMobilePhone } from '../../lib/masks';
import { isAcceptablePassword } from '../../lib/password';

/**
 * Schemas de formulário (mensagens fixas do design). A regra de verdade é do servidor (`schemas` de @webag/shared na API);
 * aqui só evitamos a ida e volta por erro óbvio. Validação ao sair do campo (design-system.md §6).
 */
const newPassword = z.string().refine(isAcceptablePassword, { message: t('password.tooWeak') });

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, t('signup.nameError')),
    email: z.string().refine(isEmail, { message: t('signup.emailError') }),
    phone: z.string().refine(isValidMobilePhone, { message: t('signup.phoneError') }),
    password: newPassword,
    confirm: z.string(),
    terms: z.boolean().refine((v) => v, { message: t('signup.termsError') }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('password.mismatch') });

export type SignupForm = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().refine(isEmail, { message: t('login.emailError') }),
  password: z.string().min(1, t('login.passwordError')),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const forgotEmailSchema = z.object({
  email: z.string().refine(isEmail, { message: t('login.emailError') }),
});

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('password.mismatch') });
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export const correctEmailSchema = z.object({
  newEmail: z.string().refine(isEmail, { message: t('signup.emailError') }),
  password: z.string().min(1, t('login.passwordError')),
});
export type CorrectEmailForm = z.infer<typeof correctEmailSchema>;
