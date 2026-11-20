#!/usr/bin/env node
// BUG-027 (limit 1 a 50): os 32 GET com paginação do OpenAPI recusam limit=0, 51, abc, -1 e 1.5 com 400 e aceitam 1 e 50 com 200.
// G4 final (tip 036e791). Lê a lista de rotas do openapi.yaml (a lista não é digitada aqui). Perfis: super admin, dono da loja do seed, cliente novo.
// Uso: API_URL=... PG_CONTAINER=... QA_TOTP_FILE=... node docs/qa/retestes/limite-50.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, adminCall, record, notTested, finish, sql, login, newCustomer, store as seedStoreOf, SEED_PASSWORD, LAT, LNG } from './lib.mjs';

const yaml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../arquitetura/api/openapi.yaml'), 'utf8').split('\n');
const routes = [];
let current = null;
let method = null;
let inPaths = false;
for (const line of yaml) {
  if (line.startsWith('paths:')) { inPaths = true; continue; }
  if (inPaths && /^[a-z]/.test(line)) break;
  const p = line.match(/^  (\/\S+):\s*$/);
  if (p) { current = p[1]; continue; }
  const m = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (m) { method = m[1]; continue; }
  if (method === 'get' && current && (line.includes('parameters/Limit') || /name: limit\b/.test(line)) && !routes.includes(current)) routes.push(current);
}
record('LIM-0', 'o contrato lista 32 GET com `limit`', routes.length === 32, `${routes.length} rotas`);

const s = await seedStoreOf();
const storeId = s.id;
const productId = sql(`select id from products where store_id = '${storeId}' limit 1`);
const owner = await login('lojista.mercadinho-boa-compra@seed.webag.local');
const customer = await newCustomer();
const tokenFor = async (path) => (path.startsWith('/v1/admin') ? 'admin' : path.startsWith('/v1/stores/') ? owner.token : path.startsWith('/v1/me') || path === '/v1/orders' || path === '/v1/exchanges' ? customer.token : null);
// Parâmetros obrigatórios de algumas rotas: sem eles TUDO dá 400 e o teste do limit não provaria nada (por isso a conferência de `limit=1` = 200 abaixo).
const range = '&from=2026-11-01&to=2026-11-20';
const extra = {
  '/v1/search/stores': `&lat=${LAT}&lng=${LNG}`,
  '/v1/search/products': `&lat=${LAT}&lng=${LNG}&q=banana`,
  '/v1/stores/{storeId}/finance/statement': range,
  '/v1/stores/{storeId}/finance/sales/top-products': range,
  '/v1/admin/reports/orders': range,
  '/v1/admin/content-reports': '&targetType=review',
};
const call = async (path, query) => {
  const url = path.replace('{storeId}', storeId).replace('{productId}', productId) + `?${query}${extra[path] ?? ''}`;
  const who = await tokenFor(path);
  return who === 'admin' ? adminCall('GET', url) : api('GET', url, { token: who ?? undefined });
};
// `top-products` tem máximo 20 no contrato (ranking), as outras 31 têm 50.
const maxOf = (path) => (path.endsWith('/sales/top-products') ? 20 : 50);
for (const path of routes) {
  const max = maxOf(path);
  const bad = {};
  for (const q of ['limit=0', `limit=${max + 1}`, 'limit=abc', 'limit=-1', 'limit=1.5']) bad[q] = (await call(path, q)).status;
  const ok1 = (await call(path, 'limit=1')).status;
  const ok50 = (await call(path, `limit=${max}`)).status;
  const allBad = Object.values(bad).every((st) => st === 400);
  const pass = allBad && ok1 === 200 && ok50 === 200;
  record(`LIM ${path}`, `limite fora de 1 a ${max}, não numérico e fracionário = 400; 1 e ${max} = 200`, pass, `invalidos=${JSON.stringify(bad)} limit=1:${ok1} limit=${max}:${ok50}`);
}
finish();
