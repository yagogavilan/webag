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
/** Operações da R1 já IMPLEMENTADAS (a marca `x-planned` saiu e o `contract.e2e-spec` as compara com a rota real); as regras deste arquivo continuam valendo para elas. */
const R1_IMPLEMENTED = new Set(['openViewAs', 'endViewAs', 'editAdminStoreProfile', 'editAdminStoreConfig', 'pauseStoreAsAdmin', 'resumeStoreAsAdmin', 'getAdminStoreOverview', 'listAdminStoreHistory', 'listStoreAdminChanges', 'getCatalogQuickStart', 'listProductDrafts', 'createProductDraft', 'createProductDraftsBatch', 'duplicateProduct', 'listProductTable', 'quickPublishProduct', 'getProductCreationMetrics', 'listCategoryTemplates', 'setCategoryTemplate']);
const r1 = all.filter((o) => o.op['x-planned'] === 'v1.1 R1' || R1_IMPLEMENTED.has(o.op.operationId as string));
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

    it('as duas rotas legadas de edição do admin foram removidas do contrato (I12, ADR-018 D6)', () => {
      for (const id of ['editAdminStore', 'editAdminStoreSettings']) expect(all.find((o) => o.op.operationId === id), id).toBeUndefined();
      expect(all.find((o) => o.key === 'PATCH /v1/admin/stores/{storeId}')).toBeUndefined();
      expect(all.find((o) => o.key === 'PUT /v1/admin/stores/{storeId}/settings/{section}')).toBeUndefined();
      expect(schemas.AdminStorePatchRequest).toBeUndefined();
      expect(all.filter((o) => o.op.deprecated === true)).toEqual([]);
    });
  });

  describe('"Ver como o lojista" é somente leitura (C-ADM-02, ADR-018 D8, threat model §14)', () => {
    const viewAs = all.filter((o) => o.op['x-view-as'] === true);
    const LISTA_FECHADA = [
      'countStoreOrders', 'getProduct', 'getStore', 'getStoreExchange', 'getStoreOrder', 'getStoreReviewsSummary', 'getStoreSettings',
      'listProductTable', 'listProducts', 'listSections', 'listStoreExchanges', 'listStoreOrders', 'listStoreReviews',
    ];
    const PROIBIDOS = /^(commissionPct|commissionSource|commissionCategories|providerFeePct|legalName|document|documentType|youReceiveCents|netBeforeProviderFee|commission|phone|email|cpf|cep|lat|lng|street|complement|note|description|photos|photoCount|refund|storeCode|deliveryCode|cancelRequest|settings|role)$/;

    it('são exatamente as 13 rotas GET da lista fechada, com Bearer do admin MAIS o cabeçalho (nunca um sem o outro)', () => {
      expect(viewAs.map((o) => o.op.operationId).sort()).toEqual(LISTA_FECHADA);
      for (const { key, method, op } of viewAs) {
        expect(method, key).toBe('get');
        expect(op.security, key).toEqual([{ bearerAuth: [] }, { bearerAuth: [], viewAsAuth: [] }]);
        for (const code of ['401', '403', '404', '429']) expect(op.responses[code], `${key} ${code}`).toBeDefined();
      }
      const usingScheme = all.filter((o) => JSON.stringify(o.op.security ?? '').includes('viewAsAuth')).map((o) => o.key);
      expect(usingScheme.sort()).toEqual(viewAs.map((o) => o.key).sort());
    });

    it('nenhuma rota financeira, de documento, de equipe, de conta ou de exportação aceita a credencial', () => {
      for (const { key, path } of viewAs) expect(path, key).not.toMatch(/finance|documents|members|payment-account|ticket|\.csv|export/);
    });

    it('a credencial é um cabeçalho `X-View-As` (apiKey), não um Bearer, e a abertura devolve `vas_` com expiração', () => {
      expect(contract.components.securitySchemes.viewAsAuth).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-View-As' });
      expect(schemas.ViewAsSession.required).toEqual(expect.arrayContaining(['token', 'expiresAt']));
      expect(schemas.ViewAsSession.properties.token.pattern).toBe('^vas_[A-Za-z0-9_-]{43}$');
      const open = all.find((o) => o.op.operationId === 'openViewAs')!.op;
      const text = String(open.description);
      for (const part of ['MESMA TRANSAÇÃO', 'sem renovação', 'Uma visão ativa por admin', '10 aberturas por hora', 'Nível fixo']) expect(text, part).toContain(part);
      for (const code of ['201', '401', '403', '404', '409', '422', '429']) expect(open.responses[code], code).toBeDefined();
      expect(contract.components.responses.Forbidden.description).toMatch(/VIEW_AS_READ_ONLY.*VIEW_AS_EXPIRED/);
    });

    it('os corpos mascarados são estritos, sem os campos proibidos, e estão ligados às rotas por `x-view-as-schema`', () => {
      const ligados = Object.fromEntries(viewAs.filter((o) => o.op['x-view-as-schema']).map((o) => [o.op.operationId, o.op['x-view-as-schema']]));
      expect(ligados).toEqual({
        getStore: 'StoreViewAs', getStoreSettings: 'StoreSettingsViewAs', getStoreOrder: 'StoreOrderViewAs',
        getStoreExchange: 'ExchangeViewAs', listStoreExchanges: 'ExchangePageViewAs',
      });
      for (const name of ['StoreViewAs', 'StoreSettingsViewAs', 'StoreOrderViewAs', 'ExchangeViewAs']) {
        const s = schemas[name];
        expect(s.additionalProperties, name).toBe(false);
        // `phone`, `whatsapp` e `description` da LOJA são públicos na vitrine; o telefone de CLIENTE é o que não pode aparecer.
        expect(Object.keys(s.properties).filter((k) => PROIBIDOS.test(k) && !(name === 'StoreViewAs' && /^(phone|whatsapp|description)$/.test(k))), name).toEqual([]);
      }
      expect(JSON.stringify(schemas.StoreOrderViewAs)).not.toMatch(/"(lastName|phone|email|cpf|observation|notes|deliveryCode|street|cep|complement|commission|netBeforeProviderFee)"/);
      expect(Object.keys(schemas.StoreOrderViewAs.properties.customer.properties)).toEqual(['firstName']);
      expect(Object.keys(schemas.StoreViewAs.properties.address.oneOf[0].properties).sort()).toEqual(['city', 'neighborhood', 'state']);
    });

    /** Percorre o schema resolvendo `$ref`; devolve o caminho de todo objeto com `properties` e `additionalProperties` diferente de `false`. */
    function openObjects(node: any, path: string, seen: Set<string>, out: string[]): string[] {
      if (!node || typeof node !== 'object') return out;
      if (node.$ref) {
        const name = String(node.$ref).split('/').pop() as string;
        if (seen.has(name)) return out;
        return openObjects(schemas[name], `${path}->${name}`, new Set([...seen, name]), out);
      }
      if (node.properties && node.additionalProperties !== false) out.push(path);
      for (const [k, v] of Object.entries(node.properties ?? {})) openObjects(v, `${path}.${k}`, seen, out);
      for (const key of ['items', 'additionalProperties']) if (typeof node[key] === 'object') openObjects(node[key], `${path}[${key}]`, seen, out);
      for (const key of ['oneOf', 'anyOf', 'allOf']) (node[key] ?? []).forEach((v: Json, i: number) => openObjects(v, `${path}<${key}${i}>`, seen, out));
      return out;
    }
    /** Todo nome de propriedade alcançável (resolvendo `$ref`). */
    function propertyNames(node: any, seen: Set<string>, out: Set<string>): Set<string> {
      if (!node || typeof node !== 'object') return out;
      if (node.$ref) {
        const name = String(node.$ref).split('/').pop() as string;
        if (!seen.has(name)) propertyNames(schemas[name], new Set([...seen, name]), out);
        return out;
      }
      for (const [k, v] of Object.entries(node.properties ?? {})) {
        out.add(k);
        propertyNames(v, seen, out);
      }
      for (const key of ['items', 'additionalProperties']) if (typeof node[key] === 'object') propertyNames(node[key], seen, out);
      for (const key of ['oneOf', 'anyOf', 'allOf']) (node[key] ?? []).forEach((v: Json) => propertyNames(v, seen, out));
      return out;
    }

    it('SEC-209: "estrito" vale em TODOS os níveis dos 5 schemas `...ViewAs` (inclusive os referenciados), e a linha do tempo não tem `reason`', () => {
      for (const name of ['StoreViewAs', 'StoreSettingsViewAs', 'StoreOrderViewAs', 'ExchangeViewAs', 'ExchangePageViewAs']) {
        expect(openObjects({ $ref: `#/components/schemas/${name}` }, name, new Set(), []), name).toEqual([]);
      }
      expect(Object.keys(schemas.StoreOrderViewAs.properties.timeline.items.properties).sort()).toEqual(['actor', 'at', 'status']);
      expect(Object.keys(schemas.ExchangeViewAs.properties.timeline.items.properties).sort()).toEqual(['actor', 'at', 'from', 'to']);
      for (const name of ['StoreOrderViewAs', 'ExchangeViewAs']) {
        const names = propertyNames({ $ref: `#/components/schemas/${name}` }, new Set(), new Set());
        expect([...names].filter((k) => /^(reason|description|note|observation|photos|text)$/.test(k)), name).toEqual([]);
      }
    });

    it('os códigos do cabeçalho malformado seguem a §15.2 (vazio ou repetido = READ_ONLY; formato inválido ou vencido = EXPIRED)', () => {
      const text = String(contract.components.securitySchemes.viewAsAuth.description);
      expect(text).toMatch(/VAZIO ou REPETIDO.*VIEW_AS_READ_ONLY/);
      expect(text).toMatch(/formato inválido.*vencida.*VIEW_AS_EXPIRED/);
      expect(text).not.toMatch(/malformado, ou em qualquer outra/);
    });

    it('a ficha do pedido no admin grava auditoria e não aceita a visão (WB-352 C14)', () => {
      const text = String(all.find((o) => o.op.operationId === 'getAdminOrder')!.op.description);
      expect(text).toContain('admin.order.view');
      expect(text).toContain('X-View-As');
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

    it('reajuste e estoque em massa exigem Idempotency-Key e versão por item no servidor (B2)', () => {
      for (const id of ['bulkProducts', 'bulkAdminStoreProducts']) {
        const found = all.find((o) => o.op.operationId === id)!;
        expect(hasParamRef(found.op, 'IdempotencyKey'), `${id}: header`).toBe(true);
        const text = String(found.op.description);
        expect(text, id).toContain('IDEMPOTENCY_KEY_REQUIRED');
        expect(text, id).toContain('EXPECTED_VERSIONS_REQUIRED');
        expect(text, id).toContain('BULK_VERSION_CONFLICT');
        expect(found.op.responses['409'].$ref, id).toBe('#/components/responses/BulkVersionConflict');
        const schema = requestSchema(found.op)!;
        expect(schema.properties.expectedVersions.items.$ref, id).toBe('#/components/schemas/ExpectedVersion');
        expect(schema.properties.expectedVersions.maxItems, id).toBe(200);
      }
      expect(schemas.BulkPreviewItem.required).toContain('version');
      expect(schemas.AdminBulkResult.properties.preview.items.$ref).toBe('#/components/schemas/AdminBulkPreviewItem');
    });

    it('desfazer lote repetido devolve o mesmo resultado, sem 409 (A4)', () => {
      const undo = all.find((o) => o.op.operationId === 'undoBulkBatch')!;
      expect(String(undo.op.description)).toContain('alreadyUndone: true');
      expect(String(undo.op.description)).not.toContain('BATCH_ALREADY_UNDONE');
      expect(schemas.BulkUndoResult.required).toContain('alreadyUndone');
    });

    it('If-Match segue a sintaxe RFC 9110 (entity-tag entre aspas) e getProduct devolve ETag (A1)', () => {
      const param = contract.components.parameters.IfMatchVersion;
      expect(param.required).not.toBe(true);
      expect(param.schema.type).toBe('string');
      expect(new RegExp(param.schema.pattern).test('"7"')).toBe(true);
      expect(new RegExp(param.schema.pattern).test('7')).toBe(false);
      for (const id of ['getProduct', 'getAdminStoreProduct', 'quickPublishProduct']) {
        const found = all.find((o) => o.op.operationId === id)!;
        expect(found.op.responses['200'].headers.ETag, id).toBeDefined();
      }
    });

    it('`current` do 409 de versão é opcional: os demais 409 mantêm o corpo antigo (I1)', () => {
      const [, extension] = schemas.ProductVersionConflictProblem.allOf;
      expect(extension.required).toBeUndefined();
      expect(extension.properties.current).toBeDefined();
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

  describe('cadastro rápido: limites e publicação em uma chamada (DEC-118, I11)', () => {
    it('o teto de rascunhos é 100 e nunca fica abaixo do lote (B1)', () => {
      expect(schemas.CatalogQuickStart.properties.draftLimit.example).toBe(100);
      expect(schemas.ProductDraftPage.properties.limit.example).toBe(100);
      const batch = schemas.CreateProductDraftsBatchRequest;
      expect(batch.properties.items.maxItems).toBe(100);
      expect(batch.properties.items.maxItems).toBeLessThanOrEqual(schemas.CatalogQuickStart.properties.draftLimit.example);
      const text = JSON.stringify(contract.paths);
      expect(text).not.toMatch(/50 rascunhos|Limite de 50/);
      expect(String(all.find((o) => o.op.operationId === 'createProductDraftsBatch')!.op.description)).toContain('slotsAvailable');
      expect(Object.keys(schemas.DraftLimitProblem.allOf[1].properties).sort()).toEqual(['draftCount', 'limit', 'slotsAvailable']);
    });

    it('publicar com nome e preço é UMA chamada transacional, idempotente e com If-Match', () => {
      const quick = r1.find((o) => o.op.operationId === 'quickPublishProduct')!;
      expect(hasParamRef(quick.op, 'IdempotencyKeyRequired')).toBe(true);
      expect(hasParamRef(quick.op, 'IfMatchVersion')).toBe(true);
      expect(quick.op.responses['409'].$ref).toBe('#/components/responses/ProductVersionConflict');
      const request = requestSchema(quick.op)!;
      expect(request.additionalProperties).toBe(false);
      expect(request.required).toEqual(['name', 'basePriceCents', 'imageIds']);
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

    it('o relatório de acesso é só do admin e o suporte não o vê; a cobertura saiu da R1 (I7)', () => {
      const found = adminR1.find((o) => o.op.operationId === 'getAdminAnalyticsAccess')!;
      expect(found.op['x-admin-profiles']).not.toContain('support');
      expect(all.find((o) => o.op.operationId === 'getAdminAnalyticsCoverage')).toBeUndefined();
      expect(schemas.AnalyticsCoveragePage).toBeUndefined();
    });

    it('a coleta não deixa IP, user-agent nem session_id em log, e o limite por IP não perde evento em silêncio (I5, I6)', () => {
      const ingest = all.find((o) => o.op.operationId === 'ingestAnalyticsEvents')!;
      const text = String(ingest.op.description);
      expect(text).toContain('nenhum log grava IP, user-agent, cabeçalhos nem `session_id`');
      expect(text).toContain('access_log off');
      expect(text).toContain('600 requisições por minuto');
      expect(text).toContain('sessão pseudônima');
      expect(Object.keys(schemas.AnalyticsAccessReport.properties.discards.properties).sort()).toEqual(['flag_off', 'rate_ip', 'rate_session', 'unknown_store']);
      expect(schemas.AnalyticsIngestResult.properties.discarded.description).toContain('NÃO descarta');
    });

    it('as chaves Redis do limite por sessão E por IP são HMAC, com segredo próprio, e o sessionId não é identificador de aparelho (§15.5)', () => {
      const text = String(all.find((o) => o.op.operationId === 'ingestAnalyticsEvents')!.op.description);
      expect(text).toContain('chave Redis = HMAC do IP');
      expect(text).toContain('variável de ambiente PRÓPRIA');
      expect(text).toContain('diferente do `AUTH_HMAC_KEY`');
      expect(text).toContain('no máximo 1 h');
      expect(text).toMatch(/UUID novo a CADA abertura do app.*30 min sem uso.*nunca igual ao id do aparelho/s);
    });
  });

  describe('quickPublishProduct: foto em processamento e resposta perdida (R6)', () => {
    it('documenta o 422 UPLOAD_NOT_READY (transitório) e o 409 que o app trata como sucesso se o produto já está ativo', () => {
      const text = String(all.find((o) => o.op.operationId === 'quickPublishProduct')!.op.description);
      expect(text).toContain('422 `UPLOAD_NOT_READY`');
      expect(text).toContain('MESMA `Idempotency-Key`');
      expect(text).toContain('`status = active` com os mesmos dados como SUCESSO');
    });
  });

  describe('sanidade do YAML', () => {
    it('nenhum schema tem chave desconhecida (descrição sem aspas em mapa de fluxo vira chave e some do contrato)', () => {
      const OK = new Set(['$ref', 'type', 'properties', 'required', 'additionalProperties', 'items', 'oneOf', 'anyOf', 'allOf', 'enum', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'format', 'description', 'example', 'examples', 'title', 'default', 'deprecated', 'readOnly', 'writeOnly', 'nullable', 'externalDocs', 'maxProperties', 'minProperties', 'uniqueItems', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'const', 'not']);
      const bad: string[] = [];
      const walk = (node: any, path: string): void => {
        if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
        if (!node || typeof node !== 'object') return;
        if (('type' in node || '$ref' in node || 'properties' in node) && !path.endsWith('properties')) {
          for (const key of Object.keys(node)) if (!OK.has(key) && !key.startsWith('x-')) bad.push(`${path}: ${key}`);
        }
        for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
      };
      walk(contract.components.schemas, 'schemas');
      expect(bad).toEqual([]);
    });
  });

  describe('503 sob saturação (BUG-035)', () => {
    it('o contrato documenta 503 com Retry-After', () => {
      const response = contract.components.responses.ServiceUnavailable;
      expect(response.headers['Retry-After']).toBeDefined();
    });
  });
});
