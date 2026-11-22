/**
 * Compatibilidade do app no NAVEGADOR aberto por http na rede local (ex.: o Safari do iPhone em http://192.168.0.10:8081, `pnpm iphone`).
 * Fora de HTTPS e de localhost o navegador desliga duas APIs que o app usa: `crypto.randomUUID` (X-Request-Id, Idempotency-Key, ids locais)
 * e `navigator.clipboard` (copiar o código PIX). Sem elas toda chamada à API falhava antes de sair. Aqui só entram versões de reserva,
 * usadas SOMENTE quando a API original não existe; em HTTPS, no localhost e no app nativo nada muda. Não toca em sessão nem em pagamento.
 * `crypto.getRandomValues` continua disponível em qualquer contexto, então os UUIDs seguem aleatórios (RFC 4122 v4).
 */
type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array; randomUUID?: () => string };

export function installInsecureContextShims(target: { crypto?: CryptoLike; navigator?: Record<string, unknown>; document?: Document } = globalThis as never): void {
  const cryptoApi = target.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID !== 'function' && typeof cryptoApi.getRandomValues === 'function') {
    const getRandomValues = cryptoApi.getRandomValues.bind(cryptoApi);
    Object.defineProperty(cryptoApi, 'randomUUID', {
      configurable: true,
      value: (): string => {
        const bytes = getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      },
    });
  }

  const nav = target.navigator;
  const doc = target.document;
  if (nav && !nav.clipboard && doc?.body) {
    const writeText = (text: string): Promise<void> => {
      const field = doc.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      doc.body.appendChild(field);
      field.focus();
      field.select();
      field.setSelectionRange(0, text.length);
      const copied = doc.execCommand('copy');
      doc.body.removeChild(field);
      return copied ? Promise.resolve() : Promise.reject(new Error('Não foi possível copiar'));
    };
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      value: { writeText, readText: () => Promise.reject(new Error('Leitura da área de transferência indisponível em http')) },
    });
  }
}

installInsecureContextShims();
