import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { presentAddress } from '../addresses/index.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { CartService } from '../cart/index.js';
import { carts, cartItems, couponRedemptions, coupons } from '../cart/db/schema.js';
import { InventoryService } from '../catalog/index.js';
import { ExposureLimitService } from '../stores/index.js';
import { couriers, DeliveriesService, type Delivery, type DeliveryActor, type DeliveryListener, type DeliveryStatus } from '../logistics/index.js';
import { computeOrderFinance, LedgerService, type OrderFinance } from '../finance/index.js';
import { IdempotencyService } from '../idempotency/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { ADMIN_REFUND_KEY_PREFIX, PaymentsService, type ManualRefundCap, type PaymentAttempt, type PaymentListener } from '../payments/index.js';
import type { PaymentStatus } from '../payments/db/schema.js';
import type { ProviderPayment } from '../payments/payment-provider.js';
import { stores } from '../stores/db/schema.js';
import { users } from '../identity/db/schema.js';
import { paymentAttempts } from '../payments/db/schema.js';
import { orderEvents, orderItems, orders } from './db/schema.js';
import { DAY_MS, windowDays } from '../exchanges/domain/eligibility.js';
import { canTransition, customerActions, PAID_STATUSES, refundDueOnCancel, type CustomerAction, type OrderActor, type OrderStatus } from './domain/state.js';
import { OrderEventBus, type OrderEvent } from './order-events.bus.js';
import { generateOrderNumber, generatePickupCode } from './order-number.js';

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

export interface CreateOrderInput {
  mode: 'delivery' | 'pickup';
  addressId?: string | undefined;
  cartRevision: number;
  paymentMethod: 'pix' | 'card';
  /** SEC-147, obrigatório: total que o cliente viu; se divergir, o servidor responde `CART_CHANGED` (frete ou desconto mudaram). */
  expectedTotalCents: number;
  card?: { token: string; installments: number; paymentMethodId?: string | undefined; issuerId?: string | undefined } | undefined;
  payerDocument?: string | undefined;
}

type Money = { amount: number; currency: 'BRL' };
const money = (amount: number): Money => ({ amount, currency: 'BRL' });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ações que já existem na API; o contrato lista as demais (troca, avaliação...) para ondas futuras. */
const IMPLEMENTED_ACTIONS: readonly CustomerAction[] = ['cancel', 'contact_store', 'report_not_received'];
/** B.1: "não recebi meu pedido" também vale por 48 h depois de marcado como entregue. */
const NOT_RECEIVED_WINDOW_MS = 48 * 3_600_000;

/** Texto seguro por motivo de recusa (nunca o texto cru do provedor). */
const DECLINE_TEXT: Record<string, string> = {
  insufficient_funds: 'Saldo insuficiente no cartão. Tente outro cartão ou pague com PIX.',
  invalid_card: 'Não foi possível usar este cartão. Confira os dados ou use outro.',
  rejected_by_issuer: 'O banco recusou o pagamento. Tente outro cartão ou pague com PIX.',
};
const declineText = (reason: string | null): string => DECLINE_TEXT[reason ?? ''] ?? 'O pagamento não foi aprovado. Tente outro cartão ou pague com PIX.';

/** Cartão: 3DS pode demorar; o pedido espera até aqui antes de expirar (HIP, a validar no sandbox). */
const CARD_PAYMENT_WINDOW_MIN = 30;
/** Folga antes de a varredura expirar pedido cuja tentativa de pagamento ficou sem resposta. */
const ORPHAN_GRACE_MS = 2 * 60_000;

interface CloseOrderOptions {
  /** `false`: encerra sem agendar estorno (o admin já estornou tudo ou escolheu não estornar). */
  refund?: boolean;
  /** Estorno agendado por operador sem perfil de super admin conta no limite acumulado (SEC-142). */
  manualCap?: ManualRefundCap;
  refundKey?: string;
  ctx?: RequestContext;
}

interface PendingRefund {
  attemptId: string;
  amountCents: number;
  reason: string;
  key: string;
}

/**
 * Pedido (RN-05 a RN-08). O servidor decide tudo: o app envia só a revisão da sacola e a forma de pagamento. A transição
 * de estado, o estoque, o cupom, o ledger e o estorno agendado acontecem na MESMA transação; o que fala com o provedor
 * ou com o cliente (estorno, push) roda depois do commit e é recuperável (intenção de estorno + conciliação).
 */
