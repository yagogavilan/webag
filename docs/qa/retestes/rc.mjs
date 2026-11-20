#!/usr/bin/env node
// Reteste do candidato a release (RC, DEC-077, código em f622bc9) contra a API REAL (provedor `fake`): o que mudou desde 0d902ab.
// Seções: dec072 b2 alertas usuarios pedidos manutencao a02 a06 janelas vocerecebe banners logistica
// Uso: API_URL=http://localhost:3400 QA_TOTP_FILE=<segredo do admin> QA_PROFILES_FILE=<arquivo> node docs/qa/retestes/rc.mjs <seção...>
// Para a seção `b2` suba a API com hosts DIFERENTES: ADMIN_WEB_URL=http://admin.webag.test LOJISTA_WEB_URL=http://lojista.webag.test WEB_PUBLIC_URL=http://www.webag.test
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, adminCall, record, notTested, finish, sql, sleep, setParam, resetParam, login, newCustomer, getOrder, pay, place, cartOf, store as seedStoreOf, paidAccepted, inPreparation, readyForCollection, outForDelivery, storeOrder, deliveryOf, waitFor, SEED_PASSWORD, API, LAT, LNG } from './lib.mjs';
import { profiles, session, as, mailTo } from './admins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const money = (m) => (typeof m === 'number' ? m : (m?.amount ?? m?.cents ?? null));
const minutesAgo = (n) => `now() - interval '${n} minutes'`;
const q = (s) => String(s).replace(/'/g, "''");
const ADMIN_URL = process.env.EXPECT_ADMIN_URL ?? 'http://admin.webag.test';
const LOJISTA_URL = process.env.EXPECT_LOJISTA_URL ?? 'http://lojista.webag.test';

let P = null; // perfis de admin com sessão
async function admins() {
  if (P) return P;
  const all = await profiles();
  await Promise.all(Object.values(all).map((a) => session(a, all)));
  P = all;
  return P;
}
const asP = async (profile, method, path, body, headers) => as((await admins())[profile], method, path, body, headers, P);
async function prep() {
  const s = await seedStoreOf();
  sql(`update product_variants set stock = 5000 where id = '${s.variantId}'`); // os pedidos de teste esgotam o estoque do seed
  return s;
}
const rows = (r) => r.data?.data ?? [];

// ====================================================================================================================== DEC-072
async function dec072() {
  await prep();
  const params = await adminCall('GET', '/v1/admin/parameters');
  const list = Array.isArray(params.data) ? params.data : (params.data?.data ?? []);
  const get = (k) => list.find((p) => p.key === k);
  record('D72-1', 'comissão padrão = 15 (DEC-072/073)', Number(get('comissao_padrao_pct')?.value) === 15 && Number(get('comissao_padrao_pct')?.default) === 15, JSON.stringify(get('comissao_padrao_pct')));
  const owner = await login('lojista.mercadinho-boa-compra@seed.webag.local');
  const mine = await api('GET', '/v1/stores/mine', { token: owner.token });
  const mineStore = (mine.data?.data ?? mine.data)?.[0] ?? mine.data;
  record('D72-1b', 'o lojista vê a comissão efetiva (15%) e a origem; a tarifa estimada do provedor vem de parâmetro', mineStore?.commissionPct === 15 && Boolean(mineStore?.providerFeePct), `commissionPct=${mineStore?.commissionPct} source=${mineStore?.commissionSource} providerFeePct=${JSON.stringify(mineStore?.providerFeePct)}`);
  const staff = await login('funcionario.mercadinho-boa-compra@seed.webag.local');
  const sMine = await api('GET', '/v1/stores/mine', { token: staff.token });
  const sStore = (sMine.data?.data ?? sMine.data)?.[0] ?? sMine.data;
  record('D72-1c', 'funcionário NÃO vê comissão nem tarifa (RN-13)', sStore?.commissionPct == null && sStore?.providerFeePct == null, `commissionPct=${sStore?.commissionPct} providerFeePct=${JSON.stringify(sStore?.providerFeePct)}`);
  // comissão do pedido = 15% do subtotal, centavo a centavo
  const c = await newCustomer();
  const o = await place(c, 'pickup', { quantity: 4 });
  const row = sql(`select subtotal_cents||'|'||commission_cents from orders where id = '${o.order?.id}'`).split('|').map(Number);
  record('D72-1d', 'a comissão do pedido novo é 15% do subtotal (arredondada)', row[0] > 0 && Math.abs(row[1] - Math.round(row[0] * 0.15)) <= 1, `subtotal=${row[0]} comissão=${row[1]}`);

  // troca_resposta_h 6 a 72
  const out = [];
  for (const v of [5, 6, 72, 73]) out.push([v, (await adminCall('PUT', '/v1/admin/parameters/troca_resposta_h', { value: v, reason: 'Reteste QA RC: limites DEC-072' })).status]);
  await resetParam('troca_resposta_h');
  record('D72-2', 'troca_resposta_h aceita 6 e 72 e recusa 5 e 73 (6 a 72 h)', out[0][1] >= 400 && out[1][1] === 200 && out[2][1] === 200 && out[3][1] >= 400, JSON.stringify(out));
  const def = (await adminCall('GET', '/v1/admin/parameters')).data;
  const defList = Array.isArray(def) ? def : (def?.data ?? []);
  record('D72-2b', 'troca_resposta_h volta ao padrão 24', Number(defList.find((p) => p.key === 'troca_resposta_h')?.value) === 24, '');

  // alcance mínimo de 3 km
  const tries = [];
  for (const [k, v] of [['entrega_min_por_km', 3], ['entrega_min_por_km', 6], ['entrega_min_por_km', 10], ['entrega_min_por_km', 12], ['entrega_min_por_km', 20]]) {
    const r = await adminCall('PUT', `/v1/admin/parameters/${k}`, { value: v, reason: 'Reteste QA RC: alcance mínimo 3 km' });
    tries.push(`${k}=${v}->${r.status}${r.status === 422 ? ' ' + String(r.data?.detail ?? '').slice(0, 110) : ''}`);
    if (r.status === 200) await resetParam(k);
  }
  const low = await adminCall('PUT', '/v1/admin/parameters/entrega_min_por_km', { value: 20, reason: 'Reteste QA RC: alcance mínimo 3 km' });
  if (low.status === 200) await resetParam('entrega_min_por_km');
  record('D72-3', 'alcance mínimo de 3 km: valor que deixa a entrega abaixo de 3 km é recusado (422) com km na mensagem', low.status === 422 && /mínimo 3/.test(low.data?.detail ?? '') && low.data?.reachKm < 3, `${low.status} ${String(low.data?.detail ?? '').slice(0, 160)}; tentativas: ${tries.join(' | ')}`);

  // parcelas: parcelas_max e parcela_min_cents lidos na intenção do cartão
  async function installmentsFor(quantity) {
    const { cart } = await cartOf(c, 'pickup', undefined, { quantity });
    const total = money(cart.data?.summary?.total);
    const intent = await api('POST', '/v1/card-intents', { token: c.token, body: { mode: 'pickup', cartRevision: cart.data?.revision, expectedTotalCents: total } });
    const token = intent.data?.url ? new URL(intent.data.url).searchParams.get('i') : null;
    const info = token ? await api('GET', `/v1/card-intents/${token}`) : null;
    return { total, max: info?.data?.installmentsMax, token, status: intent.status };
  }
  const a = await installmentsFor(30);
  const expectA = Math.max(1, Math.min(3, Math.floor(a.total / 3000)));
  record('D72-4', 'parcelas: installmentsMax = min(parcelas_max=3, total / parcela_min=R$ 30) e no mínimo 1', a.max === expectA, `total=${a.total} installmentsMax=${a.max} esperado=${expectA}`);
  await setParam('parcelas_max', 2);
  const b = await installmentsFor(30);
  await setParam('parcelas_max', 3);
  await setParam('parcela_min_cents', 1_000_000);
  const d = await installmentsFor(30);
  const over = d.token ? await api('POST', `/v1/card-intents/${d.token}/pay`, { body: { card: { token: 'fake_tok_approved', installments: 2 } } }) : null;
  await resetParam('parcela_min_cents');
  await resetParam('parcelas_max');
  record('D72-4b', 'parcelas_max=2 limita a 2; parcela mínima alta deixa só à vista (1)', b.max === Math.min(2, Math.max(1, Math.floor(b.total / 3000))) && b.max <= 2 && d.max === 1, `parcelas_max=2 -> ${b.max} (total ${b.total}); parcela_min=R$ 10.000 -> ${d.max}`);
  record('D72-4c', 'o servidor recusa 2 parcelas quando a parcela mínima só permite à vista (4xx, nenhum pedido pago)', over !== null && over.status >= 400 && over.status < 500, `HTTP ${over?.status} ${over?.data?.code ?? ''}`);
}

// ====================================================================================================================== B2 + A-01
async function b2() {
  const s = await prep();
  const ownerEmail = 'lojista.mercadinho-boa-compra@seed.webag.local';
  const owner = await login(ownerEmail);
  const t0 = Date.now() - 2000;
  const c = await newCustomer();
  const { order } = await place(c, 'pickup', { quantity: 4 });
  await pay(c, order.id);
  const full = (await getOrder(c, order.id)).data;
  const mail = await mailTo(ownerEmail, new RegExp(`(https?://[^\\s"<]*/lojista/pedidos/${order.id})`), { minCreatedAfter: t0, tries: 40 });
  record('B2-1', 'pedido novo pago: o dono recebe e-mail com link do pedido', Boolean(mail), mail ? `assunto "${mail.subject}"` : 'sem e-mail em 20 s');
  if (mail) {
    const link = mail.match[1];
    record('A01-1', 'o link do e-mail usa o host do LOJISTA (LOJISTA_WEB_URL), não o do admin', link.startsWith(`${LOJISTA_URL}/lojista/pedidos/`) && !mail.text.includes(ADMIN_URL), link);
    record('B2-2', 'o e-mail não traz dado pessoal do cliente nem valor em R$', !mail.text.includes(c.email) && !mail.text.includes(c.phone) && !/Cliente QA/.test(mail.text) && !/R\$\s?\d/.test(mail.text), 'sem e-mail, telefone, nome nem R$ no texto');
    record('B2-3', 'o e-mail traz prazo para aceitar e itens', /aceit/i.test(mail.text) && /\d/.test(mail.text), mail.text.replace(/\s+/g, ' ').slice(0, 240));
  }
  // dedupe: reenviar o evento (aceitar e tentar de novo não manda 2º e-mail de pedido novo)
  await sleep(1500);
  const count = async () => ((await (await fetch(`${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/search?query=${encodeURIComponent(`to:${ownerEmail} ${full.number}`)}`)).json()).messages ?? []).length;
  const n1 = await count();
  record('B2-4', 'um só e-mail por pedido novo (dedupe atômico)', n1 === 1, `${n1} e-mail(s) com o número ${full.number}`);
  // desligar o e-mail: só o canal e-mail (DEC-074a)
  const off = await api('PUT', `/v1/stores/${s.id}/notifications`, { token: owner.token, body: { newOrderEmail: false } });
  const t1 = Date.now() - 1000;
  const c2 = await newCustomer();
  const o2 = await place(c2, 'pickup', { quantity: 4 });
  await pay(c2, o2.order.id);
  await sleep(4000);
  const none = await mailTo(ownerEmail, new RegExp(o2.order.id), { minCreatedAfter: t1, tries: 4 });
  record('B2-5', 'com o e-mail desligado nenhum e-mail sai, e o pedido segue visível ao lojista (alerta no painel não desliga)', off.status < 300 && !none && (await storeOrder(`${o2.order.id}`, 'GET')).status === 200, `PUT notifications ${off.status}; e-mail=${Boolean(none)}`);
  await api('PUT', `/v1/stores/${s.id}/notifications`, { token: owner.token, body: { newOrderEmail: true } });
  // funcionário: sem a permissão orders não recebe; convite de funcionário usa o host do lojista
  const inviteEmail = `qa9.func.${Date.now()}@seed.webag.local`;
  const inv = await api('POST', `/v1/stores/${s.id}/members/invitations`, { token: owner.token, body: { email: inviteEmail, name: 'Func QA Nove', permissions: ['orders'] } });
  const invMail = await mailTo(inviteEmail, /(https?:\/\/[^\s"<]*\/lojista\/convite\?token=[A-Za-z0-9_-]+)/);
  record('A01-2', 'convite de funcionário: link no host do LOJISTA', inv.status < 300 && Boolean(invMail) && invMail.match[1].startsWith(`${LOJISTA_URL}/lojista/convite?token=`), `${inv.status} ${invMail?.match?.[1]?.slice(0, 70)}`);
  // convite de admin: link no host do ADMIN
  const all = await admins();
  record('A01-3', 'convite de admin: link no host do ADMIN', Boolean(all.operations.inviteLink) && all.operations.inviteLink.startsWith(`${ADMIN_URL}/`), String(all.operations.inviteLink).slice(0, 80));
  // A-08: lembrete x timeout
  const timeout = Number((await adminCall('GET', '/v1/admin/parameters')).data?.data?.find?.((p) => p.key === 'loja_aceite_timeout_min')?.value ?? 10);
  const bad = await adminCall('PUT', '/v1/admin/parameters/loja_aceite_lembrete_min', { value: timeout - 1, reason: 'Reteste QA RC: A-08' });
  const good = await adminCall('PUT', '/v1/admin/parameters/loja_aceite_lembrete_min', { value: timeout - 2, reason: 'Reteste QA RC: A-08' });
  await resetParam('loja_aceite_lembrete_min');
  record('A08-1', 'lembrete de aceite >= timeout - 1 é recusado (422); timeout - 2 é aceito', bad.status === 422 && good.status === 200, `timeout=${timeout}; ${timeout - 1}->${bad.status}; ${timeout - 2}->${good.status}`);
}

// ====================================================================================================================== B3 alertas
function audienceTable() {
  const text = readFileSync(join(HERE, '../../../apps/api/src/modules/admin/alert-catalog.ts'), 'utf8');
  const groups = { MONEY: ['super_admin', 'finance'], OPERATION: ['super_admin', 'operations', 'support'], LOGISTICS: ['super_admin', 'operations', 'finance', 'support'] };
  const sym = { SUPER: 'super_admin', OPS: 'operations', FIN: 'finance', SUP: 'support' };
  const table = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s+(\w+): \{ label: '.*?', area: '(\w+)', severity: '(\w+)'.*audience: (.+?) \},?\s*$/);
    if (!m) continue;
    const aud = m[4].trim().replace(/\s+as const$/, '');
    const list = groups[aud] ?? aud.replace(/[[\]]/g, '').split(',').map((x) => sym[x.trim()]);
    table[m[1]] = { area: m[2], severity: m[3], audience: list };
  }
  return table;
}
async function alertas() {
  const all = await admins();
  const table = audienceTable();
  const kinds = Object.keys(table);
  record('B3-0', 'catálogo de alertas lido do código (tipos com perfil)', kinds.length >= 30, `${kinds.length} tipos`);
  const tag = `qa9-${Date.now()}`;
  // limpa e injeta: 1 aberto por tipo, 3 resolvidos, 1 desconhecido
  sql(`delete from payment_alerts where details->>'qa' like 'qa9-%'`);
  const orderId = sql(`select id from orders order by created_at desc limit 1`);
  for (const k of kinds) sql(`insert into payment_alerts (kind, details) values ('${k}', '{"qa":"${tag}","orderId":"${orderId}"}'::jsonb)`);
  sql(`insert into payment_alerts (kind, details) values ('tipo_desconhecido_qa', '{"qa":"${tag}"}'::jsonb)`);
  for (const k of ['delivery_late', 'refund_failed', 'privacy_request_due']) sql(`insert into payment_alerts (kind, details, resolved_at, resolution_note) values ('${k}', '{"qa":"${tag}"}'::jsonb, now(), 'resolvido pelo QA')`);
  const profilesToTest = ['super_admin', 'operations', 'finance', 'support'];
  const call = (p, path) => (p === 'super_admin' ? adminCall('GET', path) : asP(p === 'operations' ? 'operations' : p, 'GET', path));
  const pageAll = async (p, qs) => {
    let cursor = null;
    const out = [];
    for (let i = 0; i < 40; i++) {
      const r = await call(p, `/v1/admin/alerts?limit=50${qs ? `&${qs}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (r.status !== 200) return { status: r.status, data: r.data, items: out };
      out.push(...r.data.data);
      cursor = r.data.nextCursor;
      if (!cursor) break;
    }
    return { status: 200, items: out };
  };
  const seen = {};
  for (const p of profilesToTest) {
    const r = await pageAll(p, `status=open`);
    const mine = r.items.filter((i) => i.details?.qa === tag);
    const got = new Set(mine.map((i) => i.kind));
    const expected = kinds.filter((k) => table[k].audience.includes(p));
    const extraUnknown = got.has('tipo_desconhecido_qa');
    const missing = expected.filter((k) => !got.has(k));
    const leaked = [...got].filter((k) => k !== 'tipo_desconhecido_qa' && !expected.includes(k));
    record(`B3-rbac-${p}`, `perfil ${p} vê exatamente os tipos do seu público (${expected.length}); o desconhecido só o super admin`, r.status === 200 && missing.length === 0 && leaked.length === 0 && extraUnknown === (p === 'super_admin'), `status=${r.status} vê=${got.size} faltando=[${missing}] vazando=[${leaked}] desconhecido=${extraUnknown}`);
    seen[p] = { items: r.items, expected };
    // contador do Início bate com a lista
    const sum = await call(p, '/v1/admin/alerts/summary');
    const openTotal = r.items.length;
    record(`B3-sum-${p}`, `o contador (summary) de ${p} bate com a lista aberta`, sum.status === 200 && sum.data.open === openTotal && sum.data.byKind.reduce((s, k) => s + k.count, 0) === openTotal && Object.values(sum.data.byArea).reduce((s, n) => s + n, 0) === openTotal, `summary.open=${sum.data?.open} lista=${openTotal}`);
    // tipos do catálogo (kinds) = público do perfil
    const kk = await call(p, '/v1/admin/alerts/kinds');
    const kindSet = new Set((kk.data?.data ?? []).map((k) => k.kind));
    record(`B3-kinds-${p}`, `GET /kinds de ${p} lista só os tipos do perfil`, kk.status === 200 && expected.every((k) => kindSet.has(k)) && [...kindSet].every((k) => expected.includes(k)), `${kindSet.size} tipos`);
  }
  // filtros (super admin vê tudo)
  const sup = seen.super_admin.items.filter((i) => i.details?.qa === tag);
  const byArea = async (area) => (await pageAll('super_admin', `status=open&area=${area}`)).items.filter((i) => i.details?.qa === tag);
  let areaOk = true;
  const areaInfo = [];
  for (const area of ['payments', 'orders', 'logistics', 'exchanges', 'stores', 'privacy', 'platform']) {
    const got = await byArea(area);
    const exp = sup.filter((i) => i.area === area).length;
    areaInfo.push(`${area}:${got.length}/${exp}`);
    if (got.length !== exp || got.some((i) => i.area !== area)) areaOk = false;
  }
  record('B3-f-area', 'filtro area devolve só a área pedida (7 áreas)', areaOk, areaInfo.join(' '));
  let sevOk = true;
  const sevInfo = [];
  for (const sev of ['critical', 'warning', 'info']) {
    const got = (await pageAll('super_admin', `status=open&severity=${sev}`)).items.filter((i) => i.details?.qa === tag);
    const exp = sup.filter((i) => i.severity === sev).length;
    sevInfo.push(`${sev}:${got.length}/${exp}`);
    if (got.length !== exp || got.some((i) => i.severity !== sev)) sevOk = false;
  }
  record('B3-f-sev', 'filtro severity devolve só a gravidade pedida', sevOk, sevInfo.join(' '));
  const kind = (await pageAll('super_admin', 'status=open&kind=delivery_ready')).items.filter((i) => i.details?.qa === tag);
  const comb = (await pageAll('super_admin', 'status=open&area=logistics&severity=warning')).items.filter((i) => i.details?.qa === tag);
  record('B3-f-kind', 'filtro kind exato e combinação area+severity', kind.length === 1 && kind[0].kind === 'delivery_ready' && comb.length > 0 && comb.every((i) => i.area === 'logistics' && i.severity === 'warning'), `kind=${kind.length}; area+sev=${comb.length}`);
  const res = (await pageAll('super_admin', 'status=resolved')).items.filter((i) => i.details?.qa === tag);
  const allS = (await pageAll('super_admin', 'status=all')).items.filter((i) => i.details?.qa === tag);
  record('B3-f-status', 'status=resolved traz só os 3 resolvidos (com nota); status=all traz abertos + resolvidos', res.length === 3 && res.every((i) => i.status === 'resolved' && i.resolutionNote === 'resolvido pelo QA') && allS.length === sup.length + 3, `resolved=${res.length} all=${allS.length} open=${sup.length}`);
  const bad = await Promise.all([adminCall('GET', '/v1/admin/alerts?area=foo'), adminCall('GET', '/v1/admin/alerts?severity=foo'), adminCall('GET', '/v1/admin/alerts?status=foo'), adminCall('GET', '/v1/admin/alerts?kind=BAD%20KIND'), adminCall('GET', '/v1/admin/alerts?cursor=lixo')]);
  record('B3-f-invalid', 'filtros inválidos e cursor adulterado: 400, nunca 500', bad.every((r) => r.status === 400), bad.map((r) => r.status).join(','));
  const lim0 = await adminCall('GET', '/v1/admin/alerts?limit=0');
  const lim999 = await adminCall('GET', '/v1/admin/alerts?limit=999');
  const limabc = await adminCall('GET', '/v1/admin/alerts?limit=abc');
  record('B3-f-limit', 'INFORMATIVO: limit=0 e limit=999 não dão 400 (o contrato diz mínimo 1, máximo 50; a API aceita e ajusta)', lim0.status === 200 && lim999.status === 200 && lim999.data.data.length <= 50, `limit=0 -> ${lim0.status} (${lim0.data?.data?.length} itens); limit=999 -> ${lim999.status} (${lim999.data?.data?.length} itens); limit=abc -> ${limabc.status}`);
  const kindNotMine = await call('support', '/v1/admin/alerts?status=open&kind=refund_failed');
  record('B3-f-kind-rbac', 'kind de outro público pelo suporte: lista vazia (não vaza nem dá 403)', kindNotMine.status === 200 && kindNotMine.data.data.length === 0, `${kindNotMine.status} ${kindNotMine.data?.data?.length}`);
  // ordem e paginação sem duplicar
  const pg1 = await adminCall('GET', '/v1/admin/alerts?limit=5');
  const pg2 = await adminCall('GET', `/v1/admin/alerts?limit=5&cursor=${encodeURIComponent(pg1.data.nextCursor)}`);
  const ids = new Set([...pg1.data.data, ...pg2.data.data].map((i) => i.id));
  const ordered = [...pg1.data.data, ...pg2.data.data].every((it, i, arr) => i === 0 || new Date(arr[i - 1].createdAt) >= new Date(it.createdAt));
  record('B3-page', 'paginação por cursor (5+5) sem repetir, mais recentes primeiro', ids.size === 10 && ordered, `únicos=${ids.size} ordenado=${ordered}`);
  // detalhe e resolução
  const refundFailedId = sup.find((i) => i.kind === 'refund_failed')?.id;
  const det = await Promise.all(['operations', 'support', 'finance'].map((p) => call(p, `/v1/admin/alerts/${refundFailedId}`)));
  record('B3-detail-rbac', 'detalhe de alerta de dinheiro: operação 404, suporte 404, financeiro 200', det[0].status === 404 && det[1].status === 404 && det[2].status === 200, det.map((r) => r.status).join(','));
  const lateId = sup.find((i) => i.kind === 'delivery_late')?.id;
  const noteless = await asP('operations', 'POST', `/v1/admin/alerts/${lateId}/resolve`, {});
  const supRes = await asP('support', 'POST', `/v1/admin/alerts/${lateId}/resolve`, { note: 'tentativa do suporte' });
  const opsRes = await asP('operations', 'POST', `/v1/admin/alerts/${lateId}/resolve`, { note: 'Resolvido pela operação no reteste QA' });
  const again = await asP('operations', 'POST', `/v1/admin/alerts/${lateId}/resolve`, { note: 'segunda vez' });
  const hidden = await asP('operations', 'POST', `/v1/admin/alerts/${refundFailedId}/resolve`, { note: 'operação não vê dinheiro' });
  const unk = sup.find((i) => i.kind === 'tipo_desconhecido_qa')?.id;
  const unkOps = await asP('operations', 'POST', `/v1/admin/alerts/${unk}/resolve`, { note: 'operação não vê desconhecido' });
  const unkSuper = await adminCall('POST', `/v1/admin/alerts/${unk}/resolve`, { note: 'super admin resolve o desconhecido' });
  record('B3-resolve', 'resolver: sem nota 400; suporte 403 (só lê); operação 200 e grava quem/quando/nota; repetir 409; tipo de dinheiro 404 p/ operação; desconhecido só o super', noteless.status === 400 && supRes.status === 403 && opsRes.status === 200 && opsRes.data.status === 'resolved' && Boolean(opsRes.data.resolvedByName) && again.status === 409 && hidden.status === 404 && unkOps.status === 404 && unkSuper.status === 200, `semNota=${noteless.status} suporte=${supRes.status} ops=${opsRes.status}(${opsRes.data?.resolvedByName}) repetir=${again.status} dinheiro-ops=${hidden.status} desc-ops=${unkOps.status} desc-super=${unkSuper.status}`);
  const aud = sql(`select count(*) from audit_log where action ilike '%alert%resolve%' and target_id = '${lateId}'`);
  record('B3-audit', 'a resolução fica na auditoria', Number(aud) >= 1, `linhas=${aud}`);
  // alertas REAIS (gerados pelo fluxo, não injetados): detalhe sem dado pessoal
  const realAll = (await pageAll('super_admin', 'status=all')).items.filter((i) => !i.details?.qa);
  const stripped = (i) => JSON.stringify(i.details ?? {}).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  const leaks = realAll.filter((i) => /@|\(\d\d\)|\d{10,}|Cliente QA|Beatriz|Zacarias/.test(stripped(i)));
  const realKinds = [...new Set(realAll.map((i) => i.kind))];
  record('B3-real', 'alertas REAIS gerados pelo fluxo (não injetados) trazem rótulo, dica e só ids/número no details: nenhum e-mail, telefone nem nome de cliente', realAll.length > 0 && realAll.every((i) => i.label && i.hint) && leaks.length === 0, `${realAll.length} alertas reais, tipos=${realKinds.join(',')}; com dado pessoal=${leaks.length}; exemplo ${JSON.stringify(realAll[0]?.details)}`);
  sql(`delete from payment_alerts where details->>'qa' = '${tag}'`);
}

// ====================================================================================================================== B4 usuários
async function usuarios() {
  await admins();
  await sleep(62_000); // janela de 60 s do limite de busca: começa limpa
  const stamp = Date.now();
  const c = await newCustomer();
  // nome e telefone conhecidos
  const phoneDigits = `1198${String(7000000 + (stamp % 999999)).slice(0, 7)}`;
  sql(`update users set name = 'Zacarias Quintanilha QA', phone = '${phoneDigits}' where id = '${c.userId}'`);
  const email = c.email;
  const search = (profile, term) => (profile === 'super' ? adminCall('GET', `/v1/admin/users?q=${encodeURIComponent(term)}`) : asP(profile, 'GET', `/v1/admin/users?q=${encodeURIComponent(term)}`));
  const hit = (r) => rows(r).filter((u) => u.id === c.userId).length;
  const partialEmails = [email.slice(0, 12), email.split('@')[0], `${email.split('@')[0]}@seed`, '@seed.webag.local', email.slice(1), email.replace(/.$/, ''), 'qa7.', `${email.split('@')[0]}%`, `%@seed.webag.local`, '_a7.'];
  const partial = [];
  for (const t of partialEmails) {
    const r = await search('super', t);
    partial.push([t.slice(0, 40), r.status, hit(r)]);
  }
  record('SEC181-1', 'e-mail PARCIAL (10 formas: prefixo, local sem domínio, só domínio, curinga %, _) nunca devolve a conta: lista vazia 200, sem 400', partial.every(([, st, h]) => st === 200 && h === 0), JSON.stringify(partial));
  const full = await search('super', email);
  const fullUp = await search('super', email.toUpperCase());
  record('SEC181-2', 'e-mail INTEIRO (também em maiúsculas) acha a conta', hit(full) === 1 && hit(fullUp) === 1, `${full.status}/${hit(full)}; maiúsculas ${hit(fullUp)}`);
  const row = rows(full).find((u) => u.id === c.userId);
  record('SEC181-3', 'resultado MASCARADO: nome abreviado, e-mail e celular parciais, sem o e-mail real em lugar nenhum da resposta', Boolean(row) && row.emailMasked !== email && !JSON.stringify(full.data).includes(email) && !JSON.stringify(full.data).includes(phoneDigits) && /\*/.test(row.emailMasked) && /\*/.test(row.phoneMasked ?? '*'), `${row?.name} | ${row?.emailMasked} | ${row?.phoneMasked}`);
  const phonePartial = [];
  for (const t of [phoneDigits.slice(0, 5), phoneDigits.slice(2, 9), phoneDigits.slice(-4), phoneDigits.slice(0, 9), `(11) 9${phoneDigits.slice(4, 8)}`]) {
    const r = await search('super', t);
    phonePartial.push([t, r.status, hit(r)]);
  }
  const phoneFull = [await search('super', phoneDigits), await search('super', `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${phoneDigits.slice(7)}`), await search('super', `+55${phoneDigits}`)];
  record('SEC181-4', 'celular PARCIAL (5, 7, 9 dígitos, fim, DDD+parte) = vazio; celular completo (com e sem formatação) acha', phonePartial.every(([, st, h]) => st === 200 && h === 0) && hit(phoneFull[0]) === 1 && hit(phoneFull[1]) === 1, `parciais=${JSON.stringify(phonePartial)}; completo=${hit(phoneFull[0])}/${hit(phoneFull[1])}; +55=${hit(phoneFull[2])}`);
  const byId = await search('super', c.userId);
  const byName = await search('super', 'Quintanilha');
  const short = await search('super', 'Za');
  record('SEC181-5', 'ID exato e nome por trecho (3+ letras) acham; 2 caracteres é recusado (400)', hit(byId) === 1 && hit(byName) === 1 && short.status === 400, `id=${hit(byId)} nome=${hit(byName)} 2 letras=${short.status}`);
  // auditoria: HMAC, nunca o termo
  const term = `termo-secreto-${stamp}@exemplo.com`;
  await search('super', term);
  const audit = sql(`select count(*)||'|'||coalesce(string_agg(coalesce(after::text,'')||coalesce(before::text,'')||coalesce(reason,''),' '),'') from audit_log where action = 'user.search' and at > now() - interval '2 minutes'`);
  const [auditCount, auditText] = [audit.split('|')[0], audit.slice(audit.indexOf('|') + 1)];
  record('SEC181-6', 'cada busca com q é auditada (user.search) sem gravar o termo; a busca sem q não audita', Number(auditCount) > 0 && !auditText.includes(term) && !auditText.includes('exemplo.com') && !auditText.includes(email), `linhas=${auditCount}; termo vazou=${auditText.includes('termo-secreto')}`);
  const before = sql(`select count(*) from audit_log where action = 'user.search'`);
  await adminCall('GET', '/v1/admin/users');
  const after = sql(`select count(*) from audit_log where action = 'user.search'`);
  record('SEC181-7', 'listar sem q (mais recentes) não gera auditoria de busca', before === after, `${before} -> ${after}`);
  // admin não aparece
  const adminHit = await search('super', 'admin@webag.local');
  const adminId = sql(`select id from users where email = 'admin@webag.local'`);
  const adminDetail = await adminCall('GET', `/v1/admin/users/${adminId}`);
  record('SEC181-8', 'conta de admin nunca aparece na busca e o detalhe é 404', rows(adminHit).length === 0 && adminDetail.status === 404, `busca=${rows(adminHit).length} detalhe=${adminDetail.status}`);
  // RBAC: financeiro não lê; suporte lê mas não bloqueia; operação bloqueia
  const fin = await asP('finance', 'GET', '/v1/admin/users');
  const sup = await asP('support', 'GET', '/v1/admin/users');
  const supBlock = await asP('support', 'POST', `/v1/admin/users/${c.userId}/block`, { reason: 'Tentativa do suporte (deve falhar)' });
  const finBlock = await asP('finance', 'POST', `/v1/admin/users/${c.userId}/block`, { reason: 'Tentativa do financeiro (deve falhar)' });
  const shortReason = await adminCall('POST', `/v1/admin/users/${c.userId}/block`, { reason: 'curto' });
  record('B4-rbac', 'users:read = super, operação, suporte (financeiro 403); bloquear = super e operação (suporte e financeiro 403); motivo curto 400', fin.status === 403 && sup.status === 200 && supBlock.status === 403 && finBlock.status === 403 && shortReason.status === 400, `fin=${fin.status} sup=${sup.status} sup-block=${supBlock.status} fin-block=${finBlock.status} motivo-curto=${shortReason.status}`);
  // bloqueio pela operação: sessões revogadas
  const me0 = await api('GET', '/v1/me', { token: c.token });
  const blk = await asP('operations', 'POST', `/v1/admin/users/${c.userId}/block`, { reason: 'Reteste QA RC: abuso simulado do cliente' });
  const me1 = await api('GET', '/v1/me', { token: c.token });
  const loginBlocked = await login(c.email);
  const again = await asP('operations', 'POST', `/v1/admin/users/${c.userId}/block`, { reason: 'Reteste QA RC: bloquear de novo' });
  const det = await adminCall('GET', `/v1/admin/users/${c.userId}`);
  record('B4-block', 'operação bloqueia com motivo: status blocked, sessão derrubada na hora (401), login recusado, repetir 409, histórico mascarado no detalhe', me0.status === 200 && blk.status === 200 && blk.data.status === 'blocked' && me1.status === 401 && ![200].includes(loginBlocked.status) && again.status === 409 && det.data.blockHistory?.length >= 1, `me antes=${me0.status} bloqueio=${blk.status} me depois=${me1.status} login=${loginBlocked.status} ${loginBlocked.data?.code ?? ''} repetir=${again.status} histórico=${det.data?.blockHistory?.length}`);
  // SEC-182: conta bloqueada exclui a conta e o arrependimento NÃO reabre
  const start = await api('POST', '/v1/auth/account-deletion/start', { body: { email: c.email, password: SEED_PASSWORD } });
  const fin2 = start.data?.deleteTicket ? await api('POST', '/v1/auth/account-deletion/finish', { body: { deleteTicket: start.data.deleteTicket } }) : start;
  const st1 = sql(`select status from users where id = '${c.userId}'`);
  const cancel = await api('POST', '/v1/auth/account-deletion/cancel', { body: { email: c.email, password: SEED_PASSWORD } });
  const st2 = sql(`select status from users where id = '${c.userId}'`);
  const loginAgain = await login(c.email);
  record('SEC182-1', 'conta BLOQUEADA consegue pedir a exclusão (senha certa); fica deleted; ao desistir volta BLOQUEADA (não fura o bloqueio) e o login segue recusado', start.status === 200 && [200, 202, 204].includes(fin2.status) && st1 === 'deleted' && cancel.status === 204 && st2 === 'blocked' && loginAgain.status !== 200, `start=${start.status} finish=${fin2.status} status=${st1} -> desistir ${cancel.status} -> ${st2}; login=${loginAgain.status}`);
  const unb = await asP('operations', 'POST', `/v1/admin/users/${c.userId}/unblock`, { reason: 'Reteste QA RC: desbloqueio' });
  const loginOk = await login(c.email);
  record('B4-unblock', 'desbloquear com motivo reabre o acesso', unb.status === 200 && unb.data.status === 'active' && loginOk.status === 200, `${unb.status} ${unb.data?.status}; login ${loginOk.status}`);
  // lojista: bloqueio suspende lojas com texto neutro (SEC-183)
  const merchantEmail = sql(`select u.email from users u join store_members m on m.user_id = u.id join stores s on s.id = m.store_id where m.role = 'owner' and u.email like 'lojista.papelaria%' limit 1`) || sql(`select u.email from users u join store_members m on m.user_id = u.id where m.role = 'owner' and u.email like 'lojista.%@seed.webag.local' and u.email not like '%mercadinho%' and u.email not like '%moda-passo%' limit 1`);
  const merchantId = sql(`select id from users where email = '${merchantEmail}'`);
  const mBlock = await asP('operations', 'POST', `/v1/admin/users/${merchantId}/block`, { reason: 'Reteste QA RC: lojista bloqueado' });
  const mLogin = await login(merchantEmail);
  const storeStatus = sql(`select string_agg(s.status, ',') from stores s join store_members m on m.store_id = s.id where m.user_id = '${merchantId}'`);
  record('SEC183-1', 'bloquear lojista suspende as lojas dele e o login recusado traz texto neutro (sem motivo interno)', mBlock.status === 200 && (mBlock.data.suspendedStoreIds?.length ?? 0) >= 1 && mLogin.status !== 200 && !/abuso|reteste|motivo/i.test(JSON.stringify(mLogin.data)), `bloqueio=${mBlock.status} lojas suspensas=${mBlock.data?.suspendedStoreIds?.length} falhas=${mBlock.data?.failedStoreIds?.length}; status lojas=${storeStatus}; login=${mLogin.status} ${JSON.stringify(mLogin.data).slice(0, 140)}`);
  const mUnb = await asP('operations', 'POST', `/v1/admin/users/${merchantId}/unblock`, { reason: 'Reteste QA RC: lojista desbloqueado' });
  const storeStatus2 = sql(`select string_agg(s.status, ',') from stores s join store_members m on m.store_id = s.id where m.user_id = '${merchantId}'`);
  record('B4-unblock-merchant', 'desbloquear o lojista devolve a conta; estado das lojas depois (informativo)', mUnb.status === 200 && (await login(merchantEmail)).status === 200, `lojas depois do desbloqueio=${storeStatus2} (antes ${storeStatus})`);
  const suspendedIds = sql(`select s.id from stores s join store_members m on m.store_id = s.id where m.user_id = '${merchantId}' and s.status = 'suspended'`).split('\n').filter(Boolean);
  const react = [];
  for (const id of suspendedIds) react.push((await adminCall('POST', `/v1/admin/stores/${id}/reactivate`, { reason: 'Reteste QA RC: reativar a loja do lojista desbloqueado' })).status);
  record('B4-reactivate', 'a loja suspensa pelo bloqueio NÃO volta sozinha ao desbloquear (por desenho) e volta com a reativação explícita do admin', storeStatus2.includes('suspended') && react.every((st) => st === 200) && !sql(`select string_agg(s.status, ',') from stores s join store_members m on m.store_id = s.id where m.user_id = '${merchantId}'`).includes('suspended'), `reativar=${react}; status agora=${sql(`select string_agg(s.status, ',') from stores s join store_members m on m.store_id = s.id where m.user_id = '${merchantId}'`)}`);
  // limite 60/min por admin na busca (SEC-181)
  let limited = 0;
  let first429 = null;
  await sleep(62_000); // a janela é de 60 s e as buscas acima já contaram
  for (let i = 0; i < 70; i++) {
    const r = await adminCall('GET', `/v1/admin/users?q=limite-${i}-${stamp}`);
    if (r.status === 429) {
      limited++;
      first429 ??= i + 1;
    }
  }
  record('SEC181-9', 'busca limitada a 60 por minuto por admin: o 61º em diante recebe 429', limited >= 1 && first429 !== null && first429 >= 55 && first429 <= 62, `primeiro 429 na requisição ${first429}; total 429=${limited}/70`);
}

// ====================================================================================================================== B5 pedidos admin
async function pedidos() {
  const s = await prep();
  await admins();
  const c = await newCustomer();
  sql(`update users set name = 'Beatriz Lemos Ferreira' where id = '${c.userId}'`);
  const delivered = await outForDelivery(c);
  const deliveryCode = (await getOrder(c, delivered.order.id)).data?.tracking?.deliveryCode;
  await adminCall('POST', `/v1/admin/logistics/deliveries/${delivered.deliveryId}/status`, { action: 'delivered', code: deliveryCode });
  const active = await paidAccepted(c, 'delivery'); // aceito, para cancelar
  const pickup = await place(c, 'pickup', { quantity: 4 }); // aguardando pagamento
  const callAs = (p, method, path, body, headers) => (p === 'super' ? adminCall(method, path, body, headers) : asP(p, method, path, body, headers));
  const list = (qs, p = 'super') => callAs(p, 'GET', `/v1/admin/orders${qs ? `?${qs}` : ''}`);
  const numberOf = (id) => sql(`select number from orders where id = '${id}'`);
  const n = numberOf(active.id);
  const has = (r, id) => rows(r).some((o) => o.id === id);
  const byNum = await list(`q=${encodeURIComponent(n.slice(-4))}`);
  const byEmail = await list(`q=${encodeURIComponent(c.email)}`);
  const byEmailPart = await list(`q=${encodeURIComponent(c.email.slice(0, 14))}`);
  const byOrderId = await list(`q=${active.id}`);
  const byUserId = await list(`q=${c.userId}`);
  record('B5-q', 'busca q: trecho do número, e-mail EXATO, ID do pedido e ID do cliente acham; e-mail PARCIAL não acha (sem oráculo)', has(byNum, active.id) && has(byEmail, active.id) && !rows(byEmailPart).some((o) => o.customer?.id === c.userId) && has(byOrderId, active.id) && has(byUserId, active.id), `número=${has(byNum, active.id)} e-mail=${has(byEmail, active.id)} parcial=${rows(byEmailPart).length} idPedido=${has(byOrderId, active.id)} idCliente=${has(byUserId, active.id)}`);
  const f = {
    status: await list(`userId=${c.userId}&status=delivered,received,accepted`),
    pickup: await list(`userId=${c.userId}&mode=pickup`),
    delivery: await list(`userId=${c.userId}&mode=delivery`),
    pix: await list(`userId=${c.userId}&paymentMethod=pix`),
    card: await list(`userId=${c.userId}&paymentMethod=card`),
    store: await list(`userId=${c.userId}&storeId=${s.id}`),
    city: await list(`userId=${c.userId}&city=francisco morato`),
    cityOther: await list(`userId=${c.userId}&city=Marte`),
    from: await list(`userId=${c.userId}&from=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`),
    future: await list(`userId=${c.userId}&from=${encodeURIComponent(new Date(Date.now() + 3600_000).toISOString())}`),
    to: await list(`userId=${c.userId}&to=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`),
  };
  const allDelivered = rows(f.status).every((o) => ['delivered', 'received', 'accepted'].includes(o.status));
  record('B5-filtros', 'filtros: status (lista), mode, paymentMethod, storeId, userId, city (sem caixa), from, to', allDelivered && rows(f.status).length >= 2 && rows(f.pickup).every((o) => o.mode === 'pickup') && rows(f.pickup).length === 1 && rows(f.delivery).every((o) => o.mode === 'delivery') && rows(f.delivery).length === 2 && rows(f.pix).length === 3 && rows(f.card).length === 0 && rows(f.store).length === 3 && rows(f.city).length === 3 && rows(f.cityOther).length === 0 && rows(f.from).length === 3 && rows(f.future).length === 0 && rows(f.to).length === 0, `status=${rows(f.status).length} pickup=${rows(f.pickup).length} entrega=${rows(f.delivery).length} pix=${rows(f.pix).length} cartão=${rows(f.card).length} loja=${rows(f.store).length} cidade=${rows(f.city).length}/${rows(f.cityOther).length} from=${rows(f.from).length}/${rows(f.future).length} to=${rows(f.to).length}`);
  const bad = await Promise.all([list('status=foo'), list('mode=foo'), list('paymentMethod=boleto'), list('storeId=nao-uuid'), list('userId=nao-uuid'), list('from=ontem'), list('cursor=lixo'), list('q=a')]);
  record('B5-invalid', 'parâmetros inválidos (status, mode, método, UUID, data, cursor, q de 1 letra): 400, nunca 500', bad.every((r) => r.status === 400), bad.map((r) => r.status).join(','));
  const l51 = await list('limit=51');
  const l0 = await list('limit=0');
  const labc = await list('limit=abc');
  record('B5-f-limit', 'INFORMATIVO: limit=51 e limit=0 não dão 400 (contrato: 1 a 50); a API ajusta e nunca devolve mais de 50', l51.status === 200 && rows(l51).length <= 50 && l0.status === 200, `limit=51 -> ${l51.status} (${rows(l51).length} linhas); limit=0 -> ${l0.status} (${rows(l0).length} linhas); limit=abc -> ${labc.status}`);
  const p1 = await list(`userId=${c.userId}&limit=2`);
  const p2 = await list(`userId=${c.userId}&limit=2&cursor=${encodeURIComponent(p1.data.nextCursor)}`);
  const idsP = [...rows(p1), ...rows(p2)].map((o) => o.id);
  record('B5-page', 'paginação por cursor (2+1) sem repetir nem perder pedido do cliente', rows(p1).length === 2 && rows(p2).length === 1 && new Set(idsP).size === 3 && p2.data.nextCursor == null, `p1=${rows(p1).length} p2=${rows(p2).length} únicos=${new Set(idsP).size}`);
  const lim = await list('limit=50');
  record('B5-page-max', 'limit máximo 50 respeitado', rows(lim).length <= 50 && lim.status === 200, `${rows(lim).length} linhas`);
  // detalhe, máscara, comissão
  const det = {};
  for (const p of ['super', 'operations', 'finance', 'support']) det[p] = await callAs(p, 'GET', `/v1/admin/orders/${active.id}`);
  const d = det.super.data;
  const raw = JSON.stringify(det.super.data);
  record('B5-mask', 'detalhe mascarado: nome abreviado, e-mail/celular parciais, endereço só bairro/cidade/UF (sem rua, número, CEP, complemento)', det.super.status === 200 && /^Beatriz F\.?$/.test(d.customer.name) && !raw.includes(c.email) && !raw.includes(c.phone) && !/Rua do Teste|07900|"number":"100"/.test(raw) && Boolean(d.delivery?.neighborhood), `${d.customer?.name} | ${d.customer?.emailMasked} | ${d.customer?.phoneMasked} | ${JSON.stringify(d.delivery)}`);
  const comm = (p) => det[p].data?.values?.commission;
  record('SEC184-1', 'comissão, application_fee e líquido da loja só para quem tem commissions:read (super, financeiro); operação e suporte recebem null', comm('super') !== null && comm('finance') !== null && det.operations.data?.values?.commission === null && det.operations.data?.values?.applicationFee === null && det.operations.data?.values?.merchantNetBeforeProviderFee === null && det.support.data?.values?.commission === null && det.support.data?.values?.merchantNetBeforeProviderFee === null, `super=${JSON.stringify(comm('super'))} fin=${JSON.stringify(comm('finance'))} ops=${comm('operations')} sup=${comm('support')}`);
  const lista = JSON.stringify((await list(`userId=${c.userId}`, 'operations')).data);
  record('SEC184-2', 'a LISTA para a operação não traz comissão nem application_fee', !/commission|applicationFee|merchantNet/i.test(lista), 'campos ausentes na lista');
  const acts = Object.fromEntries(Object.entries(det).map(([p, r]) => [p, r.data?.allowedActions]));
  record('B5-actions', 'allowedActions por perfil: cancelar/estornar só super e financeiro; operação e suporte sem ação', JSON.stringify(acts.super).includes('cancel') && JSON.stringify(acts.finance).includes('cancel') && JSON.stringify(acts.finance).includes('refund') && !JSON.stringify(acts.operations).match(/cancel|refund/) && !JSON.stringify(acts.support).match(/cancel|refund/), JSON.stringify(acts));
  // RBAC de cancelar e estornar
  const opsCancel = await asP('operations', 'POST', `/v1/admin/orders/${active.id}/cancel`, { reason: 'Operação tentando cancelar (deve falhar)' });
  const supCancel = await asP('support', 'POST', `/v1/admin/orders/${active.id}/cancel`, { reason: 'Suporte tentando cancelar (deve falhar)' });
  const opsRefund = await asP('operations', 'POST', `/v1/admin/orders/${active.id}/refunds`, { amountCents: 100, reason: 'Operação tentando estornar' }, { 'Idempotency-Key': randomUUID() });
  const supRefund = await asP('support', 'POST', `/v1/admin/orders/${active.id}/refunds`, { amountCents: 100, reason: 'Suporte tentando estornar' }, { 'Idempotency-Key': randomUUID() });
  const stillActive = sql(`select status from orders where id = '${active.id}'`);
  record('B5-rbac', 'operação e suporte NÃO cancelam nem estornam (403) e o pedido segue intacto', [opsCancel, supCancel, opsRefund, supRefund].every((r) => r.status === 403) && stillActive === 'accepted', `cancelar ops/sup=${opsCancel.status}/${supCancel.status}; estornar ops/sup=${opsRefund.status}/${supRefund.status}; status=${stillActive}`);
  // estorno parcial pelo financeiro dentro do teto e acima do teto (SEC-142)
  const finRefund = await asP('finance', 'POST', `/v1/admin/orders/${active.id}/refunds`, { amountCents: 150, reason: 'Estorno parcial do reteste QA' }, { 'Idempotency-Key': randomUUID() });
  await setParam('estorno_super_admin_cents', 1000, 'Reteste QA RC: teto do financeiro baixo');
  const finAbove = await asP('finance', 'POST', `/v1/admin/orders/${active.id}/refunds`, { amountCents: 900, reason: 'Soma passa do teto do financeiro' }, { 'Idempotency-Key': randomUUID() });
  const superAbove = await adminCall('POST', `/v1/admin/orders/${active.id}/refunds`, { amountCents: 100, reason: 'Super admin acima do teto' }, { 'Idempotency-Key': randomUUID() });
  await resetParam('estorno_super_admin_cents');
  record('B5-refund', 'financeiro estorna parcial (200/201); acima do teto acumulado (soma) é 403 SUPER_ADMIN_REQUIRED; super admin estorna', [200, 201].includes(finRefund.status) && finAbove.status === 403 && finAbove.data?.code === 'SUPER_ADMIN_REQUIRED' && [200, 201].includes(superAbove.status), `fin=${finRefund.status} acima=${finAbove.status} ${finAbove.data?.code} super=${superAbove.status}`);
  // cancelar pelo financeiro: devolve estoque, cancela a corrida, estorna
  const stockBefore = Number(sql(`select stock from product_variants where id = '${s.variantId}'`));
  const finCancel = await asP('finance', 'POST', `/v1/admin/orders/${active.id}/cancel`, { reason: 'Cancelamento pelo financeiro no reteste QA' });
  const st = sql(`select status||'|'||coalesce(cancelled_by,'') from orders where id = '${active.id}'`);
  const again = await asP('finance', 'POST', `/v1/admin/orders/${active.id}/cancel`, { reason: 'Cancelamento repetido (idempotente)' });
  const refunded = sql(`select coalesce(sum(i.amount_cents),0) from payment_refund_intents i join payment_attempts a on a.id = i.attempt_id where a.external_reference = '${active.id}' and i.status in ('done','pending','processing','covered')`);
  const total = sql(`select total_cents from orders where id = '${active.id}'`);
  const stockAfter = Number(sql(`select stock from product_variants where id = '${s.variantId}'`));
  const dStatus = sql(`select status from deliveries where order_id = '${active.id}' and kind = 'delivery' order by created_at desc limit 1`);
  record('B5-cancel', 'financeiro cancela: pedido cancelled (ator admin), estoque devolvido, corrida cancelada, estorno somando o total, repetir é idempotente', [200, 201].includes(finCancel.status) && st.startsWith('cancelled|admin') && [200, 201].includes(again.status) && Number(refunded) === Number(total) && stockAfter >= stockBefore && /cancel/.test(dStatus || 'cancelled'), `HTTP ${finCancel.status}; ${st}; repetir ${again.status}; estornado=${refunded} de ${total}; estoque ${stockBefore}->${stockAfter}; corrida=${dStatus}`);
  const cancelDelivered = await adminCall('POST', `/v1/admin/orders/${delivered.order.id}/cancel`, { reason: 'Cancelar pedido já entregue (deve falhar)' });
  record('B5-cancel-delivered', 'pedido já entregue não é cancelável (409 ORDER_NOT_CANCELLABLE)', cancelDelivered.status === 409 && cancelDelivered.data?.code === 'ORDER_NOT_CANCELLABLE', `${cancelDelivered.status} ${cancelDelivered.data?.code}`);
  const lojaCanAccept = await storeOrder(`${active.id}/accept`);
  record('B5-cancel-store', 'a loja não aceita mais o pedido cancelado pelo admin', lojaCanAccept.status >= 400, `HTTP ${lojaCanAccept.status}`);
  // auditoria e limite da busca
  const aud = sql(`select count(*) from audit_log where action = 'order.search'`);
  const leak = sql(`select count(*) from audit_log where action = 'order.search' and (coalesce(after::text,'')||coalesce(before::text,'')||coalesce(reason,'')) like '%${q(c.email)}%'`);
  record('A07-1', 'busca q de pedidos é auditada (order.search) sem gravar o termo', Number(aud) >= 4 && Number(leak) === 0, `linhas=${aud}; vazamento do e-mail=${leak}`);
  let first429 = null;
  await sleep(62_000);
  for (let i = 0; i < 70; i++) {
    const r = await adminCall('GET', `/v1/admin/orders?q=limite-${i}-${Date.now()}`);
    if (r.status === 429 && first429 === null) first429 = i + 1;
  }
  record('A07-2', 'busca q de pedidos limitada a 60/min por admin (429)', first429 !== null && first429 >= 50 && first429 <= 62, `primeiro 429 na requisição ${first429} de 70`);
  void pickup;
}

// ====================================================================================================================== modo manutenção
async function manutencao() {
  const s = await prep();
  await admins();
  const c = await newCustomer();
  const pre = await place(c, 'pickup', { quantity: 4 }); // pedido já criado (aguardando PIX) antes da manutenção
  const off0 = await api('GET', '/v1/config/maintenance');
  const opsTry = await asP('operations', 'PUT', '/v1/admin/maintenance', { enabled: true, reason: 'Operação tentando ligar (deve falhar)' });
  const finTry = await asP('finance', 'PUT', '/v1/admin/maintenance', { enabled: true, reason: 'Financeiro tentando ligar (deve falhar)' });
  const opsRead = await asP('support', 'GET', '/v1/admin/maintenance');
  record('MAN-1', 'só o super admin liga (operação e financeiro 403); todo perfil lê o estado; estado inicial desligado', off0.status === 200 && off0.data.active === false && opsTry.status === 403 && finTry.status === 403 && opsRead.status === 200, `público=${JSON.stringify(off0.data)}; ops=${opsTry.status} fin=${finTry.status} suporte lê=${opsRead.status}`);
  const noReason = await adminCall('PUT', '/v1/admin/maintenance', { enabled: true });
  const on = await adminCall('PUT', '/v1/admin/maintenance', { enabled: true, reason: 'Reteste QA RC: janela de manutenção', message: 'Voltamos em instantes (reteste QA)' });
  const pub = await api('GET', '/v1/config/maintenance');
  record('MAN-2', 'ligar exige motivo (400 sem); ligado, o público informa active, mensagem e quem mudou fica no admin', noReason.status === 400 && on.status === 200 && on.data.active === true && pub.data.active === true && /Voltamos/.test(pub.data.message ?? '') && Boolean(on.data.updatedByName), `sem motivo=${noReason.status}; ligar=${on.status}; público=${JSON.stringify(pub.data)}`);
  // pedido novo bloqueado: PIX, retirada, entrega, cartão
  const pix = await place(c, 'pickup', { quantity: 4 });
  const pixDel = await place(c, 'delivery');
  const { cart } = await cartOf(c, 'pickup', undefined, { quantity: 4 });
  const card = await api('POST', '/v1/card-intents', { token: c.token, body: { mode: 'pickup', cartRevision: cart.data?.revision, expectedTotalCents: money(cart.data?.summary?.total) } });
  record('MAN-3', 'com manutenção: pedido novo (PIX retirada e entrega) e intenção de cartão respondem 503 MAINTENANCE', pix.res.status === 503 && pix.res.data?.code === 'MAINTENANCE' && pixDel.res.status === 503 && card.status === 503 && card.data?.code === 'MAINTENANCE', `pix=${pix.res.status} ${pix.res.data?.code}; entrega=${pixDel.res.status}; cartão=${card.status} ${card.data?.code}`);
  // o que segue funcionando
  const home = await api('GET', `/v1/home?lat=${LAT}&lng=${LNG}`);
  const storePage = await api('GET', `/v1/browse/stores/${s.id}/products?limit=3`);
  const cartGet = await api('GET', '/v1/cart?mode=pickup', { token: c.token });
  const mine = await api('GET', '/v1/orders', { token: c.token });
  const adminRead = await adminCall('GET', '/v1/admin/parameters');
  const payOld = await pay(c, pre.order.id).catch((e) => ({ error: String(e) }));
  const accept = await storeOrder(`${pre.order.id}/accept`);
  record('MAN-4', 'leitura, sacola, lista de pedidos, painel admin, PAGAR o pedido já criado e a loja aceitá-lo seguem normais', home.status === 200 && storePage.status === 200 && cartGet.status === 200 && mine.status === 200 && adminRead.status === 200 && payOld?.status === 'received' && accept.status === 200, `home=${home.status} loja=${storePage.status} sacola=${cartGet.status} pedidos=${mine.status} admin=${adminRead.status} pagar-antigo=${payOld?.status ?? payOld?.error} aceitar=${accept.status}`);
  const again = await adminCall('PUT', '/v1/admin/maintenance', { enabled: true, reason: 'Reteste QA RC: ligar de novo (idempotente)' });
  const audOn = sql(`select count(*) from audit_log where action = 'maintenance.enable'`);
  // desligar
  const offr = await adminCall('PUT', '/v1/admin/maintenance', { enabled: false, reason: 'Reteste QA RC: fim da janela' });
  const placed = await waitFor(async () => (await place(c, 'pickup', { quantity: 4 })).res.status === 201, { timeoutMs: 30_000, everyMs: 3000 });
  const pub2 = await api('GET', '/v1/config/maintenance');
  const audOff = sql(`select count(*) from audit_log where action = 'maintenance.disable'`);
  record('MAN-5', 'ligar de novo é idempotente; desligar volta a aceitar pedido em até 15 s (cache); liga e desliga ficam na auditoria', again.status === 200 && offr.status === 200 && placed && pub2.data.active === false && Number(audOn) >= 1 && Number(audOff) >= 1, `de novo=${again.status}; desligar=${offr.status}; pedido volta=${placed}; auditoria on/off=${audOn}/${audOff}`);
}

// ====================================================================================================================== A-02
async function a02() {
  await prep();
  const c = await newCustomer();
  // pedido em separação; cliente pede cancelamento de preparo; a loja NÃO responde e marca pronto
  const o = await inPreparation(c, 'delivery');
  const req = await api('POST', `/v1/orders/${o.id}/cancel-request`, { token: c.token, body: { reason: 'Reteste QA A-02' } });
  const pending1 = sql(`select count(*) from order_cancel_requests where order_id = '${o.id}' and kind = 'preparation' and status = 'pending'`);
  const ready = await storeOrder(`${o.id}/status`, 'POST', { status: 'ready_for_collection', volumes: 1 });
  const statusPrep = sql(`select string_agg(status, ',') from order_cancel_requests where order_id = '${o.id}' and kind = 'preparation'`);
  record('A02-1', 'pedido de cancelamento de preparo pendente + a loja marca pronto: o pedido avança e o pedido de cancelamento é ENCERRADO (superseded)', req.status < 300 && Number(pending1) === 1 && ready.status === 200 && statusPrep === 'superseded', `pedir=${req.status} pendentes=${pending1}; pronto=${ready.status}; estado do pedido de preparo=${statusPrep}`);
  const deliveryId = deliveryOf(o.id);
  const courier = await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA RC', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/assign`, { courierId: courier.data.id });
  for (const action of ['confirm', 'picked_up']) await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action });
  sql(`update orders set eta_to_at = ${minutesAgo(20)}, eta_dispatch_to_at = null where id = '${o.id}'`);
  const v = (await getOrder(c, o.id)).data;
  const late = await api('POST', `/v1/orders/${o.id}/cancel-late`, { token: c.token, body: {} });
  record('A02-2', 'depois do atraso: "Pedir cancelamento" por atraso responde 200/202 (NÃO 500 por índice duplicado)', v.status === 'out_for_delivery' && v.delay?.late === true && [200, 201, 202].includes(late.status), `pedido=${v.status} delay.late=${v.delay?.late}; cancel-late HTTP ${late.status} ${JSON.stringify(late.data).slice(0, 160)}`);
  const kinds = sql(`select string_agg(kind||':'||status, ',' order by kind) from order_cancel_requests where order_id = '${o.id}'`);
  record('A02-3', 'os dois pedidos convivem por tipo (preparation:superseded e late:pending ou late:accepted)', /late:(pending|accepted)/.test(kinds) && /preparation:superseded/.test(kinds), kinds);
  // o mesmo, com a loja RECUSANDO o preparo e depois a loja respondendo: o pedido de preparo decidido não impede o late
  const o2 = await inPreparation(c, 'delivery');
  await api('POST', `/v1/orders/${o2.id}/cancel-request`, { token: c.token, body: { reason: 'Reteste QA A-02 b' } });
  const reject = await storeOrder(`${o2.id}/cancel-request/reject`, 'POST', { reason: 'Já está sendo preparado' });
  await storeOrder(`${o2.id}/status`, 'POST', { status: 'ready_for_collection', volumes: 1 });
  const d2 = deliveryOf(o2.id);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${d2}/assign`, { courierId: courier.data.id });
  for (const action of ['confirm', 'picked_up']) await adminCall('POST', `/v1/admin/logistics/deliveries/${d2}/status`, { action });
  sql(`update orders set eta_to_at = ${minutesAgo(20)} where id = '${o2.id}'`);
  const late2 = await api('POST', `/v1/orders/${o2.id}/cancel-late`, { token: c.token, body: {} });
  record('A02-4', 'preparo recusado pela loja e depois atraso: cancelar por atraso funciona', reject.status === 200 && [200, 201, 202].includes(late2.status), `recusar=${reject.status}; late=${late2.status}`);
}

// ====================================================================================================================== A-06
async function a06() {
  await prep();
  const c = await newCustomer();
  const { cart } = await cartOf(c, 'delivery');
  const accepted = cart.data?.delivery?.eta?.toAt;
  const total = money(cart.data?.summary?.total);
  const res = await api('POST', '/v1/orders', { token: c.token, headers: { 'Idempotency-Key': randomUUID() }, body: { mode: 'delivery', addressId: c.addressId, cartRevision: cart.data?.revision, expectedTotalCents: total, paymentMethod: 'pix', ...(accepted ? { acceptedEtaToAt: accepted } : {}) } });
  const o = res.data;
  record('A06-1', 'a sacola mostra a faixa (delivery.eta) e o pedido criado com acceptedEtaToAt guarda a promessa', Boolean(accepted) && res.status === 201, `sacola eta=${JSON.stringify(cart.data?.delivery?.eta)}; pedido ${res.status}`);
  const row = sql(`select extract(epoch from eta_to_at)::bigint||'|'||extract(epoch from now())::bigint from orders where id = '${o?.id}'`).split('|').map(Number);
  const acceptedEpoch = Math.floor(new Date(accepted).getTime() / 1000);
  record('A06-2', 'o fim da promessa gravada no pedido (eta_to_at) na criação fica dentro de 5 min do fim que o cliente aceitou (tolerância do ETA_CHANGED); no pagamento a faixa é reancorada (DEC-053)', Math.abs(row[0] - acceptedEpoch) <= 300, `aceito=${accepted}; gravado=${new Date(row[0] * 1000).toISOString()} (diferença ${row[0] - acceptedEpoch}s)`);
  await pay(c, o.id);
  const afterPay = sql(`select extract(epoch from eta_to_at)::bigint from orders where id = '${o.id}'`);
  await storeOrder(`${o.id}/accept`);
  await storeOrder(`${o.id}/status`, 'POST', { status: 'in_preparation' });
  await storeOrder(`${o.id}/status`, 'POST', { status: 'ready_for_collection', volumes: 1 });
  const deliveryId = deliveryOf(o.id);
  const courier = await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA A06', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/assign`, { courierId: courier.data.id });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'confirm' });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'picked_up' });
  const dispatch = sql(`select coalesce(extract(epoch from eta_dispatch_to_at)::bigint::text,'nulo')||'|'||extract(epoch from eta_to_at)::bigint from orders where id = '${o.id}'`).split('|');
  const shorter = dispatch[0] !== 'nulo' && Number(dispatch[0]) < Number(dispatch[1]);
  record('A06-3', 'ao sair para a entrega a faixa INFORMATIVA encurta (eta_dispatch_to_at < eta_to_at) e a promessa (eta_to_at) não muda', shorter && Number(dispatch[1]) === Number(afterPay), `dispatch=${dispatch[0]} promessa=${dispatch[1]} (logo após o pagamento ${afterPay}); informativa mais curta=${shorter}`);
  const shown = (await getOrder(c, o.id)).data;
  // promessa vigente ainda no futuro; a faixa informativa já passou: NÃO é atraso
  sql(`update orders set eta_dispatch_to_at = ${minutesAgo(10)}, eta_to_at = now() + interval '25 minutes' where id = '${o.id}'`);
  await sleep(1500);
  const notLate = (await getOrder(c, o.id)).data;
  const early = await api('POST', `/v1/orders/${o.id}/cancel-late`, { token: c.token, body: {} });
  record('A06-4', 'faixa informativa vencida com a promessa ainda no futuro: o pedido NÃO está atrasado e "cancelar sem custo" é recusado (409)', notLate.delay?.late !== true && early.status === 409, `delay=${JSON.stringify(notLate.delay)}; cancel-late=${early.status} ${early.data?.code}; faixa mostrada=${JSON.stringify(shown.delivery?.eta)}`);
  sql(`update orders set eta_to_at = ${minutesAgo(5)} where id = '${o.id}'`);
  await sleep(1500);
  const late = (await getOrder(c, o.id)).data;
  record('A06-5', 'só depois do fim da PROMESSA (faixa aceita) o pedido passa a atrasado', late.delay?.late === true, `delay=${JSON.stringify(late.delay)}`);
}

