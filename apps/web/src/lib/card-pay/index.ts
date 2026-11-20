import { ApiError } from '@/lib/api/errors';

export type FailureKind = 'declined' | 'cart-changed' | 'expired' | 'busy' | 'offline' | 'maintenance' | 'other';

export interface Failure {
  kind: FailureKind;
  title: string;
  text: string;
}

/** Mensagens da página segura. O `detail` da API só entra no recusado (texto seguro, sem dado do cartão). */
export function describeFailure(error: unknown): Failure {
  if (error instanceof ApiError) {
    // WB-121: 503 antes de consumir a intenção. Nada foi cobrado e o link continua valendo para quando a manutenção acabar.
    if (error.code === 'MAINTENANCE') {
      return { kind: 'maintenance', title: 'Voltamos já', text: `${error.detail ?? 'Estamos em manutenção rápida.'} Seu cartão não foi cobrado e sua sacola continua salva. Volte ao app e tente de novo daqui a pouco.` };
    }
    if (error.code === 'PAYMENT_DECLINED' || error.status === 422) {
      return { kind: 'declined', title: 'O cartão foi recusado', text: error.detail ?? 'O banco não aprovou a compra. Volte ao app e tente com outro cartão ou pague com PIX.' };
    }
    if (error.code === 'CART_CHANGED' || error.status === 409) {
      return { kind: 'cart-changed', title: 'Sua sacola mudou', text: 'O valor ou os itens mudaram desde que você abriu o pagamento. Volte ao app, confira e pague de novo.' };
    }
    if (error.status === 410) {
      return { kind: 'expired', title: 'Este link venceu ou já foi usado', text: 'Volte ao app e escolha pagar com cartão de novo.' };
    }
    if (error.status === 429) {
      return { kind: 'busy', title: 'Muitas tentativas', text: 'Espere um pouco e volte ao app para tentar de novo.' };
    }
    if (error.isNetwork) {
      return { kind: 'offline', title: 'Sem conexão', text: 'Não sabemos se o pagamento foi enviado. Confira em Pedidos no app antes de tentar de novo.' };
    }
  }
  return { kind: 'other', title: 'Não conseguimos concluir agora', text: 'Não sabemos se o pagamento foi enviado. Confira em Pedidos no app antes de tentar de novo.' };
}

/** Deep link para o app (`webag://order/<id>`). O app confirma o pagamento pelo servidor, nunca por esta página. */
export function appLink(scheme: string, path: 'checkout' | `order/${string}`): string {
  return `${scheme}://${path}`;
}

const CHALLENGE_HOSTS = [/\.mercadopago\.com(\.br)?$/, /\.mercadolibre\.com$/, /\.mercadolivre\.com\.br$/];

/** A verificação 3DS só abre em iframe se for HTTPS de um domínio do Mercado Pago (o CSP `frame-src` também limita). */
export function isChallengeUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && CHALLENGE_HOSTS.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

/** Cartões de TESTE do provedor falso (dev e staging). Nunca são cartões reais: só rótulos que viram `fake_tok_*`. */
export const FAKE_CARDS = [
  { token: 'fake_tok_approved', title: 'Cartão de teste: aprovado', hint: 'Aprova na hora.' },
  { token: 'fake_tok_insufficient', title: 'Cartão de teste: sem limite', hint: 'Recusado por limite.' },
  { token: 'fake_tok_3ds', title: 'Cartão de teste: com verificação do banco', hint: 'Pede o desafio 3DS.' },
  { token: 'fake_tok_timeout', title: 'Cartão de teste: sem resposta', hint: 'O provedor não responde.' },
] as const;
