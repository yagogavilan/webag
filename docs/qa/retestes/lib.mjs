// Biblioteca dos retestes de QA contra a API REAL (Onda 7). Sem dependências além do Node 22.
// Pré-requisitos: `pnpm run setup` e a API rodando (pnpm --filter @webag/api dev), provedor `fake`, seed completo, Docker no ar.
// Variáveis: API_URL (padrão http://localhost:3000), MAILPIT_URL (padrão http://localhost:8025), PG_CONTAINER (padrão webag-postgres-1),
//            PG_USER/PG_DB (padrão webag/webag), QA_TOTP_FILE (onde guardar o segredo TOTP do admin de desenvolvimento).
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PG = process.env.PG_CONTAINER ?? 'webag-postgres-1';
const TOTP_FILE = process.env.QA_TOTP_FILE ?? join(tmpdir(), 'webag-qa-admin-totp.txt');
export const SEED_PASSWORD = 'webag-seed-lojista-2026';
export const STORE_SLUG = 'mercadinho-boa-compra';
export const LAT = -23.2801;
export const LNG = -46.744;

// ---------------------------------------------------------------- resultado
export const results = [];
export function record(id, title, pass, evidence = '') {
  results.push({ id, title, pass, evidence });
  console.log(`${pass === null ? 'N/T  ' : pass ? 'PASS ' : 'FALHA'} ${id} | ${title}${evidence ? `  [${evidence}]` : ''}`);
  return pass;
}
/** Verificação que esta rodada NÃO executou (não conta como passou nem como falha). */
export const notTested = (id, title, reason) => record(id, title, null, `NÃO TESTADO: ${reason}`);
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------- http e banco
// A API só confia no X-Forwarded-For com TRUST_PROXY=1 (como atrás do nginx/BFF). O limite de taxa é por IP; para um gerador de teste
// com um único IP, cada conta (token) recebe um IP de origem estável e fictício. Para o ambiente padrão (sem TRUST_PROXY) o cabeçalho é ignorado.
function originOf(token) {
  if (!token) return `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`; // anônimo: IP novo a cada chamada (cadastro e login têm limite por IP)
  const h = createHash('sha1').update(token.slice(-24)).digest();
  return `10.${h[0]}.${h[1]}.${h[2] || 1}`;
}
export async function api(method, path, { body, token, headers = {} } = {}) {
  const send = () =>
    fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': originOf(token), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  // Falha de transporte (ex.: o servidor fechou o socket ocioso do pool, `fetch failed`): UMA nova tentativa só para GET (idempotente); POST nunca é repetido.
  const response = await send().catch((error) => {
    if (method !== 'GET') throw error;
    return send();
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* não é JSON */
  }
  return { status: response.status, data };
}

export function sql(query) {
  const r = spawnSync('docker', ['exec', '-i', PG, 'psql', '-U', process.env.PG_USER ?? 'webag', '-d', process.env.PG_DB ?? 'webag', '-tA', '-F', '|', '-c', query], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql falhou: ${r.stderr}`);
  return r.stdout.trim();
}

// ---------------------------------------------------------------- TOTP do admin de desenvolvimento
function totpCode(secretBase32, offsetSteps = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(message).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  return String((((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3]) % 1_000_000).padStart(6, '0');
}

let adminToken = null;
const TOKEN_FILE = `${TOTP_FILE}.token`;
const LAST_FILE = `${TOTP_FILE}.last`;
const currentStep = () => Math.floor(Date.now() / 30000);
/** Login do admin (senha + TOTP). O servidor recusa reuso do mesmo passo de 30 s, então guarda o token e o último passo usado. */
export async function admin() {
  for (const candidate of [adminToken, existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : null]) {
    if (!candidate) continue;
    const probe = await api('GET', '/v1/admin/parameters', { token: candidate });
    if (probe.status === 200) return (adminToken = candidate);
  }
  const email = 'admin@webag.local';
  const password = 'Webag-Admin-Dev-2026';
  const first = await api('POST', '/v1/auth/login', { body: { email, password } });
  if (first.data?.mfaSetupRequired) {
    const setup = await api('POST', '/v1/admin/totp/setup', { token: first.data.tokens.accessToken });
    writeFileSync(TOTP_FILE, setup.data.secret);
    const confirm = await api('POST', '/v1/admin/totp/confirm', { token: first.data.tokens.accessToken, body: { code: totpCode(setup.data.secret) } });
    if (confirm.status !== 200) throw new Error(`TOTP confirm ${confirm.status}`);
    writeFileSync(LAST_FILE, String(currentStep()));
  }
  if (!existsSync(TOTP_FILE)) throw new Error(`segredo TOTP do admin desconhecido (${TOTP_FILE}); recrie o ambiente com pnpm run setup`);
  const secret = readFileSync(TOTP_FILE, 'utf8').trim();
  let lastVerify = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const last = existsSync(LAST_FILE) ? Number(readFileSync(LAST_FILE, 'utf8')) : 0;
    while (currentStep() <= last + (attempt > 0 ? 1 : 0)) await sleep(2000); // espera o próximo passo de 30 s
    const login = await api('POST', '/v1/auth/login', { body: { email, password } });
    if (!login.data?.mfaToken) throw new Error(`login do admin sem mfaToken: ${login.status} ${JSON.stringify(login.data).slice(0, 200)}`);
    const step = currentStep();
    const verify = await api('POST', '/v1/auth/mfa/verify', { body: { mfaToken: login.data.mfaToken, code: totpCode(secret, 0) } });
    writeFileSync(LAST_FILE, String(step));
    lastVerify = `${verify.status} ${JSON.stringify(verify.data).slice(0, 160)}`;
    if (verify.status === 200) {
      adminToken = verify.data.tokens.accessToken;
      writeFileSync(TOKEN_FILE, adminToken);
      return adminToken;
    }
  }
  throw new Error(`não consegui concluir o login do admin com TOTP: ${lastVerify}`);
}
/** Reautenticação do admin (SEC-016: operações sensíveis pedem o TOTP de novo depois de `reauth_min` = 5 min). Um passo de 30 s por vez. */
async function reauth() {
  const secret = readFileSync(TOTP_FILE, 'utf8').trim();
  const last = existsSync(LAST_FILE) ? Number(readFileSync(LAST_FILE, 'utf8')) : 0;
  while (currentStep() <= last) await sleep(2000);
  const step = currentStep();
  const r = await api('POST', '/v1/auth/reauth', { token: adminToken, body: { totpCode: totpCode(secret, 0) } });
  writeFileSync(LAST_FILE, String(step));
  if (r.status !== 204 && r.status !== 200) throw new Error(`reauth ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
}
export const adminCall = async (method, path, body, headers) => {
  let r = await api(method, path, { body, token: await admin(), headers });
  if (r.status === 403 && r.data?.code === 'REAUTH_REQUIRED') {
    await reauth();
    r = await api(method, path, { body, token: adminToken, headers });
  }
  return r;
};

export async function setParam(key, value, reason = 'Reteste QA Onda 7') {
  const r = await adminCall('PUT', `/v1/admin/parameters/${key}`, { value, reason });
  if (r.status !== 200) throw new Error(`parâmetro ${key}=${value}: HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
// O seed de DESENVOLVIMENTO deixa a logística aberta 24 h, todos os dias (logistica_horario 00:00-23:59, logistica_dias seg_dom); o padrão do código é
// 09:00-20:00, seg_sab. "Restaurar o padrão" desses dois parâmetros fecharia a entrega à noite e derrubaria o resto da rodada: aqui voltam ao valor do seed.
const SEED_OVERRIDES = { logistica_horario: '00:00-23:59', logistica_dias: 'seg_dom' };
export async function resetParam(key) {
  if (SEED_OVERRIDES[key]) return adminCall('PUT', `/v1/admin/parameters/${key}`, { value: SEED_OVERRIDES[key], reason: 'Reteste QA: voltar ao valor do seed de desenvolvimento' });
  return adminCall('POST', `/v1/admin/parameters/${key}/reset`, { reason: 'Reteste QA Onda 7: restaurar padrão' });
}

// ---------------------------------------------------------------- pessoas
async function codeFromMailpit(email) {
  for (let i = 0; i < 12; i++) {
    try {
      const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const mail = (found.messages ?? []).find((m) => /código/i.test(m.Subject));
      const code = mail?.Subject.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    } catch {
      /* Mailpit subindo */
    }
    await sleep(400);
  }
  return undefined;
}

export async function login(email, password = SEED_PASSWORD) {
  const r = await api('POST', '/v1/auth/login', { body: { email, password } });
  return { ...r, token: r.data?.tokens?.accessToken };
}

let counter = 0;
/** Cliente novo, e-mail confirmado, com endereço padrão. `cep`/`number`/`complement` ajustáveis. */
export async function newCustomer({ verify = true, address = {}, noAddress = false } = {}) {
  const documents = await Promise.all(['customer_terms', 'privacy'].map(async (type) => ({ type, version: (await api('GET', `/v1/legal/${type}`)).data?.version })));
  const email = `qa7.${Date.now()}.${counter++}@seed.webag.local`;
  const phone = `1198${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const reg = await api('POST', '/v1/auth/register', { body: { name: 'Cliente QA Sete', email, phone, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: documents } });
  if (![200, 201].includes(reg.status)) throw new Error(`cadastro ${reg.status} ${JSON.stringify(reg.data).slice(0, 200)}`);
  const session = await login(email);
  if (verify) {
    const code = await codeFromMailpit(email);
    if (code) await api('POST', '/v1/auth/email/verify', { token: session.token, body: { code } });
  }
  const customer = { email, phone, token: session.token, userId: session.data?.user?.id, addressId: null };
  if (!noAddress) {
    const addr = await createAddress(customer, address);
    customer.addressId = addr.data?.id;
    if (!customer.addressId) throw new Error(`endereço ${addr.status} ${JSON.stringify(addr.data).slice(0, 200)}`);
  }
  return customer;
}

export function createAddress(customer, { cep = '07900-100', number = '100', complement, lat = LAT, lng = LNG, neighborhood = 'Centro', city = 'Francisco Morato', omitPoint = false } = {}) {
  return api('POST', '/v1/me/addresses', {
    token: customer.token,
    body: { label: 'home', cep, street: 'Rua do Teste', number, ...(complement ? { complement } : {}), neighborhood, city, state: 'SP', ...(omitPoint ? {} : { lat, lng }), isDefault: true },
  });
}

// ---------------------------------------------------------------- loja de seed
let seedStore = null;
export async function store() {
  if (seedStore) return seedStore;
  const owner = await login(`lojista.${STORE_SLUG}@seed.webag.local`);
  const staff = await login(`funcionario.${STORE_SLUG}@seed.webag.local`);
  const anon = await api('GET', `/v1/search/stores?lat=${LAT}&lng=${LNG}`);
  const found = anon.data?.data?.find((s) => s.name === 'Mercadinho Boa Compra');
  if (!found) throw new Error('Mercadinho Boa Compra não encontrado na busca');
  const products = (await api('GET', `/v1/browse/stores/${found.id}/products?limit=10`)).data?.data ?? [];
  const product = products.find((p) => p.available);
  const detail = (await api('GET', `/v1/browse/products/${product.id}`)).data;
  const variant = detail.variants.find((v) => v.available !== false) ?? detail.variants[0];
  seedStore = { id: found.id, owner: owner.token, staff: staff.token, variantId: variant.id, productId: product.id };
  return seedStore;
}

// ---------------------------------------------------------------- pedidos
export async function cartOf(customer, mode = 'delivery', couponCode, { variantId, quantity = 4 } = {}) {
  const s = await store();
  const q = `mode=${mode}${mode === 'delivery' ? `&addressId=${customer.addressId}` : ''}`;
  await api('DELETE', '/v1/cart', { token: customer.token });
  const put = await api('PUT', `/v1/cart/items/${variantId ?? s.variantId}?${q}`, { token: customer.token, body: { quantity, replaceStore: true } });
  if (put.status !== 200) {
    console.log(`  [aviso] PUT /v1/cart/items devolveu HTTP ${put.status} ${JSON.stringify(put.data).slice(0, 200)}`);
    return { put, cart: put };
  }
  if (couponCode) await api('PUT', `/v1/cart/coupon?${q}`, { token: customer.token, body: { code: couponCode } });
  const cart = await api('GET', `/v1/cart?${q}`, { token: customer.token });
  if (cart.status !== 200) console.log(`  [aviso] GET /v1/cart devolveu HTTP ${cart.status} ${JSON.stringify(cart.data).slice(0, 200)}`);
  return { put, cart };
}

/** Cria o pedido (PIX). Devolve { order, res }; `order` nulo se recusado. */
export async function place(customer, mode = 'delivery', { couponCode, variantId, quantity } = {}) {
  const { cart } = await cartOf(customer, mode, couponCode, { variantId, quantity });
  const total = cart.data?.summary?.total?.amount ?? cart.data?.summary?.total;
  const res = await api('POST', '/v1/orders', {
    token: customer.token,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { mode, ...(mode === 'delivery' ? { addressId: customer.addressId } : {}), cartRevision: cart.data?.revision, expectedTotalCents: total, paymentMethod: 'pix' },
  });
  return { order: res.status === 201 ? res.data : null, res, cart: cart.data, total };
}

export async function pay(customer, orderId) {
  const attempt = sql(`select id from payment_attempts where external_reference = '${orderId}' order by created_at limit 1`);
  const r = await api('POST', `/v1/dev/payments/${attempt}/approve`, { token: customer.token, body: {} });
  if (r.status !== 200) throw new Error(`aprovar PIX ${r.status}`);
  return (await getOrder(customer, orderId)).data;
}
export const getOrder = (customer, orderId) => api('GET', `/v1/orders/${orderId}`, { token: customer.token });
export const storeOrder = async (path, method = 'POST', body) => api(method, `/v1/stores/${(await store()).id}/orders/${path}`, { token: (await store()).owner, body });

/** Pedido pago e aceito pela loja (estado `accepted`). */
export async function paidAccepted(customer, mode = 'delivery', opts) {
  const { order, res } = await place(customer, mode, opts);
  if (!order) throw new Error(`pedido recusado: ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
  await pay(customer, order.id);
  const accept = await storeOrder(`${order.id}/accept`);
  if (accept.status !== 200) throw new Error(`aceitar ${accept.status}`);
  return order;
}
export async function inPreparation(customer, mode, opts) {
  const order = await paidAccepted(customer, mode, opts);
  const r = await storeOrder(`${order.id}/status`, 'POST', { status: 'in_preparation' });
  if (r.status !== 200) throw new Error(`em separação ${r.status}`);
  return order;
}
export async function readyForCollection(customer, opts) {
  const order = await inPreparation(customer, 'delivery', opts);
  const r = await storeOrder(`${order.id}/status`, 'POST', { status: 'ready_for_collection', volumes: 1 });
  if (r.status !== 200) throw new Error(`pronto para coleta ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return order;
}
export const deliveryOf = (orderId) => sql(`select id from deliveries where order_id = '${orderId}' and kind = 'delivery' order by created_at desc limit 1`);
export const deliveryStatus = (orderId) => sql(`select status from deliveries where order_id = '${orderId}' and kind = 'delivery' order by created_at desc limit 1`);

let courierId = null;
export async function outForDelivery(customer, opts) {
  const order = await readyForCollection(customer, opts);
  const deliveryId = deliveryOf(order.id);
  if (!courierId) {
    const c = await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA Sete', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true });
    if (c.status !== 201) throw new Error(`motoboy ${c.status} ${JSON.stringify(c.data).slice(0, 200)}`);
    courierId = c.data.id;
  }
  const assign = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/assign`, { courierId });
  if (assign.status !== 200) throw new Error(`atribuir ${assign.status} ${JSON.stringify(assign.data).slice(0, 200)}`);
  for (const action of ['confirm', 'picked_up']) {
    const r = await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action });
    if (r.status !== 200) throw new Error(`${action} ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  return { order, deliveryId };
}
export const stockOf = () => Number(sql(`select stock from product_variants where id = '${seedStore.variantId}'`));

/** Espera `fn` devolver verdadeiro (a varredura do servidor roda a cada 20 a 30 s). */
export async function waitFor(fn, { timeoutMs = 75_000, everyMs = 2_000 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(everyMs);
  }
  return Boolean(await fn());
}

export function finish() {
  const failed = results.filter((r) => r.pass === false);
  console.log(`\nRESUMO: ${results.filter((r) => r.pass === true).length} passaram, ${failed.length} falharam, ${results.filter((r) => r.pass === null).length} não testadas`);
  for (const f of failed) console.log(`  FALHA ${f.id} | ${f.title} [${f.evidence}]`);
  return failed.length;
}
