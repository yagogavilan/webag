import { desc, eq } from 'drizzle-orm';
import { DeliveryFeesService } from '../../src/modules/logistics/index.js';
import { ParametersService } from '../../src/modules/admin/index.js';
import { deliveryFeeTables } from '../../src/platform/database/schema.js';
import type { TestContext } from './app.js';

const system = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

/** Parâmetro global do admin (DEC-036b), pelo serviço (invalida o cache). Os arquivos de teste rodam em série: restaure no `afterAll`. */
export async function useParam(ctx: TestContext, key: string, value: number): Promise<void> {
  await ctx.app.get(ParametersService).update(key, value, 'ajuste de teste', system);
}

/** Grava uma versão nova da tabela do escopo padrão com as faixas dadas (distâncias em m; a última deve terminar em `raio_max_km`). */
export async function useFeeTable(ctx: TestContext, tiers: { fromM: number; toM: number; feeCents: number; exchangeFeeCents?: number; expectedCostCents?: number; etaMinutes?: number }[], scope: { scopeType?: 'default' | 'city' | 'neighborhood'; scopeId?: string | null } = {}): Promise<void> {
  const scopeType = scope.scopeType ?? 'default';
  const key = scopeType === 'default' ? 'default' : scope.scopeId!;
  const [latest] = await ctx.db.select({ version: deliveryFeeTables.version }).from(deliveryFeeTables).where(eq(deliveryFeeTables.scopeKey, key)).orderBy(desc(deliveryFeeTables.version)).limit(1);
  await ctx.app.get(DeliveryFeesService).put(
    {
      scopeType,
      scopeId: scope.scopeId ?? null,
      tiers: tiers.map((t) => ({ exchangeFeeCents: Math.ceil(t.feeCents / 2), expectedCostCents: 0, etaMinutes: 10, ...t })),
      reason: 'ajuste de teste',
      expectedVersion: latest?.version ?? 0,
    },
    system,
  );
}

/** Volta ao básico dos testes: tabela de R$ 5,00 até 15 km, raio 15 km, mínimo 0 e sem entrega grátis. */
export async function restoreFees(ctx: TestContext): Promise<void> {
  await useParam(ctx, 'raio_max_km', 15);
  await useParam(ctx, 'frete_gratis_acima_cents', 0);
  await useParam(ctx, 'pedido_minimo_cents', 0);
  await useFeeTable(ctx, [{ fromM: 0, toM: 15_000, feeCents: 500 }]);
}
