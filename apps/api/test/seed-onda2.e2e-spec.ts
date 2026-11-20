import { and, eq, sql } from 'drizzle-orm';
import { isStoreVisible } from '../src/modules/stores/index.js';
import { OBJECT_STORAGE } from '../src/platform/storage/object-storage.js';
import { MemoryObjectStorage } from '../src/platform/storage/memory.storage.js';
import { storeHours, mediaAssets, productImages, products, productVariants, stores, users, paymentAccounts, storeSettings } from '../src/platform/database/schema.js';
import { seedOnda1 } from '../seed/onda1.js';
import { applySeedHours, fakeCpf, parseSeedHours, SEED_STORES, seedOnda2 } from '../seed/onda2.js';
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

  it('SEED_HOURS (BUG-026): realistic é o padrão do seed; always_open abre 24 h todos os dias; trocar de modo não toca horário editado', async () => {
    expect(parseSeedHours(undefined, 'always_open')).toBe('always_open');
    expect(parseSeedHours('', 'always_open')).toBe('always_open');
    expect(parseSeedHours('realistic', 'always_open')).toBe('realistic');
    expect(() => parseSeedHours('sempre', 'always_open')).toThrow(/SEED_HOURS inválido/);

    const [boaCompra] = await ctx.db.select().from(stores).where(eq(stores.name, 'Mercadinho Boa Compra'));
    const hoursOf = async (storeId: string): Promise<string[]> =>
      (await ctx.db.select().from(storeHours).where(eq(storeHours.storeId, storeId))).map((r) => `${r.weekday}:${r.startMin}-${r.endMin}`).sort();
    // O seed dos testes não passa `hours`: horário realista (7 h às 20 h; domingo 8 h às 13 h).
    expect(await hoursOf(boaCompra!.id)).toContain('1:420-1200');
    expect(await hoursOf(boaCompra!.id)).toContain('0:480-780');

    await applySeedHours(ctx.db, SEED_STORES, 'always_open');
    const everyday = [0, 1, 2, 3, 4, 5, 6].map((d) => `${d}:0-1439`).sort();
    for (const seed of SEED_STORES) {
      const [store] = await ctx.db.select().from(stores).where(eq(stores.name, seed.name));
      expect(await hoursOf(store!.id)).toEqual(everyday);
    }
    // Horário editado pelo lojista não é sobrescrito ao voltar para o realista.
    const [edited] = await ctx.db.select().from(stores).where(eq(stores.name, SEED_STORES[1]!.name));
    await ctx.db.delete(storeHours).where(eq(storeHours.storeId, edited!.id));
    await ctx.db.insert(storeHours).values({ storeId: edited!.id, weekday: 3, startMin: 600, endMin: 660 });
    await applySeedHours(ctx.db, SEED_STORES, 'realistic');
    expect(await hoursOf(edited!.id)).toEqual(['3:600-660']);
    expect(await hoursOf(boaCompra!.id)).toContain('1:420-1200');
    expect(await hoursOf(boaCompra!.id)).toHaveLength(7);
  });

  it('em produção o seed de demonstração se recusa a rodar (DEC-030d)', async () => {
    await expect(seedOnda2(ctx.db, { production: true })).rejects.toThrow(/não roda em produção/);
  });
});
