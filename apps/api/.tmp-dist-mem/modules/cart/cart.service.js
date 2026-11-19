var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AddressesService } from '../addresses/index.js';
import { ParametersService } from '../admin/index.js';
import { productImages, products, productVariants } from '../catalog/db/schema.js';
import { effectivePrice } from '../catalog/domain/price.js';
import { storeMembers } from '../identity/db/schema.js';
import { CommissionService, computeOrderFinance } from '../finance/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { stores, storeSettings } from '../stores/db/schema.js';
import { ExposureLimitService, hoursToday, isOpen, nextOpening, StoreSettingsService } from '../stores/index.js';
import { cartItems, carts, couponRedemptions, coupons } from './db/schema.js';
import { rejectCoupon } from './domain/coupon.js';
import { serviceFeeCents, summarize } from './domain/pricing.js';
import { computeEta, DeliveryFeesService, presentEta } from '../logistics/index.js';
export class PurchaseHistoryPort {
}
const money = (amount) => ({ amount, currency: 'BRL' });
/** Produto comprável agora (RN-03): ativo, não pausado/removido pela moderação, variação ativa. */
const isBuyable = (product, variant) => product.status === 'active' && product.moderationStatus !== 'paused' && product.moderationStatus !== 'removed' && variant.active && product.basePriceCents !== null;
/**
 * Sacola no servidor (ADR-010, WB-020, WB-021, WB-022). Uma por conta, de uma loja só (DEC-006). Preço, estoque, horário
 * e frete são sempre RECALCULADOS na leitura (RN-05); o que muda aparece como aviso por item e só é aceito de fato por
 * `acknowledge` (o "Aceitar e continuar" do checkout). Loja fechada não impede montar a sacola (DEC-022).
 */
