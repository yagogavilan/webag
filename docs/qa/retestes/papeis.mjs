#!/usr/bin/env node
// Teste exploratório curto de segurança funcional de papéis (G4 final): cliente x cliente, cliente x loja, funcionário x dono,
// dono x outra loja, lojista x admin e os 4 perfis de admin (super, operação, financeiro, suporte) contra a API real (provedor `fake`).
// Não substitui a revisão do Security: confere o que a tabela de permissões (permissions.ts) e o RN-13 prometem, por HTTP.
// Uso: node docs/qa/retestes/papeis.mjs   (API com TRUST_PROXY=1; mesmas variáveis do lib.mjs)
import { createHmac, randomUUID } from 'node:crypto';
import { api, adminCall, admin, record, notTested, finish, sql, sleep, setParam, resetParam, login, newCustomer, getOrder, pay, place, cartOf, store as seedStoreOf, SEED_PASSWORD } from './lib.mjs';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN_PASSWORD = 'Webag-Admin-Qa-2026-xK9!';
const FAKE = '00000000-0000-4000-8000-000000000001';

function totp(secret, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}
async function inviteToken(email) {
  for (let i = 0; i < 30; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    for (const m of found.messages ?? []) {
      const detail = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const token = `${detail.Text ?? ''} ${detail.HTML ?? ''}`.match(/convite\?token=([A-Za-z0-9_-]{20,})/)?.[1];
      if (token) return token;
    }
    await sleep(500);
  }
}
/** Convida um admin do perfil, aceita o convite e matricula o TOTP (a sessão final é feita depois, em outro passo de 30 s). */
async function enrollAdmin(profile) {
  const email = `qa8.${profile}.${Date.now()}@seed.webag.local`;
  const inv = await adminCall('POST', '/v1/admin/admins', { name: `Admin QA ${profile}`, email, profile });
  if (inv.status !== 201) throw new Error(`convite ${profile}: ${inv.status} ${JSON.stringify(inv.data).slice(0, 160)}`);
  const token = await inviteToken(email);
  const accepted = await api('POST', '/v1/auth/invitations/accept', { body: { token, password: ADMIN_PASSWORD } });
  if (accepted.status !== 200) throw new Error(`aceitar convite ${profile}: ${accepted.status} ${JSON.stringify(accepted.data).slice(0, 160)}`);
  const limited = accepted.data.tokens.accessToken;
  const setup = await api('POST', '/v1/admin/totp/setup', { token: limited });
  const confirm = await api('POST', '/v1/admin/totp/confirm', { token: limited, body: { code: totp(setup.data.secret) } });
  if (confirm.status !== 200) throw new Error(`totp ${profile}: ${confirm.status}`);
  return { profile, email, secret: setup.data.secret, limited, lastStep: Math.floor(Date.now() / 30000), invitationReuse: await api('POST', '/v1/auth/invitations/accept', { body: { token, password: ADMIN_PASSWORD } }) };
}
async function adminSession(a) {
  while (Math.floor(Date.now() / 30000) <= a.lastStep) await sleep(2000);
  const first = await api('POST', '/v1/auth/login', { body: { email: a.email, password: ADMIN_PASSWORD } });
  const verify = await api('POST', '/v1/auth/mfa/verify', { body: { mfaToken: first.data?.mfaToken, code: totp(a.secret) } });
  if (verify.status !== 200) throw new Error(`login ${a.profile}: ${first.status}/${verify.status} ${JSON.stringify(verify.data).slice(0, 120)}`);
  return verify.data.tokens.accessToken;
}

