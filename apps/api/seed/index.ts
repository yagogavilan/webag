import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/platform/database/schema.js';
import { S3ObjectStorage } from '../src/platform/storage/s3.storage.js';
import { seedOnda1 } from './onda1.js';
import { applySeedHours, parseSeedHours, seedOnda2, SEED_STORES } from './onda2.js';
import { seedLogistics } from './logistics.js';
import { seedDemoOrders } from './orders-demo.js';
import { seedOnda3, SEED_STORES_ONDA3 } from './onda3.js';

/**
 * Seed de desenvolvimento: `pnpm --filter @webag/api db:seed`. Idempotente. Cada onda soma um arquivo aqui.
 * Em produção só roda o seed base (Onda 1); o admin só é criado se SEED_ADMIN_PASSWORD estiver definida de propósito.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    await seedOnda1(db, {
      adminEmail: process.env.SEED_ADMIN_EMAIL,
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      log: (message) => console.log(`[seed] ${message}`),
    });
    // HIP-C01 (DEC-039f): comissão padrão de 15% no seed do CLI (fora dos testes). Só troca o 10% de fábrica que ninguém editou.
    await db.update(schema.parameters).set({ value: 15 }).where(and(eq(schema.parameters.key, 'comissao_padrao_pct'), eq(schema.parameters.value, 10), isNull(schema.parameters.updatedBy)));
    // Ondas 2 e seguintes: dados fictícios (lojas, clientes, pedidos). NUNCA em produção (DEC-030d, I10): não há flag que libere.
    const production = process.env.NODE_ENV === 'production';
    if (production) {
      console.log('[seed] produção: só o seed base (admin, categorias, regiões, parâmetros, termos); dados de demonstração ignorados');
    } else {
      const storage = new S3ObjectStorage({
        endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
        region: process.env.S3_REGION ?? 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY ?? 'webag-dev',
        secretKey: process.env.S3_SECRET_KEY ?? 'webag-dev-secret-only',
        bucketPublic: process.env.S3_BUCKET_PUBLIC ?? 'webag-public',
        bucketPrivate: process.env.S3_BUCKET_PRIVATE ?? 'webag-private',
        publicUrl: process.env.S3_PUBLIC_URL ?? 'http://localhost:9000/webag-public',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      });
      await seedLogistics(db, (message) => console.log(`[seed] ${message}`)); // hipótese de tabela de frete: só dev/staging (DEC-036)
      // Horário da demonstração (BUG-026, DEC-069): `always_open` (padrão) deixa lojas E logística abertas 24 h todos os dias, para quem clona e
      // roda à noite ou no fim de semana poder comprar; `realistic` mantém o horário real (lojas e logística 09:00-20:00, seg a sáb). SÓ aqui, no
      // seed de dev/staging: a produção nunca chega neste ramo. Parâmetro já editado no admin (updated_by preenchido) não é tocado.
      const hours = parseSeedHours(process.env.SEED_HOURS, 'always_open');
      const [logisticsHours, logisticsDays] = hours === 'always_open' ? (['00:00-23:59', 'seg_dom'] as const) : (['09:00-20:00', 'seg_sab'] as const);
      const [fromHours, fromDays] = hours === 'always_open' ? (['09:00-20:00', 'seg_sab'] as const) : (['00:00-23:59', 'seg_dom'] as const);
      await db.update(schema.parameters).set({ value: logisticsHours }).where(and(eq(schema.parameters.key, 'logistica_horario'), eq(schema.parameters.value, fromHours), isNull(schema.parameters.updatedBy)));
      await db.update(schema.parameters).set({ value: logisticsDays }).where(and(eq(schema.parameters.key, 'logistica_dias'), eq(schema.parameters.value, fromDays), isNull(schema.parameters.updatedBy)));
      console.log(`[seed] SEED_HOURS=${hours} (${hours === 'always_open' ? 'lojas e logística abertas 24 h todos os dias' : 'horário realista das lojas e da logística'})`);
      await seedOnda2(db, { merchantPassword: process.env.SEED_MERCHANT_PASSWORD, storage, production, hours, log: (message) => console.log(`[seed] ${message}`) });
      // Onda 3: mais lojas, clientes, avaliações, cupons, favoritos e banners.
      await seedOnda3(db, { merchantPassword: process.env.SEED_MERCHANT_PASSWORD, storage, production, hours, log: (message) => console.log(`[seed] ${message}`) });
      // Lojas que já existiam (seed rodado antes ou com o outro modo): troca o horário só das que ainda estão no horário padrão do outro modo.
      await applySeedHours(db, [...SEED_STORES, ...SEED_STORES_ONDA3], hours, (message) => console.log(`[seed] ${message}`));
      // Pedidos de demonstração em vários estados (painel da loja, financeiro, logística e trocas). Só dev/staging.
      await seedDemoOrders(db, (message) => console.log(`[seed] ${message}`));
    }
    console.log('[seed] concluído');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
