import { and, eq, like, sql } from 'drizzle-orm';
import { computeOrderFinance } from '../src/modules/finance/domain/commission.js';
import { saleLines } from '../src/modules/finance/domain/ledger.js';
import type { Db } from '../src/platform/database/database.module.js';
import { deliveries, exchangeRequests, ledgerEntries, ledgerTransactions, orderEvents, orderItems, orders, productVariants, products, storeMembers, stores, userAddresses, users } from '../src/platform/database/schema.js';

/** Pedidos de demonstração em vários estados, para o painel da loja, o financeiro, a logística e as trocas terem o que mostrar. */
const DEMO_STATES = [
  { status: 'awaiting_payment', ageH: 0.1 },
  { status: 'received', ageH: 0.2 },
  { status: 'accepted', ageH: 0.5 },
  { status: 'in_preparation', ageH: 1 },
  { status: 'ready_for_collection', ageH: 1.5 },
  { status: 'out_for_delivery', ageH: 2 },
  { status: 'delivered', ageH: 48 },
  { status: 'delivered', ageH: 240 },
  { status: 'cancelled', ageH: 6 },
  { status: 'refused', ageH: 8 },
] as const;
const PAID = new Set(['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'delivered']);
const COMMISSION_BP = 1500; // padrão de 15% (DEC-039f)

/**
 * SÓ desenvolvimento e staging (nunca produção: não há flag que libere). Idempotente: os números `WB-DMxxx` são fixos e pedido já
 * criado é pulado. Os valores seguem a mesma conta da RN-10 (`computeOrderFinance`) e as vendas pagas entram no ledger.
 */
export async function seedDemoOrders(db: Db, log: (message: string) => void = () => undefined): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Pedidos de demonstração não rodam em produção');
  const customers = await db.select().from(users).where(and(like(users.email, 'cliente.%@seed.webag.local')));
  const seedStores = (
    await db
      .select({ store: stores })
      .from(stores)
      .innerJoin(storeMembers, and(eq(storeMembers.storeId, stores.id), eq(storeMembers.role, 'owner')))
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(like(users.email, 'lojista.%@seed.webag.local'))
      .limit(6)
  ).map((r) => r.store);
  if (customers.length === 0 || seedStores.length === 0) {
    log('pedidos de demonstração: sem clientes ou lojas de seed (rode as ondas 2 e 3 antes)');
    return;
  }
  let created = 0;
  let n = 0;
  for (const store of seedStores) {
    const [variant] = await db
      .select({ variant: productVariants, product: products })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.storeId, store.id), eq(productVariants.active, true), eq(products.status, 'active')))
      .limit(1);
    if (!variant) continue;
    for (const demo of DEMO_STATES) {
      n += 1;
      const number = `WB-DM${String(n).padStart(3, '0')}`;
      const [exists] = await db.select({ id: orders.id }).from(orders).where(eq(orders.number, number));
      if (exists) continue;
      const customer = customers[n % customers.length]!;
      const [address] = await db.select().from(userAddresses).where(eq(userAddresses.userId, customer.id)).limit(1);
      const unit = variant.variant.priceCents ?? variant.product.basePriceCents ?? 5_000;
      const quantity = 1 + (n % 2);
      const delivery = 600;
      const finance = computeOrderFinance({ items: [{ subtotalCents: unit * quantity, pctBp: COMMISSION_BP }], storeCouponCents: 0, platformDiscountCents: 0, deliveryFeeCents: delivery, serviceFeeCents: 0 });
      const at = new Date(Date.now() - demo.ageH * 3_600_000);
      const paid = PAID.has(demo.status);
      const delivered = demo.status === 'delivered';
      await db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            number,
            userId: customer.id,
            storeId: store.id,
            status: demo.status,
            mode: 'delivery',
            cartRevision: 0,
            address: { street: address?.street ?? 'Rua Demo', number: address?.number ?? '10', complement: null, neighborhood: address?.neighborhood ?? 'Centro', city: address?.cityName ?? 'Francisco Morato', state: 'SP', cep: address?.cep ?? '07900000', cityId: address?.cityId ?? null, neighborhoodId: null },
            etaMinMinutes: 30,
            etaMaxMinutes: 50,
            subtotalCents: finance.subtotalCents,
            deliveryFeeCents: delivery,
            serviceFeeCents: 0,
            discountCents: 0,
            totalCents: finance.totalCents,
            commissionCents: finance.commissionCents,
            applicationFeeCents: finance.applicationFeeCents,
            finance: finance as unknown as Record<string, unknown>,
            deliverySnapshot: { exchangeFeeCents: 300, expectedCostCents: 800 },
            paymentMethod: 'pix',
            exchangeVoluntaryDays: 7,
            stockState: demo.status === 'awaiting_payment' ? 'reserved' : paid ? 'sold' : 'released',
            paidAt: paid ? at : null,
            acceptedAt: ['accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'delivered'].includes(demo.status) ? at : null,
            deliveredAt: delivered ? at : null,
            cancelledAt: demo.status === 'cancelled' || demo.status === 'refused' ? at : null,
            cancelledBy: demo.status === 'cancelled' ? 'customer' : demo.status === 'refused' ? 'store' : null,
            cancelReason: demo.status === 'refused' ? 'Sem estoque (demonstração)' : null,
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        const [item] = await tx
          .insert(orderItems)
          .values({ orderId: order!.id, productId: variant.product.id, variantId: variant.variant.id, categoryId: variant.product.categoryId, name: variant.product.name, attributes: variant.variant.attributes, quantity, unitPriceCents: unit, lineTotalCents: unit * quantity, commissionPctBp: COMMISSION_BP, stockState: demo.status === 'awaiting_payment' ? 'reserved' : paid ? 'sold' : 'released' })
          .returning();
        await tx.insert(orderEvents).values({ orderId: order!.id, fromStatus: null, toStatus: demo.status, actor: 'system', reason: 'Pedido de demonstração', at });
        // A reserva do pedido aguardando pagamento é real (o PIX vence e a varredura devolve o estoque): soma ao estoque e à reserva juntos.
        // Pedido pago NÃO mexe no estoque de demonstração (ele serve só para o painel e o financeiro lerem).
        if (demo.status === 'awaiting_payment') await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${quantity}`, reserved: sql`${productVariants.reserved} + ${quantity}` }).where(eq(productVariants.id, variant.variant.id));
        if (paid) {
          const [header] = await tx.insert(ledgerTransactions).values({ orderId: order!.id, storeId: store.id, kind: 'sale', dedupeKey: `sale:${order!.id}`, meta: { finance, demo: true }, createdAt: at }).returning();
          await tx.insert(ledgerEntries).values(saleLines(finance).map((l) => ({ transactionId: header!.id, account: l.account, direction: l.direction, amountCents: l.amountCents })));
        }
        if (demo.status === 'ready_for_collection' || demo.status === 'out_for_delivery') {
          await tx.insert(deliveries).values({
            kind: 'delivery',
            orderId: order!.id,
            storeId: store.id,
            status: demo.status === 'ready_for_collection' ? 'ready_for_collection' : 'out_for_delivery',
            feeCents: delivery,
            expectedCostCents: 800,
            readyAt: at,
            contact: { number, kind: 'delivery', storeName: store.name, pickupAddress: store.addressStreet ?? '', dropoffAddress: 'Rua Demo, 10', customerFirstName: customer.name.split(' ')[0] ?? '', customerPhone: null, volumes: 1, note: null },
          });
        }
        // Uma troca por tamanho já pedida no pedido entregue mais recente: a fila de trocas da loja nasce com algo para decidir.
        if (delivered && demo.ageH === 48) {
          await tx.insert(exchangeRequests).values({
            number: `TR-DM${String(n).padStart(3, '0')}`,
            orderId: order!.id,
            orderItemId: item!.id,
            userId: customer.id,
            storeId: store.id,
            type: 'size_color',
            reasonCode: 'size',
            description: 'Ficou pequeno (demonstração)',
            method: 'drop_at_store',
            resolution: 'refund',
            quantity,
            answerDeadlineAt: new Date(Date.now() + 20 * 3_600_000),
            windowEndsAt: new Date(at.getTime() + 7 * 86_400_000),
          });
        }
      });
      created += 1;
    }
  }
  log(`pedidos de demonstração: ${created} criados`);
}