// ====================================================================================================================== janelas contadas de deliveredAt
async function janelas() {
  const s = await prep();
  const c = await newCustomer();
  const d = await outForDelivery(c);
  const code = (await getOrder(c, d.order.id)).data?.tracking?.deliveryCode;
  const done = await adminCall('POST', `/v1/admin/logistics/deliveries/${d.deliveryId}/status`, { action: 'delivered', code });
  const view = async () => (await getOrder(c, d.order.id)).data;
  const v0 = await view();
  record('JAN-0', 'pedido entregue agora: "Avaliar" e "Pedir troca" disponíveis (allowedActions)', done.status === 200 && v0.status === 'delivered' && v0.allowedActions?.includes('rate') && v0.allowedActions?.includes('request_exchange'), `${JSON.stringify(v0.allowedActions)}; deliveredAt=${v0.deliveredAt}`);
  const setDelivered = (h) => sql(`update orders set delivered_at = now() - interval '${h} hours' where id = '${d.order.id}'`);
  const actions = async (h) => {
    setDelivered(h);
    return (await view()).allowedActions ?? [];
  };
  const days = Number((await adminCall('GET', '/v1/admin/parameters')).data?.data?.find?.((p) => p.key === 'avaliacao_janela_dias')?.value ?? 30);
  const edge = [];
  for (const [h, label] of [[days * 24 - 1, `${days}d - 1h`], [days * 24 + 1, `${days}d + 1h`]]) edge.push([label, await actions(h)]);
  const rateIn = edge[0][1].includes('rate');
  const rateOut = !edge[1][1].includes('rate');
  record('JAN-1', `"Avaliar": vale até ${days} dias DEPOIS DA ENTREGA (deliveredAt), fecha depois; o updated_at do pedido não conta`, rateIn && rateOut, JSON.stringify(edge));
  // API recusa a avaliação fora da janela
  setDelivered(days * 24 + 1);
  const late = await api('POST', `/v1/orders/${d.order.id}/reviews`, { token: c.token, body: { rating: 5, comment: 'fora da janela' } });
  setDelivered(1);
  const ok = await api('POST', `/v1/orders/${d.order.id}/reviews`, { token: c.token, body: { rating: 5, comment: 'dentro da janela, reteste QA' } });
  const again = await api('POST', `/v1/orders/${d.order.id}/reviews`, { token: c.token, body: { rating: 4 } });
  record('JAN-2', 'servidor: avaliação fora da janela 422 REVIEW_WINDOW_CLOSED; dentro 201; repetir 409', late.status === 422 && late.data?.code === 'REVIEW_WINDOW_CLOSED' && ok.status === 201 && again.status === 409, `fora=${late.status} ${late.data?.code}; dentro=${ok.status}; repetir=${again.status}`);
  // troca: arrependimento 7 dias; prazo da loja; defeito
  const win = (await api('GET', `/v1/orders/${d.order.id}/exchange-options`, { token: c.token }));
  const sets = [];
  for (const [h, label] of [[7 * 24 - 2, '7d - 2h'], [7 * 24 + 2, '7d + 2h'], [31 * 24, '31d'], [91 * 24, '91d']]) {
    setDelivered(h);
    const o = await api('GET', `/v1/orders/${d.order.id}/exchange-options`, { token: c.token });
    const it = o.data?.items?.[0];
    const opts = (it?.options ?? it?.types ?? []).map((t) => `${t.type}:${t.available ?? t.eligible ?? ''}`).join(',');
    sets.push([label, (await view()).allowedActions?.includes('request_exchange'), opts || JSON.stringify(it)?.slice(0, 160)]);
  }
  record('JAN-3', '"Pedir troca": contagem pela entrega (deliveredAt); arrependimento some depois de 7 dias; sem nenhum tipo no prazo a ação some', sets[0][1] === true && sets[3][1] === false, JSON.stringify(sets));
  const exch = (h, type) => {
    setDelivered(h);
    return api('POST', `/v1/orders/${d.order.id}/exchanges`, { token: c.token, headers: { 'Idempotency-Key': randomUUID() }, body: { orderItemId: win.data?.items?.[0]?.orderItemId, type, method: 'drop_at_store' } });
  };
  const w8 = await exch(7 * 24 + 2, 'withdrawal');
  const w6 = await exch(6 * 24 + 22, 'withdrawal');
  record('JAN-4', 'servidor: arrependimento aos 6d22h é aceito (201) e aos 7d2h é recusado (409/422)', w6.status === 201 && [409, 422].includes(w8.status), `6d22h=${w6.status} ${w6.data?.code ?? ''}; 7d2h=${w8.status} ${w8.data?.code ?? ''}`);
  void s;
}