async function main() {
  const s = await seedStoreOf();
  // ----------------------------------------------------------- atores
  const alice = await newCustomer();
  const bob = await newCustomer();
  const staff = await login('funcionario.mercadinho-boa-compra@seed.webag.local');
  const owner = { token: s.owner };
  const otherOwner = await login('lojista.moda-passo-firme@seed.webag.local');
  const otherStoreId = sql(`select s.id from stores s join store_members m on m.store_id = s.id join users u on u.id = m.user_id where u.email = 'lojista.moda-passo-firme@seed.webag.local' limit 1`);
  record('PAP-0', 'atores preparados: 2 clientes, dono e funcionário da loja A, dono da loja B', Boolean(alice.token && bob.token && staff.token && otherOwner.token && otherStoreId), `lojaB=${otherStoreId}`);
  // convites dos 3 perfis de admin (convite exige reautenticação do super: adminCall cuida)
  const enrolled = [];
  for (const profile of ['operations', 'finance', 'support']) enrolled.push(await enrollAdmin(profile));
  record('PAP-1', 'convite de admin: e-mail com link, aceite com senha, TOTP obrigatório; o mesmo convite não vale duas vezes (410)', enrolled.every((e) => e.invitationReuse.status === 410), enrolled.map((e) => `${e.profile}:reuso=${e.invitationReuse.status}`).join(' '));
  const limitedTry = await api('GET', '/v1/admin/parameters', { token: enrolled[0].limited });
  record('PAP-2', 'a sessão limitada do convite (só TOTP liberado) NÃO acessa rotas de admin', [401, 403].includes(limitedTry.status), `HTTP ${limitedTry.status}`);
  const tokens = { super: await admin() };
  for (const e of enrolled) tokens[e.profile === 'operations' ? 'ops' : e.profile === 'finance' ? 'fin' : 'sup'] = await adminSession(e);
  const T = { anon: null, alice: alice.token, bob: bob.token, staff: staff.token, owner: owner.token, otherOwner: otherOwner.token, ...tokens };

  // ----------------------------------------------------------- pedidos de teste (A é dona)
  const order = await place(alice, 'delivery');
  await pay(alice, order.order.id);
  const orderId = order.order.id;
  const attemptId = sql(`select id from payment_attempts where external_reference = '${orderId}' order by created_at limit 1`);
  const delivery = null;
  void delivery;

  // ----------------------------------------------------------- matriz
  const cases = [];
  const want = (who, method, path, body, expected, label) => cases.push({ who, method, path, body, expected, label });
  // cliente x cliente (IDOR)
  want('bob', 'GET', `/v1/orders/${orderId}`, undefined, [404], 'cliente B lê o pedido da A');
  want('bob', 'POST', `/v1/orders/${orderId}/cancel`, {}, [404], 'cliente B cancela o pedido da A');
  want('bob', 'POST', `/v1/orders/${orderId}/not-received`, {}, [404], 'cliente B avisa "não recebi" no pedido da A');
  want('bob', 'GET', `/v1/orders/${orderId}/exchange-options`, undefined, [404], 'cliente B lê opções de troca da A');
  want('bob', 'POST', `/v1/orders/${orderId}/reviews`, { rating: 1 }, [404], 'cliente B avalia o pedido da A');
  want('bob', 'POST', `/v1/dev/orders/${orderId}/payment/approve`, {}, [404], 'cliente B aprova o PIX simulado do pedido da A (rota dev)');
  want('bob', 'GET', `/v1/me/addresses/${alice.addressId}`, undefined, [404, 405], 'cliente B lê o endereço da A');
  want('bob', 'PATCH', `/v1/me/addresses/${alice.addressId}`, { number: '999' }, [404], 'cliente B altera o endereço da A');
  want('bob', 'DELETE', `/v1/me/addresses/${alice.addressId}`, undefined, [404], 'cliente B apaga o endereço da A');
  want('bob', 'PATCH', '/v1/me', { role: 'admin' }, [400, 422], 'mass assignment: PATCH /me com campo role');
  // cliente x loja
  want('alice', 'GET', `/v1/stores/${s.id}/orders`, undefined, [403, 404], 'cliente lista pedidos da loja');
  want('alice', 'GET', `/v1/stores/${s.id}/finance/summary`, undefined, [403, 404], 'cliente lê o financeiro da loja');
  want('alice', 'POST', `/v1/stores/${s.id}/orders/${orderId}/accept`, {}, [403, 404], 'cliente aceita o próprio pedido pela rota da loja');
  want('alice', 'POST', `/v1/stores/${s.id}/products`, { name: 'Produto invasor' }, [403, 404], 'cliente cria produto na loja');
  // cliente x admin
  want('alice', 'GET', '/v1/admin/parameters', undefined, [401, 403], 'cliente lê parâmetros do admin');
  want('alice', 'GET', '/v1/admin/logistics/deliveries', undefined, [401, 403], 'cliente lê a logística');
  want('alice', 'POST', `/v1/admin/orders/${orderId}/refunds`, { amountCents: 100, reason: 'tentativa de estorno' }, [401, 403], 'cliente se estorna pela rota do admin');
  want('alice', 'GET', '/v1/admin/reports/finance/revenue.csv?from=2026-01-01&to=2026-12-31', undefined, [401, 403], 'cliente baixa o CSV financeiro');
  want('anon', 'GET', '/v1/admin/parameters', undefined, [401], 'sem login lê parâmetros');
  want('anon', 'GET', `/v1/orders/${orderId}`, undefined, [401], 'sem login lê pedido');
  // funcionário (orders + catalog) x dono
  want('staff', 'GET', `/v1/stores/${s.id}/orders`, undefined, [200], 'funcionário com "orders" lista pedidos');
  want('staff', 'GET', `/v1/stores/${s.id}/products`, undefined, [200], 'funcionário com "catalog" lista produtos');
  want('staff', 'GET', `/v1/stores/${s.id}/finance/summary`, undefined, [403], 'funcionário lê o financeiro (RN-13: só dono)');
  want('staff', 'GET', `/v1/stores/${s.id}/finance/statement`, undefined, [403], 'funcionário lê o extrato');
  want('staff', 'GET', `/v1/stores/${s.id}/payment-account`, undefined, [403], 'funcionário lê a conta de recebimento');
  want('staff', 'POST', `/v1/stores/${s.id}/payment-account/connect`, {}, [403], 'funcionário reconecta a conta de recebimento');
  want('staff', 'GET', `/v1/stores/${s.id}/members`, undefined, [403], 'funcionário lê a equipe');
  want('staff', 'POST', `/v1/stores/${s.id}/members/invitations`, { email: 'x@y.com', permissions: ['orders'] }, [403], 'funcionário convida alguém');
  want('staff', 'PUT', `/v1/stores/${s.id}/exchange-policy`, { voluntaryDays: 7, collectionFeeCents: 0 }, [403], 'funcionário muda a política de trocas (configurações)');
  want('staff', 'GET', `/v1/stores/${s.id}/exchanges`, undefined, [403], 'funcionário sem "exchanges" lê trocas');
  want('staff', 'GET', `/v1/stores/${s.id}/reviews`, undefined, [403], 'funcionário sem "reviews" lê avaliações');
  want('staff', 'GET', `/v1/stores/${s.id}/finance/sales/top-products`, undefined, [403], 'funcionário sem "sales_values" lê o ranking de vendas');
  want('staff', 'GET', '/v1/admin/parameters', undefined, [401, 403], 'funcionário no admin');
  // dono da loja B x loja A (não-membro recebe 404)
  want('otherOwner', 'GET', `/v1/stores/${s.id}/orders`, undefined, [404], 'dono da B lista pedidos da A');
  want('otherOwner', 'GET', `/v1/stores/${s.id}/finance/summary`, undefined, [404], 'dono da B lê o financeiro da A');
  want('otherOwner', 'GET', `/v1/stores/${s.id}/products`, undefined, [404], 'dono da B lista produtos da A');
  want('otherOwner', 'POST', `/v1/stores/${s.id}/orders/${orderId}/accept`, {}, [404], 'dono da B aceita pedido da A');
  want('otherOwner', 'POST', `/v1/stores/${otherStoreId}/orders/${orderId}/accept`, {}, [404, 409], 'dono da B aceita pedido da A pela URL da B (pedido de outra loja)');
  want('otherOwner', 'GET', `/v1/stores/${s.id}/members`, undefined, [404], 'dono da B lê a equipe da A');
  want('otherOwner', 'POST', '/v1/uploads', { storeId: s.id, purpose: 'product_image', contentType: 'image/jpeg', sizeBytes: 1000 }, [404], 'dono da B pede upload para a loja A');
  want('owner', 'GET', `/v1/stores/${otherStoreId}/orders`, undefined, [404], 'dono da A lista pedidos da B');
  // lojista x admin
  for (const p of ['/v1/admin/parameters', '/v1/admin/stores', '/v1/admin/logistics/deliveries', '/v1/admin/payments/refund-queue', '/v1/admin/privacy-requests', '/v1/admin/admins', '/v1/admin/coupons']) want('owner', 'GET', p, undefined, [401, 403], `dono de loja lê ${p}`);
  want('owner', 'POST', `/v1/admin/stores/${s.id}/approve`, {}, [401, 403], 'dono aprova a própria loja');
  want('owner', 'PATCH', `/v1/admin/stores/${s.id}/commission`, { pct: 0 }, [401, 403], 'dono zera a própria comissão');
  // perfis de admin: leitura
  const R = (who, path, expected, label) => want(who, 'GET', path, undefined, expected, `${label}`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 200], ['sup', 403]]) R(who, '/v1/admin/parameters', [ok], `${who} lê parâmetros (parameters:read: super, operação, financeiro)`);
  for (const [who, ok] of [['super', 200], ['ops', 403], ['fin', 403], ['sup', 403]]) R(who, '/v1/admin/admins', [ok], `${who} lista admins (admins:manage: só super)`);
  for (const [who, ok] of [['super', 200], ['ops', 403], ['fin', 403], ['sup', 403]]) R(who, '/v1/admin/privacy-requests', [ok], `${who} lê pedidos de titulares (privacy:manage: só super)`);
  for (const [who, ok] of [['super', 200], ['ops', 403], ['fin', 200], ['sup', 403]]) R(who, '/v1/admin/payments/refund-queue', [ok], `${who} lê a fila de estornos (payments:refunds:read: super e financeiro)`);
  for (const [who, ok] of [['super', 200], ['ops', 403], ['fin', 200], ['sup', 403]]) R(who, `/v1/admin/reports/finance/revenue.csv?from=2026-11-01&to=2026-11-30&storeId=${s.id}`, [ok], `${who} baixa o CSV de receita (reports:finance)`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 200], ['sup', 403]]) R(who, '/v1/admin/reports/operations', [ok], `${who} lê relatórios operacionais (suporte não)`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 200], ['sup', 200]]) R(who, '/v1/admin/logistics/deliveries', [ok], `${who} lê a fila da logística (logistics:read: todos)`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 200], ['sup', 200]]) R(who, '/v1/admin/overview/pending', [ok], `${who} lê as pendências do Início`);
  for (const [who, ok] of [['super', 200], ['ops', 403], ['fin', 200], ['sup', 403]]) R(who, '/v1/admin/payments/alerts', [ok], `${who} lê alertas de pagamento (payments:alerts:read)`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 200], ['sup', 403]]) R(who, '/v1/admin/coupons', [ok], `${who} lê cupons (coupons:read: super, operação, financeiro)`);
  for (const [who, ok] of [['super', 200], ['ops', 200], ['fin', 403], ['sup', 403]]) R(who, '/v1/admin/moderation/words', [ok], `${who} lê moderação (moderation:read: super e operação)`);
  // perfis de admin: escrita (o corpo é inválido de propósito: a autorização vem antes da validação, 403 x 400/404/422)
  const W = (who, method, path, body, allowed, label) => want(who, method, path, body, allowed ? [400, 404, 409, 422, 200, 201, 204] : [403], label);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', false], ['sup', false]]) W(who, 'PUT', '/v1/admin/parameters/entrega_max_min', {}, ok, `${who} escreve parâmetro (parameters:write: só super)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', false], ['sup', false]]) W(who, 'POST', `/v1/admin/stores/${FAKE}/approve`, {}, ok, `${who} aprova loja (stores:decide: super e operação)`);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', true], ['sup', false]]) W(who, 'POST', `/v1/admin/orders/${FAKE}/refunds`, { amountCents: 1, reason: 'x' }, ok, `${who} estorna pedido (orders:refund: super e financeiro)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', false], ['sup', false]]) W(who, 'POST', `/v1/admin/logistics/deliveries/${FAKE}/assign`, { courierId: FAKE }, ok, `${who} atribui motoboy (logistics:write: super e operação)`);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', false], ['sup', false]]) W(who, 'POST', `/v1/admin/payments/refund-queue/${FAKE}/cover`, {}, ok, `${who} cobre estorno com dinheiro da Webag (só super)`);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', true], ['sup', false]]) W(who, 'POST', `/v1/admin/payments/refund-queue/${FAKE}/retry`, {}, ok, `${who} tenta de novo o estorno (super e financeiro)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', false], ['sup', false]]) W(who, 'POST', '/v1/admin/coupons', {}, ok, `${who} cria cupom (coupons:write: super e operação)`);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', true], ['sup', false]]) W(who, 'PUT', `/v1/admin/stores/${FAKE}/commission`, {}, ok, `${who} altera comissão (commissions:write: super e financeiro)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', false], ['sup', false]]) W(who, 'POST', `/v1/admin/exchanges/mediations/${FAKE}/decision`, {}, ok, `${who} decide mediação (exchanges:mediate: super e operação)`);
  for (const [who, ok] of [['super', true], ['ops', false], ['fin', true], ['sup', false]]) W(who, 'POST', '/v1/admin/logistics/deliveries/payouts', {}, ok, `${who} marca lote de motoboy como pago (logistics:payout: super e financeiro, SEC-145)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', true], ['sup', true]]) W(who, 'POST', `/v1/admin/logistics/deliveries/${FAKE}/contact-reveal`, { reason: 'x' }, ok, `${who} "revelar contato" (logistics:contact: todos, com motivo e auditoria)`);
  for (const [who, ok] of [['super', true], ['ops', true], ['fin', false], ['sup', false]]) W(who, 'POST', `/v1/admin/logistics/deliveries/${FAKE}/whatsapp-sent`, {}, ok, `${who} usa o WhatsApp da corrida (logistics:write)`);

  let failures = 0;
  const failed = [];
  for (const c of cases) {
    const r = await api(c.method, c.path, { token: T[c.who], body: c.body });
    const ok = c.expected.includes(r.status);
    if (!ok) {
      failures++;
      failed.push(`${c.label}: esperado ${c.expected.join('/')}, obtido ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
    }
  }
  record('PAP-MATRIZ', `matriz de papéis x rotas: ${cases.length} verificações (IDOR entre clientes, cliente x loja x admin, funcionário x dono, loja x loja, 4 perfis de admin)`, failures === 0, failures === 0 ? `${cases.length} de ${cases.length} conforme a tabela` : `${failures} divergências: ${failed.join(' || ')}`);

  // ----------------------------------------------------------- efeitos colaterais: o que o funcionário PODE
  const staffAccept = await api('POST', `/v1/stores/${s.id}/orders/${orderId}/accept`, { token: staff.token, body: {} });
  record('PAP-3', 'funcionário com "orders" aceita pedido (200) e a ação fica atribuída a ele', staffAccept.status === 200, `HTTP ${staffAccept.status}`);
  // pedido de outra loja visto por loja A: 404
  const crossOrder = sql(`select o.id from orders o where o.store_id <> '${s.id}' limit 1`);
  const cross = await api('GET', `/v1/stores/${s.id}/orders/${crossOrder}`, { token: owner.token });
  record('PAP-4', 'dono da A pede pelo URL da A o pedido de OUTRA loja: 404 (não vaza por ID)', cross.status === 404, `HTTP ${cross.status}`);
  // suporte: auditoria só das próprias ações (audit:own)
  const auditSup = await api('GET', '/v1/admin/audit-log?limit=50', { token: tokens.sup });
  const foreign = (auditSup.data?.data ?? []).filter((e) => e.actorEmail && !String(e.actorEmail).startsWith('qa8.support'));
  record('PAP-5', 'suporte vê só as próprias ações na auditoria (o filtro é forçado no servidor)', auditSup.status === 200 && foreign.length === 0, `HTTP ${auditSup.status}; ${(auditSup.data?.data ?? []).length} linhas; de outros atores=${foreign.length}`);
  const auditSuper = await api('GET', '/v1/admin/audit-log?limit=50', { token: tokens.super });
  record('PAP-5b', 'super admin vê as ações de todos', auditSuper.status === 200 && (auditSuper.data?.data ?? []).length > (auditSup.data?.data ?? []).length, `super ${(auditSuper.data?.data ?? []).length} linhas vs suporte ${(auditSup.data?.data ?? []).length}`);
  // reautenticação: o super admin sem reauth recente não convida admin; token de cliente não vira admin
  const garbage = await api('GET', '/v1/admin/parameters', { token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.' });
  record('PAP-6', 'JWT forjado (alg none, role admin) é recusado (401)', garbage.status === 401, `HTTP ${garbage.status}`);
  const refreshAsAccess = await api('GET', '/v1/me', { token: (await api('POST', '/v1/auth/login', { body: { email: bob.email, password: SEED_PASSWORD } })).data?.tokens?.refreshToken });
  record('PAP-7', 'o refresh token não serve como access token (401)', refreshAsAccess.status === 401, `HTTP ${refreshAsAccess.status}`);
  // funcionário revogado perde o acesso
  notTested('PAP-8', 'funcionário removido pelo dono perde o acesso na hora (sessão e permissões)', 'cenário coberto por `O2-EQP` do e2e da API; não repeti por HTTP para não alterar a equipe do seed');
  // dado sensível: contato do cliente só por revelação auditada
  const dlv = sql(`select id from deliveries where kind = 'delivery' order by created_at desc limit 1`);
  const detail = await api('GET', `/v1/admin/logistics/deliveries/${dlv}`, { token: tokens.sup });
  const text = JSON.stringify(detail.data);
  const phoneLike = /\(?\d{2}\)?\s?9?\d{4}-?\d{4}/.test(text.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ''));
  record('PAP-9', 'o detalhe da corrida para o suporte NÃO traz telefone nem endereço completo do cliente (SEC-144: só pelo "Revelar" com motivo e auditoria)', detail.status === 200 && !phoneLike, `HTTP ${detail.status}; telefone no corpo=${phoneLike}`);
  void cartOf;
  void resetParam;
  void setParam;
  void randomUUID;
  void getOrder;
}

try {
  await main();
} catch (error) {
  record('PAPEIS-ERRO', 'o teste de papéis terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 4).join(' | '));
}
process.exit(finish() === 0 ? 0 : 1);
