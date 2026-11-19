import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Principal } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { errors } from '../../platform/http/app-error.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { ParametersService } from '../admin/index.js';
import { PrincipalService } from '../identity/index.js';
import { OrdersService, type CreateOrderInput } from './orders.service.js';

export const CARD_INTENT_TTL_SECONDS = 900;

export type CardIntentInput = Omit<CreateOrderInput, 'paymentMethod' | 'card'>;

interface StoredIntent {
  userId: string;
  sessionId: string;
  /** SEC-171: sem `payerDocument` (o CPF não fica em claro no Redis). */
  input: Omit<CardIntentInput, 'payerDocument'>;
  /** CPF do pagador cifrado (AES-GCM, chave de tokens de pagamento, preso ao usuário). */
  payerDocumentEnc?: string;
  expiresAt: string;
}

const DOCUMENT_INFO = 'card-intent-payer-document';

/**
 * B.2: cartão em produção SEM o app tocar em dado de cartão (regra inviolável nº 2). O app pede uma INTENÇÃO (o que quer comprar e o total
 * que viu); a página segura da web (`/pagar/cartao?i=<token>`, MP.js/Bricks/3DS) lê o valor, tokeniza o cartão no navegador e completa a
 * intenção; o servidor cria o pedido com o token do provedor. A intenção é de USO ÚNICO (256 bits, só o hash no Redis, 15 min, ligada a
 * usuário e sessão), então o link não serve a mais ninguém nem depois de usado. O app acompanha o pedido por REST.
 */
@Injectable()
export class CardIntentService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly principals: PrincipalService,
    private readonly orders: OrdersService,
    private readonly params: ParametersService,
  ) {}

  private key(token: string): string {
    return `card-intent:${sha256Hex(token)}`;
  }

  async create(principal: Principal, input: CardIntentInput) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + CARD_INTENT_TTL_SECONDS * 1000);
    const { payerDocument, ...rest } = input;
    const stored: StoredIntent = {
      userId: principal.userId,
      sessionId: principal.sessionId,
      input: rest,
      ...(payerDocument ? { payerDocumentEnc: encryptSecret(payerDocument, this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true }), DOCUMENT_INFO, principal.userId) } : {}),
      expiresAt: expiresAt.toISOString(),
    };
    await this.redis.set(this.key(token), JSON.stringify(stored), 'EX', CARD_INTENT_TTL_SECONDS);
    const base = this.config.get('WEB_PUBLIC_URL', { infer: true }).replace(/\/$/, '');
    return { token, url: `${base}/pagar/cartao?i=${token}`, expiresAt: expiresAt.toISOString(), amount: { amount: input.expectedTotalCents, currency: 'BRL' as const } };
  }

  private async read(token: string, consume: boolean): Promise<StoredIntent> {
    const gone = () => errors.gone('CARD_INTENT_INVALID', 'Link inválido ou já usado', 'Volte ao app e escolha pagar com cartão de novo.');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw gone();
    const raw = consume ? await this.redis.getdel(this.key(token)) : await this.redis.get(this.key(token));
    if (!raw) throw gone();
    return JSON.parse(raw) as StoredIntent;
  }

  /** O que a página segura mostra: valor e provedor. Não consome a intenção e não devolve nada do pedido além do total. */
  async view(token: string) {
    const intent = await this.read(token, false);
    // D-09 / DEC-072: as MESMAS regras do pagamento (`parcelas_max` e `parcela_min_cents`); a página não oferece parcela que o servidor recusaria.
    const [maxInstallments, minInstallmentCents] = await Promise.all([this.params.getNumber('parcelas_max'), this.params.getNumber('parcela_min_cents')]);
    const total = intent.input.expectedTotalCents;
    let installmentsMax = 1;
    for (let n = maxInstallments; n > 1; n -= 1) {
      if (Math.floor(total / n) >= minInstallmentCents) {
        installmentsMax = n;
        break;
      }
    }
    return {
      amount: { amount: total, currency: 'BRL' as const },
      provider: this.config.get('PAYMENT_PROVIDER', { infer: true }),
      publicKey: this.config.get('MP_PUBLIC_KEY', { infer: true }) ?? null,
      installmentsMax,
      installmentMinCents: minInstallmentCents,
      expiresAt: intent.expiresAt,
    };
  }

  /** Completa: consome a intenção (uso único), recarrega a sessão do dono e cria o pedido com o token do cartão. */
  async complete(token: string, card: NonNullable<CreateOrderInput['card']>) {
    const intent = await this.read(token, true);
    const loaded = await this.principals.load(intent.userId, intent.sessionId);
    if (!loaded) throw errors.gone('CARD_INTENT_INVALID', 'A sessão do app foi encerrada', 'Volte ao app e entre de novo.');
    const key = `card-intent-${sha256Hex(token).slice(0, 40)}`;
    const payerDocument = intent.payerDocumentEnc ? decryptSecret(intent.payerDocumentEnc, this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true }), DOCUMENT_INFO, intent.userId) : undefined;
    const { orderId } = await this.orders.create(loaded.principal, { ...intent.input, ...(payerDocument ? { payerDocument } : {}), paymentMethod: 'card', card }, key);
    const order = await this.orders.getForCustomer(intent.userId, orderId);
    return { orderId, status: order.status, payment: order.payment, threeDsUrl: (await this.orders.paymentForCustomer(intent.userId, orderId)).threeDsUrl };
  }
}
