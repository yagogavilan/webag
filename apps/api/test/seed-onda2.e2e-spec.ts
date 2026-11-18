import { and, eq, sql } from 'drizzle-orm';
import { isStoreVisible } from '../src/modules/stores/index.js';
import { OBJECT_STORAGE } from '../src/platform/storage/object-storage.js';
import { MemoryObjectStorage } from '../src/platform/storage/memory.storage.js';
import { mediaAssets, productImages, products, productVariants, stores, users, paymentAccounts, storeSettings } from '../src/platform/database/schema.js';
import { seedOnda1 } from '../seed/onda1.js';
import { fakeCpf, SEED_STORES, seedOnda2 } from '../seed/onda2.js';
import { isValidCpf } from '../src/modules/stores/domain/document.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';

describe('Seed da Onda 2: lojas fictícias em Francisco Morato e Franco da Rocha', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('cria 7 lojas aprovadas e visíveis com produtos, variações, promoções e fotos geradas; rodar de novo não duplica', async () => {
    await seedOnda1(ctx.db, {});
    const storage = ctx.app.get<MemoryObjectStorage>(OBJECT_STORAGE);
    const options = { merchantPassword: 'senha-de-teste-do-seed-1', storage };
    await seedOnda2(ctx.db, options);
    await seedOnda2(ctx.db, options);

    const seeded = await ctx.db.select().from(stores).where(sql`${stores.name} in (${sql.join(SEED_STORES.map((s) => sql`${s.name}`), sql`, `)})`);
    expect(seeded).toHaveLength(SEED_STORES.length);
    const cities = new Set(seeded.map((s) => s.addressCityName));
    expect(cities).toEqual(new Set(['Francisco Morato', 'Franco da Rocha']));
    expect(new Set(seeded.map((s) => s.addressNeighborhood)).size).toBeGreaterThanOrEqual(6);

    for (const store of seeded) {
      expect(isValidCpf(store.documentNumber)).toBe(true);
      const [account] = await ctx.db.select().from(paymentAccounts).where(eq(paymentAccounts.storeId, store.id));
      const items = await ctx.db.select().from(products).where(eq(products.storeId, store.id));
      expect(items.length).toBeGreaterThanOrEqual(6);
      expect(isStoreVisible({ status: store.status, paymentAccountActive: account?.status === 'active', activeProducts: items.filter((p) => p.status === 'active').length })).toBe(true);
      const withImage = await ctx.db.select().from(productImages).where(sql`${productImages.productId} in (${sql.join(items.map((p) => sql`${p.id}`), sql`, `)})`);
      expect(withImage).toHaveLength(items.length);
      const [settings] = await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, store.id));
      expect(settings?.radiusM).toBeGreaterThan(0);
    }
    // o seed não vira duas vezes: variações e fotos únicas, SKU único por loja
    const variants = await ctx.db.select().from(productVariants).where(sql`${productVariants.storeId} in (${sql.join(seeded.map((s) => sql`${s.id}`), sql`, `)})`);
    expect(new Set(variants.map((v) => `${v.storeId}:${v.sku}`)).size).toBe(variants.length);
    expect(variants.some((v) => v.stock === 0)).toBe(true); // há esgotado para testar a vitrine
    // as fotos foram geradas já redimensionadas em WebP (conferido no banco: o seed da Onda 3 pode ter criado as lojas antes,
    // com outro armazenamento em memória, então contar objetos do bucket deste teste dependeria da ordem dos arquivos)
    const images = await ctx.db.select({ variants: mediaAssets.variants }).from(mediaAssets).where(sql`${mediaAssets.storeId} in (${sql.join(seeded.map((s) => sql`${s.id}`), sql`, `)}) and ${mediaAssets.purpose} = 'product_image'`);
    expect(images.filter((i) => i.variants && '400' in i.variants).length).toBeGreaterThanOrEqual(42);
    expect(storage).toBeDefined();
  });

  it('o lojista de teste entra pela API com a senha do seed e enxerga a própria loja (e só ela)', async () => {
    const seed = SEED_STORES[0]!;
    const email = `lojista.${seed.slug}@seed.webag.local`;
    const login = await ctx.http.post('/v1/auth/login').send({ email, password: 'senha-de-teste-do-seed-1' }).expect(200);
    const token = login.body.tokens.accessToken as string;
    const mine = await ctx.http.get('/v1/stores/mine').set(bearer(token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].name).toBe(seed.name);
    const catalog = await ctx.http.get(`/v1/stores/${mine.body.data[0].id}/products`).set(bearer(token)).expect(200);
    expect(catalog.body.data.length).toBeGreaterThanOrEqual(6);
    const [other] = await ctx.db.select().from(stores).where(and(eq(stores.name, SEED_STORES[1]!.name)));
    await ctx.http.get(`/v1/stores/${other!.id}/products`).set(bearer(token)).expect(404);
    expect((await ctx.db.select().from(users).where(eq(users.email, email)))[0]?.passwordHash).not.toContain('senha-de-teste');
  });

  it('CPFs fictícios são válidos, determinísticos e distintos', () => {
    const cpfs = SEED_STORES.map((s) => fakeCpf(s.slug));
    expect(new Set(cpfs).size).toBe(cpfs.length);
    expect(fakeCpf('x')).toBe(fakeCpf('x'));
    for (const cpf of cpfs) expect(isValidCpf(cpf)).toBe(true);
  });

  it('em produção o seed exige senha explícita', async () => {
    await expect(seedOnda2(ctx.db, { production: true })).rejects.toThrow(/SEED_MERCHANT_PASSWORD/);
  });
});
