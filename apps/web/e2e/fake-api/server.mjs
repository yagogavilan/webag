// API falsa para os testes E2E do painel: reproduz o comportamento observável de apps/api (módulos identity e admin)
// sem Postgres/Redis. Contrato = o dos controllers reais (ver docs/arquitetura/divida-tecnica.md, DT-014).
// Uso: node e2e/fake-api/server.mjs  (PORT, FAKE_ACCESS_TTL_S)
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3999);
const ACCESS_TTL = Number(process.env.FAKE_ACCESS_TTL_S ?? 900);
const REAUTH_MS = Number(process.env.FAKE_REAUTH_MS ?? 5 * 60_000);

// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totpNow(secret, at = Date.now()) {
  let bits = '';
  for (const ch of secret.replace(/\s+/g, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}
const randomSecret = () => Array.from(randomBytes(20), (b) => B32[b % 32]).join('');

// ---------------------------------------------------------------- estado
const SUPER_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const now = () => new Date().toISOString();
const users = new Map();
const sessions = new Map();
const refreshIndex = new Map();
const invitations = new Map();
const audit = [];
let auditId = 1;
const attempts = new Map();

function addAdmin({ email, name, password, profile, secret }) {
  const user = { id: randomUUID(), email, name, password, profile, active: true, totpSecret: secret ?? null, totpConfirmed: Boolean(secret), recovery: [] };
  users.set(user.id, user);
  return user;
}
addAdmin({ email: 'admin@webag.local', name: 'Ana Souza', password: 'Webag-Admin-Dev-2026', profile: 'super_admin', secret: SUPER_SECRET });
addAdmin({ email: 'operacao@webag.local', name: 'Caio Lima', password: 'Webag-Admin-Dev-2026', profile: 'operations', secret: SUPER_SECRET });
addAdmin({ email: 'novo@webag.local', name: 'Nina Alves', password: 'Webag-Admin-Dev-2026', profile: 'support', secret: null });
users.set('customer', { id: randomUUID(), email: 'cliente@webag.local', name: 'Cliente', password: 'Cliente-Dev-2026', profile: null, active: true });

const cities = [
  { id: randomUUID(), name: 'Francisco Morato', state: 'SP', slug: 'francisco-morato-sp', active: true, neighborhoods: [] },
  { id: randomUUID(), name: 'Caieiras', state: 'SP', slug: 'caieiras-sp', active: true, neighborhoods: [] },
];
for (const city of cities) {
  for (const name of city.name === 'Caieiras' ? ['Centro', 'Laranjeiras'] : ['Centro', 'Vila Rosa', 'Jardim Alegria']) {
    city.neighborhoods.push({ id: randomUUID(), cityId: city.id, name, active: true });
  }
}
const cat = (name, icon, position, parentId = null) => ({ id: randomUUID(), name, icon, position, parentId, active: true });
const calcados = cat('Calçados', 'sneaker', 0);
const categories = [calcados, cat('Tênis', 'sneaker', 0, calcados.id), cat('Mercado', 'basket', 1), cat('Farmácia', 'pill', 2)];
const ICONS = ['basket', 'shopping-bag', 'storefront', 'pizza', 'hamburger', 'bread', 'cake', 'coffee', 'sneaker', 'pill', 'tag', 'gift', 'house', 'paw-print', 't-shirt'];

const param = (key, type, def, min, max, description, legalFloor = false, extra = {}) => ({ key, value: def, default: def, type, min: min ?? null, max: max ?? null, values: null, description, ref: 'HIP', legalFloor, updatedAt: null, ...extra });
const parameters = [
  param('pix_expiracao_min', 'int', 15, 5, 60, 'Validade do PIX (min)'),
  param('loja_aceite_timeout_min', 'int', 10, 3, 30, 'Tempo da loja para aceitar o pedido (min)'),
  param('parcelas_max', 'int', 3, 1, 12, 'Máximo de parcelas no cartão'),
  param('pedido_max_cents', 'int', 200000, 10000, null, 'Valor máximo por pedido (centavos)'),
  param('comissao_padrao_pct', 'decimal', 10, 0, 30, 'Comissão padrão sobre o subtotal de produtos (%)'),
  param('troca_arrependimento_dias', 'int', 7, 7, 7, 'Prazo de arrependimento (piso legal CDC art. 49, fixo)', true),
  param('troca_defeito_dias', 'int', 30, 30, 30, 'Prazo para troca por defeito (piso legal, fixo)', true),
  param('repasse_periodicidade', 'enum', 'semanal', null, null, 'Periodicidade do repasse', false, { values: ['semanal', 'quinzenal'] }),
  param('push_mkt_janela', 'window', '09:00-20:00', null, null, 'Janela permitida para push de marketing'),
  param('otp_validade_min', 'int', 10, 5, 30, 'Validade do código por e-mail (min)'),
];
const flags = [
  ['cartao', true, 'Pagamento com cartão de crédito'],
  ['pix', true, 'Pagamento com PIX'],
  ['retirada', true, 'Retirada na loja'],
  ['login_social', false, 'Login com Google e Apple'],
  ['taxa_servico', false, 'Taxa de serviço ao cliente'],
  ['cadastro_lojista', true, 'Cadastro aberto de lojistas'],
].map(([key, enabled, description]) => ({ key, enabled, description, updatedAt: null }));
const legal = { customer_terms: [], merchant_terms: [], privacy: [] };
legal.customer_terms.push({ id: randomUUID(), type: 'customer_terms', version: 1, title: 'Termos de uso', content: '## Termos\nTexto inicial dos termos de uso do cliente, versão um.', effectiveAt: '2026-01-01T03:00:00.000Z', relevantChange: false, createdAt: now() });
legal.privacy.push({ id: randomUUID(), type: 'privacy', version: 1, title: 'Política de privacidade', content: '## Privacidade\nTexto inicial da política de privacidade, versão um.', effectiveAt: '2026-01-01T03:00:00.000Z', relevantChange: false, createdAt: now() });

// ---------------------------------------------------------------- utilitários
const problem = (res, status, code, title, detail, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/problem+json', ...(extra.headers ?? {}) });
  res.end(JSON.stringify({ type: `https://api.webag.com.br/errors/${code.toLowerCase()}`, title, status, code, ...(detail ? { detail } : {}), ...(extra.errors ? { errors: extra.errors } : {}) }));
};
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const empty = (res, status = 204) => {
  res.writeHead(status);
  res.end();
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });

