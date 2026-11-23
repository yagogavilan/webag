/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- o contrato é um documento YAML sem tipo: o teste o percorre como dado */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ADMIN_PERMISSIONS } from '../auth/permissions.js';
import { findContractPath } from './contract-docs.js';

/**
 * Guarda do contrato da v1.1 R2 (ADR-019: campanhas e cupons, painéis prontos, acessos, porta falsa, código de barras), sem banco: roda em `pnpm test:unit`.
 * Vale para toda operação marcada `x-planned: v1.1 R2`; quando uma é implementada a marca sai, o `contract.e2e-spec` a compara com a rota real e
 * a operação entra em `R2_IMPLEMENTED` para as regras daqui continuarem valendo.
 */
type Json = Record<string, any>;
const contract = parse(readFileSync(findContractPath(process.cwd()) ?? '', 'utf8')) as Json;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const schemas = contract.components.schemas as Json;

interface Op {
  key: string;
  path: string;
  method: string;
  op: Json;
}
const all: Op[] = Object.entries(contract.paths as Json).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ key: `${m.toUpperCase()} ${path}`, path, method: m, op: item[m] as Json })),
);
/** Operações da R2 já IMPLEMENTADAS (a marca `x-planned` saiu). Vazio na R2.1: só contrato, ADR e migrações. */
const R2_IMPLEMENTED = new Set<string>();
const r2 = all.filter((o) => o.op['x-planned'] === 'v1.1 R2' || R2_IMPLEMENTED.has(o.op.operationId as string));
const byId = (id: string): Op => {
  const found = r2.find((o) => o.op.operationId === id);
  expect(found, id).toBeDefined();
  return found!;
};
const adminR2 = r2.filter((o) => o.path.startsWith('/v1/admin/'));
const storeR2 = r2.filter((o) => o.path.startsWith('/v1/stores/'));

/**
 * Permissões NOVAS da R2 (alvo). Ao criá-las em `permissions.ts` (R2.2), o teste passa a compará-las com a tabela real.
 * Cupom reaproveita `coupons:read` e `coupons:write` (WB-116); ativar, retomar e encerrar campanha é só super admin e financeiro, com 2º fator (WB-340 C6, C8).
 * Painéis: `dashboards:read` é a porta (os 4 perfis); a sensibilidade de cada MÉTRICA (geral, operacional, financeira) é conferida por métrica no serviço (C-DSH-02).
 */
const R2_NEW_PERMISSIONS: Record<string, string[]> = {
  'coupons:activate': ['super_admin', 'finance'],
  'dashboards:read': ['super_admin', 'operations', 'finance', 'support'],
};

const requestSchema = (op: Json): Json | undefined => {
  const node = op.requestBody?.content?.['application/json']?.schema;
  return node?.$ref ? schemas[String(node.$ref).split('/').pop() as string] : node;
};
const okSchema = (op: Json): Json | undefined => {
  const code = Object.keys(op.responses).find((c) => c.startsWith('2'));
  const node = code ? op.responses[code]?.content?.['application/json']?.schema : undefined;
  return node?.$ref ? schemas[String(node.$ref).split('/').pop() as string] : node;
};
const hasParam = (op: Json, name: string): boolean => (op.parameters ?? []).some((p: Json) => p.$ref === `#/components/parameters/${name}`);

/** Todas as propriedades de um schema, descendo nos `$ref` (sem repetir), com o caminho. */
function walkProps(node: any, path: string, seen: Set<string>, out: { path: string; name: string; schema: any }[]): void {
  if (!node || typeof node !== 'object') return;
  if (node.$ref) {
    const name = String(node.$ref).split('/').pop() as string;
    if (seen.has(name)) return;
    walkProps(schemas[name], `${path}->${name}`, new Set([...seen, name]), out);
    return;
  }
  for (const key of ['allOf', 'oneOf', 'anyOf']) for (const sub of node[key] ?? []) walkProps(sub, path, seen, out);
  for (const [name, prop] of Object.entries(node.properties ?? {})) {
    out.push({ path, name, schema: prop });
    walkProps(prop, `${path}.${name}`, seen, out);
  }
  if (node.items) walkProps(node.items, `${path}[]`, seen, out);
  if (node.additionalProperties && typeof node.additionalProperties === 'object') walkProps(node.additionalProperties, `${path}{}`, seen, out);
}

