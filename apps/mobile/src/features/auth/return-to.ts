/**
 * Destino depois de entrar (retorno exato, onda-3 §0.6). Só caminho interno do app: um link externo ou `//host`
 * poderia levar o usuário recém-logado para fora (SEC-084, deep links por allowlist).
 */
export function safeReturnTo(value: string | string[] | undefined, fallback = '/'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://') || raw.includes('\\')) return fallback;
  return raw;
}

/** E-mail a preencher na próxima tela de acesso (ex.: "Esse e-mail já tem conta" -> Entrar). Fica em memória, nunca na URL. */
let prefillEmail: string | null = null;
export const setEmailPrefill = (email: string): void => {
  prefillEmail = email;
};
export function takeEmailPrefill(): string {
  const value = prefillEmail ?? '';
  prefillEmail = null;
  return value;
}
