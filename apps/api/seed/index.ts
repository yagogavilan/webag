import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/platform/database/schema.js';
import { S3ObjectStorage } from '../src/platform/storage/s3.storage.js';
import { seedOnda1 } from './onda1.js';
import { seedOnda2 } from './onda2.js';
import { seedOnda3 } from './onda3.js';

/**
 * Seed de desenvolvimento: `pnpm --filter @webag/api db:seed`. Idempotente. Cada onda soma um arquivo aqui.
 * Em produção só cria o admin se SEED_ADMIN_PASSWORD estiver definida de propósito.
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
    // Onda 2: lojas fictícias com produtos e fotos geradas. Só em desenvolvimento (em produção: SEED_ONDA2=true + senha).
    const production = process.env.NODE_ENV === 'production';
    if (!production || process.env.SEED_ONDA2 === 'true') {
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
      await seedOnda2(db, { merchantPassword: process.env.SEED_MERCHANT_PASSWORD, storage, production, log: (message) => console.log(`[seed] ${message}`) });
      // Onda 3: mais lojas, clientes, avaliações, cupons, favoritos e banners (em produção: SEED_ONDA3=true).
      if (!production || process.env.SEED_ONDA3 === 'true') {
        await seedOnda3(db, { merchantPassword: process.env.SEED_MERCHANT_PASSWORD, storage, production, log: (message) => console.log(`[seed] ${message}`) });
      }
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