@Injectable()
export class OrdersService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown, PaymentListener, DeliveryListener {
  private readonly logger = new Logger(OrdersService.name);
  private timers: NodeJS.Timeout[] = [];
  /** Eventos do pedido gerados dentro da transação do pagamento; saem no `afterTransition` (depois do commit). */
  private readonly pendingEvents = new Map<string, OrderEvent[]>();
  /** Tentativas cujo valor, loja ou vínculo não batem com o pedido (SEC-134): tratadas no `afterTransition`. */
  private readonly rejectedAttempts = new Set<string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly cart: CartService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly media: MediaService,
    private readonly exposure: ExposureLimitService,
    private readonly deliveries: DeliveriesService,
    private readonly audit: AuditService,
    readonly bus: OrderEventBus,
  ) {}

  onModuleInit(): void {
    this.payments.registerListener(this);
    this.deliveries.registerListener(this);
  }

  /** Varredura de PIX vencido e de timeout de aceite. Desligada em teste e na CLI (os testes chamam `sweep`). */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.sweep().catch((e: Error) => this.logger.error(e.message)), 20_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // =================================================================== criação

  /** `created` distingue 201 (novo) de 200 (repetição com a mesma `Idempotency-Key` e o mesmo corpo). */
  async create(principal: Principal, input: CreateOrderInput, idempotencyKey: string): Promise<{ created: boolean; orderId: string }> {
    let created = false;
    const result = await this.idempotency.run(
      `order:${principal.userId}`,
      idempotencyKey,
      input,
      async () => {
        created = true;
        return { orderId: await this.createOnce(principal, input) };
      },
      // I1: só `PAYMENT_DECLINED` (pedido já aberto e encerrado) é definitivo; loja fechada, estoque, 429 e cupom reavaliam na repetição.
      { reusedStatus: 409, keepError: (e) => e.code === 'PAYMENT_DECLINED' },
    );
    return { created, orderId: result.orderId };
  }

  private async createOnce(principal: Principal, input: CreateOrderInput): Promise<string> {
    if (input.mode === 'delivery' && !input.addressId) throw errors.unprocessable('ADDRESS_REQUIRED', 'Escolha o endereço de entrega');
    if (input.paymentMethod === 'card' && !input.card) throw errors.validation([{ field: 'card', message: 'Informe o cartão.' }]);
    const { view, quote } = await this.cart.quote(principal, { mode: input.mode, addressId: input.addressId });
    if (!quote) throw errors.unprocessable('EMPTY_CART', 'Sacola vazia');

    // ---- conferência (RN-05): nada é cobrado sem o cliente ter visto o valor
    const changes = quote.changes.map((c) => checkoutChange(c));
    if (quote.cartRevision !== input.cartRevision || changes.length > 0) {
      throw errors.conflict('CART_CHANGED', 'Sua sacola mudou', 'Confira os valores antes de pagar.', { changes, cart: view });
    }
    if (input.expectedTotalCents !== quote.result.totalCents) {
      // Cupom que deixou de valer (esgotou, venceu) ou frete grátis: mudou o desconto; senão, mudou a taxa de entrega.
      const couponLost = view.coupon !== null && !view.coupon.applied;
      const kind = couponLost || quote.result.deliveryFeeCents === 0 ? 'DISCOUNT_CHANGED' : 'DELIVERY_FEE_CHANGED';
      throw errors.conflict('CART_CHANGED', 'O valor mudou', 'Confira o novo total antes de pagar.', { changes: [{ kind, fromCents: input.expectedTotalCents, toCents: quote.result.totalCents }], cart: view });
    }
    await this.assertBlockers(quote);
    if (this.payments.provider.requiresPayerDocument?.(input.paymentMethod) && !input.payerDocument) {
      throw errors.unprocessable('PAYER_DOCUMENT_REQUIRED', 'Informe o CPF', { detail: 'O pagamento exige o CPF do pagador.' });
    }

    // ---- conta financeira (a mesma da sacola; snapshot no pedido)
    const finance = this.financeOf(quote);
    if (finance.totalCents !== quote.result.totalCents) throw new Error(`total do pedido (${finance.totalCents}) diferente da sacola (${quote.result.totalCents})`);

    const pixMinutes = await this.params.getNumber('pix_expiracao_min');
    const paymentExpiresAt = new Date(Date.now() + (input.paymentMethod === 'pix' ? pixMinutes : CARD_PAYMENT_WINDOW_MIN) * 60_000);
    const order = await this.insertOrder(principal, input, quote, finance, paymentExpiresAt);

    // ---- pagamento no provedor (fora da transação)
    let attempt: PaymentAttempt;
    try {
      attempt = await this.payments.createPayment({
        externalReference: order.id,
        method: input.paymentMethod,
        amountCents: order.totalCents,
        storeId: order.storeId,
        applicationFeeCents: order.applicationFeeCents,
        installments: input.card?.installments ?? 1,
        ...(input.card ? { cardToken: input.card.token, card: { paymentMethodId: input.card.paymentMethodId, issuerId: input.card.issuerId } } : {}),
        payer: { email: principal.email, ...(input.payerDocument ? { document: input.payerDocument } : {}) },
      });
    } catch (error) {
      await this.abandon(order.id, 'Pagamento não pôde ser iniciado');
      if (error instanceof AppError && error.getStatus() < 500 && error.code !== 'PROVIDER_TIMEOUT') throw error;
      throw new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Pagamento indisponível', { detail: 'Não cobramos nada. Tente de novo em instantes.', retryAfterSeconds: 5 });
    }

    const [after] = await this.db.select().from(orders).where(eq(orders.id, order.id));
    if (after?.status === 'expired' && (attempt.status === 'declined' || attempt.status === 'cancelled')) {
      throw errors.unprocessable('PAYMENT_DECLINED', 'Pagamento recusado', { detail: declineText(attempt.declineReason) });
    }
    await this.db.transaction(async (tx) => {
      await tx.update(orders).set({ paymentAttemptId: attempt.id }).where(and(eq(orders.id, order.id), isNull(orders.paymentAttemptId)));
      // Sacola esvazia só com o pagamento em andamento: cartão recusado deixa a sacola para tentar de novo.
      await tx.delete(cartItems).where(eq(cartItems.cartId, quote.cartId));
      await tx.update(carts).set({ storeId: null, couponId: null, revision: sql`${carts.revision} + 1`, updatedAt: new Date() }).where(eq(carts.id, quote.cartId));
    });
    return order.id;
  }

  /**
   * SEC-131 / SEC-064 / DEC-014, sob trava da conta (criações simultâneas da mesma conta se enfileiram): teto de pedidos
   * aguardando pagamento, de PIX por hora e, sem e-mail confirmado, de pedidos pagos + pendentes.
   */
  private async assertAccountLimits(tx: Tx, principal: Principal, paymentMethod: 'pix' | 'card'): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order-create:${principal.userId}`}))`);
    const [pending] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.userId, principal.userId), eq(orders.status, 'awaiting_payment')));
    const pendingCount = pending?.n ?? 0;
    if (pendingCount >= (await this.params.getNumber('pedidos_pendentes_max'))) {
      throw new AppError(429, 'TOO_MANY_PENDING_ORDERS', 'Você já tem pedidos aguardando pagamento', { detail: 'Pague ou cancele o pedido em aberto antes de fazer outro.', retryAfterSeconds: 60 });
    }
    if (paymentMethod === 'pix') {
      const [pix] = await tx
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.userId, principal.userId), eq(orders.paymentMethod, 'pix'), sql`${orders.createdAt} > now() - interval '1 hour'`));
      if ((pix?.n ?? 0) >= (await this.params.getNumber('pix_hora_max'))) {
        throw new AppError(429, 'TOO_MANY_PIX_ORDERS', 'Muitos pedidos com PIX em pouco tempo', { detail: 'Tente de novo em alguns minutos.', retryAfterSeconds: 300 });
      }
    }
    if (principal.emailVerified) return;
    const blocksAll = await this.flags.isEnabled('confirmacao_email_bloqueia_compra');
    const [paid] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.userId, principal.userId), inArray(orders.status, [...PAID_STATUSES])));
    if (blocksAll || (paid?.n ?? 0) + pendingCount >= (await this.params.getNumber('email_nao_confirmado_pedidos_max'))) {
      throw errors.unprocessable('EMAIL_UNVERIFIED', 'Confirme seu e-mail', { detail: 'Falta confirmar seu e-mail para pagar.' });
    }
  }

  private async assertBlockers(quote: NonNullable<Awaited<ReturnType<CartService['quote']>>['quote']>): Promise<void> {
    const blockers = quote.blockers;
    if (blockers.includes('STORE_CLOSED')) throw errors.conflict('STORE_CLOSED', 'Loja fechada', 'A loja está fechada agora.', { opensAt: quote.opening.opensAt });
    const map: [string, string, string][] = [
      ['EMPTY', 'EMPTY_CART', 'Sacola vazia'],
      ['STORE_UNAVAILABLE', 'ITEM_UNAVAILABLE', 'Loja indisponível'],
      ['ITEM_UNAVAILABLE', 'ITEM_UNAVAILABLE', 'Item indisponível'],
      ['BELOW_MINIMUM', 'BELOW_MINIMUM', 'Pedido abaixo do mínimo'],
      ['OUT_OF_RANGE', 'OUT_OF_RANGE', 'Fora da área de entrega'],
      ['NEEDS_ADDRESS', 'ADDRESS_REQUIRED', 'Escolha o endereço de entrega'],
      ['PICKUP_UNAVAILABLE', 'PICKUP_UNAVAILABLE', 'Retirada indisponível'],
      ['ABOVE_MAX_ORDER', 'ABOVE_MAX_ORDER', 'Pedido acima do limite'],
    ];
    for (const [blocker, code, title] of map) if (blockers.includes(blocker as never)) throw errors.unprocessable(code, title);
    if (blockers.includes('NEW_STORE_LIMIT')) {
      const limit = await this.exposure.forStore(quote.store.id);
      const reais = ((limit.maxOrderCents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      throw errors.unprocessable('NEW_STORE_LIMIT', 'Pedido acima do limite da loja nova', { detail: `Esta loja é nova e, por enquanto, aceita pedidos de até ${reais}.` });
    }
  }

  /** Cupom da loja reduz a base da comissão; cupom da plataforma e frete grátis são custo da Webag, limitados à `application_fee` (DEC-016, DEC-036). */
  private financeOf(quote: NonNullable<Awaited<ReturnType<CartService['quote']>>['quote']>): OrderFinance {
    const { result, coupon } = quote;
    let storeCoupon = 0;
    let platform = 0;
    const delivery = result.deliveryFeeCents;
    if (coupon) {
      // DEC-036a: o frete é da Webag; cupom de frete grátis (e todo cupom da plataforma) é custo dela e sai da `application_fee`.
      if (coupon.scope === 'platform' || coupon.kind === 'free_shipping') platform = result.discountCents;
      else storeCoupon = result.discountCents;
    }
    return computeOrderFinance({
      items: quote.priced.map((i) => ({ subtotalCents: i.quantity * i.unitPriceCents, pctBp: i.commissionPctBp })),
      storeCouponCents: storeCoupon,
      platformDiscountCents: platform,
      deliveryFeeCents: delivery,
      serviceFeeCents: result.serviceFeeCents,
    });
  }

  private async insertOrder(principal: Principal, input: CreateOrderInput, quote: NonNullable<Awaited<ReturnType<CartService['quote']>>['quote']>, finance: OrderFinance, paymentExpiresAt: Date): Promise<OrderRow> {
    const lines = quote.priced.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.db.transaction(async (tx) => {
          await this.assertAccountLimits(tx, principal, input.paymentMethod);
          const [cart] = await tx.select().from(carts).where(eq(carts.id, quote.cartId)).for('update');
          if (!cart || cart.revision !== input.cartRevision) throw errors.conflict('CART_CHANGED', 'Sua sacola mudou', 'Confira os valores antes de pagar.');
          // I5 / SEC-148: a revisão é "consumida" na mesma transação do pedido; a criação concorrente (outra chave, outro aparelho)
          // enxerga a revisão nova sob a trava e recebe CART_CHANGED, em vez de gerar 2 pedidos e 2 cobranças.
          await tx.update(carts).set({ revision: sql`${carts.revision} + 1`, updatedAt: new Date() }).where(eq(carts.id, quote.cartId));
          if (quote.coupon) await this.claimCoupon(tx, quote.coupon.id, principal.userId, quote.coupon.maxUses, quote.coupon.perCustomerLimit);
          try {
            await this.inventory.reserve(tx, lines);
          } catch (error) {
            if (error instanceof AppError && error.code === 'STOCK_CONFLICT') {
              const raw = error.problem.extensions?.variantId;
              const variantId = typeof raw === 'string' ? raw : '';
              const name = quote.priced.find((i) => i.variantId === variantId)?.name;
              throw errors.conflict('STOCK_CONFLICT', 'Acabou o estoque', name ? `Acabou o estoque de ${name}.` : 'Acabou o estoque de um item.', { variantId });
            }
            throw error;
          }
          const { store, settings, address } = quote;
          const [row] = await tx
            .insert(orders)
            .values({
              number: generateOrderNumber(),
              userId: principal.userId,
              storeId: store.id,
              mode: input.mode,
              cartRevision: input.cartRevision,
              address: input.mode === 'delivery' && address ? { ...presentAddress(address) } : null,
              etaMinMinutes: settings.etaMinMinutes,
              etaMaxMinutes: settings.etaMaxMinutes,
              pickup: input.mode === 'pickup' ? { address: settings.pickupUseStoreAddress ? storeAddressLine(store) : (settings.pickupAddress ?? storeAddressLine(store)), instructions: settings.pickupInstructions, prepMinMinutes: settings.pickupPrepMinMinutes, prepMaxMinutes: settings.pickupPrepMaxMinutes } : null,
              pickupCode: input.mode === 'pickup' ? generatePickupCode() : null,
              couponId: quote.coupon?.id ?? null,
              couponCode: quote.coupon?.code ?? null,
              subtotalCents: finance.subtotalCents,
              deliveryFeeCents: quote.result.deliveryFeeCents,
              serviceFeeCents: finance.serviceFeeCents,
              discountCents: quote.result.discountCents,
              storeCouponCents: finance.storeCouponCents,
              platformDiscountCents: finance.platformDiscountCents,
              totalCents: finance.totalCents,
              commissionCents: finance.commissionCents,
              applicationFeeCents: finance.applicationFeeCents,
              deliverySnapshot: input.mode === 'delivery' ? (quote.deliverySnapshot as unknown as Record<string, unknown> | null) : null,
              // I4: o desconto de frete grátis não reduz o item (e o frete devolvido numa troca é só o que o cliente pagou).
              finance: {
                ...finance,
                platformDiscountCapped: finance.platformDiscountCapped || quote.result.platformDiscountCapped,
                itemDiscountCents: quote.coupon?.kind === 'free_shipping' ? 0 : quote.result.discountCents,
                deliveryDiscountCents: quote.coupon?.kind === 'free_shipping' ? quote.result.discountCents : 0,
              },
              paymentMethod: input.paymentMethod,
              exchangeVoluntaryDays: settings.voluntaryExchangeDays,
              exchangeCollectionFeeCents: settings.collectionFeeCents,
              exchangePolicyVersion: settings.exchangePolicyVersion,
              paymentExpiresAt,
            })
            .returning();
          if (!row) throw new Error('pedido não criado');
          await tx.insert(orderItems).values(
            quote.priced.map((i) => ({
              orderId: row.id,
              productId: i.productId,
              variantId: i.variantId,
              categoryId: i.categoryId,
              name: i.name,
              attributes: i.attributes,
              image: i.image,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              lineTotalCents: i.quantity * i.unitPriceCents,
              commissionPctBp: i.commissionPctBp,
            })),
          );
          await tx.insert(orderEvents).values({ orderId: row.id, fromStatus: null, toStatus: 'awaiting_payment', actor: 'customer', actorUserId: principal.userId });
          if (quote.coupon) await tx.insert(couponRedemptions).values({ couponId: quote.coupon.id, userId: principal.userId, orderId: row.id, discountCents: quote.result.discountCents });
          return row;
        });
      } catch (error) {
        // Colisão do código curto (raríssima): tenta outro número.
        if (isUniqueViolation(error, 'orders_number_uq')) continue;
        throw error;
      }
    }
    throw new Error('não foi possível gerar o número do pedido');
  }

  /** Limite do cupom sob trava (RN-09): dois pedidos simultâneos para o último uso, só um passa. */
  private async claimCoupon(tx: Tx, couponId: string, userId: string, maxUses: number | null, perCustomer: number): Promise<void> {
    await tx.select({ id: coupons.id }).from(coupons).where(eq(coupons.id, couponId)).for('update');
    const [uses] = await tx
      .select({
        total: sql<number>`count(*) filter (where ${couponRedemptions.releasedAt} is null)::int`,
        mine: sql<number>`count(*) filter (where ${couponRedemptions.releasedAt} is null and ${couponRedemptions.userId} = ${userId})::int`,
      })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, couponId));
    if (maxUses !== null && (uses?.total ?? 0) >= maxUses) throw errors.unprocessable('COUPON_EXHAUSTED', 'Cupom esgotado');
    if ((uses?.mine ?? 0) >= perCustomer) throw errors.unprocessable('COUPON_ALREADY_USED', 'Cupom já utilizado');
  }

  /** Pedido que nunca chegou a ser cobrado: expira e devolve estoque e cupom ("nenhum pedido ficou aberto"). */
  private async abandon(orderId: string, reason: string): Promise<void> {
    const events: OrderEvent[] = [];
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order || order.status !== 'awaiting_payment') return;
      const closed = await this.closeOrder(tx, order, 'expired', 'system', reason, null);
      events.push(closed.event);
    });
    for (const event of events) await this.bus.emit(event);
  }

  // =================================================================== transições

  /**
   * Encerra o pedido (cancelado, recusado ou expirado) na transação de quem chama: valida a transição, devolve estoque
   * (reserva ou baixa), libera o cupom, AGENDA o estorno quando já havia pagamento e grava o evento. O estorno em si
   * (chamada ao provedor) sai depois do commit por `finishRefund`.
   */
  async closeOrder(
    tx: Tx,
    order: OrderRow,
    to: 'cancelled' | 'refused' | 'expired',
    actor: OrderActor,
    reason: string | null,
    actorUserId: string | null,
    opts: CloseOrderOptions = {},
  ): Promise<{ event: OrderEvent; refund: PendingRefund | null }> {
    if (!canTransition(order.status, to, actor, order.mode)) throw errors.conflict('INVALID_TRANSITION', 'Transição não permitida', `O pedido não pode ir de ${order.status} para ${to}.`);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const reserved = items.filter((i) => i.stockState === 'reserved').map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const sold = items.filter((i) => i.stockState === 'sold').map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    if (reserved.length > 0) await this.inventory.release(tx, reserved);
    if (sold.length > 0) await this.inventory.restock(tx, sold);
    await tx.update(orderItems).set({ stockState: 'released' }).where(and(eq(orderItems.orderId, order.id), inArray(orderItems.stockState, ['reserved', 'sold'])));
    await tx.update(couponRedemptions).set({ releasedAt: new Date() }).where(and(eq(couponRedemptions.orderId, order.id), isNull(couponRedemptions.releasedAt)));

    let refund: PendingRefund | null = null;
    if (opts.refund !== false && !order.disputedAt && refundDueOnCancel(order.status) && order.paymentAttemptId) {
      const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, order.paymentAttemptId));
      if (attempt) {
        const remaining = attempt.amountCents - (await this.payments.refundedOrPendingCents(tx, attempt.id));
        if (remaining > 0) {
          const key = opts.refundKey ?? `order-close:${order.id}`;
          await this.payments.reserveRefundIntent(tx, attempt.id, remaining, `order_${to}`, key, { actorId: actorUserId, actorRole: opts.ctx?.principal?.adminProfile ?? actor, requestId: opts.ctx?.requestId ?? null }, opts.manualCap);
          refund = { attemptId: attempt.id, amountCents: remaining, reason: `order_${to}`, key };
        }
      }
    }

    // L.4: pedido encerrado com a corrida em aberto (admin cancelando): a corrida acaba junto, na mesma transação.
    if (order.mode === 'delivery' && (order.status === 'ready_for_collection' || order.status === 'out_for_delivery')) {
      await this.deliveries.cancelForOrderInTx(tx, order.id, reason ?? 'Pedido cancelado', { id: actorUserId, role: actor }, opts.ctx ?? { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({ status: to, stockState: 'released', updatedAt: now, ...(to === 'cancelled' || to === 'refused' ? { cancelledAt: now, cancelledBy: actor, cancelReason: reason?.slice(0, 200) ?? null } : {}) })
      .where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({ orderId: order.id, fromStatus: order.status, toStatus: to, actor, actorUserId, reason: reason?.slice(0, 200) ?? null });
    return { event: this.eventOf(order, to, actor, reason, now), refund };
  }

  private eventOf(order: OrderRow, to: OrderStatus, actor: OrderActor, reason: string | null, at: Date): OrderEvent {
    return { orderId: order.id, number: order.number, userId: order.userId, storeId: order.storeId, from: order.status, to, actor, reason, at };
  }

  /** Conclui o estorno agendado (fora da transação). Se o provedor recusar, o pagamentos registra backoff e alerta (SEC-130) e a conciliação refaz. */
  async finishRefund(refund: PendingRefund | null): Promise<void> {
    if (!refund) return;
    try {
      await this.payments.executeScheduledRefund(refund.attemptId, refund.amountCents, refund.reason, refund.key);
    } catch (error) {
      this.logger.warn(`estorno do pedido (tentativa ${refund.attemptId}) pendente: ${safeErrorMessage(error)}`);
    }
  }

  /** Cancelamento pelo cliente (RN-08): livre até o aceite; depois, 409 `ORDER_NOT_CANCELLABLE`. Idempotente. */
  async cancelByCustomer(userId: string, orderId: string, reason: string | null): Promise<void> {
    let done: { event: OrderEvent; refund: PendingRefund | null } | null = null;
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).for('update');
      if (!order) throw errors.notFound('Pedido não encontrado.');
      if (order.status === 'cancelled' && order.cancelledBy === 'customer') return;
      if (!canTransition(order.status, 'cancelled', 'customer', order.mode)) {
        throw errors.conflict('ORDER_NOT_CANCELLABLE', 'O pedido não pode mais ser cancelado', 'Peça o cancelamento à loja ou fale com o suporte.');
      }
      done = await this.closeOrder(tx, order, 'cancelled', 'customer', reason, userId);
    });
    if (!done) return;
    const result = done as { event: OrderEvent; refund: PendingRefund | null };
    await this.finishRefund(result.refund);
    await this.bus.emit(result.event);
  }

  /**
   * Transição que não encerra o pedido (aceite, separação, saída, entrega). Valida ator e modo, grava horário e evento.
   * Repetir o mesmo destino é idempotente (toque duplo, retry de rede): devolve `null` e nada muda.
   */
  async advance(tx: Tx, order: OrderRow, to: OrderStatus, actor: OrderActor, actorUserId: string | null, reason: string | null = null): Promise<OrderEvent | null> {
    if (order.status === to) return null;
    if (!canTransition(order.status, to, actor, order.mode)) {
      throw errors.conflict('INVALID_TRANSITION', 'Transição não permitida', `O pedido está em "${order.status}" e não pode ir para "${to}".`, { currentStatus: order.status });
    }
    const now = new Date();
    await tx
      .update(orders)
      .set({ status: to, updatedAt: now, ...(to === 'accepted' ? { acceptedAt: now, acceptDeadlineAt: null } : {}), ...(to === 'delivered' ? { deliveredAt: now } : {}) })
      .where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({ orderId: order.id, fromStatus: order.status, toStatus: to, actor, actorUserId, reason: reason?.slice(0, 200) ?? null });
    return this.eventOf(order, to, actor, reason, now);
  }

  // =================================================================== pagamento (ganchos)

  /** Roda na transação do pagamento: aprovado paga o pedido; recusado/expirado devolve o estoque. */
  async onAttemptTransition(tx: Tx, attempt: PaymentAttempt, _from: PaymentStatus, remote: ProviderPayment | null): Promise<void> {
    if (!UUID_RE.test(attempt.externalReference)) return;
    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.externalReference)).for('update');
    if (!order) return; // pagamento avulso (ferramentas de dev)
    // SEC-134: a tentativa precisa ser a do pedido (vínculo, valor e loja); senão não paga, alerta e (se aprovada) estorna.
    if ((order.paymentAttemptId && order.paymentAttemptId !== attempt.id) || attempt.amountCents !== order.totalCents || attempt.storeId !== order.storeId) {
      this.rejectedAttempts.add(attempt.id);
      return;
    }
    if (!order.paymentAttemptId) await tx.update(orders).set({ paymentAttemptId: attempt.id }).where(eq(orders.id, order.id));
    if (order.status !== 'awaiting_payment') return; // pedido já encerrado: o `afterTransition` estorna se foi pago

    const events: OrderEvent[] = [];
    if (attempt.status === 'approved') {
      events.push(await this.markPaid(tx, order, attempt, remote));
    } else if (attempt.status === 'declined' || attempt.status === 'expired' || attempt.status === 'cancelled') {
      events.push((await this.closeOrder(tx, order, 'expired', 'system', attempt.status === 'declined' ? 'Pagamento recusado' : 'Pagamento não realizado a tempo', null)).event);
    }
    if (events.length > 0) this.pendingEvents.set(attempt.id, events);
  }

  private async markPaid(tx: Tx, order: OrderRow, attempt: PaymentAttempt, remote: ProviderPayment | null): Promise<OrderEvent> {
    const items = await tx.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.stockState, 'reserved')));
    await this.inventory.commitSale(tx, items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })));
    await tx.update(orderItems).set({ stockState: 'sold' }).where(and(eq(orderItems.orderId, order.id), eq(orderItems.stockState, 'reserved')));
    const timeout = await this.params.getNumber('loja_aceite_timeout_min');
    const now = new Date();
    await tx.update(orders).set({ status: 'received', stockState: 'sold', paidAt: now, acceptDeadlineAt: new Date(now.getTime() + timeout * 60_000), updatedAt: now }).where(eq(orders.id, order.id));
    // Comissão congelada no pagamento (RN-10): o `finance` do pedido é a base do lançamento.
    await this.ledger.recordSale(tx, { orderId: order.id, storeId: order.storeId, attemptId: attempt.id, finance: order.finance as unknown as OrderFinance });
    if (remote?.providerFeeCents !== undefined && remote.providerFeeCents > 0) await this.ledger.recordProviderFee(tx, { orderId: order.id, storeId: order.storeId, attemptId: attempt.id, feeCents: remote.providerFeeCents });
    await tx.insert(orderEvents).values({ orderId: order.id, fromStatus: 'awaiting_payment', toStatus: 'received', actor: 'system', reason: 'Pagamento aprovado' });
    return this.eventOf(order, 'received', 'system', 'Pagamento aprovado', now);
  }

  /** Depois do commit: publica o evento e estorna pagamento que chegou para pedido já encerrado (SEC-040). */
  async afterTransition(attempt: PaymentAttempt): Promise<void> {
    const events = this.pendingEvents.get(attempt.id) ?? [];
    this.pendingEvents.delete(attempt.id);
    for (const event of events) await this.bus.emit(event);
    if (this.rejectedAttempts.delete(attempt.id)) {
      await this.payments.raiseAlert(attempt.id, 'order_attempt_mismatch', { orderId: attempt.externalReference });
      if (attempt.status === 'approved') await this.payments.refundBySystem(attempt.id, attempt.amountCents, 'order_attempt_mismatch', `auto-refund-mismatch:${attempt.id}`);
      return;
    }
    if (attempt.status !== 'approved' || !UUID_RE.test(attempt.externalReference)) return;
    const [order] = await this.db.select().from(orders).where(eq(orders.id, attempt.externalReference));
    if (order && (order.status === 'cancelled' || order.status === 'expired' || order.status === 'refused')) {
      await this.payments.refundBySystem(attempt.id, attempt.amountCents, 'order_closed', `auto-refund-closed:${attempt.id}`);
    }
  }

  /**
   * I2: o provedor contestou o pagamento aprovado. Na transação do pagamento: marca o pedido (`disputedAt`), lança o chargeback no
   * ledger (a loja passa a dever a parte dela) e audita. O alerta `payment_disputed` é do pagamento. Idempotente.
   */
  async onDisputed(tx: Tx, attempt: PaymentAttempt): Promise<void> {
    if (!UUID_RE.test(attempt.externalReference)) return;
    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.externalReference)).for('update');
    if (!order || order.paymentAttemptId !== attempt.id) return;
    if (order.disputedAt === null) {
      await tx.update(orders).set({ disputedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
      await this.audit.record(tx, { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null }, { action: 'order.disputed', targetType: 'order', targetId: order.id, actorId: null, actorRole: 'system', after: { attemptId: attempt.id, amountCents: attempt.amountCents } });
    }
    await this.ledger.recordChargeback(tx, { orderId: order.id, reason: 'chargeback' });
  }

  /** I3: a tarifa do provedor só apareceu depois da aprovação: lança uma vez (`fee:<pedido>`). */
  async onFeeKnown(tx: Tx, attempt: PaymentAttempt, remote: ProviderPayment): Promise<void> {
    if (!UUID_RE.test(attempt.externalReference) || (remote.providerFeeCents ?? 0) <= 0) return;
    const [order] = await tx.select({ id: orders.id, storeId: orders.storeId, paymentAttemptId: orders.paymentAttemptId }).from(orders).where(eq(orders.id, attempt.externalReference));
    if (!order || order.paymentAttemptId !== attempt.id || !(await this.ledger.hasSale(order.id, tx))) return;
    await this.ledger.recordProviderFee(tx, { orderId: order.id, storeId: order.storeId, attemptId: attempt.id, feeCents: remote.providerFeeCents! });
  }

  /** Estorno confirmado pelo provedor: lança no ledger com a mesma chave (idempotente). */
  async onRefundConfirmed(tx: Tx, attempt: PaymentAttempt, refund: { amountCents: number; idempotencyKey: string; reason: string }): Promise<void> {
    if (!UUID_RE.test(attempt.externalReference)) return;
    if (!(await this.ledger.hasSale(attempt.externalReference, tx))) return; // estorno de PIX tardio: nunca houve venda lançada
    await this.ledger.recordRefund(tx, { orderId: attempt.externalReference, refundCents: refund.amountCents, refundKey: refund.idempotencyKey, reason: refund.reason });
  }

  /**
   * SEC-039: estorno manual do admin, total ou parcial, sobre o pagamento do pedido. Acima de `estorno_super_admin_cents` só
   * o super admin; motivo obrigatório; chave de idempotência do cliente HTTP (repetir não estorna de novo). A auditoria nasce
   * na transação que confirma o estorno (SEC-074). Se o provedor recusar, o estorno fica na fila de pendências (SEC-130)
   * e a resposta é `queued`.
   */
  async adminRefund(orderId: string, input: { amountCents: number; reason: string; idempotencyKey: string }, ctx: RequestContext): Promise<{ status: 'done' | 'queued'; refundedCents: number; remainingCents: number }> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    if (!order.paymentAttemptId || !order.paidAt) throw errors.conflict('ORDER_NOT_PAID', 'Pedido sem pagamento a estornar');
    if (order.disputedAt) throw errors.conflict('ORDER_DISPUTED', 'Pedido com pagamento contestado', 'O provedor já debitou o valor (chargeback); não há o que estornar.');
    const limit = await this.params.getNumber('estorno_super_admin_cents');
    const isSuper = ctx.principal?.adminProfile === 'super_admin';
    if (input.amountCents > limit && !isSuper) {
      throw new AppError(403, 'SUPER_ADMIN_REQUIRED', 'Estorno acima do limite do seu perfil', { detail: 'Valores acima do limite exigem o super admin.' });
    }
    // SEC-142: o limite vale pela soma (por pedido e por operador no dia), conferida sob lock ao gravar a intenção.
    const cap = isSuper ? undefined : { perOrderCents: limit, perActorDayCents: await this.params.getNumber('estorno_financeiro_dia_cents') };
    const key = `${ADMIN_REFUND_KEY_PREFIX}${input.idempotencyKey}`;
    let status: 'done' | 'queued' = 'done';
    try {
      await this.payments.refund(order.paymentAttemptId, input.amountCents, input.reason, key, ctx, cap);
    } catch (error) {
      const queued = await this.payments.hasQueuedRefund(order.paymentAttemptId, key);
      if (!queued) throw error;
      status = 'queued';
    }
    const attempt = await this.payments.getAttempt(order.paymentAttemptId);
    const pending = await this.payments.refundedOrPendingCents(this.db, attempt.id);
    // BUG-011: estorno que zera o pedido o encerra (a loja não aceita nem a logística despacha pedido já devolvido).
    if (pending >= attempt.amountCents) await this.cancelAfterFullRefund(orderId, input.reason, ctx);
    return { status, refundedCents: pending, remainingCents: attempt.amountCents - pending };
  }

  /** Estorno total manual leva o pedido ativo a CANCELADO (ator admin): estoque devolvido, corrida cancelada e auditoria. Pedido já encerrado ou entregue fica como está. */
  private async cancelAfterFullRefund(orderId: string, reason: string, ctx: RequestContext): Promise<void> {
    let done: { event: OrderEvent } | null = null;
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order || !canTransition(order.status, 'cancelled', 'admin', order.mode)) return;
      done = await this.closeOrder(tx, order, 'cancelled', 'admin', `Estorno total: ${reason}`, ctx.principal?.userId ?? null, { refund: false, ctx });
      await this.audit.record(tx, ctx, { action: 'order.cancel_by_full_refund', targetType: 'order', targetId: order.id, before: { status: order.status }, after: { status: 'cancelled' }, reason });
    });
    if (done) await this.bus.emit((done as { event: OrderEvent }).event);
  }

  /**
   * BUG-011 / RN-08: o admin cancela o pedido em qualquer estado ativo, com motivo (auditado) e, por padrão, estorno do que
   * falta devolver. Sem super admin, o estorno do cancelamento conta no limite acumulado (SEC-142). Repetir é idempotente.
   */
  async adminCancel(orderId: string, input: { reason: string; refund: boolean }, ctx: RequestContext): Promise<{ status: 'cancelled'; refundedCents: number; remainingCents: number }> {
    let done: { event: OrderEvent; refund: PendingRefund | null } | null = null;
    let attemptId: string | null = null;
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order) throw errors.notFound('Pedido não encontrado.');
      attemptId = order.paymentAttemptId;
      if (order.status === 'cancelled' && order.cancelledBy === 'admin') return; // repetição
      if (!canTransition(order.status, 'cancelled', 'admin', order.mode)) {
        throw errors.conflict('ORDER_NOT_CANCELLABLE', 'O pedido não pode ser cancelado', `O pedido está em "${order.status}".`, { currentStatus: order.status });
      }
      const isSuper = ctx.principal?.adminProfile === 'super_admin';
      const limit = await this.params.getNumber('estorno_super_admin_cents');
      const manualCap: ManualRefundCap | undefined = isSuper ? undefined : { perOrderCents: limit, perActorDayCents: await this.params.getNumber('estorno_financeiro_dia_cents') };
      done = await this.closeOrder(tx, order, 'cancelled', 'admin', input.reason, ctx.principal?.userId ?? null, {
        refund: input.refund,
        ...(manualCap ? { manualCap } : {}),
        refundKey: `${ADMIN_REFUND_KEY_PREFIX}cancel:${order.id}`,
        ctx,
      });
      await this.audit.record(tx, ctx, { action: 'order.admin_cancel', targetType: 'order', targetId: order.id, before: { status: order.status }, after: { status: 'cancelled', refund: input.refund }, reason: input.reason });
    });
    const result = done as { event: OrderEvent; refund: PendingRefund | null } | null;
    if (result) {
      await this.finishRefund(result.refund);
      await this.bus.emit(result.event);
    }
    if (!attemptId) return { status: 'cancelled', refundedCents: 0, remainingCents: 0 };
    const attempt = await this.payments.getAttempt(attemptId);
    const pending = await this.payments.refundedOrPendingCents(this.db, attempt.id);
    return { status: 'cancelled', refundedCents: pending, remainingCents: attempt.amountCents - pending };
  }

  // =================================================================== logística (L.4)

  /**
   * A loja marca "pronto para coleta" (DEC-036): o pedido vai a `ready_for_collection` e nasce a corrida na MESMA transação
   * (idempotente: toque duplo não cria duas). O admin é avisado depois do commit (`afterReadyForCollection`).
   */
  async readyForCollection(tx: Tx, order: OrderRow, actorUserId: string, input: { volumes?: number | undefined; note?: string | undefined }): Promise<OrderEvent | null> {
    if (order.mode !== 'delivery') throw errors.conflict('INVALID_TRANSITION', 'Transição não permitida', 'Pedido de retirada não vai para a coleta da Webag.');
    const event = await this.advance(tx, order, 'ready_for_collection', 'store', actorUserId);
    const [store] = await tx.select().from(stores).where(eq(stores.id, order.storeId));
    const [customer] = await tx.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, order.userId));
    const address = (order.address ?? {}) as { street?: string; number?: string; complement?: string | null; neighborhood?: string; city?: string; cityId?: string | null; neighborhoodId?: string | null };
    const snapshot = (order.deliverySnapshot ?? {}) as { expectedCostCents?: number };
    await this.deliveries.createInTx(
      tx,
      {
        orderId: order.id,
        storeId: order.storeId,
        volumes: input.volumes ?? 1,
        note: input.note ?? null,
        cityId: address.cityId ?? null,
        neighborhoodId: address.neighborhoodId ?? null,
        feeCents: order.deliveryFeeCents,
        expectedCostCents: snapshot.expectedCostCents ?? 0,
        actor: { id: actorUserId, role: 'store' },
        contact: {
          number: order.number,
          kind: 'delivery',
          storeName: store?.name ?? '',
          storePhone: store?.whatsapp ?? store?.phone ?? null,
          pickupAddress: storeAddressLine(store ?? {}),
          dropoffAddress: [address.street, address.number, address.complement, address.neighborhood, address.city].filter(Boolean).join(', '),
          customerFirstName: (customer?.name ?? '').trim().split(/\s+/)[0] ?? '',
          customerPhone: customer?.phone ?? null,
          volumes: input.volumes ?? 1,
          note: input.note ?? null,
        },
      },
      { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null },
    );
    return event;
  }

  /** Depois do commit: o admin vê o pedido pronto no painel (alerta durável; o tempo real entra com o Socket.IO). */
  async afterReadyForCollection(order: OrderRow): Promise<void> {
    await this.payments.raiseAlert(null, 'delivery_ready', { orderId: order.id, orderNumber: order.number, storeId: order.storeId }).catch(() => undefined);
  }

  private readonly pendingDeliveryEvents = new Map<string, { events: OrderEvent[]; refund: PendingRefund | null }>();

  /**
   * A logística mudou a corrida (mesma transação): a entrega Webag leva o pedido junto. Coletou -> SAIU; entregou -> ENTREGUE;
   * devolvida à loja -> CANCELADO com estorno total. As demais mudanças (atribuir, confirmar, não entregue) não mudam o
   * estado do pedido; o cliente é avisado em `afterDeliveryChange`.
   */
  async onDeliveryChange(tx: Tx, delivery: Delivery, _from: DeliveryStatus | null, to: DeliveryStatus, actor: DeliveryActor, reason: string | null): Promise<void> {
    if (delivery.kind !== 'delivery') return; // coleta e reentrega de troca mudam a troca, não o pedido
    const [order] = await tx.select().from(orders).where(eq(orders.id, delivery.orderId)).for('update');
    if (!order) return;
    const who: OrderActor = actor.role === 'system' ? 'system' : 'admin';
    const events: OrderEvent[] = [];
    const refund: PendingRefund | null = null;
    if (to === 'out_for_delivery' && order.status === 'ready_for_collection') {
      const event = await this.advance(tx, order, 'out_for_delivery', who, actor.id, 'Motoboy coletou o pedido');
      if (event) events.push(event);
    } else if (to === 'delivered' && order.status === 'out_for_delivery') {
      const event = await this.advance(tx, order, 'delivered', who, actor.id, 'Entrega concluída');
      if (event) events.push(event);
    }
    // SEC-143: "devolvida à loja" é declarada pela operação; cancelar e estornar só depois que a loja confirma o recebimento
    // (`confirmStoreReturnInTx`). Até lá o pedido segue ativo e o admin é alertado em `afterDeliveryChange`.
    this.pendingDeliveryEvents.set(delivery.id, { events, refund });
    void reason;
  }

  async afterDeliveryChange(delivery: Delivery, _from: DeliveryStatus | null, to: DeliveryStatus, actor: DeliveryActor, reason: string | null): Promise<void> {
    if (delivery.kind !== 'delivery') return;
    const pending = this.pendingDeliveryEvents.get(delivery.id);
    this.pendingDeliveryEvents.delete(delivery.id);
    if (pending?.refund) await this.finishRefund(pending.refund);
    const [order] = await this.db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order) return;
    if (to === 'returned_to_store') await this.payments.raiseAlert(null, 'return_awaiting_store', { orderId: order.id, orderNumber: order.number, storeId: order.storeId, deliveryId: delivery.id }).catch(() => undefined);
    for (const event of pending?.events ?? []) await this.bus.emit(event);
    // Aviso ao cliente a CADA mudança da corrida (L.3): o pedido pode manter o mesmo estado (ex.: motoboy a caminho).
    await this.bus.emit({ ...this.eventOf(order, order.status, actor.role === 'system' ? 'system' : 'admin', reason, new Date()), from: order.status, delivery: { id: delivery.id, status: to } });
  }

  /**
   * SEC-143: a loja confirmou que recebeu a mercadoria devolvida (ou o admin registra por ela, com motivo): só agora o pedido é
   * cancelado e estornado por inteiro, com a taxa de entrega (DEC-039e). Na transação de quem chama; o estorno sai depois do commit.
   */
  async confirmStoreReturnInTx(tx: Tx, order: OrderRow, via: 'store' | 'admin', ctx: RequestContext, reason: string | null): Promise<{ event: OrderEvent; refund: PendingRefund | null }> {
    await this.deliveries.confirmStoreReturnInTx(tx, order.id, via, ctx, reason);
    if (!PAID_STATUSES.includes(order.status) || order.status === 'delivered') throw errors.conflict('RETURN_NOT_PENDING', 'Não há devolução aguardando confirmação', 'O pedido já foi encerrado.');
    return this.closeOrder(tx, order, 'cancelled', 'admin', 'Entrega não realizada: pedido devolvido à loja', ctx.principal?.userId ?? null);
  }

  /** O admin registra a confirmação da loja (com motivo e auditoria), quando a loja não confirma no painel. */
  async adminConfirmStoreReturn(orderId: string, reason: string, ctx: RequestContext): Promise<void> {
    let done: { event: OrderEvent; refund: PendingRefund | null } | null = null;
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order) throw errors.notFound('Pedido não encontrado.');
      done = await this.confirmStoreReturnInTx(tx, order, 'admin', ctx, reason);
    });
    const result = done as { event: OrderEvent; refund: PendingRefund | null } | null;
    if (!result) return;
    await this.finishRefund(result.refund);
    await this.bus.emit(result.event);
  }

  /** Alerta para o painel do admin/financeiro (ex.: tentativa de adivinhar o código de retirada). */
  async raiseAlert(kind: string, details: Record<string, unknown>): Promise<void> {
    await this.payments.raiseAlert(null, kind, details);
  }

  /** A Webag cobriu um estorno que o provedor não concluiu (DEC-020a): lança a cobertura e a dívida da loja no ledger. */
  async onRefundCovered(tx: Tx, attempt: PaymentAttempt, coverage: { amountCents: number; idempotencyKey: string; reason: string }): Promise<void> {
    if (!UUID_RE.test(attempt.externalReference)) return;
    if (!(await this.ledger.hasSale(attempt.externalReference, tx))) return;
    await this.ledger.recordCoverage(tx, { orderId: attempt.externalReference, coverageCents: coverage.amountCents, coverageKey: coverage.idempotencyKey, reason: coverage.reason });
  }

  // =================================================================== varreduras

  /** PIX vencido, tentativa órfã e timeout de aceite da loja (RN-07). Idempotente; roda a cada ~20 s. */
  async sweep(now = new Date()): Promise<{ expiredPix: number; orphans: number; acceptTimeouts: number }> {
    const expiredPix = await this.payments.expireDue(now);
    const orphans = await this.expireOrphans(now);
    const acceptTimeouts = await this.timeoutAccept(now);
    return { expiredPix, orphans, acceptTimeouts };
  }

  private async expireOrphans(now: Date): Promise<number> {
    const due = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'awaiting_payment'), lt(orders.paymentExpiresAt, new Date(now.getTime() - ORPHAN_GRACE_MS))))
      .orderBy(asc(orders.paymentExpiresAt))
      .limit(50);
    let n = 0;
    for (const { id } of due) {
      const events: OrderEvent[] = [];
      await this.db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
        if (!order || order.status !== 'awaiting_payment') return;
        const [attempt] = order.paymentAttemptId ? await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, order.paymentAttemptId)) : [];
        if (attempt && (attempt.status === 'approved' || attempt.status === 'pending_3ds')) return; // o webhook ou a conciliação resolve
        events.push((await this.closeOrder(tx, order, 'expired', 'system', 'Pagamento não realizado a tempo', null)).event);
        n++;
      });
      for (const event of events) await this.bus.emit(event);
    }
    return n;
  }

  private async timeoutAccept(now: Date): Promise<number> {
    const due = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'received'), lte(orders.acceptDeadlineAt, now)))
      .orderBy(asc(orders.acceptDeadlineAt))
      .limit(50);
    let n = 0;
    for (const { id } of due) {
      let done: { event: OrderEvent; refund: PendingRefund | null } | null = null;
      await this.db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
        if (!order || order.status !== 'received') return;
        done = await this.closeOrder(tx, order, 'cancelled', 'system', 'A loja não respondeu a tempo', null);
      });
      if (!done) continue;
      const result = done as { event: OrderEvent; refund: PendingRefund | null };
      n++;
      await this.finishRefund(result.refund);
      await this.bus.emit(result.event);
    }
    return n;
  }

  // =================================================================== leitura (cliente)

  /** Pedido da conta (404 para o de outra conta, SEC-020). */
  async getForCustomer(userId: string, orderId: string) {
    const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    return this.present(order);
  }

  async present(order: OrderRow) {
    const [items, events, [store], attempt] = await Promise.all([
      this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.id)),
      this.db.select({ id: stores.id, name: stores.name, whatsapp: stores.whatsapp, logoAssetId: stores.logoAssetId }).from(stores).where(eq(stores.id, order.storeId)),
      this.payments.latestForReference(order.id),
    ]);
    const [logo] = store?.logoAssetId ? await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.logoAssetId)) : [];
    const paid = PAID_STATUSES.includes(order.status);
    const cancelled = order.status === 'cancelled' || order.status === 'refused';
    const finance = order.finance as unknown as OrderFinance;
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      mode: order.mode,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      store: { id: order.storeId, name: store?.name ?? '', logo: { urls: (logo ? this.media.publicVariants(logo) : null) ?? {} }, whatsapp: store?.whatsapp ?? null },
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, name: i.name, attributes: i.attributes, image: { urls: i.image }, quantity: i.quantity, unitPrice: money(i.unitPriceCents), lineTotal: money(i.lineTotalCents) })),
      summary: {
        subtotal: money(order.subtotalCents),
        delivery: money(order.deliveryFeeCents),
        deliveryEstimated: false,
        freeShipping: order.deliveryFeeCents === 0,
        serviceFee: money(order.serviceFeeCents),
        discount: money(order.discountCents),
        total: money(order.totalCents),
        minimumTotalApplied: false,
        platformDiscountCapped: finance.platformDiscountCapped === true,
        missingForMinimum: null,
      },
      couponCode: order.couponCode,
      delivery: order.mode === 'delivery' && order.address ? { address: order.address, etaMinMinutes: order.etaMinMinutes, etaMaxMinutes: order.etaMaxMinutes } : null,
      pickup: order.mode === 'pickup' && order.pickup ? { ...order.pickup, code: paid ? order.pickupCode : null } : null,
      payment: { method: order.paymentMethod, status: publicPaymentStatus(attempt?.status) },
      exchangePolicy: { voluntaryDays: order.exchangeVoluntaryDays, collectionFeeCents: order.exchangeCollectionFeeCents, version: order.exchangePolicyVersion },
      timeline: events.map((e) => ({ status: e.toStatus, at: e.at.toISOString(), actor: e.actor, reason: e.reason })),
      allowedActions: this.actionsOf(order),
      /** B.1: prazos finais da troca já na entrada do pedido ("Troca até 25/11"); nulos fora do prazo ou sem entrega. */
      exchange: this.exchangeWindowOf(order),
      cancellation: cancelled && order.cancelledAt && order.cancelledBy ? { by: order.cancelledBy, reason: order.cancelReason, at: order.cancelledAt.toISOString() } : null,
      tracking: order.mode === 'delivery' ? await this.trackingOf(order) : null,
    };
  }

  private actionsOf(order: OrderRow) {
    const actions = customerActions(order.status).filter((a) => IMPLEMENTED_ACTIONS.includes(a));
    const recentlyDelivered = order.status === 'delivered' && order.deliveredAt !== null && Date.now() - order.deliveredAt.getTime() <= NOT_RECEIVED_WINDOW_MS;
    return recentlyDelivered && !actions.includes('report_not_received') ? [...actions, 'report_not_received' as const] : actions;
  }

  /** Prazos finais (a mais longa de cada tipo): arrependimento (7 dias), troca voluntária da loja e defeito. Pedido não entregue: tudo nulo. */
  private exchangeWindowOf(order: OrderRow) {
    if (order.status !== 'delivered' || !order.deliveredAt) return { canRequest: false, withdrawalUntil: null, voluntaryUntil: null, defectUntil: null };
    const at = (days: number) => new Date(order.deliveredAt!.getTime() + days * DAY_MS);
    const withdrawal = at(windowDays({ type: 'withdrawal', productDurable: true, storeVoluntaryDays: order.exchangeVoluntaryDays }));
    const voluntary = order.exchangeVoluntaryDays > 0 ? at(order.exchangeVoluntaryDays) : null;
    const defect = at(windowDays({ type: 'defect', productDurable: true, storeVoluntaryDays: order.exchangeVoluntaryDays }));
    const now = Date.now();
    return { canRequest: [withdrawal, voluntary, defect].some((d) => d !== null && d.getTime() > now), withdrawalUntil: withdrawal.toISOString(), voluntaryUntil: voluntary?.toISOString() ?? null, defectUntil: defect.toISOString() };
  }

  /**
   * B.1 "Não recebi meu pedido": avisa a operação (alerta `order_not_received`) e grava na auditoria; vale com o pedido a caminho ou
   * até 48 h depois de "entregue". Repetir é idempotente (um alerta por pedido). Não estorna nem muda o estado: a operação decide.
   */
  async reportNotReceived(principal: Principal, orderId: string, ctx: RequestContext): Promise<{ reported: true }> {
    const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, principal.userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    if (!this.actionsOf(order).includes('report_not_received')) throw errors.conflict('ORDER_NOT_REPORTABLE', 'Não dá para avisar agora', 'Só vale com o pedido a caminho ou até 48 h depois de entregue.');
    await this.payments.raiseAlert(null, 'order_not_received', { orderId: order.id, orderNumber: order.number, storeId: order.storeId });
    await this.audit.recordStandalone(ctx, { action: 'order.not_received_reported', targetType: 'order', targetId: order.id, actorId: principal.userId, actorRole: 'customer' });
    return { reported: true };
  }

  /**
   * Acompanhamento da entrega Webag para o cliente (WB-235): estado da corrida, SÓ o primeiro nome do motoboy (sem telefone nem
   * foto) e o código de entrega a partir de "saiu para entrega". Nunca o contato do motoboy nem dado de outro cliente.
   */
  private async trackingOf(order: OrderRow) {
    const delivery = await this.deliveries.forOrder(order.id);
    if (!delivery) return null;
    const [courier] = delivery.courierId ? await this.db.select({ name: couriers.name }).from(couriers).where(eq(couriers.id, delivery.courierId)) : [];
    const events = await this.deliveries.events(delivery.id);
    const showCode = delivery.deliveryCode !== null && (delivery.status === 'out_for_delivery' || delivery.status === 'not_delivered');
    return {
      status: delivery.status,
      courierFirstName: courier ? (courier.name.trim().split(/\s+/)[0] ?? null) : null,
      attempts: delivery.attempts,
      failReason: delivery.status === 'not_delivered' ? delivery.failReason : null,
      deliveryCode: showCode ? delivery.deliveryCode : null,
      timeline: events.filter((e) => e.action !== 'whatsapp_sent' && !e.action.startsWith('cost')).map((e) => ({ status: e.toStatus, at: e.createdAt.toISOString() })),
    };
  }

  async paymentForCustomer(userId: string, orderId: string) {
    const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    const attempt = await this.payments.latestForReference(order.id);
    if (!attempt) throw errors.notFound('Pagamento não encontrado.');
    return {
      method: attempt.method,
      status: publicPaymentStatus(attempt.status),
      amount: money(attempt.amountCents),
      pix: attempt.method === 'pix' && attempt.pixCopyPaste && attempt.expiresAt && publicPaymentStatus(attempt.status) === 'pending' ? { copyPaste: attempt.pixCopyPaste, qrCodeBase64: attempt.pixQrBase64, expiresAt: attempt.expiresAt.toISOString() } : null,
      installments: attempt.installments,
      threeDsUrl: attempt.status === 'pending_3ds' ? attempt.threeDsUrl : null,
      declineReason: attempt.status === 'declined' ? declineText(attempt.declineReason) : null,
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }

  async listForCustomer(userId: string, query: { scope?: 'active' | 'past' | undefined; cursor?: string | undefined; limit?: unknown }): Promise<Page<Awaited<ReturnType<OrdersService['summaryOf']>>>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const active: OrderStatus[] = ['awaiting_payment', 'received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'];
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), query.scope === 'active' ? inArray(orders.status, active) : query.scope === 'past' ? sql`${orders.status} not in (${sql.join(active.map((s) => sql`${s}`), sql`, `)})` : undefined, timestampCursorBefore(orders.createdAt, orders.id, cursor)))
      .orderBy(...timestampOrderDesc(orders.createdAt, orders.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const data = await Promise.all(page.map((o) => this.summaryOf(o)));
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  private async summaryOf(order: OrderRow) {
    const [items, [store]] = await Promise.all([
      this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select({ name: stores.name, logoAssetId: stores.logoAssetId }).from(stores).where(eq(stores.id, order.storeId)),
    ]);
    const [logo] = store?.logoAssetId ? await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.logoAssetId)) : [];
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      mode: order.mode,
      store: { id: order.storeId, name: store?.name ?? '', logo: { urls: (logo ? this.media.publicVariants(logo) : null) ?? {} } },
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      firstItemName: items[0]?.name ?? '',
      firstItemImage: { urls: items[0]?.image ?? {} },
      total: money(order.totalCents),
      createdAt: order.createdAt.toISOString(),
    };
  }
}