function newSession(user, { mfaVerified }) {
  const id = randomUUID();
  const refreshToken = randomBytes(32).toString('base64url');
  const accessToken = `at_${randomBytes(24).toString('base64url')}`;
  const session = { id, userId: user.id, accessToken, accessExpires: Date.now() + ACCESS_TTL * 1000, refreshToken, mfaVerified, reauthAt: Date.now(), revoked: false, lastUsed: Date.now() };
  sessions.set(id, session);
  refreshIndex.set(refreshToken, id);
  return { session, tokens: { accessToken, refreshToken, expiresIn: ACCESS_TTL, tokenType: 'Bearer' } };
}
function rotate(session) {
  refreshIndex.delete(session.refreshToken);
  session.refreshToken = randomBytes(32).toString('base64url');
  session.accessToken = `at_${randomBytes(24).toString('base64url')}`;
  session.accessExpires = Date.now() + ACCESS_TTL * 1000;
  refreshIndex.set(session.refreshToken, session.id);
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: ACCESS_TTL, tokenType: 'Bearer' };
}
function revokeAll(userId) {
  for (const s of sessions.values()) if (s.userId === userId) s.revoked = true;
}
function record(req, ctx, entry) {
  audit.unshift({ id: auditId++, at: now(), actorId: ctx.user?.id ?? null, actorRole: ctx.user?.profile ?? null, ip: req.socket.remoteAddress ?? '', requestId: randomUUID(), targetType: null, targetId: null, before: null, after: null, reason: null, ...entry });
}
const PERMS = {
  'regions:read': ['super_admin', 'operations', 'finance', 'support'],
  'regions:write': ['super_admin', 'operations'],
  'categories:read': ['super_admin', 'operations', 'finance', 'support'],
  'categories:write': ['super_admin', 'operations'],
  'parameters:read': ['super_admin', 'operations', 'finance'],
  'parameters:write': ['super_admin'],
  'flags:read': ['super_admin', 'operations', 'finance', 'support'],
  'flags:write': ['super_admin'],
  'legal:read': ['super_admin', 'operations', 'finance', 'support'],
  'legal:write': ['super_admin'],
  'audit:read': ['super_admin'],
  'admins:manage': ['super_admin'],
};
function me(user) {
  return { id: user.id, email: user.email, emailVerified: true, name: user.name, phone: null, roles: user.profile ? ['customer'] : ['customer'], adminProfile: user.profile && user.active ? user.profile : null, pendingTerms: [] };
}
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: true, name: u.name });