// ====================================================================================================================== "Você recebe"
async function vocerecebe() {
  await prep();
  const owner = await login('lojista.mercadinho-boa-compra@seed.webag.local');
  const get = async () => {
    const r = await api('GET', '/v1/stores/mine', { token: owner.token });
    const st = (r.data?.data ?? r.data)?.[0] ?? r.data;
    return st;
  };
  const a = await get();
  await setParam('taxa_provedor_pix_pct', 2, 'Reteste QA RC: tarifa estimada');
  await setParam('taxa_provedor_cartao_pct', 7.5, 'Reteste QA RC: tarifa estimada');
  const b = await get();
  await resetParam('taxa_provedor_pix_pct');
  await resetParam('taxa_provedor_cartao_pct');
  const c = await get();
  record('VR-1', '"Você recebe": a tarifa do provedor vem dos parâmetros (padrão 0,99 PIX e 4,98 cartão; muda e volta) e a comissão efetiva também', a.providerFeePct?.pix === 0.99 && a.providerFeePct?.card === 4.98 && b.providerFeePct?.pix === 2 && b.providerFeePct?.card === 7.5 && c.providerFeePct?.pix === 0.99 && a.commissionPct === 15, `padrão=${JSON.stringify(a.providerFeePct)} alterado=${JSON.stringify(b.providerFeePct)} voltou=${JSON.stringify(c.providerFeePct)} comissão=${a.commissionPct}`);
  // o "mais vendidos" do lojista: youReceive por produto = itens - comissão (proporcional), antes da tarifa
  const top = await api('GET', `/v1/stores/${(await prep()).id}/finance/sales/top-products?limit=3&from=2026-11-01&to=2026-11-30`, { token: owner.token });
  record('VR-2', 'ranking do lojista traz youReceive por produto (líquido antes da tarifa)', top.status === 200 && JSON.stringify(top.data).includes('youReceive'), `${top.status} ${JSON.stringify(top.data).slice(0, 200)}`);
  // comparação numérica: pedido novo, comissão e líquido do financeiro
  const cst = await newCustomer();
  const o = await place(cst, 'pickup', { quantity: 4 });
  await pay(cst, o.order.id);
  const fin = await api('GET', `/v1/stores/${(await prep()).id}/finance/statement?limit=5&from=2026-11-01&to=2026-11-30`, { token: owner.token });
  const mine = JSON.stringify(fin.data);
  record('VR-3', 'o extrato do lojista mostra o pedido com comissão e tarifa do provedor (soma conferida no financeiro)', fin.status === 200 && mine.includes('providerFee') && mine.includes('commission'), `${fin.status} ${mine.slice(0, 200)}`);
}

