/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- o contrato é um documento YAML sem tipo: o teste o percorre como dado */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ADMIN_PERMISSIONS } from '../auth/permissions.js';
import { findContractPath } from './contract-docs.js';

/**
 * Guarda do contrato da v1.1 R1 (ADR-018), sem banco: roda em `pnpm test:unit`.
 * Vale para toda operação marcada `x-planned: v1.1 R1`; quando a operação é implementada, a marca sai e o `contract.e2e-spec`
 * passa a compará-la com a rota real, mas estas regras continuam valendo para ela (o filtro é pela lista de ids abaixo).
 */
type Json = Record<string, any>;
const contract = parse(readFileSync(findContractPath(process.cwd()) ?? '', 'utf8')) as Json;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Op {
  key: string;
  path: string;
  method: string;
  op: Json;
}
const all: Op[] = Object.entries(contract.paths as Json).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ key: `${m.toUpperCase()} ${path}`, path, method: m, op: item[m] as Json })),
);
const r1 = all.filter((o) => o.op['x-planned'] === 'v1.1 R1');
const adminR1 = r1.filter((o) => o.path.startsWith('/v1/admin/'));
const schemas = contract.components.schemas as Json;

/** Permissões NOVAS da R1 (alvo). Ao criá-las em `permissions.ts` (R1.2), o teste passa a compará-las com a tabela real. */
const R1_NEW_PERMISSIONS: Record<string, string[]> = {
  'store-catalog:write': ['super_admin', 'operations'],
  'store-history:export': ['super_admin', 'operations', 'finance'],
  'view-as:open': ['super_admin', 'operations', 'finance', 'support'],
  'analytics:read': ['super_admin', 'operations', 'finance'],
};

const ref = (name: string): string => `#/components/parameters/${name}`;
const hasParamRef = (op: Json, name: string): boolean => (op.parameters ?? []).some((p: Json) => p.$ref === ref(name));
const resolve = (node: Json | undefined): Json | undefined => {
  if (node?.$ref) return schemas[String(node.$ref).split('/').pop() as string];
  return node;
};
const requestSchema = (op: Json): Json | undefined => resolve(op.requestBody?.content?.['application/json']?.schema);
const okSchema = (op: Json): Json | undefined => {
  const code = Object.keys(op.responses).find((c) => c.startsWith('2'));
  return code ? resolve(op.responses[code]?.content?.['application/json']?.schema) : undefined;
};