/** Estados internos (`creating`, `divergent`) aparecem como `pending` (contrato). */
export const publicPaymentStatus = (status: PaymentStatus | undefined): 'pending' | 'pending_3ds' | 'approved' | 'declined' | 'expired' | 'cancelled' | 'refunded' =>
  status === undefined || status === 'creating' || status === 'divergent' ? 'pending' : status;

const storeAddressLine = (store: { addressStreet?: string | null; addressNumber?: string | null; addressNeighborhood?: string | null; addressCityName?: string | null }): string =>
  [store.addressStreet, store.addressNumber, store.addressNeighborhood, store.addressCityName].filter(Boolean).join(', ');

function checkoutChange(c: { variantId: string; name: string; warning: Record<string, unknown> }) {
  const w = c.warning as { code: string; fromCents?: number; toCents?: number; requestedQuantity?: number; maxQuantity?: number };
  const base = { variantId: c.variantId, name: c.name };
  switch (w.code) {
    case 'PRICE_CHANGED':
      return { kind: 'PRICE_CHANGED', ...base, fromCents: w.fromCents, toCents: w.toCents };
    case 'QUANTITY_EXCEEDS_STOCK':
      return { kind: 'QUANTITY_REDUCED', ...base, fromQuantity: w.requestedQuantity, toQuantity: w.maxQuantity };
    case 'OUT_OF_STOCK':
      return { kind: 'OUT_OF_STOCK', ...base };
    default:
      return { kind: 'UNAVAILABLE', ...base };
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e.code === '23505' && e.constraint === constraint) || (e.cause?.code === '23505' && e.cause.constraint === constraint);
}