let CartService = class CartService {
    db;
    params;
    settings;
    addresses;
    media;
    purchases;
    commissions;
    exposure;
    fees;
    constructor(db, params, settings, addresses, media, purchases, commissions, exposure, fees) {
        this.db = db;
        this.params = params;
        this.settings = settings;
        this.addresses = addresses;
        this.media = media;
        this.purchases = purchases;
        this.commissions = commissions;
        this.exposure = exposure;
        this.fees = fees;
    }
    // ------------------------------------------------------------------ leitura
    async get(principal, ctx) {
        const notices = [];
        if (await this.expireIfStale(principal.userId))
            notices.push({ code: 'CART_EXPIRED', message: 'Sua sacola ficou parada e foi esvaziada.' });
        return this.build(principal, ctx, notices);
    }
    /** Sacola parada por mais de `carrinho_validade_dias` é esvaziada (WB-020 C6). Devolve se esvaziou algo. */
    async expireIfStale(userId, executor = this.db) {
        const days = await this.params.getNumber('carrinho_validade_dias');
        const [cart] = await executor.select().from(carts).where(eq(carts.userId, userId));
        if (!cart?.storeId || Date.now() - cart.updatedAt.getTime() <= days * 86_400_000)
            return false;
        await executor.delete(cartItems).where(eq(cartItems.cartId, cart.id));
        await executor.update(carts).set({ storeId: null, couponId: null, revision: sql `${carts.revision} + 1`, updatedAt: new Date() }).where(eq(carts.id, cart.id));
        return true;
    }
    emptyView(cartId, revision, notices) {
        const zero = summarize({ subtotalCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0, coupon: null, commissionPct: 0, minTotalCents: 0 });
        return {
            id: cartId,
            revision,
            store: null,
            items: [],
            coupon: null,
            delivery: { mode: 'delivery', addressId: null, available: null, distanceM: null, feeFromCents: null, estimated: false, eta: null, logisticsOpensAt: null },
            summary: this.presentSummary(zero, { deliveryEstimated: false, missingForMinimumCents: null }),
            checkout: { canCheckout: false, blockers: ['EMPTY'], opensAt: null },
            notices,
        };
    }
    presentSummary(result, extra) {
        return {
            subtotal: money(result.subtotalCents),
            delivery: money(result.deliveryFeeCents),
            deliveryEstimated: extra.deliveryEstimated,
            freeShipping: result.deliveryFeeCents === 0,
            serviceFee: money(result.serviceFeeCents),
            discount: money(result.discountCents),
            total: money(result.totalCents),
            minimumTotalApplied: result.minimumTotalApplied,
            platformDiscountCapped: result.platformDiscountCapped,
            missingForMinimum: extra.missingForMinimumCents === null ? null : money(extra.missingForMinimumCents),
        };
    }
    async build(principal, ctx, notices, couponOverride) {
        return (await this.buildFull(principal, ctx, notices, couponOverride)).view;
    }
    /**
     * Fotografia do checkout (Onda 4): a MESMA conta da sacola, com os dados internos que o pedido congela (categoria e
     * comissão por item, cupom e endereço). O que a sacola mostra é o que o pedido cobra.
     */
    /** SEC-170: o pedido, já sob a trava do cupom, reconfere a "primeira compra" com o documento do pagador (e vê pedidos simultâneos não pagos). */
    hasTakenFirstPurchase(userId, hints) {
        return this.purchases.hasPaidOrder(userId, hints);
    }
    payerDocumentHash(document) {
        return this.purchases.documentHash(document);
    }
    async quote(principal, ctx) {
        await this.expireIfStale(principal.userId);
        return this.buildFull(principal, ctx, []);
    }
    /** Monta a sacola com valores vigentes. `couponOverride` testa um cupom antes de gravá-lo (aplicar). */
    async buildFull(principal, ctx, notices, couponOverride) {
        const userId = principal.userId;
        // Endereço de outra conta é 404 em qualquer estado da sacola (não revela existência, SEC-020).
        if (ctx.addressId)
            await this.addresses.get(userId, ctx.addressId);
        const [cart] = await this.db.select().from(carts).where(eq(carts.userId, userId));
        if (!cart?.storeId)
            return { view: this.emptyView(cart?.id ?? null, cart?.revision ?? 0, notices), quote: null };
        const rows = await this.db
            .select({ item: cartItems, variant: productVariants, product: products })
            .from(cartItems)
            .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
            .innerJoin(products, eq(products.id, cartItems.productId))
            .where(eq(cartItems.cartId, cart.id))
            .orderBy(asc(cartItems.createdAt), asc(cartItems.id));
        if (rows.length === 0)
            return { view: this.emptyView(cart.id, cart.revision, notices), quote: null };
        const [storeRow] = await this.db
            .select({
            store: stores,
            settings: storeSettings,
            visible: sql `(${stores.status} = 'approved' and exists (select 1 from payment_accounts pa where pa.store_id = ${stores.id} and pa.status = 'active'))`,
        })
            .from(stores)
            .innerJoin(storeSettings, eq(storeSettings.storeId, stores.id))
            .where(eq(stores.id, cart.storeId));
        if (!storeRow)
            return { view: this.emptyView(cart.id, cart.revision, notices), quote: null };
        const { store, settings } = storeRow;
        const now = new Date();
        const maxQty = await this.params.getNumber('item_qtd_max');
        const covers = await this.covers(rows.map((r) => r.product.id));
        const categoryOf = new Map(rows.map((r) => [r.product.id, r.product.categoryId]));
        // ---- itens: o que vale agora
        let subtotal = 0;
        let hasUnavailable = false;
        const items = rows.map(({ item, variant, product }) => {
            const warnings = [];
            const free = Math.max(variant.stock - variant.reserved, 0);
            const buyable = storeRow.visible && isBuyable(product, variant);
            const price = effectivePrice(product.basePriceCents ?? 0, variant.priceCents, { promoPriceCents: product.promoPriceCents, promoStartsAt: product.promoStartsAt, promoEndsAt: product.promoEndsAt }, now);
            const maxQuantity = buyable ? Math.min(free, maxQty) : 0;
            const quantity = Math.min(item.quantity, maxQuantity);
            if (!buyable)
                warnings.push({ code: 'UNAVAILABLE', message: 'Esse item não está mais à venda. Remova para continuar.' });
            else if (free === 0)
                warnings.push({ code: 'OUT_OF_STOCK', message: 'Esse item esgotou. Remova para continuar.' });
            else if (item.quantity > maxQuantity)
                warnings.push({ code: 'QUANTITY_EXCEEDS_STOCK', message: `Só temos ${maxQuantity} unidades. Ajustamos a quantidade.`, requestedQuantity: item.quantity, maxQuantity });
            if (buyable && free > 0 && price.priceCents !== item.seenPriceCents)
                warnings.push({ code: 'PRICE_CHANGED', message: 'O preço mudou.', fromCents: item.seenPriceCents, toCents: price.priceCents });
            if (quantity === 0)
                hasUnavailable = true;
            subtotal += quantity * price.priceCents;
            return {
                id: item.id,
                variantId: variant.id,
                productId: product.id,
                name: product.name,
                attributes: variant.attributes,
                image: { urls: covers.get(product.id) ?? {} },
                quantity,
                unitPrice: money(price.priceCents),
                originalUnitPrice: price.originalCents === null ? null : money(price.originalCents),
                lineTotal: money(quantity * price.priceCents),
                available: quantity > 0,
                maxQuantity,
                warnings,
            };
        });
        // ---- entrega
        const blockers = [];
        if (!storeRow.visible)
            blockers.push('STORE_UNAVAILABLE');
        let deliveryFee = 0;
        let deliveryEstimated = false;
        let deliveryAddress = null;
        let deliverySnapshot = null;
        let etaEstimate = null; // DEC-053: ETA do endereço escolhido (gravado no pedido)
        const delivery = { mode: ctx.mode, addressId: null, available: null, distanceM: null, feeFromCents: null, estimated: false, eta: null, logisticsOpensAt: null };
        if (ctx.mode === 'pickup') {
            if (!settings.pickupEnabled)
                blockers.push('PICKUP_UNAVAILABLE');
        }
        else {
            const address = await this.addressFor(userId, ctx.addressId);
            deliveryAddress = address;
            // L.1 (DEC-036): a taxa vem da tabela do admin pelo DESTINO; mínimo, frete grátis e raio são globais.
            const freeAbove = await this.params.getNumber('frete_gratis_acima_cents');
            delivery.feeFromCents = await this.fees.startingFeeFor(store.addressCityId ?? null);
            if (!address) {
                blockers.push('NEEDS_ADDRESS');
                deliveryEstimated = true;
                delivery.estimated = true;
                deliveryFee = delivery.feeFromCents ?? 0;
                if (freeAbove > 0 && subtotal >= freeAbove)
                    deliveryFee = 0;
            }
            else {
                delivery.addressId = address.id;
                const quote = await this.fees.quote(store.id, { lat: address.lat, lng: address.lng, cityId: address.cityId, neighborhoodId: address.neighborhoodId }, subtotal);
                delivery.available = quote.available;
                delivery.logisticsOpensAt = quote.reason === 'LOGISTICS_CLOSED' ? (quote.logisticsOpensAt?.toISOString() ?? null) : null;
                delivery.distanceM = quote.distanceM;
                // BUG-016: logística fechada/pausada é outro bloqueio (o app oferece só retirada e mostra "Entrega volta às HH:MM").
                if (!quote.available)
                    blockers.push(quote.reason === 'LOGISTICS_CLOSED' ? 'LOGISTICS_CLOSED' : 'OUT_OF_RANGE'); // sem tabela para o destino também some a entrega: o admin vê o alerta na prévia
                deliveryFee = quote.feeCents ?? 0;
                deliverySnapshot = quote.snapshot;
                if (quote.available)
                    etaEstimate = quote.eta;
                delivery.eta = quote.available && quote.eta ? presentEta({ minMinutes: quote.eta.fromMin, maxMinutes: quote.eta.toMin }, now) : null;
            }
        }
        // ---- cupom (reavaliado a cada leitura: tirar item pode derrubar o pedido mínimo do cupom)
        const couponId = couponOverride === undefined ? cart.couponId : couponOverride;
        let couponView = null;
        let appliedCoupon = null;
        if (couponId) {
            const [coupon] = await this.db.select().from(coupons).where(eq(coupons.id, couponId));
            // WB-254 C1: cupom de entrega grátis só vale em pedido de entrega (na retirada ele seria gasto sem desconto).
            const pickupFreeShipping = coupon?.kind === 'free_shipping' && ctx.mode === 'pickup';
            const rejection = pickupFreeShipping ? 'COUPON_NOT_ALLOWED' : coupon ? await this.rejectionFor(principal, coupon, store.id, subtotal, now, deliveryAddress ? { cep: deliveryAddress.cep, number: deliveryAddress.number, complement: deliveryAddress.complement } : null) : 'COUPON_NOT_FOUND';
            if (coupon) {
                couponView = { code: coupon.code, kind: coupon.kind, scope: coupon.scope, applied: rejection === null, rejection };
                if (rejection === null)
                    appliedCoupon = coupon;
            }
        }
        // Comissão efetiva por item (loja > categoria > padrão): o teto do cupom da plataforma usa a comissão REAL do pedido.
        const priced = items.filter((i) => i.quantity > 0);
        const rates = await this.commissions.resolveForItems(store.id, priced.map((i) => categoryOf.get(i.productId) ?? null), now);
        const commissionCapCents = computeOrderFinance({ items: priced.map((i, index) => ({ subtotalCents: i.lineTotal.amount, pctBp: rates[index].pctBp })), storeCouponCents: 0, platformDiscountCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0 }).commissionCents;
        const serviceFee = serviceFeeCents(String(await this.params.get('taxa_servico_tipo')), await this.params.getNumber('taxa_servico_valor'), subtotal);
        const result = summarize({
            subtotalCents: subtotal,
            deliveryFeeCents: deliveryFee,
            serviceFeeCents: serviceFee,
            coupon: appliedCoupon ? { kind: appliedCoupon.kind, scope: appliedCoupon.scope, value: appliedCoupon.value, percentCapCents: appliedCoupon.percentCapCents } : null,
            commissionPct: await this.params.getNumber('comissao_padrao_pct'),
            // Teto do desconto da plataforma = `application_fee` antes do desconto: comissão + entrega + serviço (RN-09).
            commissionCapCents: commissionCapCents + deliveryFee + serviceFee,
            minTotalCents: await this.params.getNumber('cupom_total_minimo_cents'),
        });
        // ---- loja aberta e mínimo (bloqueiam só o pagamento, DEC-022)
        const opening = await this.openingOf(store.id, settings, now);
        if (storeRow.visible && !opening.open)
            blockers.push('STORE_CLOSED');
        if (hasUnavailable)
            blockers.push('ITEM_UNAVAILABLE');
        const minOrderCents = await this.params.getNumber('pedido_minimo_cents'); // global (DEC-036b)
        const missing = subtotal < minOrderCents ? minOrderCents - subtotal : null;
        if (missing !== null && subtotal > 0)
            blockers.push('BELOW_MINIMUM');
        if (result.totalCents > (await this.params.getNumber('pedido_max_cents')))
            blockers.push('ABOVE_MAX_ORDER');
        // WB-225 / SEC-062: loja nova tem teto por pedido (R$ 500 por padrão) até completar o prazo ou os pedidos entregues.
        const exposure = await this.exposure.forStore(store.id, now);
        if (exposure.active && exposure.maxOrderCents !== null && result.totalCents > exposure.maxOrderCents)
            blockers.push('NEW_STORE_LIMIT');
        if (subtotal === 0)
            blockers.unshift('EMPTY');
        const etaConfig = await this.fees.etaConfig();
        const legacyEta = (() => {
            const base = etaEstimate ?? computeEta(etaConfig, { distanceM: 0, prepMin: settings.prepMinutes });
            return { etaMinMinutes: base.fromMin, etaMaxMinutes: base.toMin };
        })();
        const [logo] = store.logoAssetId ? await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, store.logoAssetId)) : [];
        const view = {
            id: cart.id,
            revision: cart.revision,
            store: {
                id: store.id,
                name: store.name ?? '',
                logo: { urls: (logo ? this.media.publicVariants(logo) : null) ?? {} },
                open: opening.open,
                opensAt: opening.opensAt,
                // DEC-053: sem endereço ainda, o intervalo é só preparo + despacho (a partir de); com endereço, o ETA completo.
                ...legacyEta,
                minOrder: money(minOrderCents),
            },
            items,
            coupon: couponView,
            delivery,
            summary: this.presentSummary(result, { deliveryEstimated, missingForMinimumCents: missing }),
            checkout: { canCheckout: blockers.length === 0, blockers, opensAt: opening.opensAt, ...(exposure.active && exposure.maxOrderCents !== null ? { newStoreMaxOrder: money(exposure.maxOrderCents) } : {}) },
            notices,
        };
        const quote = {
            cartId: cart.id,
            cartRevision: cart.revision,
            mode: ctx.mode,
            store,
            settings,
            opening,
            address: deliveryAddress,
            deliverySnapshot,
            eta: etaEstimate,
            coupon: appliedCoupon,
            result,
            blockers,
            priced: priced.map((i, index) => ({ variantId: i.variantId, productId: i.productId, categoryId: categoryOf.get(i.productId) ?? null, name: i.name, attributes: i.attributes, image: i.image.urls, quantity: i.quantity, unitPriceCents: i.unitPrice.amount, commissionPctBp: rates[index].pctBp })),
            hasWarnings: items.some((i) => i.warnings.length > 0),
            changes: items.flatMap((i) => i.warnings.map((w) => ({ variantId: i.variantId, name: i.name, warning: w }))),
        };
        return { view, quote };
    }
    async openingOf(storeId, settings, now) {
        const [hours, holidays] = await Promise.all([this.settings.weeklyHours(storeId), this.settings.holidays(storeId)]);
        const input = { hours, holidays: new Set(holidays.map((h) => h.date)), pausedUntil: settings.pausedUntil, pausedIndefinitely: settings.pausedIndefinitely };
        const open = isOpen(input, now);
        return { open, opensAt: open ? null : (nextOpening(input, now)?.toISOString() ?? null), hoursToday: hoursToday(input, now) };
    }
    /** Endereço do pedido: o escolhido (do dono, senão 404) ou o padrão da conta; `null` se não houver nenhum. */
    async addressFor(userId, addressId) {
        if (addressId)
            return this.addresses.get(userId, addressId);
        const [first] = await this.addresses.list(userId);
        return first ?? null;
    }
    async covers(productIds) {
        const map = new Map();
        const rows = await this.db
            .select({ productId: productImages.productId, asset: mediaAssets })
            .from(productImages)
            .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
            .where(and(inArray(productImages.productId, productIds), eq(productImages.position, 0)));
        for (const row of rows)
            map.set(row.productId, this.media.publicVariants(row.asset) ?? {});
        return map;
    }
    async rejectionFor(principal, coupon, storeId, subtotalCents, now, address = null) {
        const [uses] = await this.db
            .select({
            total: sql `count(*) filter (where ${couponRedemptions.releasedAt} is null)::int`,
            mine: sql `count(*) filter (where ${couponRedemptions.releasedAt} is null and ${couponRedemptions.userId} = ${principal.userId})::int`,
        })
            .from(couponRedemptions)
            .where(eq(couponRedemptions.couponId, coupon.id));
        const [member] = await this.db.select({ userId: storeMembers.userId }).from(storeMembers).where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, principal.userId)));
        return rejectCoupon(coupon, {
            now,
            userId: principal.userId,
            cartStoreId: storeId,
            subtotalCents,
            emailVerified: principal.emailVerified,
            totalUses: uses?.total ?? 0,
            customerUses: uses?.mine ?? 0,
            // Só consulta o histórico quando o cupom é de primeira compra (evita a consulta nos demais).
            hasPaidOrder: coupon.firstPurchaseOnly ? await this.purchases.hasPaidOrder(principal.userId, { address }) : false, // sem o documento: ele só é conhecido ao criar o pedido
            isStoreMember: member !== undefined,
        });
    }
    // ----------------------------------------------------------------- escrita
    /** Trava a sacola da conta (cria vazia se faltar): duas requisições simultâneas se enfileiram. */
    async lock(tx, userId) {
        await tx.insert(carts).values({ userId }).onConflictDoNothing();
        const [cart] = await tx.select().from(carts).where(eq(carts.userId, userId)).for('update');
        if (!cart)
            throw new Error('Sacola não criada');
        return cart;
    }
    async touch(tx, cartId, patch = {}) {
        await tx.update(carts).set({ ...patch, revision: sql `${carts.revision} + 1`, updatedAt: new Date() }).where(eq(carts.id, cartId));
    }
    /** Variação comprável de loja visível; senão 404 (loja/produto invisível) ou 422 (existe, mas indisponível). */
    async purchasable(executor, variantId) {
        const [row] = await executor
            .select({
            variant: productVariants,
            product: products,
            storeName: stores.name,
            visible: sql `(${stores.status} = 'approved' and exists (select 1 from payment_accounts pa where pa.store_id = ${stores.id} and pa.status = 'active'))`,
        })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .innerJoin(stores, eq(stores.id, products.storeId))
            .where(eq(productVariants.id, variantId));
        if (!row || !row.visible || row.product.status === 'draft' || row.product.status === 'archived')
            throw errors.notFound('Produto não encontrado.');
        if (!isBuyable(row.product, row.variant))
            throw errors.unprocessable('ITEM_UNAVAILABLE', 'Produto indisponível', { detail: 'Esse produto não está à venda agora.' });
        const free = Math.max(row.variant.stock - row.variant.reserved, 0);
        if (free === 0)
            throw errors.unprocessable('OUT_OF_STOCK', 'Sem estoque', { detail: 'Esse item esgotou.' });
        const price = effectivePrice(row.product.basePriceCents, row.variant.priceCents, { promoPriceCents: row.product.promoPriceCents, promoStartsAt: row.product.promoStartsAt, promoEndsAt: row.product.promoEndsAt }, new Date());
        return { ...row, free, priceCents: price.priceCents };
    }
    /**
     * Define a quantidade de uma variação (idempotente: repetir é seguro em rede ruim). Acima do disponível ou de
     * `item_qtd_max`, ajusta ao máximo e avisa (WB-020 C2). Item de outra loja: 409 `CART_STORE_CONFLICT` com a loja
     * atual; `replaceStore: true` confirma "Esvaziar e continuar" (WB-021).
     */
    async setItem(principal, variantId, input, ctx) {
        const notices = [];
        const maxQty = await this.params.getNumber('item_qtd_max');
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            const target = await this.purchasable(tx, variantId);
            const storeId = target.product.storeId;
            const [current] = await tx.select({ count: sql `count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cart.id));
            if (cart.storeId && cart.storeId !== storeId && (current?.count ?? 0) > 0) {
                if (!input.replaceStore) {
                    const [other] = await tx.select({ name: stores.name }).from(stores).where(eq(stores.id, cart.storeId));
                    throw errors.conflict('CART_STORE_CONFLICT', 'Trocar de loja?', 'Cada pedido é de uma loja só. Esvazie a sacola para adicionar itens desta loja.', {
                        currentStore: { id: cart.storeId, name: other?.name ?? '' },
                        newStore: { id: storeId, name: target.storeName ?? '' },
                        itemCount: current?.count ?? 0,
                    });
                }
                await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
                await tx.update(carts).set({ couponId: null }).where(eq(carts.id, cart.id));
                notices.push({ code: 'STORE_REPLACED', message: 'Sacola esvaziada. Item adicionado.' });
            }
            const maxQuantity = Math.min(target.free, maxQty);
            const applied = Math.min(input.quantity, maxQuantity);
            if (applied < input.quantity)
                notices.push({ code: 'QUANTITY_ADJUSTED', message: `Só temos ${maxQuantity} unidades.`, requestedQuantity: input.quantity, appliedQuantity: applied, maxQuantity });
            await tx
                .insert(cartItems)
                .values({ cartId: cart.id, variantId, productId: target.product.id, quantity: applied, seenPriceCents: target.priceCents })
                .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: applied } });
            await this.touch(tx, cart.id, { storeId });
        });
        return this.build(principal, ctx, notices);
    }
    async removeItem(principal, variantId, ctx) {
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            await tx.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
            const [left] = await tx.select({ count: sql `count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cart.id));
            await this.touch(tx, cart.id, (left?.count ?? 0) === 0 ? { storeId: null, couponId: null } : {});
        });
        return this.build(principal, ctx, []);
    }
    async clear(principal, ctx) {
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
            await this.touch(tx, cart.id, { storeId: null, couponId: null });
        });
        return this.build(principal, ctx, []);
    }
    /** Aplica (ou troca, WB-022 C3) o cupom. Recusa com 422 e o `code` do motivo; a sacola não muda. */
    async applyCoupon(principal, rawCode, ctx) {
        const code = rawCode.trim().toUpperCase();
        const [coupon] = await this.db.select().from(coupons).where(sql `upper(${coupons.code}) = ${code}`);
        const [cart] = await this.db.select().from(carts).where(eq(carts.userId, principal.userId));
        if (!cart?.storeId)
            throw errors.unprocessable('CART_EMPTY', 'Sacola vazia', { detail: 'Adicione itens antes de aplicar um cupom.' });
        if (!coupon)
            throw errors.unprocessable('COUPON_NOT_FOUND', 'Cupom inválido', { detail: 'Esse cupom não existe. Confira o código.' });
        const view = await this.build(principal, ctx, [], coupon.id);
        if (view.coupon && !view.coupon.applied && view.coupon.rejection)
            throw errors.unprocessable(view.coupon.rejection, 'Cupom não aplicado', { detail: COUPON_MESSAGES[view.coupon.rejection](coupon) });
        await this.db.transaction(async (tx) => {
            const locked = await this.lock(tx, principal.userId);
            await this.touch(tx, locked.id, { couponId: coupon.id });
        });
        return this.build(principal, ctx, []);
    }
    async removeCoupon(principal, ctx) {
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            await this.touch(tx, cart.id, { couponId: null });
        });
        return this.build(principal, ctx, []);
    }
    /**
     * "Aceitar e continuar" (RN-05, WB-020 C3): grava o que a leitura já mostrou, ajustando quantidades ao disponível,
     * tirando o que saiu do ar e atualizando os preços vistos. Depois disso a sacola não tem mais avisos de mudança.
     */
    async acknowledge(principal, ctx) {
        const view = await this.build(principal, ctx, []);
        if (!view.id)
            return view;
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            for (const item of view.items) {
                if (item.quantity === 0)
                    continue; // esgotado: o cliente decide remover (nada some sem ele ver)
                const current = item.unitPrice.amount;
                await tx.update(cartItems).set({ quantity: item.quantity, seenPriceCents: current }).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.id, item.id)));
            }
            await this.touch(tx, cart.id);
        });
        return this.build(principal, ctx, []);
    }
    /**
     * Junta a sacola do visitante (feita no aparelho) à da conta no login (RN-05): mesma loja soma as quantidades até o
     * estoque; loja diferente mantém a da conta e avisa; conta vazia adota a do aparelho. Item inválido é ignorado e avisado.
     */
    async merge(principal, input, ctx) {
        const notices = [];
        const maxQty = await this.params.getNumber('item_qtd_max');
        await this.db.transaction(async (tx) => {
            const cart = await this.lock(tx, principal.userId);
            const [current] = await tx.select({ count: sql `count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cart.id));
            let storeId = (current?.count ?? 0) > 0 ? cart.storeId : null;
            const adopting = storeId === null;
            for (const wanted of input.items) {
                let target;
                try {
                    target = await this.purchasable(tx, wanted.variantId);
                }
                catch {
                    notices.push({ code: 'MERGE_ITEM_SKIPPED', message: 'Um item da sacola do aparelho não está mais disponível.', variantId: wanted.variantId });
                    continue;
                }
                if (storeId === null)
                    storeId = target.product.storeId;
                if (target.product.storeId !== storeId) {
                    if (!notices.some((n) => n.code === 'MERGE_KEPT_ACCOUNT_CART'))
                        notices.push({ code: 'MERGE_KEPT_ACCOUNT_CART', message: 'Mantivemos a sacola da sua conta. Os itens de outra loja ficaram de fora.' });
                    continue;
                }
                const [existing] = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, wanted.variantId)));
                const sum = (existing?.quantity ?? 0) + wanted.quantity;
                const applied = Math.min(sum, target.free, maxQty);
                await tx
                    .insert(cartItems)
                    .values({ cartId: cart.id, variantId: wanted.variantId, productId: target.product.id, quantity: applied, seenPriceCents: target.priceCents })
                    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: applied } });
            }
            if (adopting && storeId !== null)
                await tx.update(carts).set({ couponId: null }).where(eq(carts.id, cart.id));
            await this.touch(tx, cart.id, storeId !== null ? { storeId } : {});
        });
        return this.build(principal, ctx, notices);
    }
};
CartService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService,
        StoreSettingsService,
        AddressesService,
        MediaService,
        PurchaseHistoryPort,
        CommissionService,
        ExposureLimitService,
        DeliveryFeesService])
], CartService);
export { CartService };
const COUPON_MESSAGES = {
    COUPON_NOT_FOUND: () => 'Esse cupom não existe. Confira o código.',
    COUPON_NOT_STARTED: () => 'Esse cupom ainda não começou.',
    COUPON_EXPIRED: (c) => `Esse cupom venceu em ${c.endsAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })}.`,
    COUPON_EXHAUSTED: () => 'Esse cupom acabou.',
    COUPON_ALREADY_USED: () => 'Esse cupom já foi usado.',
    COUPON_MIN_ORDER: (c) => `Esse cupom vale a partir de R$ ${(c.minOrderCents / 100).toFixed(2).replace('.', ',')}.`,
    COUPON_OTHER_STORE: () => 'Esse cupom é de outra loja.',
    COUPON_FIRST_PURCHASE_ONLY: () => 'Esse cupom vale só na primeira compra.',
    COUPON_EMAIL_UNVERIFIED: () => 'Confirme seu e-mail para usar este cupom.',
    COUPON_NOT_ALLOWED: (coupon) => (coupon.kind === 'free_shipping' ? 'Cupom de entrega grátis só vale em pedido de entrega.' : 'Você não pode usar esse cupom nessa loja.'),
};
//# sourceMappingURL=cart.service.js.map