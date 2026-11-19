import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { PasswordService } from '../src/modules/identity/password.service.js';
import { renderVariant } from '../src/modules/media/image.processor.js';
import type { Db } from '../src/platform/database/database.module.js';
import { banners, categories, cities, coupons, favorites, legalDocuments, mediaAssets, products, reviews, stores, termsAcceptances, userAddresses, userRoles, users } from '../src/platform/database/schema.js';
import { bannerImage, type BannerArt } from './banner-art.js';
import { DEV_SEED_MERCHANT_PASSWORD, seedStores, type SeedOnda2Options, type SeedStore } from './onda2.js';

/**
 * Seed da Onda 3: mais 6 lojas e produtos FICTÍCIOS (Francisco Morato, Franco da Rocha, Caieiras), clientes de teste
 * com endereço padrão, banners da home, avaliações, cupons e favoritos. Idempotente. Dev apenas (em produção exige
 * `SEED_ONDA3=true` e `SEED_MERCHANT_PASSWORD`).
 *
 * FONTE DOS DADOS (registro de origem): igual ao seed da Onda 2 (tudo inventado; domínio `seed.webag.local`; CPF
 * fictício; fotos e banners GERADOS por este código com `sharp`, sem terceiros). Os comentários das avaliações são
 * frases genéricas escritas para teste. Avaliações sem `order_id` (ainda não há pedidos): não aparecem como "Compra
 * verificada" até a Onda 4/5A. Coordenadas aproximadas dos bairros; servem só para testar raio e frete.
 */

const WEEK = [1, 2, 3, 4, 5, 6];
const tier = (toM: number, feeCents: number) => [{ fromM: 0, toM, feeCents }];

