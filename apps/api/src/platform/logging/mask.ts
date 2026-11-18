const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Telefone brasileiro com ou sem máscara/DDI (10 a 13 dígitos seguidos, com separadores comuns). */
const PHONE = /(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)/g;

/** SEC-072/SEC-128: mensagens de erro de terceiros (SMTP, Redis, provedor) podem trazer e-mail ou telefone do usuário. */
export function maskPii(text: string): string {
  return text
    .replace(EMAIL, (match) => {
      const [local = '', domain = ''] = match.split('@');
      return `${local.slice(0, 1)}***@${domain}`;
    })
    .replace(PHONE, '[telefone]');
}

/** Mensagem de um erro desconhecido, já mascarada, para ir a `logger.warn/error`. */
export function safeErrorMessage(error: unknown): string {
  return maskPii(error instanceof Error ? error.message : String(error));
}
