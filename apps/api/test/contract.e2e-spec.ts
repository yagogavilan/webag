import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { createTestApp, listRoutes, type TestContext } from './helpers/app.js';

interface Operation {
  operationId: string;
  /** Contrato publicado antes do código (ex.: pedido na Onda 3, implementado na Onda 4). Sai da comparação com as rotas reais. */
  'x-planned'?: string;
  security?: unknown[];
  responses: Record<string, unknown>;
}
interface Contract {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: unknown; allOf?: unknown[] }> };
}

const contract = parse(readFileSync(resolve(import.meta.dirname, '../../../docs/arquitetura/api/openapi.yaml'), 'utf8')) as Contract;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const allOperations = Object.entries(contract.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ key: `${m.toUpperCase()} ${path}`, op: item[m]! })),
);
const operations = allOperations.filter((o) => o.op['x-planned'] === undefined);
const planned = allOperations.filter((o) => o.op['x-planned'] !== undefined);

/** O contrato (openapi.yaml) e o código não podem divergir (ADR-007: o YAML é a fonte da verdade). */
describe('contrato OpenAPI x rotas reais', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const routes = () =>
    listRoutes(ctx.app)
      .filter((r) => !r.path.startsWith('/v1/dev/') && !r.path.startsWith('/v1/test-'))
      .map((r) => ({ ...r, key: `${r.method} ${r.path.replace(/:([A-Za-z]+)/g, '{$1}')}` }));

  it('toda rota registrada está documentada e toda operação documentada existe', () => {
    const real = routes().map((r) => r.key).sort();
    const documented = operations.map((o) => o.key).sort();
    expect(real).toEqual(documented);
  });

  it('operações planejadas (`x-planned`) ainda não existem como rota; ao implementar, remover a marca (e o contrato passa a valer)', () => {
    const real = new Set(routes().map((r) => r.key));
    expect(planned.filter((o) => real.has(o.key)).map((o) => o.key)).toEqual([]);
    expect(planned.every((o) => /^(Onda \d|v1\.1 R\d)/.test(o.op['x-planned'] ?? ''))).toBe(true);
  });

  it('segurança: `security: []` exatamente nas rotas @Public (SEC-021)', () => {
    const publicReal = new Set(routes().filter((r) => r.isPublic).map((r) => r.key));
    const publicDocumented = new Set(operations.filter((o) => Array.isArray(o.op.security) && o.op.security.length === 0).map((o) => o.key));
    expect([...publicReal].sort()).toEqual([...publicDocumented].sort());
  });

  it('operationIds são únicos', () => {
    const ids = allOperations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SEC-022: schemas de entrada recusam campo extra e os de saída não expõem campos internos', () => {
    for (const [name, schema] of Object.entries(contract.components.schemas)) {
      if (name.endsWith('Request')) expect(schema.additionalProperties, name).toBe(false);
      const props = Object.keys(schema.properties ?? {});
      expect(props.filter((p) => /passwordHash|tokenHash|codeHash|totpSecretEnc|providerPaymentId|cpf|cvv/i.test(p)), name).toEqual([]);
    }
  });

  it('SEC-035: nenhum caminho documentado confirma/aprova pagamento', () => {
    // Aprovar LOJA ou produto é moderação de cadastro, não pagamento: só os caminhos de pagamento contam.
    expect(operations.filter((o) => /confirm|approve|capture/i.test(o.key) && !o.key.includes('/admin/totp') && !o.key.includes('/admin/stores/') && !o.key.includes('/admin/products/'))).toEqual([]);
  });

  it('operações autenticadas documentam 401 e as públicas de escrita documentam 429', () => {
    for (const { key, op } of allOperations) {
      const isPublic = Array.isArray(op.security) && op.security.length === 0;
      if (!isPublic) expect(Object.keys(op.responses), key).toContain('401');
      if (isPublic && key.startsWith('POST') && !key.includes('/webhooks/')) expect(Object.keys(op.responses), key).toContain('429');
    }
  });
});