export const SEED_STORES_ONDA3: SeedStore[] = [
  {
    slug: 'padaria-pao-quente', name: 'Padaria Pão Quente', owner: 'Teresa Teste', description: 'Pães, salgados e café da manhã completo. (Loja fictícia de teste)',
    category: 'Mercado', city: 'francisco-morato-sp', neighborhood: 'Vila Rosa', street: 'Rua do Forno (fictícia)', number: '12', cep: '07900500', lat: -23.2861, lng: -46.7395, phone: '11911110008',
    radiusM: 3000, tiers: tier(3000, 400), minOrderCents: 1000, freeAboveCents: 5000, pickup: true, approvedDaysAgo: 10, voluntaryExchangeDays: 0,
    hours: [{ weekdays: [0, ...WEEK], start: '06:00', end: '19:00' }],
    products: [
      { name: 'Pão de queijo (6 un.)', description: 'Assado na hora.', category: 'Padaria', priceCents: 1290, section: 'Salgados', hue: 40, variants: [{ stock: 40, sku: 'PPQ-PQ' }] },
      { name: 'Coxinha de frango', description: 'Massa leve, recheio generoso.', category: 'Padaria', priceCents: 790, promo: { priceCents: 690, days: 7 }, section: 'Salgados', hue: 28, variants: [{ stock: 50, sku: 'PPQ-COX' }] },
      { name: 'Café coado 500ml', description: 'Garrafa térmica.', category: 'Bebidas', priceCents: 1190, section: 'Bebidas', hue: 25, variants: [{ stock: 20, sku: 'PPQ-CAF' }] },
      { name: 'Bolo de cenoura (fatia)', description: 'Com cobertura de chocolate.', category: 'Padaria', priceCents: 890, section: 'Doces', hue: 15, variants: [{ stock: 0, sku: 'PPQ-BOL' }] },
    ],
  },
  {
    slug: 'hortifruti-sitio-verde', name: 'Hortifruti Sítio Verde', owner: 'Iago Teste', description: 'Frutas, verduras e legumes frescos. (Loja fictícia de teste)',
    category: 'Mercado', city: 'franco-da-rocha-sp', neighborhood: 'Centro', street: 'Praça Imaginária (fictícia)', number: '5', cep: '07850400', lat: -23.3235, lng: -46.7270, phone: '11911110009',
    radiusM: 6000, tiers: [{ fromM: 0, toM: 3000, feeCents: 500 }, { fromM: 3000, toM: 6000, feeCents: 800 }], minOrderCents: 2500, freeAboveCents: 9000, pickup: false, approvedDaysAgo: 90, voluntaryExchangeDays: 0,
    hours: [{ weekdays: [1, 2, 3, 4, 5, 6], start: '07:00', end: '18:00' }],
    products: [
      { name: 'Alface crespa (un.)', description: 'Colhida no dia.', category: 'Hortifruti', priceCents: 349, section: 'Verduras', hue: 110, variants: [{ stock: 60, sku: 'HSV-ALF' }] },
      { name: 'Laranja pera (kg)', description: 'Doce, para suco.', category: 'Hortifruti', priceCents: 549, promo: { priceCents: 449, days: 4 }, section: 'Frutas', hue: 35, variants: [{ stock: 80, sku: 'HSV-LAR' }] },
      { name: 'Batata inglesa (kg)', description: 'Lavada.', category: 'Hortifruti', priceCents: 699, section: 'Legumes', hue: 45, variants: [{ stock: 70, sku: 'HSV-BAT' }] },
    ],
  },
  {
    slug: 'casa-e-cia-utilidades', name: 'Casa & Cia Utilidades', owner: 'Lúcia Teste', description: 'Utilidades domésticas, ferramentas e elétrica. (Loja fictícia de teste)',
    category: 'Casa e construção', city: 'caieiras-sp', neighborhood: 'Centro', street: 'Rua das Ferramentas (fictícia)', number: '480', cep: '07700100', lat: -23.3645, lng: -46.7410, phone: '11911110010',
    radiusM: 7000, tiers: [{ fromM: 0, toM: 2500, feeCents: 700 }, { fromM: 2500, toM: 7000, feeCents: 1200 }], minOrderCents: 3000, freeAboveCents: 15000, pickup: true, approvedDaysAgo: 120, voluntaryExchangeDays: 7,
    hours: [{ weekdays: WEEK, start: '08:00', end: '18:00' }],
    products: [
      { name: 'Jogo de panelas (5 peças)', description: 'Antiaderente.', category: 'Utilidades', priceCents: 18990, promo: { priceCents: 15990, days: 12 }, section: 'Cozinha', hue: 210, variants: [{ stock: 8, sku: 'CCU-PAN' }] },
      { name: 'Lâmpada LED 9W', description: 'Luz branca.', category: 'Elétrica', priceCents: 1290, section: 'Elétrica', hue: 55, attributes: ['Luz'], variants: [{ attributes: { Luz: 'Branca' }, stock: 100, sku: 'CCU-LED-B' }, { attributes: { Luz: 'Amarela' }, stock: 3, sku: 'CCU-LED-A' }] },
      { name: 'Martelo 500g', description: 'Cabo emborrachado.', category: 'Ferramentas', priceCents: 3490, section: 'Ferramentas', hue: 0, variants: [{ stock: 15, sku: 'CCU-MAR' }] },
      { name: 'Balde plástico 12L', description: 'Com alça reforçada.', category: 'Utilidades', priceCents: 1990, section: 'Limpeza', hue: 195, variants: [{ stock: 25, sku: 'CCU-BAL' }] },
    ],
  },
  {
    slug: 'moda-passo-firme', name: 'Moda Passo Firme', owner: 'Bruno Teste', description: 'Calçados e roupas casuais. Troca em até 15 dias. (Loja fictícia de teste)',
    category: 'Moda e calçados', city: 'francisco-morato-sp', neighborhood: 'Jardim Santa Rita', street: 'Avenida da Moda (fictícia)', number: '700', cep: '07900600', lat: -23.2750, lng: -46.7480, phone: '11911110011',
    radiusM: 6000, tiers: [{ fromM: 0, toM: 3000, feeCents: 600 }, { fromM: 3000, toM: 6000, feeCents: 1000 }], minOrderCents: 5000, freeAboveCents: 20000, pickup: true, approvedDaysAgo: 5, voluntaryExchangeDays: 15,
    hours: [{ weekdays: WEEK, start: '09:00', end: '19:00' }],
    products: [
      { name: 'Tênis casual', description: 'Solado de borracha.', category: 'Calçados', priceCents: 15990, promo: { priceCents: 12990, days: 9 }, section: 'Calçados', hue: 320, attributes: ['Tamanho', 'Cor'], variants: [{ attributes: { Tamanho: '39', Cor: 'Preto' }, stock: 6, sku: 'MPF-TEN-39P' }, { attributes: { Tamanho: '40', Cor: 'Preto' }, stock: 2, sku: 'MPF-TEN-40P' }, { attributes: { Tamanho: '41', Cor: 'Branco' }, stock: 0, sku: 'MPF-TEN-41B' }] },
      { name: 'Camiseta básica', description: 'Algodão.', category: 'Roupas', priceCents: 4990, section: 'Roupas', hue: 260, attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 12, sku: 'MPF-CAM-P' }, { attributes: { Tamanho: 'M' }, stock: 15, sku: 'MPF-CAM-M' }, { attributes: { Tamanho: 'G' }, stock: 4, sku: 'MPF-CAM-G' }] },
      { name: 'Sandália rasteira', description: 'Confortável.', category: 'Calçados', priceCents: 7990, section: 'Calçados', hue: 340, attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: '36' }, stock: 5, sku: 'MPF-SAN-36' }, { attributes: { Tamanho: '37' }, stock: 5, sku: 'MPF-SAN-37' }] },
    ],
  },
  {
    slug: 'clinica-pet-patas', name: 'Patas & Cia Pet', owner: 'Vera Teste', description: 'Rações e brinquedos. (Loja fictícia de teste)',
    category: 'Pet', city: 'caieiras-sp', neighborhood: 'Laranjeiras', street: 'Rua dos Bichos (fictícia)', number: '90', cep: '07700200', lat: -23.3590, lng: -46.7350, phone: '11911110012',
    radiusM: 5000, tiers: tier(5000, 700), minOrderCents: 3500, freeAboveCents: 12000, pickup: false, approvedDaysAgo: 200, voluntaryExchangeDays: 0, paused: true,
    hours: [{ weekdays: WEEK, start: '09:00', end: '18:00' }],
    products: [
      { name: 'Ração cães adultos 10kg', description: 'Sabor carne.', category: 'Ração', priceCents: 15990, section: 'Ração', hue: 25, variants: [{ stock: 10, sku: 'PCP-RAC' }] },
      { name: 'Bolinha de borracha', description: 'Brinquedo resistente.', category: 'Acessórios', priceCents: 1590, section: 'Brinquedos', hue: 120, variants: [{ stock: 30, sku: 'PCP-BOL' }] },
    ],
  },
  {
    slug: 'papelaria-ponto-certo', name: 'Papelaria Ponto Certo', owner: 'Nilton Teste', description: 'Material escolar e de escritório. (Loja fictícia de teste)',
    category: 'Papelaria', city: 'franco-da-rocha-sp', neighborhood: 'Vila Lanfranchi', street: 'Rua do Caderno (fictícia)', number: '33', cep: '07850500', lat: -23.3190, lng: -46.7230, phone: '11911110013',
    radiusM: 4000, tiers: tier(4000, 500), minOrderCents: 1500, freeAboveCents: 6000, pickup: true, approvedDaysAgo: 60, voluntaryExchangeDays: 7,
    hours: [{ weekdays: WEEK, start: '08:00', end: '19:00' }],
    products: [
      { name: 'Caderno 10 matérias', description: 'Capa dura.', category: 'Material escolar', priceCents: 3490, promo: { priceCents: 2990, days: 6 }, section: 'Cadernos', hue: 230, variants: [{ stock: 40, sku: 'PPC-CAD' }] },
      { name: 'Caneta esferográfica (10 un.)', description: 'Tinta azul.', category: 'Escritório', priceCents: 1890, section: 'Escrita', hue: 215, variants: [{ stock: 60, sku: 'PPC-CAN' }] },
    ],
  },
];

