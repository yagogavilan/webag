#!/usr/bin/env node
// Invalidação da vitrine pelos CAMINHOS DE ESCRITA NOVOS da v1.1 R1 (DEC-113: até 5 s) contra a API REAL compilada, com os caches LIGADOS nos TTLs de produção
// (FEED_DIRECTORY_TTL_SECONDS=15, HOME_SECTIONS_TTL_SECONDS=60, BROWSE_CACHE_TTL_SECONDS=10) e relógio real. Complementa `invalidacao-vitrine.mjs` (moderação e suspensão):
//   R1-A  admin PAUSA a loja (WB-351)        -> `open` da página da loja vira false
//   R1-B  admin renomeia a loja (WB-351)     -> nome novo na página da loja
//   R1-C  lojista reajusta o preço em massa (WB-377, `bulk` price_adjust) -> preço novo na página do produto e na vitrine
//   R1-D  lojista pausa o produto em massa    -> some da vitrine e a página mostra indisponível
//   R1-E  importação CSV `onExisting=update` muda o preço (SEC-213) -> preço novo na página e na vitrine
// Uso: API_URL=http://127.0.0.1:3400 QA_TOTP_FILE=/caminho/totp.txt node docs/qa/performance/invalidacao-r1.mjs   (mesmo ambiente de docs/qa/retestes/lib.mjs; seed padrão)
import { randomUUID } from 'node:crypto';
import { adminCall, api, API, finish, LAT, LNG, record, sleep, sql, store } from '../retestes/lib.mjs';

const LIMIT_MS = 5000;
const s = await store();
const Q = `lat=${LAT}&lng=${LNG}`;
const get = async (path) => (await api('GET', path)).data;
const owner = (method, path, body, headers = {}) => api(method, path, { token: s.owner, body, headers });
/** Espera `probe()` devolver `want`; ms desde `since` (consulta a cada 200 ms; null = não chegou em 12 s). */
async function until(probe, want, since) {
  while (Date.now() - since < 12_000) {
    if ((await probe()) === want) return Date.now() - since;
    await sleep(200);
  }
  return null;
}
const warm = async (...probes) => {
  for (let i = 0; i < 3; i++) for (const p of probes) await p();
};
const pageStore = () => get(`/v1/browse/stores/${s.id}?${Q}`);
const pageProduct = (id) => get(`/v1/browse/products/${id}`);
const vitrinePrice = async (id) => (await get(`/v1/browse/stores/${s.id}/products?limit=50`)).data?.find((p) => p.id === id)?.price?.amount ?? null;
const reason = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
const overview = async () => (await adminCall('GET', `/v1/admin/stores/${s.id}/overview`)).data;

// ------------------------------------------------------------------ R1-A e R1-B: edição da loja pelo admin
{
  const original = await pageStore();
  await warm(async () => (await pageStore()).open);
  let v = (await overview()).store.version;
  const t0 = Date.now();
  const paused = await adminCall('POST', `/v1/admin/stores/${s.id}/pause`, { reason, expectedVersion: v, kind: '30m' });
  const ms = await until(async () => (await pageStore()).open, false, Date.now());
  record('R1-A', 'admin PAUSA a loja: a página da loja mostra fechada em até 5 s', paused.status === 200 && ms !== null && ms <= LIMIT_MS, `HTTP ${paused.status} em ${Date.now() - t0} ms; refletiu em ${ms === null ? '>12 s' : `${ms} ms`}`);
  v = (await overview()).store.version;
  const back = Date.now();
  const resumed = await adminCall('POST', `/v1/admin/stores/${s.id}/resume`, { reason, expectedVersion: v });
  const ms2 = await until(async () => (await pageStore()).open, true, back);
  record('R1-A2', 'admin REABRE a loja: volta a aparecer aberta em até 5 s', resumed.status === 200 && ms2 !== null && ms2 <= LIMIT_MS, `HTTP ${resumed.status}; ${ms2 === null ? '>12 s' : `${ms2} ms`}`);

  v = (await overview()).store.version;
  const newName = `${original.name} QA`;
  await warm(async () => (await pageStore()).name);
  const renamed = await adminCall('PATCH', `/v1/admin/stores/${s.id}/profile`, { reason, expectedVersion: v, changes: { name: newName } });
  const ms3 = await until(async () => (await pageStore()).name, newName, Date.now());
  record('R1-B', 'admin renomeia a loja: o nome novo aparece na página em até 5 s', renamed.status === 200 && ms3 !== null && ms3 <= LIMIT_MS, `HTTP ${renamed.status}; ${ms3 === null ? '>12 s' : `${ms3} ms`}`);
  v = (await overview()).store.version;
  await adminCall('PATCH', `/v1/admin/stores/${s.id}/profile`, { reason, expectedVersion: v, changes: { name: original.name } });
}

