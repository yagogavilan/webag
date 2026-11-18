import {
  correctEmail,
  getMe,
  forgotPassword,
  getCurrentLegalDocument,
  listRegions,
  login,
  logout,
  register,
  resendEmailCode,
  resetPassword,
  verifyEmail,
  type AuthResult,
  type DocumentRef,
  type TokenPair,
} from '@webag/shared';
import { request } from './http';
import { ApiError } from './problem';
import { sessionStore } from './session';
import type { StoredSession } from './session-storage';

/** Acesso ao contrato de identidade (`/v1/auth/*`). Login do cliente é de 1 passo; TOTP é só do admin (não existe no app). */

function toStored(user: AuthResult['user'], tokens: TokenPair): StoredSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: Date.now() + tokens.expiresIn * 1000,
    user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
  };
}

export async function fetchCurrentCustomerDocuments(): Promise<{ refs: DocumentRef[] }> {
  const [terms, privacy] = await Promise.all([
    request((init) => getCurrentLegalDocument('customer_terms', init), { auth: 'none', retry: true }),
    request((init) => getCurrentLegalDocument('privacy', init), { auth: 'none', retry: true }),
  ]);
  return {
    refs: [
      { type: terms.type, version: terms.version },
      { type: privacy.type, version: privacy.version },
    ],
  };
}

export interface SignUpInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Cadastro: busca as versões vigentes dos termos (409 TERMS_OUTDATED se mudarem no meio), cria a conta e já abre a sessão.
 * O código de e-mail sai em segundo plano; não bloqueia a 1ª compra (DEC-014/015).
 */
export async function signUp(input: SignUpInput): Promise<void> {
  const { refs } = await fetchCurrentCustomerDocuments();
  const result = await request(
    (init) =>
      register(
        {
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          phone: input.phone,
          password: input.password,
          adultDeclaration: true,
          acceptedDocuments: refs,
        },
        init,
      ),
    { auth: 'none' },
  );
  await sessionStore.setSession(toStored(result.user, result.tokens));
}

export interface SignInInput {
  email: string;
  password: string;
  /** Step-up por e-mail (403 LOGIN_CODE_REQUIRED): o mesmo login com o código recebido. */
  code?: string;
}

export async function signIn(input: SignInInput): Promise<void> {
  const result = await request(
    (init) =>
      login(
        {
          email: input.email.trim().toLowerCase(),
          password: input.password,
          ...(input.code ? { code: input.code } : {}),
        },
        init,
      ),
    { auth: 'none' },
  );
  // Conta de admin pede 2º fator (MfaChallenge). O app do cliente não tem esse fluxo (admin é só web, DEC-018) e não revela
  // que a conta existe: responde igual a credencial errada.
  if ('mfaRequired' in result) {
    throw new ApiError({ kind: 'problem', status: 401, code: 'INVALID_CREDENTIALS' });
  }
  await sessionStore.setSession(toStored(result.user, result.tokens));
  // SEC-121: admin sem TOTP (`mfaSetupRequired`) não pode ficar com sessão no app do cliente: revoga no servidor, apaga daqui
  // e responde como credencial errada.
  if (result.mfaSetupRequired) {
    await signOut();
    throw new ApiError({ kind: 'problem', status: 401, code: 'INVALID_CREDENTIALS' });
  }
}

export async function signOut(): Promise<void> {
  // Revoga no servidor se der; independente do resultado o aparelho esquece a sessão (SEC-012).
  try {
    await request((init) => logout(init), { timeoutMs: 5_000 });
  } catch {
    // sem rede: o refresh antigo morre no servidor por validade ou na próxima limpeza de sessões
  }
  await sessionStore.clear();
}

export async function confirmEmail(code: string): Promise<void> {
  await request((init) => verifyEmail({ code }, init));
  await sessionStore.updateUser({ emailVerified: true });
}

export const resendCode = (): Promise<void> => request((init) => resendEmailCode(init));

export async function changeUnverifiedEmail(newEmail: string, password: string): Promise<string> {
  const email = newEmail.trim().toLowerCase();
  await request((init) => correctEmail({ newEmail: email, password }, init));
  await sessionStore.updateUser({ email });
  return email;
}

export const requestPasswordCode = (email: string): Promise<unknown> =>
  request((init) => forgotPassword({ email: email.trim().toLowerCase() }, init), { auth: 'none' });

/** Redefine a senha. O servidor confirma o e-mail e revoga TODAS as sessões; para cliente devolve tokens e já entramos. */
export async function resetPasswordWithCode(input: { email: string; code: string; newPassword: string }): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const result = await request(
    (init) => resetPassword({ email, code: input.code, newPassword: input.newPassword }, init),
    { auth: 'none' },
  );
  if (!result.tokens) return false;
  // O reset não devolve o resumo do usuário: completa com /v1/me (se falhar, a próxima leitura corrige).
  await sessionStore.setSession({
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    accessExpiresAt: Date.now() + result.tokens.expiresIn * 1000,
    user: { id: '', name: '', email, emailVerified: true },
  });
  try {
    const me = await request((init) => getMe(init));
    await sessionStore.updateUser({ id: me.id, name: me.name, email: me.email, emailVerified: me.emailVerified });
  } catch {
    // segue logado com o que temos
  }
  return true;
}

export const fetchCurrentLegalDocument = (type: 'customer_terms' | 'privacy') =>
  request((init) => getCurrentLegalDocument(type, init), { auth: 'none', retry: true });

export const fetchRegions = () => request((init) => listRegions(init), { auth: 'none', retry: true });