const CUSTOMERS = [
  { slug: 'ana', name: 'Ana Cliente Teste', lat: -23.2801, lng: -46.7440, cep: '07900100', neighborhood: 'Centro', city: 'francisco-morato-sp', street: 'Rua do Teste', number: '100' },
  { slug: 'bruno', name: 'Bruno Cliente Teste', lat: -23.3215, lng: -46.7265, cep: '07850100', neighborhood: 'Centro', city: 'franco-da-rocha-sp', street: 'Rua da Prova', number: '45' },
  { slug: 'carla', name: 'Carla Cliente Teste', lat: -23.3640, lng: -46.7405, cep: '07700100', neighborhood: 'Centro', city: 'caieiras-sp', street: 'Rua do Exemplo', number: '8' },
  { slug: 'diego', name: 'Diego Cliente Teste', lat: -23.2760, lng: -46.7290, cep: '07900400', neighborhood: 'Jardim Dos Eucaliptos', city: 'francisco-morato-sp', street: 'Rua Modelo', number: '221' },
  { slug: 'elisa', name: 'Elisa Cliente Teste', lat: -23.2705, lng: -46.7510, cep: '07900200', neighborhood: 'Jardim Alegria', city: 'francisco-morato-sp', street: 'Rua Fictícia', number: '17' },
  { slug: 'fabio', name: 'Fábio Cliente Teste', lat: -23.2890, lng: -46.7380, cep: '07900300', neighborhood: 'Vila Rosa', city: 'francisco-morato-sp', street: 'Rua Imaginária', number: '63' },
];