// ---------------------------------------------------------------- rotas
const routes = [];
const route = (method, pattern, opts, handler) => routes.push({ method, regex: new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), opts, handler });

const mfaTokens = new Map();
const resetTickets = new Map();
route('POST', '/v1/auth/login', { public: true }, async (req, res, ctx) => {
  const body = ctx.body;
  const key = `${body.email}`;
  const state = attempts.get(key) ?? { count: 0, until: 0 };
  if (state.until > Date.now()) return problem(res, 429, 'RATE_LIMITED', 'Muitas tentativas', 'Muitas tentativas. Tente em 15 minutos ou redefina a senha.', { headers: { 'retry-after': String(Math.ceil((state.until - Date.now()) / 1000)) } });
  const user = [...users.values()].find((u) => u.email === String(body.email).toLowerCase());
  const fail = () => {
    state.count += 1;
    if (state.count >= 5) state.until = Date.now() + 15 * 60_000;
    attempts.set(key, state);
    return problem(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');
  };
  if (!user || user.password !== body.password) return fail();
  let mfaSetupRequired = false;
  if (user.profile && user.active) {
    if (user.totpConfirmed) {
      // 2 passos (SEC-090): a senha certa devolve só o desafio; o código vai em /v1/auth/mfa/verify.
      if (body.totpCode !== undefined) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
      const mfaToken = randomBytes(32).toString('base64url');
      mfaTokens.set(mfaToken, { userId: user.id, attempts: 0, until: Date.now() + 300_000 });
      attempts.delete(key);
      return json(res, 200, { mfaRequired: true, mfaToken, expiresIn: 300 });
    }
    mfaSetupRequired = true;
  }
  attempts.delete(key);
  const { tokens } = newSession(user, { mfaVerified: false });
  if (user.profile) record(req, { user }, { action: 'admin.login', targetType: 'user', targetId: user.id, after: { mfaVerified: false } });
  json(res, 200, { user: publicUser(user), tokens, mfaSetupRequired });
});
/** Confere TOTP ou código de recuperação (uso único). Retorna 'totp' | 'recovery' | null. */
function checkFactor(user, raw) {
  const value = String(raw ?? '');
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^\d{6}$/.test(value) && (value === totpNow(user.totpSecret) || value === totpNow(user.totpSecret, Date.now() - 30_000))) return 'totp';
  if (user.recovery.includes(normalized)) {
    user.recovery = user.recovery.filter((c) => c !== normalized);
    return 'recovery';
  }
  return null;
}
route('POST', '/v1/auth/mfa/verify', { public: true }, (req, res, ctx) => {
  const invalid = () => problem(res, 401, 'MFA_INVALID', 'Código incorreto ou vencido', 'Código incorreto ou vencido.');
  const entry = mfaTokens.get(ctx.body.mfaToken);
  if (!entry || entry.until < Date.now() || entry.attempts >= 5) return invalid();
  const user = users.get(entry.userId);
  const factor = user && checkFactor(user, ctx.body.code);
  if (!factor) {
    entry.attempts += 1;
    return invalid();
  }
  mfaTokens.delete(ctx.body.mfaToken);
  let mfaSetupRequired = false;
  if (factor === 'recovery') {
    user.totpSecret = null;
    user.totpConfirmed = false;
    mfaSetupRequired = true;
  }
  const { tokens } = newSession(user, { mfaVerified: factor === 'totp' });
  record(req, { user }, { action: 'admin.login', targetType: 'user', targetId: user.id, after: { mfaVerified: factor === 'totp' } });
  json(res, 200, { user: publicUser(user), tokens, mfaSetupRequired });
});
route('POST', '/v1/auth/refresh', { public: true }, (req, res, ctx) => {
  const id = refreshIndex.get(ctx.body.refreshToken);
  const session = id && sessions.get(id);
  if (!session || session.revoked) return problem(res, 401, 'REFRESH_INVALID', 'Sessão inválida', 'Entre de novo.');
  json(res, 200, rotate(session));
});
route('POST', '/v1/auth/logout', { mfaOptional: true }, (req, res, ctx) => {
  ctx.session.revoked = true;
  empty(res);
});
route('POST', '/v1/auth/logout-all', { mfaOptional: true }, (req, res, ctx) => {
  revokeAll(ctx.user.id);
  empty(res);
});
route('POST', '/v1/auth/reauth', { mfaOptional: true }, (req, res, ctx) => {
  const code = String(ctx.body.totpCode ?? '');
  if (code !== totpNow(ctx.user.totpSecret) && code !== totpNow(ctx.user.totpSecret, Date.now() - 30_000)) return problem(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');
  ctx.session.reauthAt = Date.now();
  empty(res);
});
route('POST', '/v1/auth/password/forgot', { public: true }, (req, res) => json(res, 202, { message: 'Se o e-mail existir, enviamos um código.' }));
route('POST', '/v1/auth/password/reset', { public: true }, (req, res, ctx) => {
  if (ctx.body.code !== '123456') return problem(res, 401, 'CODE_INVALID', 'Código inválido', 'Código incorreto ou vencido.');
  const user = [...users.values()].find((u) => u.email === ctx.body.email);
  if (user?.profile && user.totpConfirmed) {
    // SEC-095: admin com TOTP só troca a senha depois do 2º fator, no mesmo ticket.
    const resetTicket = randomBytes(32).toString('base64url');
    resetTickets.set(resetTicket, { userId: user.id, attempts: 0, until: Date.now() + 600_000 });
    return json(res, 200, { tokens: null, mfaRequired: true, resetTicket, expiresIn: 600 });
  }
  if (user) user.password = ctx.body.newPassword;
  json(res, 200, { tokens: null });
});
route('POST', '/v1/auth/password/reset/complete', { public: true }, (req, res, ctx) => {
  const invalid = () => problem(res, 401, 'MFA_INVALID', 'Código incorreto ou vencido', 'Código incorreto ou vencido.');
  const entry = resetTickets.get(ctx.body.resetTicket);
  if (!entry || entry.until < Date.now() || entry.attempts >= 5) return invalid();
  const user = users.get(entry.userId);
  if (!user || !checkFactor(user, ctx.body.totpCode)) {
    entry.attempts += 1;
    return invalid();
  }
  resetTickets.delete(ctx.body.resetTicket);
  user.password = ctx.body.newPassword;
  revokeAll(user.id);
  json(res, 200, { tokens: null });
});
route('POST', '/v1/auth/invitations/accept', { public: true }, (req, res, ctx) => {
  const invite = invitations.get(ctx.body.token);
  if (!invite || invite.used) return problem(res, 410, 'INVITATION_INVALID', 'Convite inválido', 'Peça um novo convite.');
  invite.used = true;
  const user = addAdmin({ email: invite.email, name: invite.name, password: ctx.body.password, profile: invite.profile, secret: null });
  const { tokens } = newSession(user, { mfaVerified: false });
  json(res, 200, { tokens, mfaSetupRequired: true });
});
route('GET', '/v1/me', {}, (req, res, ctx) => json(res, 200, me(ctx.user)));
route('POST', '/v1/me/password', { mfaOptional: false }, (req, res, ctx) => {
  if (ctx.body.currentPassword !== ctx.user.password) return problem(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');
  ctx.user.password = ctx.body.newPassword;
  revokeAll(ctx.user.id);
  const { tokens } = newSession(ctx.user, { mfaVerified: ctx.session.mfaVerified });
  json(res, 200, { tokens });
});
route('POST', '/v1/admin/totp/setup', { mfaOptional: true }, (req, res, ctx) => {
  if (ctx.user.totpConfirmed) return problem(res, 409, 'TOTP_ALREADY_CONFIGURED', 'TOTP já configurado');
  ctx.user.totpSecret = randomSecret();
  json(res, 200, { secret: ctx.user.totpSecret, otpauthUri: `otpauth://totp/Webag:${ctx.user.email}?secret=${ctx.user.totpSecret}&issuer=Webag` });
});
route('POST', '/v1/admin/totp/confirm', { mfaOptional: true }, (req, res, ctx) => {
  const code = String(ctx.body.code);
  if (!ctx.user.totpSecret || (code !== totpNow(ctx.user.totpSecret) && code !== totpNow(ctx.user.totpSecret, Date.now() - 30_000))) return problem(res, 401, 'UNAUTHENTICATED', 'Não autenticado', 'Código inválido.');
  ctx.user.totpConfirmed = true;
  ctx.user.recovery = Array.from({ length: 10 }, () => randomBytes(8).toString('hex').slice(0, 10).toUpperCase());
  ctx.session.mfaVerified = true;
  record(req, ctx, { action: 'admin.totp_configured', targetType: 'user', targetId: ctx.user.id });
  json(res, 200, { recoveryCodes: ctx.user.recovery.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) });
});

// regiões
route('GET', '/v1/admin/regions/cities', { perm: 'regions:read' }, (req, res) => json(res, 200, { data: cities, nextCursor: null }));
route('POST', '/v1/admin/regions/cities', { perm: 'regions:write' }, (req, res, ctx) => {
  const { name, state = 'SP', active = false } = ctx.body;
  if (!name || String(name).trim().length < 2) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'name', message: 'Informe o nome.' }] });
  if (cities.some((c) => c.name.toLowerCase() === String(name).trim().toLowerCase() && c.state === state)) return problem(res, 409, 'CITY_EXISTS', 'Cidade já cadastrada');
  const city = { id: randomUUID(), name: String(name).trim(), state, slug: `${String(name).toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}`, active, neighborhoods: [] };
  cities.push(city);
  record(req, ctx, { action: 'city.create', targetType: 'city', targetId: city.id, after: { name: city.name, active } });
  json(res, 201, city);
});
route('PATCH', '/v1/admin/regions/cities/:id', { perm: 'regions:write' }, (req, res, ctx) => {
  const city = cities.find((c) => c.id === ctx.params[0]);
  if (!city) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const before = { name: city.name, active: city.active };
  Object.assign(city, ctx.body);
  record(req, ctx, { action: 'city.update', targetType: 'city', targetId: city.id, before, after: { name: city.name, active: city.active } });
  json(res, 200, city);
});
route('POST', '/v1/admin/regions/cities/:id/neighborhoods', { perm: 'regions:write' }, (req, res, ctx) => {
  const city = cities.find((c) => c.id === ctx.params[0]);
  if (!city) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (city.neighborhoods.some((n) => n.name.toLowerCase() === String(ctx.body.name).trim().toLowerCase())) return problem(res, 409, 'NEIGHBORHOOD_EXISTS', 'Bairro já cadastrado nesta cidade');
  const hood = { id: randomUUID(), cityId: city.id, name: String(ctx.body.name).trim(), active: ctx.body.active ?? true };
  city.neighborhoods.push(hood);
  record(req, ctx, { action: 'neighborhood.create', targetType: 'neighborhood', targetId: hood.id, after: hood });
  json(res, 201, hood);
});
route('PATCH', '/v1/admin/regions/neighborhoods/:id', { perm: 'regions:write' }, (req, res, ctx) => {
  const hood = cities.flatMap((c) => c.neighborhoods).find((n) => n.id === ctx.params[0]);
  if (!hood) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const before = { ...hood };
  Object.assign(hood, ctx.body);
  record(req, ctx, { action: 'neighborhood.update', targetType: 'neighborhood', targetId: hood.id, before, after: { ...hood } });
  json(res, 200, hood);
});

