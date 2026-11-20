import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureLegalDocs } from './helpers/fixtures.js';
import { shopWith } from './helpers/orders.js';

interface Param {
  name?: string;
  $ref?: string;
}
type Contract = { paths: Record<string, Record<string, { parameters?: Param[]; 'x-planned'?: string }>> };
const contract = parse(readFileSync(resolve(import.meta.dirname, '../../../docs/arquitetura/api/openapi.yaml'), 'utf8')) as Contract;

/** Todo GET do contrato (já implementado) que aceita `limit` na query. */
const paged = Object.entries(contract.paths).flatMap(([path, item]) =>
  item.get && item.get['x-planned'] === undefined && (item.get.parameters ?? []).some((p) => p.name === 'limit' || p.$ref?.endsWith('/Limit')) ? [path] : [],
);

/**
 * BUG-027: `limit` fora de 1 a 50 (0, 51, 1000, abc, vazio, negativo, decimal) é 400 VALIDATION_FAILED em TODA lista paginada do contrato,
 * não ajustado em silêncio. A lista de rotas sai do próprio openapi.yaml (uma rota nova com `limit` entra sozinha); para cada rota, procura-se
 * a credencial (público, cliente, dono da loja, admin) com que um `limit` válido NÃO dá 400/401/403, e com essa mesma credencial os inválidos dão 400.
 */
describe('limit das listas paginadas: 1 a 50, fora disso 400 (BUG-027)', () => {
  let ctx: TestContext;
  let credentials: { name: string; headers: Record<string, string> }[];
  let storeId: string;
  let productId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
    storeId = shop.store.id;
    productId = shop.store.productIds[0]!;
    const customer = await createCustomer(ctx);
    const admin = await createAdmin(ctx, 'super_admin');
    credentials = [
      { name: 'lojista', headers: bearer(shop.store.owner.accessToken) },
      { name: 'admin', headers: bearer(admin.accessToken) },
      { name: 'cliente', headers: bearer(customer.accessToken) },
      { name: 'público', headers: {} },
    ];
  });
  afterAll(() => ctx.close());

  const BASES = ['?', '?from=2026-01-01&to=2026-01-31&', '?targetType=review&', '?lat=-23.28&lng=-46.74&', '?lat=-23.28&lng=-46.74&q=ab&', '?q=ab&'];
  const fill = (path: string): string => path.replace(/\{storeId\}/g, storeId).replace(/\{productId\}/g, productId).replace(/\{[A-Za-z]+\}/g, () => randomUUID());
  const call = (path: string, query: string, headers: Record<string, string>) => ctx.http.get(`${fill(path)}${query}`).set(headers);

  it('o contrato lista as rotas paginadas (a varredura não pode ficar vazia)', () => {
    expect(paged.length).toBeGreaterThanOrEqual(25);
  });

  it.each(paged)('GET %s', async (path) => {
    // Rotas com filtro obrigatório (período, tipo, posição) recebem o conjunto mínimo válido; o schema é estrito e recusa chaves a mais.
    let used: { name: string; headers: Record<string, string>; base: string } | null = null;
    search: for (const credential of credentials) {
      for (const base of BASES) {
        const response = await call(path, `${base}limit=10`, credential.headers);
        if (![400, 401, 403, 404].includes(response.status)) {
          used = { ...credential, base };
          break search;
        }
      }
    }
    expect(used, `nenhuma credencial consegue chamar ${path} com limit=10 (ajuste a varredura)`).not.toBeNull();
    for (const bad of ['0', '51', '1000', 'abc', '', '-1', '1.5', '5 ']) {
      const response = await call(path, `${used!.base}limit=${encodeURIComponent(bad)}`, used!.headers);
      expect(response.status, `${path} limit="${bad}" (${used!.name})`).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
    for (const good of ['1', '10', '50']) {
      const response = await call(path, `${used!.base}limit=${good}`, used!.headers);
      if (good !== '50' || !path.endsWith('/top-products')) expect(response.status, `${path} limit=${good}`).not.toBe(400);
    }
  });
});
