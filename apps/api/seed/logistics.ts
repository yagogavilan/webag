import { and, eq } from 'drizzle-orm';
import { deliveryFeeTables, deliveryFeeTiers } from '../src/modules/logistics/db/schema.js';
import { parameters } from '../src/modules/admin/db/schema.js';
import type { Db } from '../src/platform/database/database.module.js';

/**
 * Tabela inicial de taxa de entrega e custo previsto do motoboy (HIP-L01/HIP-L02), SÓ para desenvolvimento e staging.
 * São HIPÓTESES até o fundador cotar com 3 a 5 motoboys de Francisco Morato: em produção o financeiro cadastra a tabela
 * real no admin antes de abrir a entrega (sem tabela a entrega fica indisponível, de propósito). Idempotente.
 */
export async function seedLogistics(db: Db, log: (message: string) => void = () => undefined): Promise<void> {
  const [existing] = await db.select({ id: deliveryFeeTables.id }).from(deliveryFeeTables).where(and(eq(deliveryFeeTables.scopeKey, 'default'), eq(deliveryFeeTables.version, 1)));
  if (!existing) {
    const [table] = await db
      .insert(deliveryFeeTables)
      .values({ scopeType: 'default', scopeKey: 'default', version: 1, effectiveFrom: new Date(Date.now() - 86_400_000), reason: 'Tabela inicial de desenvolvimento (hipótese HIP-L01, cotar com motoboys)' })
      .onConflictDoNothing()
      .returning({ id: deliveryFeeTables.id });
    if (table) {
      // [de m, até m, taxa ao cliente, custo previsto do motoboy, minutos]; troca = 50% da taxa (DEC-039a).
      const bands: [number, number, number, number, number][] = [[0, 2_000, 600, 800, 10], [2_000, 5_000, 900, 1_100, 18], [5_000, 10_000, 1_200, 1_500, 28], [10_000, 15_000, 1_500, 1_900, 40]];
      await db.insert(deliveryFeeTiers).values(bands.map(([fromM, toM, fee, cost, eta], position) => ({ tableId: table.id, position, fromM, toM, feeCents: fee, exchangeFeeCents: Math.ceil(fee / 2), expectedCostCents: cost, etaMinutes: eta })));
      log('tabela de taxa de entrega inicial (4 faixas, hipótese)');
    }
  }
  // Pedido mínimo de R$ 20,00 (HIP-L12); frete grátis desligado.
  await db.insert(parameters).values({ key: 'pedido_minimo_cents', value: 2000 }).onConflictDoNothing();
}