const COMMENTS: Record<number, string[]> = {
  5: ['Chegou rápido e tudo certo.', 'Atendimento excelente, recomendo.', 'Produto exatamente como na foto.'],
  4: ['Bom, só demorou um pouco.', 'Gostei, voltarei a comprar.', 'Tudo certo, embalagem simples.'],
  3: ['Regular, esperava mais.', 'Entrega ok, produto mediano.'],
  2: ['Atrasou bastante.', 'Veio diferente do anúncio.'],
  1: ['Não gostei da experiência.'],
};

export async function seedOnda3(db: Db, options: SeedOnda2Options = {}): Promise<void> {
  const log = options.log ?? (() => undefined);
  if (options.production || process.env.NODE_ENV === 'production') throw new Error('Seed de demonstração não roda em produção');
  const password = options.merchantPassword ?? DEV_SEED_MERCHANT_PASSWORD;

  // 1. Mais lojas e produtos (mesma rotina da Onda 2; pula as que já existem).
  await seedStores(db, SEED_STORES_ONDA3, options);

  // 2. Clientes de teste com endereço padrão.
  const passwords = new PasswordService();
  passwords.assertPolicy(password, 8);
  const passwordHash = await passwords.hash(password);
  const allCities = await db.select().from(cities);
  const docs = await db.select().from(legalDocuments);
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const email = `cliente.${c.slug}@seed.webag.local`;
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db.insert(users).values({ email, name: c.name, passwordHash, emailVerifiedAt: new Date(), adultDeclaredAt: new Date(), passwordChangedAt: new Date() }).returning();
      if (!user) continue;
      await db.insert(userRoles).values({ userId: user.id, role: 'customer' });
      for (const type of ['customer_terms', 'privacy'] as const) {
        const latest = docs.filter((d) => d.type === type).sort((a, b) => b.version - a.version)[0];
        if (latest) await db.insert(termsAcceptances).values({ userId: user.id, documentId: latest.id, platform: 'seed' });
      }
      const city = allCities.find((x) => x.slug === c.city);
      await db.insert(userAddresses).values({ userId: user.id, label: 'home', cep: c.cep, street: c.street, number: c.number, neighborhood: c.neighborhood, cityName: city?.name ?? '', state: 'SP', cityId: city?.id ?? null, lat: c.lat, lng: c.lng, isDefault: true });
      log(`cliente ${email}: criado com endereço padrão`);
    }
    customerIds.push(user.id);
  }

  // 3. Avaliações: só nas lojas que ainda não têm nenhuma (idempotente). Algumas lojas ficam com menos de 3 ("Novo").
  const allStores = await db.select().from(stores).where(eq(stores.status, 'approved'));
  const seedStoreRows = allStores.filter((s) => s.documentNumber.length === 11).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  for (const [i, store] of seedStoreRows.entries()) {
    const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.storeId, store.id));
    if (count > 0) continue;
    const howMany = [0, 2, 5, 7, 4, 6, 3, 8, 1, 5, 6, 4, 7][i % 13]!;
    const storeProducts = await db.select().from(products).where(eq(products.storeId, store.id));
    for (let r = 0; r < howMany; r += 1) {
      const rating = [5, 4, 5, 3, 4, 5, 2, 4][(i + r) % 8]!;
      const comments = COMMENTS[rating]!;
      const product = r % 3 === 2 ? storeProducts[r % Math.max(storeProducts.length, 1)] : undefined;
      await db.insert(reviews).values({
        storeId: store.id,
        productId: product?.id ?? null,
        userId: customerIds[(i + r) % customerIds.length]!,
        rating,
        comment: comments[(i + r) % comments.length]!,
        storeReply: r === 0 && rating >= 4 ? 'Obrigado pela avaliação! Volte sempre.' : null,
        storeRepliedAt: r === 0 && rating >= 4 ? new Date() : null,
        createdAt: new Date(Date.now() - (r * 3 + i) * 86_400_000),
      });
    }
    if (howMany > 0) log(`avaliações de ${store.name}: ${howMany}`);
  }

  // 4. Cupons (códigos públicos de teste).
  const firstStore = seedStoreRows.find((s) => s.name === 'Moda Passo Firme') ?? seedStoreRows[0];
  const couponSeeds = [
    { code: 'BEMVINDO10', kind: 'percent' as const, scope: 'platform' as const, value: 10, percentCapCents: 1500, minOrderCents: 3000, firstPurchaseOnly: true, maxUses: 100 as number | null },
    { code: 'FRETEGRATIS', kind: 'free_shipping' as const, scope: 'platform' as const, value: 0, percentCapCents: null, minOrderCents: 5000, firstPurchaseOnly: false, maxUses: 500 },
    ...(firstStore ? [{ code: 'LOJA5', kind: 'fixed' as const, scope: 'store' as const, value: 500, percentCapCents: null, minOrderCents: 2000, firstPurchaseOnly: false, maxUses: 100, storeId: firstStore.id }] : []),
  ];
  for (const c of couponSeeds) {
    await db
      .insert(coupons)
      .values({ ...c, storeId: 'storeId' in c ? c.storeId : null, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 90 * 86_400_000) })
      .onConflictDoNothing();
    // BUG-023 (SEC-170d): cupom de primeira compra sempre com teto de usos; a semeadura repetida completa o que ficou sem teto, sem mexer em outro campo.
    if (c.maxUses !== null) await db.update(coupons).set({ maxUses: sql`coalesce(${coupons.maxUses}, ${c.maxUses})` }).where(sql`upper(${coupons.code}) = ${c.code}`);
  }

  // 5. Favoritos das duas primeiras clientes.
  const someProducts = await db.select({ id: products.id }).from(products).where(eq(products.status, 'active')).limit(4);
  for (const [i, userId] of customerIds.slice(0, 2).entries()) {
    for (const store of seedStoreRows.slice(i, i + 2)) await db.insert(favorites).values({ userId, storeId: store.id }).onConflictDoNothing();
    for (const product of someProducts.slice(i, i + 2)) await db.insert(favorites).values({ userId, productId: product.id }).onConflictDoNothing();
  }

  // 6. Banners 2:1 (arte SÓLIDA do kit v3, gerada em `banner-art.ts`; precisam de armazenamento para as imagens; sem ele, a home fica sem banner).
  // Idempotente por banner: os ARQUIVOS (`media/<asset>/<largura>.webp`) são reenviados a cada execução (cobre o armazenamento recriado, o bucket
  // vazio e a troca de arte), e a linha do banner só nasce quando a home ainda não tem nenhum (não mexe em banner curado no admin).
  if (options.storage) {
    const storage = options.storage;
    try {
      const [admin] = await db.select().from(users).where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@webag.local'));
      const ownerId = admin?.id ?? customerIds[0]!;
      const mercado = (await db.select().from(categories)).find((c) => c.name === 'Mercado');
      const [anyBanner] = await db.select({ id: banners.id }).from(banners).limit(1);
      const bannerSeeds: (BannerArt & { title: string; destinationType: 'coupon' | 'category' | 'store'; destinationCode: string | null; destinationId: string | null })[] = [
        { title: 'Frete grátis acima de R$ 50', theme: 'lime', object: 'bag', lines: ['Frete grátis', 'acima de R$ 50'], cta: 'Usar cupom', destinationType: 'coupon', destinationCode: 'FRETEGRATIS', destinationId: null },
        { title: 'Tudo para o seu mercado', theme: 'ink', object: 'basket', lines: ['Tudo para o', 'seu mercado'], cta: 'Ver mercado', destinationType: 'category', destinationCode: null, destinationId: mercado?.id ?? null },
        { title: 'Novidades na Moda Passo Firme', theme: 'purple', object: 'sneaker', lines: ['Novidades na', 'Moda Passo Firme'], cta: 'Ver loja', destinationType: 'store', destinationCode: null, destinationId: firstStore?.id ?? null },
      ];
      let uploaded = 0;
      for (const [position, b] of bannerSeeds.entries()) {
        const base = await bannerImage(b);
        const objectKey = `seed/banner-${position}`;
        const [existing] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.objectKey, objectKey), eq(mediaAssets.purpose, 'banner')));
        if (!existing && anyBanner) continue; // home já curada: não cria banner de demonstração
        const assetId = existing?.id ?? randomUUID();
        // Arquivos ANTES das linhas: se o armazenamento falhar, não sobra registro apontando para arquivo inexistente.
        const variants: Record<string, string> = {};
        for (const width of [400, 800, 1200]) {
          const key = `media/${assetId}/${width}.webp`;
          await storage.putObject('public', key, await renderVariant(base, width), 'image/webp');
          variants[String(width)] = key;
          uploaded += 1;
        }
        if (!existing) {
          await db.insert(mediaAssets).values({ id: assetId, ownerUserId: ownerId, storeId: null, purpose: 'banner', status: 'ready', objectKey, declaredContentType: 'image/png', declaredSizeBytes: base.length, contentType: 'image/png', sizeBytes: base.length, width: 1200, height: 600, variants, expiresAt: new Date(), completedAt: new Date() });
          await db.insert(banners).values({ title: b.title, imageAssetId: assetId, cityId: null, destinationType: b.destinationType, destinationId: b.destinationId, destinationCode: b.destinationCode, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 60 * 86_400_000), position });
        } else {
          await db.update(mediaAssets).set({ variants, contentType: 'image/png', sizeBytes: base.length, width: 1200, height: 600, status: 'ready' }).where(eq(mediaAssets.id, assetId));
        }
        // A URL pública tem de resolver (bucket público inexistente ou sem leitura anônima = 404/403 aqui, e o app mostraria imagem quebrada).
        const url = storage.publicUrl(variants['800']!);
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5_000) }).catch(() => null);
        if (!res?.ok) log(`ATENÇÃO: ${url} respondeu ${res ? res.status : 'sem resposta'}: confira o bucket público e a leitura anônima (storage-init) e o S3_PUBLIC_URL`);
      }
      log(`banners da home: ${uploaded / 3} com arquivos enviados ao armazenamento`);
    } catch (error) {
      log(`armazenamento indisponível (${error instanceof Error ? error.message.slice(0, 120) : 'erro'}): home segue sem banner. Suba o storage e o storage-init e rode o seed de novo`);
    }
  }
  log(`seed da Onda 3 concluído. Clientes de teste: cliente.<nome>@seed.webag.local (senha ${options.production ? 'de SEED_MERCHANT_PASSWORD' : DEV_SEED_MERCHANT_PASSWORD}); cupons: BEMVINDO10, FRETEGRATIS, LOJA5`);
}