/** Schemas de entrada e de saída que pertencem ao pacote R2 (nome -> schema). */
const R2_SCHEMA_NAMES = Object.keys(schemas).filter((n) => /^(Campaign|Coupon|Activation|Simulation|Invite|AcceptCampaign|StoreCoupon|Metric|Dashboard|Duplicate|AnalyticsFunnel|AnalyticsInterest|RecordAnalytics|Barcode|Promotion|CartSummaryLine|DiscountOrigin|CheckoutStarted)/.test(n));

describe('contrato OpenAPI da v1.1 R2', () => {
  it('a versão do contrato subiu e há operações da R2, todas com id, resumo, descrição e autenticação', () => {
    expect(contract.info.version).toBe('0.5.0');
    expect(r2.length).toBe(37);
    for (const { key, op } of r2) {
      expect(op.operationId, key).toBeTruthy();
      expect(op.summary, key).toBeTruthy();
      expect(String(op.description ?? '').length, key).toBeGreaterThan(40);
      expect(op.security, `${key}: nenhuma rota da R2 é pública`).toBeUndefined(); // vale o Bearer global; `security: []` seria pública
      expect(Object.keys(op.responses), key).toContain('401');
    }
    const ids = all.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('as histórias da R2 estão cobertas (o contrato cobre todas as telas das specs)', () => {
    const text = JSON.stringify(r2.map((o) => [o.op.summary, o.op.description]));
    it.each(['WB-340', 'WB-341', 'WB-342', 'WB-343', 'WB-344', 'WB-345', 'WB-346', 'WB-347', 'WB-348', 'WB-349', 'WB-356', 'WB-357', 'WB-362', 'WB-367', 'WB-373'])('%s é citada por alguma operação', (id) => {
      expect(text).toContain(id);
    });
    it('os controles de segurança C-CUP e C-DSH aparecem no texto do contrato', () => {
      const every = JSON.stringify(contract.paths) + JSON.stringify(schemas);
      for (const c of ['C-CUP-01', 'C-CUP-02', 'C-CUP-05', 'C-CUP-06', 'C-CUP-07', 'C-CUP-10', 'C-CUP-12', 'C-DSH-01', 'C-DSH-02', 'C-DSH-03', 'C-DSH-04', 'C-DSH-05', 'C-DSH-06']) expect(every, c).toContain(c);
    });
    it('os critérios por papel e por tela têm rota: lista, simulação, ciclo de vida, convite, aceite, cupom da loja, relatório, suspeitos, vitrine, painéis', () => {
      const ids = r2.map((o) => o.op.operationId).sort();
      for (const id of [
        'listCampaigns', 'createCampaign', 'simulateCampaign', 'getCampaign', 'updateCampaign', 'activateCampaign', 'pauseCampaign', 'resumeCampaign', 'endCampaign', 'duplicateCampaign',
        'listCampaignStores', 'inviteCampaignStores', 'getCampaignReport', 'exportCampaignReportCsv', 'listCampaignAlerts', 'getCampaignBudget', 'listCouponSuspects', 'releaseCouponSuspect',
        'listStoreCampaignInvites', 'acceptCampaignInvite', 'declineCampaignInvite', 'leaveCampaign', 'listStoreCoupons', 'createStoreCoupon', 'previewStoreCoupon', 'updateStoreCoupon',
        'listCartCouponOffers', 'getDashboardCatalog', 'queryDashboardMetric', 'listDashboards', 'getDashboard', 'duplicateDashboard', 'getAdminAnalyticsFunnel', 'getAdminAnalyticsInterest',
        'recordAnalyticsInterest', 'lookupProductBarcode', 'getPromotionEligibility',
      ]) expect(ids, id).toContain(id);
    });
  });

  describe('autorização por papel e escopo (C-ADM-01, C-GEN-02, C-CUP-07, C-CUP-08)', () => {
    it.each(adminR2.map((o) => [o.key, o] as const))('%s declara permissão e perfis, iguais à matriz', (_key, { op }) => {
      const permission = op['x-admin-permission'] as string | undefined;
      const profiles = op['x-admin-profiles'] as string[] | undefined;
      expect(permission, 'x-admin-permission').toBeTruthy();
      expect(Array.isArray(profiles), 'x-admin-profiles').toBe(true);
      const expected = (ADMIN_PERMISSIONS as Record<string, readonly string[]>)[permission as string] ?? R2_NEW_PERMISSIONS[permission as string];
      expect(expected, `permissão desconhecida: ${permission}`).toBeDefined();
      expect([...(profiles as string[])].sort()).toEqual([...expected!].sort());
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['401', '403']));
    });

    it('ativar, retomar e encerrar são só super admin e financeiro; criar, editar e pausar não incluem o financeiro; suporte nunca mexe em campanha', () => {
      for (const id of ['activateCampaign', 'resumeCampaign', 'endCampaign']) expect(byId(id).op['x-admin-profiles'], id).toEqual(['super_admin', 'finance']);
      for (const id of ['createCampaign', 'updateCampaign', 'pauseCampaign', 'duplicateCampaign', 'inviteCampaignStores', 'releaseCouponSuspect']) expect(byId(id).op['x-admin-profiles'], id).toEqual(['super_admin', 'operations']);
      for (const { key, op } of adminR2.filter((o) => o.path.includes('campaign') || o.path.includes('coupon-suspects'))) expect(op['x-admin-profiles'], key).not.toContain('support');
    });

    it('rota de loja do lojista documenta 401, 403 e 404 e NÃO entra no "Ver como" (devolve o líquido da própria loja)', () => {
      for (const { key, op } of storeR2) {
        expect(Object.keys(op.responses), key).toEqual(expect.arrayContaining(['401', '403', '404']));
        expect(op['x-view-as'], key).toBeUndefined();
        expect(JSON.stringify(op.security ?? ''), key).not.toContain('viewAsAuth');
      }
    });

    it('o admin não tem rota que aceite convite ou crie cupom em nome da loja (C-CUP-07)', () => {
      expect(adminR2.filter((o) => /accept|decline|leave/i.test(String(o.op.operationId)))).toEqual([]);
      expect(adminR2.filter((o) => /\/v1\/admin\/stores\/.*coupon/i.test(o.path))).toEqual([]);
      expect(Object.keys(requestSchema(byId('inviteCampaignStores').op)!.properties).sort()).toEqual(['reason', 'storeIds']);
    });
  });

  describe('DEC-088 / F1: nada majora preço, frete ou taxa por cupom; o cliente nunca envia desconto, fonte ou campanha (C-CUP-01)', () => {
    const FORBIDDEN_NAME = /(surcharge|markup|inflate|increase|raise|majora|extraFee|serviceFee|deliveryFee|priceCents|basePrice|newPrice|originalPrice|feeCents)/i;
    it('nenhuma propriedade de ENTRADA das rotas de cupom e campanha altera preço, frete ou taxa', () => {
      const inputs = r2.map((o) => requestSchema(o.op)).filter(Boolean);
      for (const root of inputs) {
        const props: { path: string; name: string }[] = [];
        walkProps(root, 'body', new Set(), props as any);
        expect(props.filter((p) => FORBIDDEN_NAME.test(p.name)), JSON.stringify(root).slice(0, 60)).toEqual([]);
      }
    });

    it('applyCartCoupon aceita só `code`, estrito, e o corpo do pedido não tem campo de desconto, fonte ou campanha', () => {
      const apply = schemas.ApplyCouponRequest;
      expect(apply.additionalProperties).toBe(false);
      expect(Object.keys(apply.properties)).toEqual(['code']);
      const order = schemas.CreateOrderRequest;
      expect(order.additionalProperties).toBe(false);
      expect(Object.keys(order.properties).filter((k) => /(discount|campaign|funding|storeShare|coupon)/i.test(k))).toEqual([]);
      const description = String(all.find((o) => o.op.operationId === 'applyCartCoupon')!.op.description);
      for (const part of ['FIELD_NOT_EDITABLE', 'COUPON_SHORTFALL', 'COUPON_NOT_APPLICABLE', 'COUPON_RATE_LIMITED', 'Cupom inválido', 'NÃO reserva orçamento']) expect(description, part).toContain(part);
      expect(schemas.CouponProblem.allOf[1].properties.shortfall.$ref).toBe('#/components/schemas/CouponShortfall');
      expect(all.find((o) => o.op.operationId === 'applyCartCoupon')!.op.responses['422'].content['application/problem+json'].schema.$ref).toBe('#/components/schemas/CouponProblem');
    });

    it('o cupom da loja não tem loja, fonte, parte da loja nem campanha no corpo: a loja vem da rota (C-CUP-07)', () => {
      const create = schemas.StoreCouponCreate;
      expect(create.additionalProperties).toBe(false);
      expect(Object.keys(create.properties).filter((k) => /(store|funding|campaign|share|webag)/i.test(k))).toEqual([]);
      expect(create.required).toContain('monthlyCapCents');
    });

    it('só existem as 4 fontes de custo e frete grátis é documentado como "O frete é da Webag"', () => {
      expect(schemas.CampaignFunding.enum).toEqual(['webag', 'store', 'split', 'self_funded']);
      expect(String(byId('createCampaign').op.description)).toContain('O frete é da Webag');
      expect(schemas.CampaignCreate.additionalProperties).toBe(false);
      expect(schemas.CampaignPatch.additionalProperties).toBe(false);
    });

    it('o resumo do carrinho e o pedido trazem a composição SEM alterar os campos antigos (aditivo e opcional)', () => {
      for (const name of ['CartCoupon', 'CartSummary', 'Order']) {
        const added = ['origin', 'breakdown', 'shortfall', 'validUntil', 'lines', 'couponBreakdown'].filter((k) => schemas[name].properties?.[k]);
        expect(added.length, name).toBeGreaterThan(0);
        for (const k of added) expect(schemas[name].required ?? [], `${name}.${k} é opcional`).not.toContain(k);
      }
      expect(schemas.CartSummaryLine.properties.key.enum).toEqual(['subtotal', 'delivery', 'service_fee', 'coupon_discount', 'total']);
    });
  });

  describe('dinheiro em centavos inteiros, lista paginada, idempotência e versão', () => {
    it('toda propriedade `...Cents` dos schemas da R2 é inteira (nunca number)', () => {
      const bad: string[] = [];
      for (const name of R2_SCHEMA_NAMES) {
        const props: { path: string; name: string; schema: any }[] = [];
        walkProps({ $ref: `#/components/schemas/${name}` }, name, new Set(), props);
        for (const p of props.filter((x) => /Cents$/.test(x.name))) {
          const types = ([] as string[]).concat(p.schema.type ?? p.schema.oneOf?.map((o: any) => o.type) ?? []);
          if (types.includes('number') && !types.includes('integer')) bad.push(`${p.path}.${p.name}`);
        }
      }
      expect(bad).toEqual([]);
    });

    it('toda lista da R2 tem `data` e `nextCursor` e aceita `limit` (exceto a vitrine de até 20 ofertas)', () => {
      for (const { key, op } of r2.filter((o) => String(o.op.operationId).startsWith('list') && o.op.operationId !== 'listCartCouponOffers')) {
        const schema = okSchema(op)!;
        expect(Object.keys(schema.properties), key).toEqual(expect.arrayContaining(['data', 'nextCursor']));
        expect(hasParam(op, 'Limit'), key).toBe(true);
      }
      expect(schemas.CouponOfferList.properties.data.maxItems).toBe(20);
    });

    it('as escritas que o app repete em 3G exigem `Idempotency-Key` (criar, duplicar, convidar, aceitar, cupom da loja, painel)', () => {
      for (const id of ['createCampaign', 'duplicateCampaign', 'inviteCampaignStores', 'acceptCampaignInvite', 'createStoreCoupon', 'duplicateDashboard']) expect(hasParam(byId(id).op, 'IdempotencyKeyRequired'), id).toBe(true);
      for (const id of ['activateCampaign', 'pauseCampaign', 'resumeCampaign', 'endCampaign', 'releaseCouponSuspect']) expect(hasParam(byId(id).op, 'IdempotencyKey'), id).toBe(true);
    });

    it('edição, ativação e retomada conferem a versão (409) e toda escrita do admin exige motivo (auditoria)', () => {
      for (const id of ['updateCampaign', 'activateCampaign', 'resumeCampaign']) {
        expect(requestSchema(byId(id).op)!.required, id).toContain('expectedVersion');
        expect(Object.keys(byId(id).op.responses), id).toContain('409');
      }
      expect(requestSchema(byId('updateStoreCoupon').op)!.required).toContain('expectedVersion');
      for (const { key, op } of adminR2.filter((o) => o.method !== 'get' && !o.path.includes('/dashboard') && !o.path.includes('/analytics') && !o.path.endsWith('/simulate'))) {
        const schema = requestSchema(op);
        expect(schema, `${key}: corpo JSON`).toBeDefined();
        expect(schema!.required, key).toContain('reason');
        const reason = schema!.properties.reason;
        expect([reason.minLength, reason.maxLength], key).toEqual([3, 200]);
      }
    });

    it('rotas sensíveis ou caras documentam 429 (aplicar cupom, vitrine, painéis, código de barras, convite, criação, CSV, porta falsa)', () => {
      for (const id of ['queryDashboardMetric', 'listCartCouponOffers', 'lookupProductBarcode', 'inviteCampaignStores', 'createCampaign', 'createStoreCoupon', 'exportCampaignReportCsv', 'recordAnalyticsInterest', 'getAdminAnalyticsFunnel']) {
        expect(Object.keys(byId(id).op.responses), id).toContain('429');
      }
      expect(Object.keys(all.find((o) => o.op.operationId === 'applyCartCoupon')!.op.responses)).toContain('429');
    });
  });

  describe('ativar com custo da Webag (WB-340 C4 a C11, C-CUP-08)', () => {
    it('os bloqueios têm código estável para cada critério e a ativação documenta o 2º fator recente e a flag', () => {
      const codes = schemas.ActivationBlocker.properties.code.enum as string[];
      for (const c of ['BUDGET_REQUIRED', 'USAGE_OR_BUDGET_REQUIRED', 'MIN_ORDER_TOO_LOW', 'GLOBAL_BUDGET_ZERO', 'GLOBAL_BUDGET_EXCEEDED', 'ABOVE_MARGIN_SUPER_ADMIN_ONLY', 'LOSS_RISK_ACK_REQUIRED', 'FREE_SHIPPING_FUNDING_INVALID', 'FREE_SHIPPING_DISABLED']) expect(codes, c).toContain(c);
      const text = String(byId('activateCampaign').op.description);
      for (const part of ['REAUTH_REQUIRED', 'ACTIVATION_BLOCKED', 'campanhas_cupom', 'super admin', 'R$ 0']) expect(text, part).toContain(part);
      expect(schemas.ActivationBlocker.properties.requiredMinOrderCents).toBeDefined();
      expect(schemas.ActivationBlocker.properties.missingCents).toBeDefined();
    });

    it('a simulação traz o custo previsto do motoboy como campo, com a origem e a marca de provisório (F4), e o pior caso do percentual', () => {
      const row = schemas.SimulationRow;
      expect(Object.keys(row.properties)).toEqual(expect.arrayContaining(['courierCostCents', 'marginCents', 'remainingCents', 'minOrderNeededCents', 'discountStoreCents', 'discountWebagCents']));
      const sim = schemas.CampaignSimulation;
      expect(sim.properties.courierCostSource.enum).toEqual(['delivery_fee_table', 'provisional']);
      expect(sim.required).toEqual(expect.arrayContaining(['provisional', 'worstCase', 'globalBudget']));
      expect(schemas.Campaign.allOf[1].required).toContain('courierCostProvisional');
    });

    it('o orçamento mostra total, reservado, gasto, restante e o do dia, com usos', () => {
      expect(schemas.CampaignBudget.required).toEqual(expect.arrayContaining(['totalCents', 'reservedCents', 'spentCents', 'dailyCents', 'dailyReservedCents', 'dailySpentCents', 'usesReserved', 'usesConfirmed']));
      expect(schemas.CampaignGlobalBudget.properties.monthlyBudgetCents.description).toContain('padrão 0');
    });
  });

  describe('relatório, suspeitos e privacidade (C-CUP-05, C-CUP-12, WB-345, WB-344)', () => {
    it('o relatório traz o custo real, o devolvido, o ticket sem cupom, a conciliação e o parcial, sem dado pessoal', () => {
      expect(schemas.CampaignReport.required).toEqual(expect.arrayContaining(['webagCostCents', 'returnedCents', 'ticketWithoutCouponCents', 'reconciled', 'marginPartial', 'repeat30dReadyAt']));
      const props: { path: string; name: string }[] = [];
      for (const name of ['CampaignReport', 'CouponSuspect', 'CampaignAlert', 'CampaignEnrollment']) walkProps({ $ref: `#/components/schemas/${name}` }, name, new Set(), props as any);
      expect(props.filter((p) => /^(name|email|phone|cpf|document|address|street|cep|deviceId|device|userId|customer|hmac|payer)/i.test(p.name) && p.name !== 'name'), 'sem dado pessoal nem identificador antifraude').toEqual([]);
      expect(Object.keys(schemas.CouponSuspect.properties).sort()).toEqual(['campaignId', 'campaignName', 'detectedAt', 'id', 'orderNumber', 'releasedAt', 'signal', 'state']);
    });

    it('o CSV é text/csv, tem proteção de fórmula e é auditado; não existe "revelar" na lista de suspeitos', () => {
      const csv = byId('exportCampaignReportCsv').op;
      expect(csv.responses['200'].content['text/csv']).toBeDefined();
      expect(String(csv.description)).toMatch(/apóstrofo/);
      expect(String(byId('listCouponSuspects').op.description)).toContain('NÃO existe "revelar"');
      expect(r2.filter((o) => /reveal/i.test(String(o.op.operationId)))).toEqual([]);
    });

    it('o aceite da loja registra versão e hash do texto e exige confirmação explícita; não existe aceite automático', () => {
      const accept = schemas.AcceptCampaignInviteRequest;
      expect(accept.required).toEqual(expect.arrayContaining(['termsVersion', 'termsHash', 'monthlyCapCents', 'confirm']));
      expect(accept.properties.confirm.enum).toEqual([true]);
      expect(String(byId('acceptCampaignInvite').op.description)).toContain('campaign_acceptances');
      expect(String(byId('inviteCampaignStores').op.description)).toContain('nunca registra aceite em nome da loja');
    });
  });

  describe('painéis: catálogo fechado, sem SQL livre e sem dimensão de pessoa (C-DSH-01, C-DSH-04, WB-356)', () => {
    it('a consulta é estrita, com ids de enum, no máximo 2 dimensões e 5 filtros, e a resposta traz atualizado_em, em_cache e n por célula', () => {
      const query = schemas.MetricQuery;
      expect(query.additionalProperties).toBe(false);
      expect(query.properties.dimensionIds.maxItems).toBe(2);
      expect(query.properties.filters.maxItems).toBe(5);
      expect(schemas.MetricFilter.additionalProperties).toBe(false);
      expect(schemas.MetricFilter.properties.op.enum).toEqual(['eq', 'in']);
      expect(schemas.MetricFilter.properties.values.maxItems).toBe(50);
      expect(schemas.MetricResult.required).toEqual(expect.arrayContaining(['generatedAt', 'cached']));
      expect(schemas.MetricResult.properties.rows.maxItems).toBe(5000);
      expect(schemas.MetricCell.required).toEqual(expect.arrayContaining(['n', 'lowSample', 'suppressed']));
    });

    it('não existe dimensão de cliente, motoboy, endereço nem bairro; a lista é fechada', () => {
      expect(schemas.DimensionId.enum).toEqual(['time', 'city', 'store', 'category', 'mode', 'payment_method', 'campaign', 'distance_band', 'origin']);
      for (const d of schemas.DimensionId.enum as string[]) expect(d).not.toMatch(/customer|client|user|courier|motoboy|address|street|neighborhood|bairro|cep/i);
    });

    it('as métricas financeiras são distinguíveis por sensibilidade e o catálogo é filtrado por perfil (C-DSH-02)', () => {
      expect(schemas.MetricSensitivity.enum).toEqual(['general', 'operational', 'financial']);
      expect(schemas.MetricDefinition.required).toEqual(expect.arrayContaining(['sensitivity', 'dimensions', 'minSample', 'polarity', 'definition']));
      const query = byId('queryDashboardMetric').op;
      for (const part of ['METRIC_FORBIDDEN', 'ANTES de ler o cache', '30 consultas por minuto', 'statement_timeout', 'pool separado', '400 dias', 'QUERY_NOT_ALLOWED', 'zero consultas']) expect(String(query.description), part).toContain(part);
      expect(Object.keys(query.responses)).toEqual(expect.arrayContaining(['422', '429', '503']));
    });

    it('os limites do PRD estão no contrato (400 dias, 12 widgets, 20 painéis, 5 s, 5 min, amostras 20 e 5)', () => {
      const ex = (k: string) => schemas.DashboardLimits.properties[k].example;
      expect([ex('maxPeriodDays'), ex('maxWidgetsPerDashboard'), ex('maxDashboardsPerUser'), ex('timeoutSeconds'), ex('cacheSeconds'), ex('lowSampleRate'), ex('lowSampleQuantile'), ex('queriesPerMinute'), ex('concurrentQueries')]).toEqual([400, 12, 20, 5, 300, 20, 5, 30, 2]);
      expect(schemas.Dashboard.properties.widgets.maxItems).toBe(12);
      expect(schemas.DashboardWidget.properties.title.maxLength).toBe(80);
    });

    it('painel pronto não edita (só duplica) e painel de outro admin é 404', () => {
      expect(schemas.Dashboard.required).toContain('editable');
      expect(String(byId('listDashboards').op.description)).toContain('nenhum editável');
      expect(String(byId('getDashboard').op.description)).toContain('404');
      expect(r2.filter((o) => o.path.startsWith('/v1/admin/dashboards') && ['put', 'patch', 'delete'].includes(o.method))).toEqual([]); // o construtor é R3
    });
  });

  describe('lojista: cupom próprio e convite (WB-343, WB-346)', () => {
    it('o teto de percentual e o pedido mínimo do valor fixo têm código de erro e parâmetro', () => {
      const text = String(byId('createStoreCoupon').op.description);
      for (const part of ['STORE_COUPON_PERCENT_ABOVE_MAX', 'STORE_COUPON_MIN_ORDER_TOO_LOW', 'cupom_loja_pct_max', 'R$ 66,67', 'teto mensal em R$ obrigatório']) expect(text, part).toContain(part);
      expect(schemas.StoreCouponPreview.required).toEqual(expect.arrayContaining(['youReceiveWithCents', 'youReceiveWithoutCents', 'maxPct']));
    });

    it('o convite mostra a parte da loja, o exemplo em reais, a validade de 7 dias e o texto versionado com hash', () => {
      expect(schemas.CampaignInvite.required).toEqual(expect.arrayContaining(['storeSharePct', 'example', 'terms', 'suggestedMonthlyCapCents', 'expiresAt']));
      expect(schemas.CampaignInviteTerms.properties.hash.pattern).toBe('^[a-f0-9]{64}$');
      expect(schemas.CampaignInvite.properties.expiresAt.description).toContain('7 dias');
    });
  });

  describe('vitrine e selo de/por (WB-347, WB-348)', () => {
    it('a vitrine só lista públicos, aplicáveis agora ou com "Faltam R$ X", e nunca segmentado ou esgotado', () => {
      const text = String(byId('listCartCouponOffers').op.description);
      for (const part of ['só cupons públicos', 'nunca', 'segmentado', 'esgotado', 'Faltam R$ X']) expect(text, part).toContain(part);
      expect(schemas.CouponOffer.required).toEqual(expect.arrayContaining(['code', 'origin', 'restrictions', 'applicable', 'shortfall', 'validUntil']));
      expect(schemas.DiscountOrigin.enum).toEqual(['webag', 'store', 'webag_and_store', 'delivery_webag']);
    });

    it('a elegibilidade do "de/por" diz o motivo e a data, e o texto fixo do PRD está no contrato', () => {
      expect(String(byId('getPromotionEligibility').op.description)).toContain('Seu desconto só aparece depois de 30 dias de preço anterior.');
      expect(schemas.PromotionEligibility.required).toEqual(expect.arrayContaining(['eligible', 'reasonCode', 'eligibleFrom']));
    });
  });

  describe('acessos, porta falsa e código de barras (WB-362, WB-367, WB-373)', () => {
    it('o funil e a porta falsa não são do suporte e o evento novo não carrega conta, valor nem endereço', () => {
      expect(byId('getAdminAnalyticsFunnel').op['x-admin-profiles']).toEqual(['super_admin', 'operations', 'finance']);
      expect(byId('getAdminAnalyticsInterest').op['x-admin-profiles']).toEqual(['super_admin', 'operations', 'finance']);
      expect(Object.keys(schemas.CheckoutStartedEvent.properties).sort()).toEqual(['eventId', 'name', 'occurredAt', 'sessionId', 'storeId']);
      expect(schemas.CheckoutStartedEvent.additionalProperties).toBe(false);
      expect(schemas.AnalyticsEvent.oneOf.map((o: Json) => o.$ref)).toContain('#/components/schemas/CheckoutStartedEvent');
    });

    it('a porta falsa guarda a faixa de exemplo e não promete preço nem data; o texto livre é curto', () => {
      const req = schemas.RecordAnalyticsInterestRequest;
      expect(req.additionalProperties).toBe(false);
      expect(req.properties.priceBand.enum).toEqual(['up_to_19', '20_to_39', '40_to_79', '80_plus', 'would_not_pay']);
      expect(req.properties.note.maxLength).toBe(140);
    });

    it('o código de barras é conferido no servidor, único por loja, sem rede externa e limitado a 60 por hora', () => {
      const text = String(byId('lookupProductBarcode').op.description);
      for (const part of ['dígito verificador', 'único por loja', 'Nenhuma chamada de rede', 'ean_base_externa', '60 consultas por hora']) expect(text, part).toContain(part);
      expect(schemas.ProductVariant.properties.barcode).toBeDefined();
      expect(schemas.ProductVariant.required ?? []).not.toContain('barcode');
    });
  });
});
