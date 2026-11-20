#!/usr/bin/env node
// Teste de fumaça de ponta a ponta contra a API JÁ RODANDO (pnpm dev) com o seed de desenvolvimento e o provedor `fake`.
// Uso: `pnpm smoke`. Sem dependências além do Node (usa fetch). Só funciona em desenvolvimento:
// usa as contas do seed e as rotas /v1/dev/payments (que não existem em produção).
//
// Verifica: /health, /health/ready, /docs; login do cliente, do dono e do funcionário da loja, do admin (TOTP);
// um pedido de RETIRADA do início ao fim (sacola, PIX simulado, aceite pelo funcionário, preparo, entrega) e um pedido de
// ENTREGA até "pronto para coleta" (corrida criada).
//
// Variáveis opcionais: API_URL (padrão http://localhost:<API_PORT do .env>), SMOKE_PASSWORD (senha das contas de seed).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
    )
  : {};
const API = (process.env.API_URL ?? `http://localhost:${env.API_PORT ?? 3000}`).replace(/\/+$/, '');
const SEED_PASSWORD = process.env.SMOKE_PASSWORD ?? 'webag-seed-lojista-2026';
const STORE_SLUG = 'mercadinho-boa-compra';
const LAT = -23.2801;
const LNG = -46.744;

let failures = 0;
const ok = (message) => console.log(`  ok   ${message}`);
const bad = (message) => {
  failures++;
  console.log(`  FALHA ${message}`);
};
const check = (condition, message, extra = '') => (condition ? ok(message) : bad(`${message} ${extra}`));
const step = (title) => console.log(`\n${title}`);
const stop = (message) => {
  console.error(`\n[smoke] interrompido: ${message}`);
  process.exit(1);
};

async function call(method, path, { body, token, headers = {} } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* corpo não é JSON (ex.: /docs) */
  }
  return { status: response.status, data };
}

// TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s): o mesmo cálculo de scripts/totp.mjs.
function totp(secretBase32, offsetSteps = 0) {
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
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

// O id da tentativa de pagamento não aparece na API (só o servidor sabe); lemos do banco pelo container do compose.
function attemptIdOfOrder(orderId) {
  const user = env.POSTGRES_USER ?? 'webag';
  const db = env.POSTGRES_DB ?? 'webag';
  const sql = `select id from payment_attempts where external_reference = '${orderId}' order by created_at limit 1`;
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', user, '-d', db, '-tA', '-c', sql], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function login(email, password = SEED_PASSWORD) {
  const response = await call('POST', '/v1/auth/login', { body: { email, password } });
  return { ...response, token: response.data?.tokens?.accessToken };
}

console.log(`[smoke] API: ${API}`);

// Minuto 23:59 de Brasília: o horário de loja aceita no máximo 23:59 e o fim é exclusivo, então a loja de 24 h do seed (SEED_HOURS=always_open)
// fica fechada só nesse minuto (BUG-026). Espera ele passar em vez de reprovar a verificação por isso.
const brtMinuteOfDay = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
};
if (brtMinuteOfDay() === 23 * 60 + 59) {
  console.log('[smoke] 23:59 em Brasília: aguardando a virada do minuto (a loja de demonstração de 24 h fecha por 1 minuto aqui)');
  await new Promise((done) => setTimeout(done, 61_000 - (Date.now() % 60_000)));
}

step('1. Saúde e contrato');
const health = await call('GET', '/health');
check(health.status === 200 && health.data?.status === 'ok', 'GET /health');
const ready = await call('GET', '/health/ready');
check(ready.status === 200 && ready.data?.details?.database?.status === 'up' && ready.data?.details?.redis?.status === 'up', 'GET /health/ready (banco e Redis no ar)');
const docs = await call('GET', '/docs');
check(docs.status === 200, 'GET /docs (contrato OpenAPI)');
if (health.status !== 200) stop('a API não respondeu. Ela está rodando (pnpm dev)?');

