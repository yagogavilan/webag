#!/usr/bin/env node
// SEC-188 (aprovar loja só depois de o admin ABRIR todos os documentos vigentes), pela API real, provedor `fake`. G4 final (tip 036e791).
// Cenários adversariais além da regressão de negócio: (a) outro admin não "herda" a abertura de quem abriu; (b) suporte não abre documento;
// (c) documento REENVIADO depois da abertura exige nova abertura; (d) a abertura é por documento (faltando 1 de 3, recusa e lista só o que falta).
// Uso: API_URL=... MAILPIT_URL=... PG_CONTAINER=... QA_TOTP_FILE=... QA_PROFILES_FILE=... node docs/qa/retestes/sec188.mjs
import { api, adminCall, record, finish, sql, sleep, setParam, resetParam, login, SEED_PASSWORD } from './lib.mjs';
import { uploadReal, jpg } from './onda-8.mjs';
import { profiles, session, as } from './admins.mjs';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const cpf = () => {
  const base = String(Math.floor(Math.random() * 1e9)).padStart(9, '0').split('').map(Number);
  const dv = (list) => {
    const r = list.reduce((a, d, i) => a + d * (list.length + 1 - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  const out = [...base, d1, dv([...base, d1])].join('');
  return /^(\d)\1{10}$/.test(out) ? cpf() : out;
};
async function mailCode(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const code = (found.messages ?? []).find((m) => /código/i.test(m.Subject))?.Subject.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await sleep(400);
  }
}

/** Loja nova em análise (cadastro completo como o lojista faz). */
async function newStoreInReview(tag) {
  const email = `qa188.${tag}.${Date.now()}@seed.webag.local`;
  const terms = await Promise.all(['merchant_terms', 'privacy', 'customer_terms'].map(async (type) => ({ type, version: (await api('GET', `/v1/legal/${type}`)).data?.version })));
  await api('POST', '/v1/auth/register', { body: { name: 'Lojista QA 188', email, phone: `1198${Math.floor(Math.random() * 9e6 + 1e6)}`, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: terms.filter((t) => t.type !== 'merchant_terms') } });
  const session1 = await login(email);
  await api('POST', '/v1/auth/email/verify', { token: session1.token, body: { code: await mailCode(email) } });
  await api('POST', '/v1/me/merchant-role', { token: session1.token, body: { acceptedDocuments: terms.filter((t) => t.type === 'merchant_terms') } });
  const token = session1.token;
  const reauth = () => api('POST', '/v1/auth/reauth', { token, body: { password: SEED_PASSWORD } });
  await reauth();
  const storeId = (await api('POST', '/v1/stores', { token, body: { documentType: 'cpf', documentNumber: cpf() } })).data?.id;
  const categoryId = sql(`select id from categories order by created_at limit 1`);
  await api('PATCH', `/v1/stores/${storeId}/profile`, { token, body: { name: `Loja QA188 ${Date.now() % 100000}`, mainCategoryId: categoryId, whatsapp: '(11) 98888-7777', address: { cep: '07900-100', number: '120' } } });
  const upload = async (kind) => {
    const up = await uploadReal(token, { storeId, purpose: 'store_document', contentType: 'image/jpeg', body: await jpg(900, 600) });
    return api('POST', `/v1/stores/${storeId}/documents`, { token, body: { kind, uploadId: up.done.data.id } });
  };
  for (const kind of ['id_front', 'id_back', 'address_proof']) await upload(kind);
  await reauth();
  const conn = await api('POST', `/v1/stores/${storeId}/payment-account/connect`, { token, body: {} });
  await api('POST', `/v1/stores/${storeId}/payment-account/callback`, { token, body: { code: 'fake-ok', state: conn.data?.state } });
  const submit = await api('POST', `/v1/stores/${storeId}/submit`, { token, body: {} });
  return { storeId, token, reauth, upload, submit };
}
const docsOf = async (storeId) => ((await adminCall('GET', `/v1/admin/stores/${storeId}`)).data?.documents ?? []).filter((d) => d.current);

async function main() {
  const P = await profiles();
  await Promise.all(Object.values(P).map((a) => session(a, P)));
  const ops = (m, p, b) => as(P.operations, m, p, b, undefined, P);
  const sup = (m, p, b) => as(P.support, m, p, b, undefined, P);

  // ---------------------------------------------------------------- A. outro admin e abertura parcial
  const A = await newStoreInReview('a');
  record('S188-0', 'preparo: loja nova em análise com 3 documentos', A.submit.status === 200 && (await docsOf(A.storeId)).length === 3, `submit ${A.submit.status}`);
  const docsA = await docsOf(A.storeId);
  const o1 = await ops('POST', `/v1/admin/stores/${A.storeId}/approve`, {});
  record('S188-1', 'operação aprova sem abrir nada: 409 DOCUMENTS_NOT_REVIEWED, 3 faltando', o1.status === 409 && o1.data?.code === 'DOCUMENTS_NOT_REVIEWED' && o1.data?.errors?.length === 3, `HTTP ${o1.status} ${o1.data?.code} faltam=${o1.data?.errors?.length}`);
  // o super admin abre 2 de 3: nada muda para a operação; o próprio super admin ainda tem 1 faltando
  for (const d of docsA.slice(0, 2)) await adminCall('POST', `/v1/admin/stores/${A.storeId}/documents/${d.id}/access`, { reason: 'initial_review' });
  const s1 = await adminCall('POST', `/v1/admin/stores/${A.storeId}/approve`, {});
  record('S188-2', 'super admin abriu 2 de 3: recusa e lista só o que falta (1 item)', s1.status === 409 && s1.data?.code === 'DOCUMENTS_NOT_REVIEWED' && s1.data?.errors?.length === 1, `HTTP ${s1.status} faltam=${s1.data?.errors?.length} ${JSON.stringify(s1.data?.errors ?? []).slice(0, 100)}`);
  await adminCall('POST', `/v1/admin/stores/${A.storeId}/documents/${docsA[2].id}/access`, { reason: 'initial_review' });
  const o2 = await ops('POST', `/v1/admin/stores/${A.storeId}/approve`, {});
  record('S188-3', 'o super admin abriu tudo, mas a abertura é DE QUEM abriu: a operação segue recusada (409, 3 faltando)', o2.status === 409 && o2.data?.errors?.length === 3, `HTTP ${o2.status} faltam=${o2.data?.errors?.length}`);
  const supOpen = await sup('POST', `/v1/admin/stores/${A.storeId}/documents/${docsA[0].id}/access`, { reason: 'doubt' });
  record('S188-4', 'suporte não abre documento de loja (403)', supOpen.status === 403, `HTTP ${supOpen.status}`);
  const supApprove = await sup('POST', `/v1/admin/stores/${A.storeId}/approve`, {});
  record('S188-4b', 'suporte não aprova loja (403)', supApprove.status === 403, `HTTP ${supApprove.status}`);
  for (const d of docsA) await ops('POST', `/v1/admin/stores/${A.storeId}/documents/${d.id}/access`, { reason: 'initial_review' });
  const o3 = await ops('POST', `/v1/admin/stores/${A.storeId}/approve`, {});
  record('S188-5', 'operação abre os 3 e aprova (200 approved)', o3.status === 200 && o3.data?.status === 'approved', `HTTP ${o3.status} ${o3.data?.status}`);
  const wrongStore = await adminCall('POST', `/v1/admin/stores/${A.storeId}/documents/00000000-0000-4000-8000-000000000000/access`, { reason: 'doubt' });
  record('S188-5b', 'abrir documento que não é da loja: 404 (não conta como abertura)', wrongStore.status === 404, `HTTP ${wrongStore.status}`);

  // ---------------------------------------------------------------- B. documento reenviado depois da abertura
  const B = await newStoreInReview('b');
  const docsB = await docsOf(B.storeId);
  for (const d of docsB) await adminCall('POST', `/v1/admin/stores/${B.storeId}/documents/${d.id}/access`, { reason: 'initial_review' });
  const corr = await adminCall('POST', `/v1/admin/stores/${B.storeId}/request-correction`, { items: [{ item: 'id_front', reason: 'Foto do documento cortada' }] });
  record('S188-6', 'pedir correção (1 item) leva a loja para correction_requested', corr.status === 200 && corr.data?.status === 'correction_requested', `HTTP ${corr.status} ${corr.data?.status}`);
  const re = await B.upload('id_front');
  await B.reauth();
  const resub = await api('POST', `/v1/stores/${B.storeId}/submit`, { token: B.token, body: {} });
  const docsB2 = await docsOf(B.storeId);
  const novo = docsB2.find((d) => d.kind === 'id_front');
  record('S188-7', 'lojista reenvia a frente do documento e envia de novo: loja volta a in_review com documento NOVO (outro id)', re.status === 204 && resub.status === 200 && novo && novo.id !== docsB.find((d) => d.kind === 'id_front').id, `upload ${re.status} submit ${resub.status} ${resub.data?.status ?? ''}`);
  const b1 = await adminCall('POST', `/v1/admin/stores/${B.storeId}/approve`, {});
  record('S188-8', 'depois do reenvio, aprovar só com a abertura antiga = 409 e lista SÓ o documento novo (1 item)', b1.status === 409 && b1.data?.errors?.length === 1 && /id_front/.test(JSON.stringify(b1.data.errors)), `HTTP ${b1.status} ${JSON.stringify(b1.data?.errors ?? []).slice(0, 120)}`);
  if (novo) await adminCall('POST', `/v1/admin/stores/${B.storeId}/documents/${novo.id}/access`, { reason: 'initial_review' });
  const b2 = await adminCall('POST', `/v1/admin/stores/${B.storeId}/approve`, {});
  record('S188-9', 'abrir o documento novo e aprovar: 200 approved', b2.status === 200 && b2.data?.status === 'approved', `HTTP ${b2.status} ${b2.data?.status}`);

  // ---------------------------------------------------------------- C. auditoria
  const audit = sql(`select action||':'||count(*) from audit_log where target_id in ('${A.storeId}','${B.storeId}') and action in ('store.approve_blocked','store.approve') group by action order by action`);
  record('S188-10', 'tentativas bloqueadas e aprovações ficam na auditoria (approve_blocked = 4 nas duas lojas: 3 + 1; approve = 2; o 403 do suporte não chega a auditar a decisão)', /store\.approve_blocked:4/.test(audit.replace(/\n/g, ' ')) && /store\.approve:2/.test(audit.replace(/\n/g, ' ')), audit.replace(/\n/g, ' '));
}
await setParam('pix_hora_max', 30, 'Reteste QA SEC-188 (restaurado no fim)');
try {
  await main();
} catch (error) {
  record('S188-ERRO', 'o script terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '));
}
await resetParam('pix_hora_max').catch(() => undefined);
finish();
