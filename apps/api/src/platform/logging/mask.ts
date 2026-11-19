const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Telefone brasileiro com ou sem máscara/DDI (10 a 13 dígitos seguidos, com separadores comuns). */
const PHONE = /(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)/g;

/** CNPJ (14) e CPF (11) com ou sem pontuação, sem dígito colado (SEC-140). Roda ANTES do telefone, que também casa 10 a 11 dígitos. */
const CNPJ = /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g;
const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;

/** SEC-072/SEC-128: mensagens de erro de terceiros (SMTP, Redis, provedor) podem trazer e-mail ou telefone do usuário. */
export function maskPii(text: string): string {
  return text
    .replace(EMAIL, (match) => {
      const [local = '', domain = ''] = match.split('@');
      return `${local.slice(0, 1)}***@${domain}`;
    })
    .replace(CNPJ, '[documento]')
    .replace(CPF, '[documento]')
    .replace(PHONE, '[telefone]');
}

/** Mensagem de um erro desconhecido, já mascarada, para ir a `logger.warn/error`. */
export function safeErrorMessage(error: unknown): string {
  return maskPii(error instanceof Error ? error.message : String(error));
}

/** LGPD: a posição do cliente (`lat`/`lng` na query de descoberta) não vai ao log de acesso. */
export function maskCoordinates(url: string | undefined): string | undefined {
  return url?.replace(/([?&](?:lat|lng))=[^&]*/g, '$1=[redacted]');
}

/**
 * SEC-171: o token de uso único vai na URL (link de exportação, intenção de cartão) e a URL vai ao log de acesso. O segmento do token
 * é trocado por `[token]`, e o `?i=` da página de pagamento também (o proxy faz o mesmo no seu log, ver infra).
 */
export function maskTokenPaths(url: string | undefined): string | undefined {
  return url?.replace(/(\/data-exports\/download\/)[^/?#\s]+/g, '$1[token]').replace(/(\/card-intents\/)[^/?#\s]+/g, '$1[token]').replace(/([?&]i)=[^&#\s]*/g, '$1=[token]');
}