// categorias
const tree = () => categories.filter((c) => !c.parentId).sort((a, b) => a.position - b.position).map((c) => ({ ...c, children: categories.filter((k) => k.parentId === c.id).sort((a, b) => a.position - b.position) }));
route('GET', '/v1/admin/categories', { perm: 'categories:read' }, (req, res) => json(res, 200, { data: tree(), icons: ICONS, nextCursor: null }));
route('POST', '/v1/admin/categories', { perm: 'categories:write' }, (req, res, ctx) => {
  const b = ctx.body;
  if (categories.some((c) => c.parentId === (b.parentId ?? null) && c.name.toLowerCase() === String(b.name).toLowerCase())) return problem(res, 409, 'CATEGORY_NAME_TAKEN', 'Já existe uma categoria com esse nome neste nível');
  if (!ICONS.includes(b.icon)) return problem(res, 422, 'CATEGORY_ICON_INVALID', 'Ícone inválido', undefined, { errors: [{ field: 'icon', message: 'Use um ícone da biblioteca.' }] });
  const c = { id: randomUUID(), name: b.name, icon: b.icon, parentId: b.parentId ?? null, position: b.position ?? 0, active: b.active ?? true };
  categories.push(c);
  record(req, ctx, { action: 'category.create', targetType: 'category', targetId: c.id, after: c });
  json(res, 201, c);
});
route('PUT', '/v1/admin/categories/order', { perm: 'categories:write' }, (req, res, ctx) => {
  ctx.body.ids.forEach((id, position) => {
    const c = categories.find((k) => k.id === id);
    if (c) c.position = position;
  });
  record(req, ctx, { action: 'category.reorder', targetType: 'category', after: { ids: ctx.body.ids } });
  empty(res);
});
route('PATCH', '/v1/admin/categories/:id', { perm: 'categories:write' }, (req, res, ctx) => {
  const c = categories.find((k) => k.id === ctx.params[0]);
  if (!c) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const before = { ...c };
  Object.assign(c, ctx.body);
  record(req, ctx, { action: 'category.update', targetType: 'category', targetId: c.id, before, after: { ...c } });
  json(res, 200, c);
});
route('DELETE', '/v1/admin/categories/:id', { perm: 'categories:write' }, (req, res, ctx) => {
  const index = categories.findIndex((k) => k.id === ctx.params[0]);
  if (index < 0) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (categories.some((k) => k.parentId === ctx.params[0])) return problem(res, 409, 'CATEGORY_IN_USE', 'Categoria em uso', 'Mova antes ou inative.');
  const [removed] = categories.splice(index, 1);
  record(req, ctx, { action: 'category.delete', targetType: 'category', targetId: removed.id, before: removed });
  empty(res);
});