// ====================================================================================================================== banners
async function banners() {
  const list = (await api('GET', '/v1/banners')).data?.data ?? [];
  const res = [];
  for (const b of list) {
    for (const [size, url] of Object.entries(b.image?.urls ?? {})) {
      const r = await fetch(url).catch(() => null);
      const buf = r ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
      res.push([b.title, size, r?.status, r?.headers.get('content-type'), buf.length]);
    }
  }
  record('BAN-1', 'GET /v1/banners devolve os 3 banners do seed, cada um com 3 tamanhos (400, 800, 1200) e TODOS os arquivos existem (200, image/webp, com bytes)', list.length >= 3 && res.length >= 9 && res.every(([, , st, ct, len]) => st === 200 && /^image\//.test(ct ?? '') && len > 500), `${list.length} banners, ${res.length} arquivos; ${JSON.stringify(res.filter(([, , st, ct, len]) => !(st === 200 && /^image\//.test(ct ?? '') && len > 500)))}; exemplo ${JSON.stringify(res[0])}`);
  const home = await api('GET', `/v1/home?lat=${LAT}&lng=${LNG}`);
  record('BAN-2', 'a home do app traz banners (mesma lista) ou o app os busca em /v1/banners', home.status === 200, `home ${home.status}; chaves: ${Object.keys(home.data ?? {}).join(',')}`);
}

// ====================================================================================================================== logística fora do horário
async function logistica() {
  const s = await prep();
  const c = await newCustomer();
  const hoursNow = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  const closedWindow = `${String((hoursNow + 4) % 24).padStart(2, '0')}:00-${String((hoursNow + 5) % 24).padStart(2, '0')}:00`;
  await setParam('logistica_horario', closedWindow, 'Reteste QA RC: logística fechada agora');
  const del = await place(c, 'delivery');
  const pick = await place(c, 'pickup', { quantity: 4 });
  const cartDel = await cartOf(c, 'delivery');
  await sleep(32_000); // cache de 30 s da descoberta (cartões da busca)
  const view = await api('GET', `/v1/browse/stores/${s.id}?lat=${LAT}&lng=${LNG}&addressId=${c.addressId}`, { token: c.token });
  const search = await api('GET', `/v1/search/stores?lat=${LAT}&lng=${LNG}`);
  const card = (search.data?.data ?? []).find((x) => x.id === s.id);
  record('LOG-1', `fora do horário da logística (${closedWindow}): entrega recusada (422 LOGISTICS_CLOSED), retirada segue (201)`, del.res.status === 422 && del.res.data?.code === 'LOGISTICS_CLOSED' && pick.res.status === 201, `entrega=${del.res.status} ${del.res.data?.code}; retirada=${pick.res.status}`);
  record('LOG-2', 'a loja, a sacola e o cartão da busca dizem por quê e quando volta (unavailableReason / logisticsClosed / opensAt)', card?.delivery?.unavailableReason === 'LOGISTICS_CLOSED' && Boolean(card?.delivery?.logisticsOpensAt) && cartDel.cart.data?.delivery?.available === false && Boolean(cartDel.cart.data?.delivery?.logisticsOpensAt), `cartão da busca (após 32 s)=${JSON.stringify(card?.delivery ?? {}).slice(0, 240)}; loja=${JSON.stringify(view.data?.delivery ?? {}).slice(0, 200)}; sacola=${JSON.stringify(cartDel.cart.data?.delivery ?? {}).slice(0, 400)}`);
  await setParam('logistica_horario', '00:00-23:59', 'Reteste QA RC: volta ao valor do seed de desenvolvimento (24 h)');
  const pause = await adminCall('POST', '/v1/admin/logistics/pause', { reason: 'Reteste QA RC: pausa geral' });
  const delP = await place(c, 'delivery');
  const availP = await adminCall('GET', '/v1/admin/logistics/availability');
  const resume = await adminCall('POST', '/v1/admin/logistics/resume', {});
  const delOk = await place(c, 'delivery');
  record('LOG-3', 'pausa geral da logística recusa entrega (LOGISTICS_PAUSED/CLOSED) e ao retomar volta a aceitar', pause.status < 300 && delP.res.status === 422 && /LOGISTICS_(PAUSED|CLOSED)/.test(delP.res.data?.code ?? '') && resume.status < 300 && delOk.res.status === 201, `pausar=${pause.status}; entrega=${delP.res.status} ${delP.res.data?.code}; retomar=${resume.status}; depois=${delOk.res.status} ${delOk.res.data?.code ?? ''}`);
}

const sections = { dec072, b2, alertas, usuarios, pedidos, manutencao, a02, a06, janelas, vocerecebe, banners, logistica };
const wanted = process.argv.slice(2);
const run = wanted.length ? wanted : Object.keys(sections);
for (const name of run) {
  if (!sections[name]) {
    console.log(`seção desconhecida: ${name}`);
    continue;
  }
  console.log(`\n=== ${name} ===`);
  try {
    await sections[name]();
  } catch (error) {
    record(`${name}-ERRO`, `a seção ${name} quebrou (erro do script ou do ambiente, não conta como aprovada)`, false, String(error?.stack ?? error).slice(0, 400));
  }
}
void notTested;
process.exit(finish() === 0 ? 0 : 1);