// ------------------------------------------------------------------ R1-C: reajuste em massa pelo lojista
const productId = s.productId;
const priceNow = async () => (await pageProduct(productId)).price.amount;
const versionOf = () => Number(sql(`select version from products where id = '${productId}'`));
const base = await priceNow();
{
  await warm(priceNow, () => vitrinePrice(productId));
  const action = { type: 'price_adjust', mode: 'percent', value: 10 };
  const preview = await owner('POST', `/v1/stores/${s.id}/products/bulk`, { productIds: [productId], action, dryRun: true });
  const item = preview.data?.preview?.[0];
  const t0 = Date.now();
  const applied = await owner('POST', `/v1/stores/${s.id}/products/bulk`, { productIds: [productId], action, dryRun: false, expectedVersions: [{ productId, version: item?.version }], confirmLargeChange: false }, { 'Idempotency-Key': randomUUID() });
  const want = item?.toCents;
  const msPage = await until(priceNow, want, Date.now());
  const msList = await until(() => vitrinePrice(productId), want, Date.now());
  record('R1-C', `lojista reajusta +10% em massa (R$ ${(base / 100).toFixed(2)} -> ${(want / 100).toFixed(2)}): página e vitrine mostram o preço novo em até 5 s`, applied.status === 200 && msPage !== null && msPage <= LIMIT_MS && msList !== null && msList <= LIMIT_MS, `HTTP ${applied.status} em ${Date.now() - t0} ms; página ${msPage ?? '>12 s'} ms, vitrine ${msList ?? '>12 s'} ms`);
  // restaura pelo caminho de edição normal (também uma escrita de catálogo)
  const back = await owner('PATCH', `/v1/stores/${s.id}/products/${productId}`, { basePriceCents: base });
  const msBack = await until(priceNow, base, Date.now());
  record('R1-C2', 'edição normal volta o preço: refletido em até 5 s', back.status === 200 && msBack !== null && msBack <= LIMIT_MS, `HTTP ${back.status}; ${msBack ?? '>12 s'} ms`);
}

// ------------------------------------------------------------------ R1-D: pausar o produto em massa
{
  await warm(async () => (await pageProduct(productId)).available, () => vitrinePrice(productId));
  const v = versionOf();
  const paused = await owner('POST', `/v1/stores/${s.id}/products/bulk`, { productIds: [productId], action: { type: 'pause' }, dryRun: false, expectedVersions: [{ productId, version: v }] });
  const ms = await until(async () => (await vitrinePrice(productId)) === null, true, Date.now());
  const ms2 = await until(async () => (await pageProduct(productId)).available, false, Date.now());
  record('R1-D', 'lojista PAUSA o produto em massa: some da vitrine e a página fica indisponível em até 5 s', paused.status === 200 && ms !== null && ms <= LIMIT_MS && ms2 !== null && ms2 <= LIMIT_MS, `HTTP ${paused.status}; vitrine ${ms ?? '>12 s'} ms, página ${ms2 ?? '>12 s'} ms`);
  const t = Date.now();
  const resumed = await owner('POST', `/v1/stores/${s.id}/products/bulk`, { productIds: [productId], action: { type: 'resume' }, dryRun: false });
  const ms3 = await until(async () => (await vitrinePrice(productId)) !== null, true, t);
  record('R1-D2', 'lojista REATIVA em massa: volta à vitrine em até 5 s', resumed.status === 200 && ms3 !== null && ms3 <= LIMIT_MS, `HTTP ${resumed.status}; ${ms3 ?? '>12 s'} ms`);
}

// ------------------------------------------------------------------ R1-E: importação CSV (update de preço por código)
{
  const sku = `QAINV${Date.now()}`;
  sql(`update product_variants set sku = '${sku}' where product_id = '${productId}' and active = true and id = (select id from product_variants where product_id = '${productId}' order by created_at limit 1)`);
  const cat = sql(`select c.name from categories c join products p on p.category_id = c.id where p.id = '${productId}'`);
  const target = base + 111;
  const csv = ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', `Banana QA;${cat};;${(target / 100).toFixed(2).replace('.', ',')};;;;;;50;${sku}`].join('\r\n');
  await warm(priceNow, () => vitrinePrice(productId));
  const t0 = Date.now();
  // `api()` serializa o corpo como JSON; a planilha vai como texto puro
  const raw = await fetch(`${API}/v1/stores/${s.id}/products/import?mode=commit&onExisting=update`, { method: 'POST', headers: { authorization: `Bearer ${s.owner}`, 'content-type': 'text/csv', 'idempotency-key': randomUUID(), 'x-forwarded-for': '10.77.1.1' }, body: csv });
  const res = { status: raw.status, data: await raw.json().catch(() => null) };
  record('R1-E0', 'importação CSV (update) respondeu 200 com 1 atualizado', res.status === 200 && res.data?.updated === 1, `HTTP ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`);
  const msPage = await until(priceNow, target, Date.now());
  const msList = await until(() => vitrinePrice(productId), target, Date.now());
  record('R1-E', 'importação CSV muda o preço: página e vitrine refletem em até 5 s', msPage !== null && msPage <= LIMIT_MS && msList !== null && msList <= LIMIT_MS, `em ${Date.now() - t0} ms; página ${msPage ?? '>12 s'} ms, vitrine ${msList ?? '>12 s'} ms`);
  await owner('PATCH', `/v1/stores/${s.id}/products/${productId}`, { basePriceCents: base });
  sql(`update product_variants set sku = null where sku = '${sku}'`);
}
process.exit(finish() === 0 ? 0 : 1);