// parâmetros e flags
route('GET', '/v1/admin/parameters', { perm: 'parameters:read' }, (req, res) => json(res, 200, { data: parameters, nextCursor: null }));
const validateParam = (p, v) => {
  if (p.type === 'int' || p.type === 'decimal') {
    if (typeof v !== 'number') return 'Informe um número.';
    if (p.type === 'int' && !Number.isInteger(v)) return 'Informe um número inteiro.';
    if (p.min !== null && v < p.min) return `O valor mínimo é ${p.min}.`;
    if (p.max !== null && v > p.max) return `O valor máximo é ${p.max}.`;
  }
  if (p.type === 'enum' && !p.values.includes(v)) return `Use um destes valores: ${p.values.join(', ')}.`;
  return null;
};
route('PUT', '/v1/admin/parameters/:key', { perm: 'parameters:write' }, (req, res, ctx) => {
  const p = parameters.find((x) => x.key === ctx.params[0]);
  if (!p) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (p.legalFloor) return problem(res, 422, 'PARAMETER_LOCKED', 'Parâmetro fixo por lei', 'Piso legal de troca não é editável (DEC-011).');
  if (!ctx.body.reason || String(ctx.body.reason).trim().length < 5) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'reason', message: 'Informe o motivo (mínimo 5 caracteres).' }] });
  const problemText = validateParam(p, ctx.body.value);
  if (problemText) return problem(res, 422, 'PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', problemText, { errors: [{ field: 'value', message: problemText }] });
  const before = p.value;
  p.value = ctx.body.value;
  p.updatedAt = now();
  record(req, ctx, { action: 'parameter.update', targetType: 'parameter', targetId: p.key, before: { value: before }, after: { value: p.value }, reason: ctx.body.reason });
  json(res, 200, p);
});
route('POST', '/v1/admin/parameters/:key/reset', { perm: 'parameters:write' }, (req, res, ctx) => {
  const p = parameters.find((x) => x.key === ctx.params[0]);
  if (!p) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (p.legalFloor) return problem(res, 422, 'PARAMETER_LOCKED', 'Parâmetro fixo por lei');
  const before = p.value;
  p.value = p.default;
  p.updatedAt = now();
  record(req, ctx, { action: 'parameter.reset', targetType: 'parameter', targetId: p.key, before: { value: before }, after: { value: p.value }, reason: ctx.body.reason });
  json(res, 200, p);
});
route('GET', '/v1/admin/feature-flags', { perm: 'flags:read' }, (req, res) => json(res, 200, { data: flags, nextCursor: null }));
route('PUT', '/v1/admin/feature-flags/:key', { perm: 'flags:write' }, (req, res, ctx) => {
  const f = flags.find((x) => x.key === ctx.params[0]);
  if (!f) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const before = f.enabled;
  f.enabled = Boolean(ctx.body.enabled);
  f.updatedAt = now();
  record(req, ctx, { action: 'feature_flag.set', targetType: 'feature_flag', targetId: f.key, before: { enabled: before }, after: { enabled: f.enabled } });
  json(res, 200, f);
});