describe('contrato OpenAPI da v1.1 R1', () => {
  it('há operações planejadas e todas têm id, resumo e descrição', () => {
    expect(r1.length).toBeGreaterThanOrEqual(30);
    for (const { key, op } of r1) {
      expect(op.operationId, key).toBeTruthy();
      expect(op.summary, key).toBeTruthy();
      expect(String(op.description ?? '').length, key).toBeGreaterThan(40);
    }
  });

  describe('autorização por papel e escopo (C-ADM-01, C-GEN-02)', () => {
    it.each(adminR1.map((o) => [o.key, o] as const))('%s declara permissão e perfis, iguais à matriz', (_key, { op }) => {
      const permission = op['x-admin-permission'] as string | undefined;
      const profiles = op['x-admin-profiles'] as string[] | undefined;
      expect(permission, 'x-admin-permission').toBeTruthy();
      expect(Array.isArray(profiles), 'x-admin-profiles').toBe(true);
      const real = (ADMIN_PERMISSIONS as Record<string, readonly string[]>)[permission as string];
      const expected = real ?? R1_NEW_PERMISSIONS[permission as string];
      expect(expected, `permissão desconhecida: ${permission}`).toBeDefined();
      expect([...(profiles as string[])].sort()).toEqual([...expected!].sort());
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['401', '403']));
    });

    it('rota de loja do lojista documenta 401, 403 e 404 (não revela a existência de loja alheia)', () => {
      for (const { key, op, path } of r1.filter((o) => o.path.startsWith('/v1/stores/{storeId}'))) {
        expect(Object.keys(op.responses), key).toEqual(expect.arrayContaining(['401', '403', '404']));
        expect(path).toContain('{storeId}');
      }
    });

    it('só duas rotas novas são públicas, ambas com 429 (rate limit)', () => {
      const publicOps = r1.filter((o) => Array.isArray(o.op.security) && o.op.security.length === 0).map((o) => o.key);
      expect(publicOps.sort()).toEqual(['GET /v1/category-templates', 'POST /v1/analytics/events']);
      for (const { key, op } of r1.filter((o) => Array.isArray(o.op.security) && o.op.security.length === 0)) expect(Object.keys(op.responses), key).toContain('429');
    });

    it('permissões novas da R1 não colidem com as existentes', () => {
      for (const name of Object.keys(R1_NEW_PERMISSIONS)) {
        if (name in ADMIN_PERMISSIONS) expect([...(ADMIN_PERMISSIONS as Record<string, readonly string[]>)[name]!].sort(), name).toEqual([...R1_NEW_PERMISSIONS[name]!].sort());
      }
    });
  });

  describe('edição pelo admin (WB-351, WB-353, WB-354)', () => {
    const writes = adminR1.filter((o) => o.path.startsWith('/v1/admin/stores/') && o.method !== 'get');

    it.each(writes.map((o) => [o.key, o] as const))('%s exige motivo no corpo', (_key, { op }) => {
      const schema = requestSchema(op);
      expect(schema, 'corpo JSON').toBeDefined();
      expect(Object.keys(schema!.properties ?? {})).toContain('reason');
      expect(schema!.required).toContain('reason');
    });

    it('edição de dados, horário, pausa e catálogo confere a versão (C-ADM-05)', () => {
      const versioned = ['editAdminStoreProfile', 'editAdminStoreConfig', 'pauseStoreAsAdmin', 'resumeStoreAsAdmin', 'editAdminStoreProduct', 'setAdminStoreProductVariants', 'adjustAdminStoreVariantStock', 'setAdminStoreProductImages', 'setAdminStoreProductStatus'];
      for (const id of versioned) {
        const found = adminR1.find((o) => o.op.operationId === id);
        expect(found, id).toBeDefined();
        expect(requestSchema(found!.op)!.required, id).toContain('expectedVersion');
        expect(Object.keys(found!.op.responses), id).toContain('409');
      }
    });

    it('o catálogo do admin tem teto de 200 itens e 429 na ação em massa (C-ADM-07)', () => {
      const bulk = adminR1.find((o) => o.op.operationId === 'bulkAdminStoreProducts')!;
      expect(requestSchema(bulk.op)!.properties.productIds.maxItems).toBe(200);
      expect(Object.keys(bulk.op.responses)).toContain('429');
    });

    it('o catálogo de motivos tem os 4 motivos de preço e o texto é limitado a 200 caracteres', () => {
      const codes = schemas.AdminReasonCode.enum as string[];
      for (const price of ['requested_by_merchant', 'obvious_price_error', 'legal_or_inspection_order', 'agreed_campaign']) expect(codes).toContain(price);
      expect(schemas.AdminReason.properties.note.maxLength).toBe(200);
      expect(schemas.AdminReason.additionalProperties).toBe(false);
    });

    it('os dados editáveis da loja são uma lista fechada, sem documento, razão social, conta, equipe ou status (C-ADM-03)', () => {
      const changes = schemas.AdminStoreProfileChanges;
      expect(changes.additionalProperties).toBe(false);
      expect(Object.keys(changes.properties).sort()).toEqual(['description', 'name', 'phone', 'whatsapp']);
    });

    it('as duas rotas antigas de edição do admin ficam deprecated (sem motivo, razão social e endereço)', () => {
      for (const id of ['editAdminStore', 'editAdminStoreSettings']) expect(all.find((o) => o.op.operationId === id)?.op.deprecated, id).toBe(true);
    });
  });

  describe('"Ver como o lojista" é somente leitura (C-ADM-02)', () => {
    const viewAs = all.filter((o) => o.op['x-view-as'] === true);

    it('só rotas GET aceitam a credencial, e todas declaram o esquema de segurança', () => {
      expect(viewAs.length).toBeGreaterThanOrEqual(10);
      for (const { key, method, op } of viewAs) {
        expect(method, key).toBe('get');
        expect(op.security, key).toEqual([{ bearerAuth: [] }, { viewAsAuth: [] }]);
      }
      const usingScheme = all.filter((o) => JSON.stringify(o.op.security ?? '').includes('viewAsAuth')).map((o) => o.key);
      expect(usingScheme.sort()).toEqual(viewAs.map((o) => o.key).sort());
    });

    it('nenhuma rota financeira, de documento, de equipe, de conta ou de exportação aceita a credencial', () => {
      for (const { key, path } of viewAs) expect(path, key).not.toMatch(/finance|documents|members|payment-account|ticket|\.csv|export/);
    });

    it('a credencial é opaca e a abertura devolve expiração de até 30 min', () => {
      expect(contract.components.securitySchemes.viewAsAuth.bearerFormat).toBe('opaque');
      expect(schemas.ViewAsSession.required).toEqual(expect.arrayContaining(['token', 'expiresAt']));
      expect(String(all.find((o) => o.op.operationId === 'openViewAs')!.op.description)).toContain('ANTES de qualquer dado');
    });
  });

  describe('escritas repetíveis e concorrência (3G instável)', () => {
    it('criar rascunho, lote, duplicar e criar pelo admin exigem Idempotency-Key', () => {
      for (const id of ['createProductDraft', 'createProductDraftsBatch', 'duplicateProduct', 'createAdminProductDraft']) {
        const found = r1.find((o) => o.op.operationId === id)!;
        expect(hasParamRef(found.op, 'IdempotencyKeyRequired'), id).toBe(true);
      }
    });

    it('o rascunho e a edição em linha conferem a versão por If-Match e respondem 409 específico', () => {
      for (const id of ['updateProduct', 'setProductVariants', 'setProductImages', 'publishProduct', 'adjustVariantStock']) {
        const found = all.find((o) => o.op.operationId === id)!;
        expect(hasParamRef(found.op, 'IfMatchVersion'), id).toBe(true);
        expect(found.op.responses['409'].$ref, id).toBe('#/components/responses/ProductVersionConflict');
      }
    });

    it('lista nova é paginada por cursor com limite', () => {
      for (const { key, op } of r1.filter((o) => o.method === 'get')) {
        const schema = okSchema(op);
        if (!schema?.properties || !('nextCursor' in schema.properties) || schema.properties.nextCursor.type === 'null') continue;
        expect(hasParamRef(op, 'Cursor'), `${key}: cursor`).toBe(true);
        expect(hasParamRef(op, 'Limit'), `${key}: limit`).toBe(true);
      }
    });
  });

  describe('dinheiro e dados', () => {
    it('todo campo `...Cents` é inteiro (nada de float)', () => {
      const bad: string[] = [];
      const walk = (name: string, node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const n = node as Json;
        for (const [prop, def] of Object.entries(n.properties ?? {})) {
          const types = ([] as string[]).concat((def as Json).type ?? []);
          if (/Cents$/.test(prop) && !types.every((t) => t === 'integer' || t === 'null')) bad.push(`${name}.${prop}`);
          walk(`${name}.${prop}`, def);
        }
      };
      for (const [name, schema] of Object.entries(schemas)) walk(name, schema);
      expect(bad).toEqual([]);
    });

    it('todo schema de entrada novo recusa campo extra', () => {
      for (const [name, schema] of Object.entries(schemas)) {
        if (name.endsWith('Request')) expect(schema.additionalProperties, name).toBe(false);
      }
    });
  });

  describe('coleta de eventos sem identidade (C-ANA-01, C-ANA-02, WB-363)', () => {
    const request = schemas.AnalyticsEventsRequest;
    const eventNames = ['AppSessionStartedEvent', 'StoreViewedEvent', 'ProductViewedEvent', 'ItemAddedEvent'];

    it('lote de no máximo 100 eventos, esquema estrito e nenhum campo de pessoa ou aparelho', () => {
      expect(request.properties.events.maxItems).toBe(100);
      for (const name of eventNames) {
        const event = schemas[name];
        expect(event.additionalProperties, name).toBe(false);
        expect(Object.keys(event.properties).filter((p) => /user|account|email|phone|device|ip|token|order|price|valor|name$/i.test(p) && p !== 'name'), name).toEqual([]);
      }
      expect(request.properties.events.items.$ref).toBe('#/components/schemas/AnalyticsEvent');
    });

    it('a rota não recebe Authorization nem X-Device-Id e responde 202 com 413 e 429 documentados', () => {
      const ingest = all.find((o) => o.op.operationId === 'ingestAnalyticsEvents')!;
      expect(ingest.op.security).toEqual([]);
      expect(ingest.op.parameters ?? []).toEqual([]);
      expect(Object.keys(ingest.op.responses)).toEqual(expect.arrayContaining(['202', '413', '422', '429']));
    });

    it('order_paid não é evento do app (o servidor o grava, sem order_id, user_id nem valor)', () => {
      expect(JSON.stringify(schemas.AnalyticsEvent)).not.toContain('order_paid');
    });

    it('célula suprimida não carrega valor: só `suppressed` e `n` (n apenas quando >= 5)', () => {
      const cell = schemas.AnalyticsCell;
      expect(cell.required).toEqual(['suppressed']);
      expect(cell.properties.n.minimum).toBe(5);
    });

    it('relatórios de acesso e cobertura são só do admin e o suporte não os vê', () => {
      for (const id of ['getAdminAnalyticsAccess', 'getAdminAnalyticsCoverage']) {
        const found = adminR1.find((o) => o.op.operationId === id)!;
        expect(found.op['x-admin-profiles']).not.toContain('support');
      }
    });
  });

  describe('503 sob saturação (BUG-035)', () => {
    it('o contrato documenta 503 com Retry-After', () => {
      const response = contract.components.responses.ServiceUnavailable;
      expect(response.headers['Retry-After']).toBeDefined();
    });
  });
});