step('2. Logins de demonstração');
// Cada execução cria um cliente novo (exercita o cadastro e evita os limites da API: 2 pedidos aguardando pagamento
// e 5 pedidos PIX por hora por conta, que o seed de pedidos de demonstração já consome nos clientes de seed).
async function registerCustomer() {
  const documents = await Promise.all(['customer_terms', 'privacy'].map(async (type) => ({ type, version: (await call('GET', `/v1/legal/${type}`)).data?.version })));
  const email = `smoke.${Date.now()}@seed.webag.local`;
  const phone = `1199${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const registered = await call('POST', '/v1/auth/register', {
    body: { name: 'Cliente Fumaça', email, phone, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: documents },
  });
  return { email, registered, ...(await login(email)) };
}
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
// O código de 6 dígitos chega por e-mail; em desenvolvimento o e-mail vai para o Mailpit (assunto: "Seu código Webag: 123456").
async function codeFromMailpit(email) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const mail = (found.messages ?? []).find((m) => /código/i.test(m.Subject));
      const code = mail?.Subject.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    } catch {
      /* Mailpit ainda subindo */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  return undefined;
}
const customer = await registerCustomer();
check(customer.registered.status === 201 || customer.registered.status === 200, `cliente novo cadastrado (${customer.email})`, `(HTTP ${customer.registered.status} ${JSON.stringify(customer.registered.data).slice(0, 200)})`);
check(Boolean(customer.token), 'cliente: login com a conta recém-criada', `(HTTP ${customer.status})`);
const emailCode = await codeFromMailpit(customer.email);
check(Boolean(emailCode), 'e-mail com o código de confirmação chegou ao Mailpit');
if (emailCode) {
  const verified = await call('POST', '/v1/auth/email/verify', { token: customer.token, body: { code: emailCode } });
  check(verified.status === 204, 'e-mail do cliente confirmado com o código', `(HTTP ${verified.status})`);
}
const owner = await login(`lojista.${STORE_SLUG}@seed.webag.local`);
check(Boolean(owner.token), `lojista (dono): lojista.${STORE_SLUG}@seed.webag.local`, `(HTTP ${owner.status})`);
const staff = await login(`funcionario.${STORE_SLUG}@seed.webag.local`);
check(Boolean(staff.token), `lojista (funcionário): funcionario.${STORE_SLUG}@seed.webag.local`, `(HTTP ${staff.status})`);
if (!customer.token || !owner.token || !staff.token) stop('login de demonstração falhou. O seed rodou? (pnpm run setup)');

const adminEmail = env.SEED_ADMIN_EMAIL ?? 'admin@webag.local';
const adminPassword = env.SEED_ADMIN_PASSWORD ?? 'Webag-Admin-Dev-2026';
const adminLogin = await login(adminEmail, adminPassword);
if (adminLogin.token && adminLogin.data?.mfaSetupRequired) {
  const setup = await call('POST', '/v1/admin/totp/setup', { token: adminLogin.token });
  const secret = setup.data?.secret;
  if (setup.status === 201 && secret) {
    const confirm = await call('POST', '/v1/admin/totp/confirm', { token: adminLogin.token, body: { code: totp(secret) } });
    check(confirm.status === 200 && confirm.data?.recoveryCodes?.length === 10, 'admin: TOTP configurado no primeiro login (10 códigos de recuperação)', `(HTTP ${confirm.status})`);
    console.log(`       Segredo TOTP do admin (só desenvolvimento): ${secret}`);
    console.log('       Para gerar o código: node scripts/totp.mjs <segredo>   (ou digite o segredo em um app autenticador)');
    const second = await call('POST', '/v1/auth/login', { body: { email: adminEmail, password: adminPassword } });
    const verify = await call('POST', '/v1/auth/mfa/verify', { body: { mfaToken: second.data?.mfaToken, code: totp(secret, 1) } });
    check(verify.status === 200 && Boolean(verify.data?.tokens?.accessToken), 'admin: login em 2 passos (senha + TOTP)', `(HTTP ${verify.status})`);
  } else {
    bad(`admin: setup do TOTP (HTTP ${setup.status})`);
  }
} else if (adminLogin.data?.mfaRequired) {
  ok('admin: senha aceita e o 2º fator (TOTP) é exigido (já configurado; use scripts/totp.mjs com o segredo guardado)');
} else {
  bad(`admin: login (HTTP ${adminLogin.status})`);
}

step('3. Catálogo');
const stores = await call('GET', `/v1/search/stores?lat=${LAT}&lng=${LNG}`, { token: customer.token });
const store = stores.data?.data?.find((s) => s.name === 'Mercadinho Boa Compra');
check(Boolean(store), 'lojas por perto (busca geográfica PostGIS) devolve o Mercadinho Boa Compra', `(HTTP ${stores.status})`);
if (!store) stop('loja do seed não encontrada');
const products = await call('GET', `/v1/browse/stores/${store.id}/products?limit=5`, { token: customer.token });
const product = products.data?.data?.find((p) => p.available);
check(Boolean(product), 'catálogo da loja devolve produtos disponíveis');
if (!product) stop('sem produto disponível');
const detail = await call('GET', `/v1/browse/products/${product.id}`, { token: customer.token });
const variant = detail.data?.variants?.find((v) => v.available !== false) ?? detail.data?.variants?.[0];
check(Boolean(variant?.id), `produto "${product.name}" tem variação`);
if (!variant?.id) stop('variação não encontrada');

const address = await call('POST', '/v1/me/addresses', {
  token: customer.token,
  body: { label: 'home', cep: '07900-100', street: 'Rua do Teste', number: '100', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: LAT, lng: LNG, isDefault: true },
});
const addressId = address.data?.id;
check(address.status === 201 && Boolean(addressId), 'endereço do cliente cadastrado', `(HTTP ${address.status} ${JSON.stringify(address.data).slice(0, 200)})`);

async function buyAndPay(mode) {
  // Limite de 2 pedidos aguardando pagamento por conta: cancela os que sobraram de uma execução anterior.
  const open = await call('GET', '/v1/orders?scope=active&limit=50', { token: customer.token });
  for (const old of (open.data?.data ?? []).filter((o) => o.status === 'awaiting_payment')) {
    await call('POST', `/v1/orders/${old.id}/cancel`, { token: customer.token, body: {} });
  }
  await call('DELETE', '/v1/cart', { token: customer.token });
  const put = await call('PUT', `/v1/cart/items/${variant.id}?mode=${mode}${mode === 'delivery' ? `&addressId=${addressId}` : ''}`, { token: customer.token, body: { quantity: 4, replaceStore: true } });
  check(put.status === 200, `[${mode}] item na sacola`, `(HTTP ${put.status} ${JSON.stringify(put.data).slice(0, 200)})`);
  const cart = await call('GET', `/v1/cart?mode=${mode}${mode === 'delivery' ? `&addressId=${addressId}` : ''}`, { token: customer.token });
  const total = cart.data?.summary?.total?.amount ?? cart.data?.summary?.total;
  check(typeof total === 'number', `[${mode}] sacola com total calculado pelo servidor (${total} centavos)`, JSON.stringify(cart.data).slice(0, 300));
  const created = await call('POST', '/v1/orders', {
    token: customer.token,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { mode, ...(mode === 'delivery' ? { addressId } : {}), cartRevision: cart.data?.revision, expectedTotalCents: total, paymentMethod: 'pix' },
  });
  if ((created.status === 409 && created.data?.code === 'STORE_CLOSED') || (created.status === 422 && created.data?.code === 'LOGISTICS_CLOSED')) {
    console.log('  dica: a loja ou a logística de demonstração está fechada agora. Use SEED_HOURS=always_open no .env e rode `pnpm db:seed` (abre as lojas 24 h), ou rode entre 7 h e 20 h (horário de Brasília).');
  }
  check(created.status === 201 && created.data?.status === 'awaiting_payment', `[${mode}] pedido criado aguardando o PIX`, `(HTTP ${created.status} ${JSON.stringify(created.data).slice(0, 300)})`);
  const order = created.data;
  if (!order?.id) stop('pedido não foi criado');
  const attemptId = attemptIdOfOrder(order.id);
  check(Boolean(attemptId), `[${mode}] tentativa de pagamento localizada no banco`);
  if (!attemptId) stop('não achei a tentativa de pagamento (o container do Postgres do compose está no ar?)');
  const approved = await call('POST', `/v1/dev/payments/${attemptId}/approve`, { token: customer.token, body: {} });
  check(approved.status === 200, `[${mode}] PIX simulado aprovado (mesmo caminho do webhook real)`, `(HTTP ${approved.status})`);
  const after = await call('GET', `/v1/orders/${order.id}`, { token: customer.token });
  check(after.data?.status === 'received', `[${mode}] pedido virou "received" (pago)`, `(estado: ${after.data?.status})`);
  return after.data;
}

step('4. Pedido de RETIRADA do início ao fim (PIX simulado)');
let pickup = await buyAndPay('pickup');
const base = `/v1/stores/${store.id}/orders/${pickup.id}`;
const accept = await call('POST', `${base}/accept`, { token: staff.token });
check(accept.status === 200, 'funcionário aceita o pedido', `(HTTP ${accept.status})`);
const forbiddenFinance = await call('GET', `/v1/stores/${store.id}/payment-account`, { token: staff.token });
check([403, 404].includes(forbiddenFinance.status), `funcionário NÃO acessa a conta de recebimento (HTTP ${forbiddenFinance.status})`);
const prep = await call('POST', `${base}/status`, { token: staff.token, body: { status: 'in_preparation' } });
check(prep.status === 200, 'em separação', `(HTTP ${prep.status})`);
const ready2 = await call('POST', `${base}/status`, { token: owner.token, body: { status: 'ready_for_pickup' } });
check(ready2.status === 200, 'dono marca pronto para retirada', `(HTTP ${ready2.status})`);
pickup = (await call('GET', `/v1/orders/${pickup.id}`, { token: customer.token })).data;
const code = pickup?.pickup?.code ?? pickup?.pickup?.pickupCode;
check(typeof code === 'string' && /^\d{4}$/.test(code), 'cliente vê o código de retirada de 4 dígitos');
const delivered = await call('POST', `${base}/status`, { token: owner.token, body: { status: 'delivered', pickupCode: code } });
check(delivered.status === 200 && delivered.data?.status === 'delivered', 'retirada concluída com o código', `(HTTP ${delivered.status})`);

step('5. Pedido de ENTREGA até a coleta pelo motoboy (PIX simulado)');
const delivery = await buyAndPay('delivery');
const dBase = `/v1/stores/${store.id}/orders/${delivery.id}`;
check((await call('POST', `${dBase}/accept`, { token: owner.token })).status === 200, 'dono aceita');
check((await call('POST', `${dBase}/status`, { token: owner.token, body: { status: 'in_preparation' } })).status === 200, 'em separação');
const collect = await call('POST', `${dBase}/status`, { token: owner.token, body: { status: 'ready_for_collection', volumes: 1 } });
check(collect.status === 200 && collect.data?.status === 'ready_for_collection', 'pronto para coleta (corrida da logística criada)', `(HTTP ${collect.status})`);

console.log(failures === 0 ? '\n[smoke] TUDO CERTO' : `\n[smoke] ${failures} verificação(ões) falharam`);
process.exit(failures === 0 ? 0 : 1);