// termos
const present = (d) => d;
route('GET', '/v1/admin/legal/:type', { perm: 'legal:read' }, (req, res, ctx) => {
  const list = legal[ctx.params[0]];
  if (!list) return problem(res, 404, 'NOT_FOUND', 'Tipo de documento desconhecido.');
  json(res, 200, { data: [...list].sort((a, b) => b.version - a.version).map(present), nextCursor: null });
});
route('POST', '/v1/admin/legal/:type', { perm: 'legal:write' }, (req, res, ctx) => {
  const list = legal[ctx.params[0]];
  if (!list) return problem(res, 404, 'NOT_FOUND', 'Tipo de documento desconhecido.');
  const b = ctx.body;
  if (!b.content || String(b.content).trim().length < 20) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'content', message: 'O texto não pode ficar vazio.' }] });
  const doc = { id: randomUUID(), type: ctx.params[0], version: (list.at(-1)?.version ?? 0) + 1, title: b.title, content: b.content, effectiveAt: b.effectiveAt, relevantChange: Boolean(b.relevantChange), createdAt: now() };
  list.push(doc);
  record(req, ctx, { action: 'legal.publish', targetType: 'legal_document', targetId: doc.id, after: { type: doc.type, version: doc.version } });
  json(res, 201, doc);
});
route('GET', '/v1/legal/:type', { public: true }, (req, res, ctx) => {
  const list = (legal[ctx.params[0]] ?? []).filter((d) => new Date(d.effectiveAt) <= new Date());
  const current = list.sort((a, b) => b.version - a.version)[0];
  if (!current) return problem(res, 404, 'NOT_FOUND', 'Não encontrado', 'Documento ainda não publicado.');
  json(res, 200, current);
});

