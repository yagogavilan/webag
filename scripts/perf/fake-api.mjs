// API falsa do app do cliente, só para MEDIR desempenho (`pnpm perf:app`). Dados determinísticos no formato do contrato
// (docs/arquitetura/api/openapi.yaml), latência de servidor configurável e fotos geradas em WebP nos tamanhos reais da API (120/400/800).
// Nada aqui vai para produção; não valida regra de negócio. Uso: importado por scripts/perf-app.mjs (ou `node scripts/perf/fake-api.mjs`).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sharp = createRequire(resolve(root, 'apps/mobile/package.json'))('sharp');

const money = (amount) => ({ amount, currency: 'BRL' });
const iso = () => new Date().toISOString();

// ---- Fotos: ruído suave + gradiente, comprimidas até o peso típico de cada variante (≈ 5 KB / 25 KB / 70 KB) ----
const VARIANTS = { 120: { q: 55 }, 400: { q: 62 }, 800: { q: 68 } };
const IMAGE_KINDS = 6;
const imageCache = new Map();
async function makeImage(width, n) {
  const key = `${width}-${n}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const h = Math.round(width * 0.75);
  const raw = Buffer.alloc(width * h * 3);
  let seed = 1234 + n * 977 + width;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // blocos suaves (parece foto de produto: fundo liso + objeto) com pouco ruído
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const cx = x / width - 0.5;
      const cy = y / h - 0.5;
      const inside = cx * cx + cy * cy < 0.09;
      const base = inside ? [60 + n * 30, 90 + n * 15, 160 - n * 20] : [236, 232, 240];
      const noise = (rnd() - 0.5) * (inside ? 26 : 8);
      raw[i] = Math.max(0, Math.min(255, base[0] + noise + y * 0.05));
      raw[i + 1] = Math.max(0, Math.min(255, base[1] + noise));
      raw[i + 2] = Math.max(0, Math.min(255, base[2] + noise));
    }
  }
  const buffer = await sharp(raw, { raw: { width, height: h, channels: 3 } }).webp({ quality: VARIANTS[width]?.q ?? 60 }).toBuffer();
  imageCache.set(key, buffer);
  return buffer;
}

// ---- Dados ----
const CATEGORIES = ['Casa e utilidades', 'Calçados', 'Moda', 'Mercado', 'Beleza', 'Pet', 'Brinquedos', 'Papelaria'].map((name, i) => ({
  id: `cat-${i}`, parentId: null, name, icon: 'house', position: i + 1, active: true, createdAt: iso(), updatedAt: iso(), children: [],
}));

export function buildData(base) {
  const img = (n, sizes = [120, 400, 800]) => ({ urls: Object.fromEntries(sizes.map((w) => [String(w), `${base}/img/${w}/${n % IMAGE_KINDS}.webp`])) });
  const rating = (avg = 4.7, count = 80) => ({ average: avg, count, isNew: false });
  const stores = Array.from({ length: 14 }, (_, i) => ({
    id: `s${i + 1}`,
    name: ['Casa Bela', 'Mercadinho Boa Compra', 'Calçados Veloz', 'Moda Morato', 'Pet Amigo', 'Papelaria Central', 'Beleza Pura', 'Brinquedos Alegria', 'Utilidades 10', 'Doce Lar', 'Tem de Tudo', 'Padaria Real', 'Ótica Visão', 'Farmácia Vida'][i],
    logo: img(i, [120]),
    mainCategoryId: `cat-${i % 8}`,
    open: i % 5 !== 4,
    opensAt: null,
    distanceM: 400 + i * 350,
    rating: rating(4 + (i % 10) / 10, 20 + i * 7),
    delivery: { available: true, feeCents: 400 + (i % 4) * 100, freeShipping: false, freeAboveCents: 0, minOrderCents: 2000, etaMinMinutes: 25, etaMaxMinutes: 45 },
    pickupEnabled: true,
    acceptsExchange: true,
  }));
  const productNames = ['Tênis Corrida Veloz', 'Camiseta Básica', 'Panela de Pressão 5L', 'Ração Premium 3kg', 'Caderno Universitário', 'Shampoo Hidratante', 'Boneca Articulada', 'Jogo de Toalhas', 'Mochila Escolar', 'Fone sem fio', 'Garrafa Térmica', 'Kit de Canetas'];
  const productCard = (i, storeIdx = i % stores.length) => ({
    id: `p${i + 1}`,
    name: productNames[i % productNames.length] + (i >= productNames.length ? ` ${Math.floor(i / productNames.length) + 1}` : ''),
    image: img(i, [400]),
    price: money(2990 + i * 410),
    originalPrice: i % 2 ? money(3990 + i * 410) : null,
    discountPercent: i % 2 ? 25 : null,
    categoryId: `cat-${i % 8}`,
    store: { id: stores[storeIdx].id, name: stores[storeIdx].name, open: true, opensAt: null, distanceM: stores[storeIdx].distanceM },
  });
  const home = {
    mode: 'delivery',
    empty: false,
    nearbyStores: stores.slice(0, 12),
    newStores: stores.slice(12).map((s) => ({ ...s })),
    offers: Array.from({ length: 8 }, (_, i) => productCard(i)),
    bestSellers: Array.from({ length: 5 }, (_, i) => productCard(i + 8)),
    availableCategoryIds: CATEGORIES.map((c) => c.id),
  };
  const browseStore = (s) => ({
    id: s.id,
    name: s.name,
    description: 'Casa e utilidades para o dia a dia',
    logo: s.logo,
    cover: img(3, [400, 800]),
    mainCategoryId: s.mainCategoryId,
    rating: s.rating,
    open: s.open,
    opensAt: null,
    hoursToday: [{ start: '08:00', end: '20:00' }],
    delivery: { available: true, distanceM: s.distanceM, feeCents: s.delivery.feeCents, freeShipping: false, freeAboveCents: 12000, minOrderCents: 2000, etaMinMinutes: 25, etaMaxMinutes: 45, acceptsDelivery: true },
    pickup: { enabled: true, offered: true, address: 'Rua A, 10', instructions: null, prepMinMinutes: 20, prepMaxMinutes: 30 },
    exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 500, version: 1 },
    supplier: { name: `${s.name} Comércio Ltda`, documentType: 'cnpj', documentMasked: '12.345.678/****-**', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' } },
    sections: [{ id: 'sec-1', name: 'Mais pedidos' }, { id: 'sec-2', name: 'Ofertas' }],
  });
  const storeProducts = (storeId, cursor, limit = 20) => {
    const all = Array.from({ length: 45 }, (_, i) => ({
      id: `${storeId}-p${i + 1}`,
      name: productNames[i % productNames.length] + (i >= productNames.length ? ` ${Math.floor(i / productNames.length) + 1}` : ''),
      sectionId: i % 2 ? 'sec-1' : 'sec-2',
      image: img(i, [400]),
      price: money(1990 + i * 130),
      originalPrice: null,
      discountPercent: null,
      available: true,
    }));
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + limit);
    return { data: page, nextCursor: start + limit < all.length ? String(start + limit) : null };
  };
  const product = (id) => {
    const storeId = id.includes('-p') ? id.split('-p')[0] : 's1';
    const idx = Number(id.replace(/^.*p/, '')) || 1;
    const store = stores.find((s) => s.id === storeId) ?? stores[0];
    return {
      id,
      name: productNames[(idx - 1) % productNames.length],
      description: 'Produto de boa qualidade, entrega rápida na região de Francisco Morato.',
      categoryId: 'cat-1',
      available: true,
      unavailableReason: null,
      price: money(8990),
      originalPrice: money(11990),
      discountPercent: 25,
      variantAttributes: ['Tamanho'],
      variants: ['40', '42', '44'].map((t, k) => ({ id: `${id}-v${t}`, attributes: { Tamanho: t }, price: money(8990), originalPrice: null, discountPercent: null, available: k < 2, maxQuantity: k < 2 ? 5 : 0, lastUnits: null })),
      images: [0, 1, 2].map((k) => ({ id: `i${k}`, position: k, urls: { 800: `${base}/img/800/${(idx + k) % IMAGE_KINDS}.webp`, 400: `${base}/img/400/${(idx + k) % IMAGE_KINDS}.webp` } })),
      rating: rating(4.6, 38),
      store: { id: store.id, name: store.name, open: true, opensAt: null, hoursToday: [{ start: '08:00', end: '20:00' }] },
    };
  };
  return { stores, home, browseStore, storeProducts, product };
}

// ---- Estado (sessão, sacola, pedidos) ----
export async function startFakeApi({ port = 3998, latencyMs = 60, host = '127.0.0.1' } = {}) {
  const base = `http://${host}:${port}`;
  const data = buildData(base);
  await Promise.all(Object.keys(VARIANTS).flatMap((w) => Array.from({ length: IMAGE_KINDS }, (_, n) => makeImage(Number(w), n))));
  const user = { id: 'u1', email: 'cliente.ana@seed.webag.local', emailVerified: true, name: 'Ana Souza' };
  let cart = null;
  let addresses = [];
  const orders = new Map();
  const log = { requests: 0 };

  const summary = (items) => {
    const subtotal = items.reduce((t, i) => t + i.lineTotal.amount, 0);
    return { subtotal: money(subtotal), delivery: money(500), deliveryEstimated: false, freeShipping: false, serviceFee: money(200), discount: money(0), total: money(subtotal + 700), minimumTotalApplied: false, platformDiscountCapped: false, missingForMinimum: null };
  };
  const buildCart = () => ({
    id: 'cart1', revision: 1,
    store: { id: cart.store.id, name: cart.store.name, logo: cart.store.logo, open: true, opensAt: null, etaMinMinutes: 25, etaMaxMinutes: 45, minOrder: money(2000) },
    items: cart.items, coupon: null,
    delivery: { mode: 'delivery', addressId: null, available: true, distanceM: 1200, feeFromCents: 500, estimated: false },
    summary: summary(cart.items),
    checkout: { canCheckout: true, blockers: [], opensAt: null },
    notices: [],
  });
  const emptyCart = () => ({ id: null, revision: 0, store: null, items: [], coupon: null, delivery: { mode: 'delivery', addressId: null, available: true, distanceM: null, feeFromCents: null, estimated: true }, summary: { ...summary([]), total: money(0), delivery: money(0), serviceFee: money(0) }, checkout: { canCheckout: false, blockers: ['EMPTY'], opensAt: null }, notices: [] });
  const addItem = (variantId, quantity) => {
    const m = /^(.*)-v(\d+)$/.exec(variantId);
    const productId = m ? m[1] : variantId;
    const p = data.product(productId);
    const store = data.stores.find((s) => s.id === p.store.id) ?? data.stores[0];
    cart ??= { store, items: [] };
    const found = cart.items.find((i) => i.variantId === variantId);
    const unit = 8990;
    if (quantity <= 0) cart.items = cart.items.filter((i) => i.variantId !== variantId);
    else if (found) { found.quantity = quantity; found.lineTotal = money(unit * quantity); }
    else cart.items.push({ id: `ci-${variantId}`, variantId, productId, name: p.name, attributes: { Tamanho: m?.[2] ?? '40' }, image: p.images[0] ? { urls: p.images[0].urls } : { urls: {} }, quantity, unitPrice: money(unit), originalUnitPrice: null, lineTotal: money(unit * quantity), available: true, maxQuantity: 5, warnings: [] });
  };
  const order = (id, status = 'received', paid = false) => {
    const items = (cart?.items ?? []).map((i) => ({ productId: i.productId, variantId: i.variantId, name: i.name, attributes: i.attributes, image: i.image, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal }));
    return {
      tracking: null, id, number: '#1042', status, mode: 'delivery', createdAt: iso(), updatedAt: iso(),
      store: { id: 's1', name: 'Casa Bela', logo: img0(), whatsapp: '11987654321' },
      items, summary: summary(cart?.items ?? []), couponCode: null,
      delivery: { address: { id: 'a1', label: 'home', cep: '07900000', street: 'Rua das Palmeiras', number: '120', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', cityId: null, lat: -23.28, lng: -46.74, isDefault: true, createdAt: iso() }, etaMinMinutes: 30, etaMaxMinutes: 45 },
      pickup: null, payment: { method: 'pix', status: paid ? 'approved' : 'pending' }, exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 500, version: 1 },
      timeline: [{ status: 'received', at: iso(), actor: 'system', reason: null }], allowedActions: ['cancel', 'contact_store'], cancellation: null,
    };
  };
  const img0 = () => ({ urls: { 120: `${base}/img/120/0.webp` } });
  const paidOrders = new Set();

  const send = (res, status, body, extra = {}) => {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'cache-control': 'no-store', ...extra });
    res.end(text);
  };
  const readBody = (req) => new Promise((done) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => done(b ? JSON.parse(b) : {})); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', base);
    const p = url.pathname;
    log.requests++;
    if (process.env.PERF_DEBUG && req.method !== 'GET') console.log('[fake-api]', req.method, req.url);
    if (req.method === 'OPTIONS') return send(res, 204);
    const imageMatch = /^\/img\/(\d+)\/(\d+)\.webp$/.exec(p);
    if (imageMatch) {
      const buf = await makeImage(Number(imageMatch[1]), Number(imageMatch[2]));
      res.writeHead(200, { 'content-type': 'image/webp', 'content-length': buf.length, 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': 'public, max-age=31536000, immutable' });
      return res.end(buf);
    }
    if (latencyMs > 0) await sleep(latencyMs);
    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
    let m;
    if (p === '/health') return send(res, 200, { ok: true });
    if (p === '/v1/config/maintenance') return send(res, 200, { active: false, message: null, expectedBackAt: null });
    if (p === '/v1/regions') return send(res, 200, { data: [{ id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'francisco-morato', neighborhoods: [{ id: 'n1', name: 'Centro' }, { id: 'n2', name: 'Jardim Fortaleza' }] }, { id: 'c2', name: 'Franco da Rocha', state: 'SP', slug: 'franco-da-rocha', neighborhoods: [] }], nextCursor: null });
    if (p === '/v1/categories') return send(res, 200, { data: CATEGORIES, nextCursor: null });
    if (p === '/v1/banners') return send(res, 200, { data: [0, 1, 2].map((i) => ({ id: `b${i}`, title: `Oferta ${i + 1}`, image: { urls: { 800: `${base}/img/800/${i}.webp`, 400: `${base}/img/400/${i}.webp` } }, destination: { type: 'store', id: `s${i + 1}`, code: null }, position: i })) });
    if (p === '/v1/home') return send(res, 200, data.home);
    if ((m = /^\/v1\/browse\/stores\/([^/]+)$/.exec(p))) { const s = data.stores.find((x) => x.id === m[1]); return s ? send(res, 200, data.browseStore(s)) : send(res, 404, { code: 'NOT_FOUND', status: 404, title: 'x' }); }
    if ((m = /^\/v1\/browse\/stores\/([^/]+)\/products$/.exec(p))) return send(res, 200, data.storeProducts(m[1], url.searchParams.get('cursor'), Number(url.searchParams.get('limit') ?? 20)));
    if ((m = /^\/v1\/browse\/stores\/([^/]+)\/reviews$/.exec(p))) return send(res, 200, { data: [], nextCursor: null });
    if ((m = /^\/v1\/browse\/products\/([^/]+)$/.exec(p))) return send(res, 200, data.product(m[1]));
    if ((m = /^\/v1\/browse\/products\/([^/]+)\/reviews$/.exec(p))) return send(res, 200, { data: [], nextCursor: null });
    if (p === '/v1/auth/login') return send(res, 200, { user, tokens: { accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresIn: 900, tokenType: 'Bearer' }, mfaSetupRequired: false });
    if (p === '/v1/auth/refresh') return send(res, 200, { accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresIn: 900, tokenType: 'Bearer' });
    if (p === '/v1/me') return send(res, 200, { ...user, phone: null, roles: ['customer'], adminProfile: null, pendingTerms: [] });
    if (p === '/v1/me/favorites') return send(res, 200, { data: [], nextCursor: null });
    if ((m = /^\/v1\/cep\/(\d{8})$/.exec(p))) return send(res, 200, { cep: m[1], street: 'Rua das Palmeiras', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 });
    if (p === '/v1/me/addresses' && req.method === 'POST') {
      const a = { id: 'a1', label: body.label ?? 'home', cep: body.cep ?? '07900000', street: body.street ?? '', number: body.number ?? '', complement: body.complement ?? null, neighborhood: body.neighborhood ?? '', city: body.city ?? 'Francisco Morato', state: body.state ?? 'SP', cityId: null, lat: body.lat ?? -23.28, lng: body.lng ?? -46.74, pinVerified: false, isDefault: true, createdAt: iso(), updatedAt: iso() };
      addresses = [a];
      return send(res, 201, a);
    }
    if (p === '/v1/me/addresses') return send(res, 200, { data: addresses, nextCursor: null });
    if ((m = /^\/v1\/me\/addresses\/([^/]+)$/.exec(p))) { const a = addresses.find((x) => x.id === m[1]); return a ? send(res, 200, { ...a, ...body }) : send(res, 404, { status: 404, code: 'NOT_FOUND', title: 'x' }); }
    if (p === '/v1/cart/merge') { for (const i of body.items ?? []) addItem(i.variantId, i.quantity); return send(res, 200, cart ? buildCart() : emptyCart()); }
    if (p === '/v1/cart' && req.method === 'GET') return send(res, 200, cart ? buildCart() : emptyCart());
    if ((m = /^\/v1\/cart\/items\/(.+)$/.exec(p))) { if (req.method === 'PUT') addItem(decodeURIComponent(m[1]), body.quantity); else addItem(decodeURIComponent(m[1]), 0); return send(res, 200, cart ? buildCart() : emptyCart()); }
    if (p === '/v1/orders' && req.method === 'POST') { const o = order('11111111-1111-4111-8111-111111111111', 'awaiting_payment'); orders.set(o.id, o); return send(res, 201, o); }
    if (p === '/v1/orders' && req.method === 'GET') return send(res, 200, { data: [...orders.values()].map((o) => ({ id: o.id, number: o.number, status: o.status, mode: o.mode, store: o.store, itemCount: o.items.length, firstItemName: o.items[0]?.name ?? '', firstItemImage: o.items[0]?.image ?? { urls: {} }, total: o.summary.total, createdAt: o.createdAt })), nextCursor: null });
    if ((m = /^\/v1\/orders\/([^/]+)\/payment$/.exec(p))) return send(res, 200, { method: 'pix', status: paidOrders.has(m[1]) ? 'approved' : 'pending', amount: money(10000), pix: { copyPaste: '00020126TESTE-PIX-COPIA-E-COLA', qrCodeBase64: null, expiresAt: new Date(Date.now() + 14 * 60_000).toISOString() }, installments: 1, declineReason: null, updatedAt: iso() });
    if ((m = /^\/v1\/orders\/([^/]+)$/.exec(p))) { const o = orders.get(m[1]) ?? order(m[1], 'awaiting_payment'); if (paidOrders.has(m[1])) { o.payment.status = 'approved'; o.status = 'received'; } return send(res, 200, o); }
    if ((m = /^\/v1\/dev\/orders\/([^/]+)\/payment\/approve$/.exec(p))) { paidOrders.add(m[1]); return send(res, 200, {}); }
    if (p.startsWith('/v1/')) { console.warn(`[fake-api] sem rota: ${req.method} ${p}`); return send(res, 404, { type: 'about:blank', title: 'Sem rota (API falsa de desempenho)', status: 404, code: 'NOT_FOUND' }); }
    return send(res, 404, {});
  });
  await new Promise((done) => server.listen(port, host, done));
  return { base, log, close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }), reset: () => { cart = null; addresses = []; orders.clear(); paidOrders.clear(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const api = await startFakeApi({ port: Number(process.env.PORT ?? 3998) });
  console.log(`[fake-api] no ar em ${api.base}`);
}
