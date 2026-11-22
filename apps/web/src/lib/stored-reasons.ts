/**
 * Motivos digitados pelo admin ficam só no `sessionStorage` da aba (pré-preenchimento). SEC-220: não podem sobreviver ao logout nem à
 * perda da sessão, senão o próximo usuário do mesmo navegador recebe o texto do anterior. Chaves e limpeza ficam juntas aqui.
 */
export const VIEW_AS_REASON_KEY = 'wb:view-as:last-reason';
export const ADMIN_SESSION_REASON_KEY = 'wb:admin:session-reason';

/** Aviso exibido junto ao campo de texto livre do motivo (a nota vai também ao `audit_log`, que não se apaga). */
export const REASON_NOTE_WARNING = 'Não escreva dados do cliente (nome, telefone, endereço).';

export function clearStoredReasons(): void {
  try {
    window.sessionStorage.removeItem(VIEW_AS_REASON_KEY);
    window.sessionStorage.removeItem(ADMIN_SESSION_REASON_KEY);
  } catch {
    /* sem armazenamento (ou fora do navegador): não há o que apagar */
  }
}