// auditoria
route('GET', '/v1/admin/audit-log', { perm: 'audit:read' }, (req, res, ctx) => {
  const q = ctx.query;
  const limit = Math.min(Number(q.get('limit') ?? 50), 100);
  let rows = audit.filter((a) => (!q.get('actorId') || a.actorId === q.get('actorId')) && (!q.get('action') || a.action === q.get('action')) && (!q.get('targetType') || a.targetType === q.get('targetType')) && (!q.get('targetId') || a.targetId === q.get('targetId')) && (!q.get('from') || a.at >= q.get('from')) && (!q.get('to') || a.at <= q.get('to')));
  const cursor = q.get('cursor');
  if (cursor) rows = rows.filter((a) => a.id < Number(cursor));
  const page = rows.slice(0, limit);
  json(res, 200, { data: page, nextCursor: rows.length > limit ? String(page.at(-1).id) : null });
});

// admins
route('GET', '/v1/admin/admins', { perm: 'admins:manage' }, (req, res) => json(res, 200, { data: [...users.values()].filter((u) => u.profile).map((u) => ({ userId: u.id, name: u.name, email: u.email, profile: u.profile, active: u.active, totpConfigured: u.totpConfirmed })), nextCursor: null }));
route('POST', '/v1/admin/admins', { perm: 'admins:manage', reauth: true }, (req, res, ctx) => {
  const b = ctx.body;
  if ([...users.values()].some((u) => u.email === String(b.email).toLowerCase())) return problem(res, 409, 'EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem conta');
  const token = randomBytes(32).toString('base64url');
  invitations.set(token, { email: String(b.email).toLowerCase(), name: b.name, profile: b.profile, used: false });
  record(req, ctx, { action: 'admin.invite', targetType: 'invitation', targetId: randomUUID(), after: { profile: b.profile } });
  console.log(`[fake-api] convite: http://localhost:3001/admin/convite?token=${token}`);
  json(res, 201, { invitationId: randomUUID(), expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString() });
});
route('PATCH', '/v1/admin/admins/:id', { perm: 'admins:manage', reauth: true }, (req, res, ctx) => {
  const target = users.get(ctx.params[0]);
  if (!target?.profile) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const next = { profile: ctx.body.profile ?? target.profile, active: ctx.body.active ?? target.active };
  const supers = [...users.values()].filter((u) => u.profile === 'super_admin' && u.active && u.id !== target.id);
  if (target.profile === 'super_admin' && target.active && (next.profile !== 'super_admin' || !next.active) && supers.length === 0) return problem(res, 409, 'LAST_SUPER_ADMIN', 'Precisa existir ao menos 1 super admin');
  record(req, ctx, { action: 'admin.update', targetType: 'user', targetId: target.id, before: { profile: target.profile, active: target.active }, after: next });
  Object.assign(target, next);
  revokeAll(target.id);
  empty(res);
});
route('POST', '/v1/admin/admins/:id/totp/reset', { perm: 'admins:manage', reauth: true }, (req, res, ctx) => {
  const target = users.get(ctx.params[0]);
  if (!target?.profile) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (target.id === ctx.user.id) return problem(res, 403, 'CANNOT_RESET_OWN_TOTP', 'Sem permissão', 'Você não pode redefinir o seu próprio TOTP.');
  target.totpSecret = null;
  target.totpConfirmed = false;
  revokeAll(target.id);
  record(req, ctx, { action: 'admin.totp_reset', targetType: 'user', targetId: target.id });
  empty(res);
});
// utilitário de teste (não existe na API real): lê o segredo do admin semeado
route('GET', '/__test/state', { public: true }, (req, res) => json(res, 200, { superSecret: SUPER_SECRET, audit: audit.length }));

// ---------------------------------------------------------------- servidor
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = routes.find((r) => r.method === req.method && r.regex.test(url.pathname));
  if (!match) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const ctx = { params: url.pathname.match(match.regex).slice(1), query: url.searchParams, body: {}, user: null, session: null };
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    ctx.body = await readBody(req);
    if (ctx.body === null) return problem(res, 400, 'BAD_REQUEST', 'Requisição inválida');
  }
  if (!match.opts.public) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const session = [...sessions.values()].find((s) => s.accessToken === token && !s.revoked);
    if (!session || session.accessExpires < Date.now()) return problem(res, 401, 'UNAUTHENTICATED', 'Não autenticado', 'Faça login para continuar.');
    ctx.session = session;
    ctx.user = users.get(session.userId);
    if (!ctx.user?.active && ctx.user?.profile) return problem(res, 401, 'UNAUTHENTICATED', 'Não autenticado');
    if (ctx.user.profile && !session.mfaVerified && !match.opts.mfaOptional) return problem(res, 403, 'MFA_REQUIRED', 'Sem permissão', 'Conclua a verificação em duas etapas para continuar.');
    if (match.opts.perm && !(ctx.user.profile && PERMS[match.opts.perm].includes(ctx.user.profile))) return problem(res, 403, 'FORBIDDEN', 'Sem permissão', 'Você não tem permissão para esta ação.');
    if (match.opts.reauth && Date.now() - session.reauthAt > REAUTH_MS) return problem(res, 403, 'REAUTH_REQUIRED', 'Sem permissão', 'Confirme sua identidade para continuar.');
    session.lastUsed = Date.now();
  }
  try {
    await match.handler(req, res, ctx);
  } catch (error) {
    console.error(error);
    problem(res, 500, 'INTERNAL_ERROR', 'Erro interno');
  }
}).listen(PORT, () => console.log(`[fake-api] ouvindo em http://localhost:${PORT}`));
