// API falsa para os testes E2E do painel: reproduz o comportamento observável de apps/api (módulos identity e admin)
// sem Postgres/Redis. Contrato = o dos controllers reais (ver docs/arquitetura/divida-tecnica.md, DT-014).
// Uso: node e2e/fake-api/server.mjs  (PORT, FAKE_ACCESS_TTL_S)
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';

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
addAdmin({ email: 'suporte@webag.local', name: 'Sara Dias', password: 'Webag-Admin-Dev-2026', profile: 'support', secret: SUPER_SECRET });
addAdmin({ email: 'novo@webag.local', name: 'Nina Alves', password: 'Webag-Admin-Dev-2026', profile: 'support', secret: null });
users.set('lojista', { id: randomUUID(), email: 'lojista@webag.local', name: 'Marcos Silva', password: 'Lojista-Dev-2026', profile: null, active: true, roles: ['customer', 'merchant'], emailVerified: true });
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
  param('entrega_preparo_padrao_min', 'int', 20, 5, 120, 'ETA: preparo padrão da loja (min); a loja pode definir o seu'),
  param('entrega_despacho_min', 'int', 15, 0, 60, 'ETA: espera de despacho até o motoboy sair (min)'),
  param('entrega_rota_fator_pct', 'int', 130, 100, 250, 'ETA: fator de rota sobre a distância em linha reta (130 = 1,30)'),
  param('entrega_min_por_km', 'decimal', 6, 1, 30, 'ETA: minutos de deslocamento por km de rota'),
  param('entrega_faixa_min', 'int', 15, 0, 60, 'ETA: folga da faixa para cada lado da estimativa (min)'),
  param('entrega_max_min', 'int', 120, 30, 240, 'ETA: teto da estimativa; acima disso a loja não entrega para o endereço'),
  param('entrega_atraso_tolerancia_min', 'int', 15, 0, 60, 'Atraso: minutos depois do fim da faixa antes de compensar e de liberar o cancelamento sem custo'),
  param('entrega_cancel_resposta_min', 'int', 10, 3, 30, 'Pedido já em saída: prazo da operação responder ao cancelamento por atraso (min)'),
  param('entrega_compensacao_tipo', 'enum', 'frete_gratis_proximo', null, null, 'Compensação do pedido entregue com atraso', false, { values: ['frete_gratis_proximo', 'cupom_valor', 'nenhuma'] }),
  param('entrega_compensacao_cents', 'int', 1000, 0, 5000, 'Valor do cupom de compensação (centavos)'),
  param('entrega_lote_max', 'int', 4, 2, 10, 'Corridas da mesma área que a Logística atribui de uma vez ao mesmo motoboy'),
  param('logistica_horario', 'window', '09:00-20:00', null, null, 'Horário em que a Webag despacha entregas'),
  param('logistica_dias', 'enum', 'seg_sab', null, null, 'Dias em que a logística abre', false, { values: ['seg_sab', 'seg_sex', 'seg_dom'] }),
  param('raio_max_km', 'int', 15, 1, 50, 'Raio máximo de entrega (km)'),
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
// Textos legais: os REAIS do seed da API (apps/api/seed/legal, DEC-080), com as variáveis {{...}} que o site preenche.
const SEED_LEGAL = new URL('../../../api/seed/legal/', import.meta.url);
const legalDoc = (type, title) => ({ id: randomUUID(), type, version: 1, title, content: readFileSync(new URL(`${type}.md`, SEED_LEGAL), 'utf8').trim(), effectiveAt: new Date(Date.now() - 86_400_000).toISOString(), relevantChange: false, createdAt: now() });
const legal = {
  customer_terms: [legalDoc('customer_terms', 'Termos de Uso')],
  merchant_terms: [legalDoc('merchant_terms', 'Termos do Lojista')],
  privacy: [legalDoc('privacy', 'Política de Privacidade')],
  exchange_policy: [legalDoc('exchange_policy', 'Política de Trocas e Reembolsos')],
};

// ---------------------------------------------------------------- utilitários
const problem = (res, status, code, title, detail, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/problem+json', ...(extra.headers ?? {}) });
  res.end(JSON.stringify({ type: `https://api.webag.com.br/errors/${code.toLowerCase()}`, title, status, code, ...(detail ? { detail } : {}), ...(extra.errors ? { errors: extra.errors } : {}), ...(extra.extra ?? {}) }));
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
        // A importação de produtos manda a planilha em texto (`text/csv`), não JSON.
        if ((req.headers['content-type'] ?? '').startsWith('text/csv')) return resolve({ __csv: raw });
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
  'stores:read': ['super_admin', 'operations', 'support'],
  'stores:write': ['super_admin', 'operations'],
  'stores:decide': ['super_admin', 'operations'],
  'stores:documents': ['super_admin', 'operations'],
  'logistics:read': ['super_admin', 'operations', 'finance', 'support'],
  'logistics:write': ['super_admin', 'operations'],
  'logistics:contact': ['super_admin', 'operations', 'finance', 'support'],
  'exchanges:mediate': ['super_admin', 'operations'],
};
function me(user) {
  return { id: user.id, email: user.email, emailVerified: user.emailVerified ?? true, name: user.name, phone: null, roles: user.roles ?? ['customer'], adminProfile: user.profile && user.active ? user.profile : null, pendingTerms: [] };
}
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified ?? true, name: u.name });

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

// pedido ao encarregado (público): sempre a mesma resposta, exista ou não conta com o e-mail (SEC-152)
const privacyRequests = [];
route('POST', '/v1/privacy/requests', { public: true }, (req, res, ctx) => {
  if (String(ctx.body.email).startsWith('limite@')) return problem(res, 429, 'TOO_MANY_REQUESTS', 'Muitas tentativas');
  privacyRequests.push({ type: ctx.body.type, exists: [...users.values()].some((u) => u.email === String(ctx.body.email).toLowerCase()) });
  json(res, 202, { protocol: `PV-${String(privacyRequests.length).padStart(4, '0')}`, dueAt: '2026-12-04T12:00:00.000Z' });
});
route('GET', '/__test/privacy-requests', { public: true }, (req, res) => json(res, 200, { data: privacyRequests }));

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

// ---------------------------------------------------------------- lojista e lojas (Onda 2A)
const stores = new Map();
const uploads = new Map();
// PNG mínimo (cinza 16x12) para o visualizador de documentos.
const PNG = (() => {
  const crc = (buf) => {
    let c;
    const table = Array.from({ length: 256 }, (_, n) => {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    let x = 0xffffffff;
    for (const b of buf) x = table[(x ^ b) & 0xff] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const [w, h] = [16, 12];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 180)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

const CPF_KINDS = ['id_front', 'id_back', 'address_proof'];
const CNPJ_KINDS = ['cnpj_card', 'responsible_id'];
const ownerStore = (user) => [...stores.values()].find((s) => s.ownerId === user.id);
const apiStore = (s, viewer = 'owner') => ({
  id: s.id,
  status: s.status,
  documentType: s.documentType,
  document: s.document,
  legalName: s.legalName,
  name: s.name,
  description: s.description,
  phone: null,
  whatsapp: s.whatsapp,
  mainCategoryId: s.mainCategoryId,
  extraCategoryIds: [],
  address: s.address,
  logo: null,
  cover: null,
  pendingReview: false,
  reviewItems: s.reviewItems.filter((i) => !i.resolved).map((i) => ({ item: i.item, reason: i.reason })),
  submittedAt: s.submittedAt,
  decisionReason: s.status === 'rejected' || s.status === 'suspended' ? s.decisionReason : null,
  createdAt: s.createdAt,
  ...(viewer === 'owner' ? { role: 'owner' } : {}),
});
const currentDocs = (s) => s.documents.filter((d) => !d.superseded);
function missingFor(s) {
  const out = [];
  if (!s.name) out.push({ field: 'name', message: 'Informe o nome da loja.' });
  if (!s.mainCategoryId) out.push({ field: 'mainCategoryId', message: 'Escolha a categoria principal.' });
  if (!s.whatsapp) out.push({ field: 'whatsapp', message: 'Informe o WhatsApp ou o telefone.' });
  if (!s.address?.cep || s.address.lat == null) out.push({ field: 'address', message: 'Informe o endereço da loja.' });
  if (s.documentType === 'cnpj' && !s.legalName) out.push({ field: 'legalName', message: 'Informe a razão social.' });
  const have = new Set(currentDocs(s).map((d) => d.kind));
  for (const kind of s.documentType === 'cpf' ? CPF_KINDS : CNPJ_KINDS) if (!have.has(kind)) out.push({ field: `documents.${kind}`, message: `Falta o documento: ${kind}.` });
  if (!s.payment) out.push({ field: 'paymentAccount', message: 'Conecte a conta de recebimento.' });
  for (const item of s.reviewItems) if (!item.resolved) out.push({ field: `review.${item.item}`, message: 'Corrija o item reprovado.' });
  return out;
}
const mustOwn = (res, ctx) => {
  const s = stores.get(ctx.params[0]);
  if (!s || s.ownerId !== ctx.user.id) {
    problem(res, 404, 'NOT_FOUND', 'Não encontrado');
    return null;
  }
  return s;
};
const addHistory = (s, from, to, actor, reason) => s.history.push({ from, to, at: now(), reason: reason ?? null, actor });

route('GET', '/v1/categories', {}, (req, res) => json(res, 200, { data: tree().map((c) => ({ ...c, createdAt: now(), updatedAt: now() })), nextCursor: null }));
route('GET', '/v1/regions', {}, (req, res) => json(res, 200, { data: cities.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, state: c.state, slug: c.slug, neighborhoods: c.neighborhoods.filter((n) => n.active).map((n) => ({ id: n.id, name: n.name })) })), nextCursor: null }));
route('GET', '/v1/cep/:cep', {}, (req, res, ctx) => {
  if (ctx.params[0].replace('-', '') === '07900000') return json(res, 200, { street: 'Rua das Flores', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 });
  problem(res, 404, 'NOT_FOUND', 'Não encontrado', 'CEP não encontrado.');
});

// conta de lojista: cadastro com código por e-mail (código fixo 123456) e papel de lojista
route('POST', '/v1/auth/register', { public: true }, (req, res, ctx) => {
  const b = ctx.body;
  const email = String(b.email ?? '').toLowerCase();
  if ([...users.values()].some((u) => u.email === email)) return problem(res, 409, 'EMAIL_ALREADY_REGISTERED', 'E-mail já cadastrado');
  if (String(b.password ?? '').length < 8) return problem(res, 422, 'WEAK_PASSWORD', 'Senha fraca', undefined, { errors: [{ field: 'password', message: 'Senha fraca.' }] });
  const user = { id: randomUUID(), email, name: b.name, password: b.password, profile: null, active: true, roles: ['customer'], emailVerified: false };
  users.set(user.id, user);
  const { tokens } = newSession(user, { mfaVerified: false });
  json(res, 201, { user: publicUser(user), tokens });
});
route('POST', '/v1/auth/email/verify', {}, (req, res, ctx) => {
  if (ctx.body.code !== '123456') return problem(res, 401, 'CODE_INVALID', 'Código inválido', 'Código incorreto ou vencido.');
  ctx.user.emailVerified = true;
  empty(res);
});
route('POST', '/v1/auth/email/resend', {}, (req, res) => empty(res));
route('POST', '/v1/me/merchant-role', {}, (req, res, ctx) => {
  if (!ctx.user.emailVerified) return problem(res, 403, 'EMAIL_VERIFICATION_REQUIRED', 'Confirme seu e-mail');
  if (!ctx.user.roles.includes('merchant')) ctx.user.roles.push('merchant');
  empty(res);
});

// lojas do lojista
route('GET', '/v1/stores/mine', {}, (req, res, ctx) => {
  const s = ownerStore(ctx.user);
  json(res, 200, { data: s ? [apiStore(s)] : [], nextCursor: null });
});
route('POST', '/v1/stores', {}, (req, res, ctx) => {
  if (!ctx.user.emailVerified) return problem(res, 403, 'EMAIL_VERIFICATION_REQUIRED', 'Confirme seu e-mail');
  const b = ctx.body;
  const document = String(b.documentNumber ?? '').replace(/\D/g, '');
  if (!/^\d{11}$|^\d{14}$/.test(document)) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'documentNumber', message: 'CPF inválido.' }] });
  if ([...stores.values()].some((s) => s.document === document)) return problem(res, 409, 'DOCUMENT_IN_USE', 'Documento já cadastrado', 'Esse CPF ou CNPJ já tem uma loja.');
  const s = { id: randomUUID(), ownerId: ctx.user.id, status: 'draft', documentType: b.documentType, document, legalName: b.legalName ?? null, name: null, description: null, whatsapp: null, mainCategoryId: null, address: null, documents: [], reviewItems: [], history: [], payment: null, submittedAt: null, decidedBy: null, decisionReason: null, createdAt: now() };
  stores.set(s.id, s);
  json(res, 201, apiStore(s));
});
route('GET', '/v1/stores/:id', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (s) json(res, 200, { ...apiStore(s), settings: { hours: [] } });
});
route('PATCH', '/v1/stores/:id/profile', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  const b = ctx.body;
  if (b.name !== undefined) s.name = b.name;
  if (b.legalName !== undefined) s.legalName = b.legalName;
  if (b.mainCategoryId !== undefined) s.mainCategoryId = b.mainCategoryId;
  if (b.whatsapp !== undefined) s.whatsapp = b.whatsapp;
  if (b.description !== undefined) s.description = b.description;
  if (b.address) s.address = { cep: b.address.cep, street: b.address.street ?? null, number: b.address.number, complement: b.address.complement ?? null, neighborhood: b.address.neighborhood ?? null, city: b.address.city ?? null, state: b.address.state ?? null, lat: b.address.lat ?? null, lng: b.address.lng ?? null };
  json(res, 200, { ...apiStore(s), pendingReview: false });
});
route('GET', '/v1/stores/:id/onboarding', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (s) json(res, 200, { status: s.status, complete: missingFor(s).length === 0, missing: missingFor(s), paymentAccount: s.payment, history: s.history });
});
route('GET', '/v1/stores/:id/documents', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (s) json(res, 200, { data: s.documents.map((d) => ({ id: d.id, kind: d.kind, uploadedAt: d.createdAt, current: !d.superseded })), nextCursor: null });
});
route('POST', '/v1/stores/:id/documents', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  const upload = uploads.get(ctx.body.uploadId);
  if (!upload || upload.status !== 'ready') return problem(res, 422, 'UPLOAD_NOT_READY', 'Arquivo não confirmado');
  for (const d of s.documents) if (d.kind === ctx.body.kind) d.superseded = true;
  s.documents.push({ id: randomUUID(), kind: ctx.body.kind, createdAt: now(), superseded: false });
  // Reenvio de documento em correção: o item aberto daquele documento fica resolvido.
  for (const item of s.reviewItems) if (item.item === ctx.body.kind) item.resolved = true;
  empty(res);
});
route('POST', '/v1/stores/:id/submit', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  const missing = missingFor(s);
  if (missing.length > 0) return problem(res, 422, 'ONBOARDING_INCOMPLETE', 'Faltam itens para enviar a loja', 'Complete o que falta e envie de novo.', { errors: missing });
  const from = s.status;
  s.status = 'in_review';
  s.submittedAt = s.submittedAt ?? now();
  addHistory(s, from, 'in_review', ctx.user.id);
  json(res, 200, apiStore(s));
});

// conta de recebimento (Mercado Pago simulado): autoriza e volta ao painel com state e code
route('GET', '/v1/stores/:id/payment-account', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (s) json(res, 200, s.payment ? { connected: true, provider: 'fake', status: 'active', holderDocumentMasked: '***.982.247-**' } : { connected: false });
});
route('POST', '/v1/stores/:id/payment-account/connect', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  s.oauthState = randomBytes(24).toString('base64url');
  json(res, 200, { authorizationUrl: `/lojista/onboarding/4?state=${s.oauthState}&code=fake-code`, state: s.oauthState, expiresInSeconds: 600 });
});
route('POST', '/v1/stores/:id/payment-account/callback', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  if (!s.oauthState || ctx.body.state !== s.oauthState) return problem(res, 422, 'OAUTH_STATE_INVALID', 'Link expirado');
  s.oauthState = null;
  s.payment = { status: 'active' };
  json(res, 200, { connected: true, provider: 'fake', status: 'active', holderDocumentMasked: '***.982.247-**' });
});

// uploads: política (POST ao armazenamento falso), confirmação
route('POST', '/v1/uploads', {}, (req, res, ctx) => {
  const id = randomUUID();
  uploads.set(id, { id, storeId: ctx.body.storeId, purpose: ctx.body.purpose, status: 'pending' });
  json(res, 200, { id, upload: { url: `http://localhost:${PORT}/__storage/${id}`, fields: { key: id }, expiresAt: now() } });
});
route('POST', '/v1/uploads/:id/complete', {}, (req, res, ctx) => {
  const upload = uploads.get(ctx.params[0]);
  if (!upload) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  upload.status = 'ready';
  const urls = upload.purpose === 'product_image' ? { 160: `http://localhost:${PORT}/__storage/img-${upload.id}.png`, 400: `http://localhost:${PORT}/__storage/img-${upload.id}.png` } : null;
  json(res, 200, { id: upload.id, status: 'ready', urls, rejectionReason: null });
});

// admin: fila, caso e decisões
const queueRow = (s) => ({ id: s.id, name: s.name, status: s.status, documentMasked: `•••${s.document.slice(-4)}`, city: s.address?.city ?? null, submittedAt: s.submittedAt, overdue: false, holderMismatch: false });
route('GET', '/v1/admin/stores', { perm: 'stores:read' }, (req, res, ctx) => {
  const status = ctx.query.get('status') ?? 'in_review';
  const rows = [...stores.values()].filter((s) => s.status === status).sort((a, b) => String(a.submittedAt ?? a.createdAt).localeCompare(String(b.submittedAt ?? b.createdAt)));
  json(res, 200, { data: rows.map(queueRow), nextCursor: null });
});
route('GET', '/v1/admin/stores/:id', { perm: 'stores:read' }, (req, res, ctx) => {
  const s = stores.get(ctx.params[0]);
  if (!s) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const owner = users.get(s.ownerId);
  json(res, 200, {
    store: apiStore(s, 'admin'),
    owner: { email: owner?.email ?? '', name: owner?.name ?? '' },
    documents: s.documents.map((d) => ({ id: d.id, kind: d.kind, uploadedAt: d.createdAt, current: !d.superseded })),
    reviewItems: s.reviewItems.filter((i) => !i.resolved).map((i) => ({ item: i.item, reason: i.reason })),
    history: s.history.map((h) => ({ from: h.from, to: h.to, at: h.at, reason: h.reason })),
    paymentAccount: s.payment ? { status: 'active', holderDocumentMasked: '***.982.247-**', holderMatchesStore: true } : null,
    sameDocument: [],
    settings: {},
  });
});
route('POST', '/v1/admin/stores/:id/documents/:doc/access', { perm: 'stores:documents' }, (req, res, ctx) => {
  const s = stores.get(ctx.params[0]);
  const doc = s?.documents.find((d) => d.id === ctx.params[1]);
  if (!doc) return problem(res, 404, 'NOT_FOUND', 'Documento não encontrado.');
  record(req, ctx, { action: 'store.document_view', targetType: 'store_document', targetId: doc.id, reason: ctx.body.reason });
  json(res, 200, { url: `http://localhost:${PORT}/__storage/doc-${doc.id}.png?sig=1`, expiresInSeconds: 300, contentType: 'image/png' });
});
function decide(req, res, ctx, from, to, apply) {
  const s = stores.get(ctx.params[0]);
  if (!s) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (s.status !== from) {
    const who = s.decidedBy ? users.get(s.decidedBy)?.name : null;
    return problem(res, 409, from === 'in_review' && ['approved', 'rejected', 'correction_requested'].includes(s.status) ? 'STORE_ALREADY_DECIDED' : 'INVALID_STORE_TRANSITION', 'Loja já decidida', who ? `Já decidida por ${who}.` : 'Já decidida.');
  }
  const previous = s.status;
  s.status = to;
  s.decidedBy = ctx.user.id;
  apply(s);
  addHistory(s, previous, to, ctx.user.id, s.decisionReason);
  record(req, ctx, { action: `store.${to}`, targetType: 'store', targetId: s.id, reason: s.decisionReason });
  json(res, 200, apiStore(s, 'admin'));
}
route('POST', '/v1/admin/stores/:id/approve', { perm: 'stores:decide' }, (req, res, ctx) => decide(req, res, ctx, 'in_review', 'approved', () => {}));
route('POST', '/v1/admin/stores/:id/request-correction', { perm: 'stores:decide' }, (req, res, ctx) =>
  decide(req, res, ctx, 'in_review', 'correction_requested', (s) => {
    for (const item of ctx.body.items ?? []) s.reviewItems.push({ item: item.item, reason: item.reason, resolved: false });
    s.decisionReason = (ctx.body.items ?? []).map((i) => `${i.item}: ${i.reason}`).join('; ');
  }),
);
route('POST', '/v1/admin/stores/:id/reject', { perm: 'stores:decide' }, (req, res, ctx) => decide(req, res, ctx, 'in_review', 'rejected', (s) => (s.decisionReason = ctx.body.reason)));
route('POST', '/v1/admin/stores/:id/suspend', { perm: 'stores:decide' }, (req, res, ctx) => decide(req, res, ctx, 'approved', 'suspended', (s) => (s.decisionReason = ctx.body.reason)));
route('POST', '/v1/admin/stores/:id/reactivate', { perm: 'stores:decide' }, (req, res, ctx) => decide(req, res, ctx, 'suspended', 'approved', (s) => (s.decisionReason = null)));

// ---------------------------------------------------------------- catálogo do lojista (Onda 2B): o comportamento observável que o painel usa
const products = new Map(); // id -> produto
const sections = new Map(); // id -> seção
const idempotent = new Map(); // chave -> id do produto
const storeProducts = (storeId) => [...products.values()].filter((p) => p.storeId === storeId && p.status !== 'archived');
const imageUrls = (assetId) => ({ 160: `http://localhost:${PORT}/__storage/img-${assetId}.png`, 400: `http://localhost:${PORT}/__storage/img-${assetId}.png` });
const presentVariant = (v) => ({ id: v.id, attributes: v.attributes, sku: v.sku, priceCents: v.priceCents, effectivePriceCents: v.priceCents, originalPriceCents: null, discountPercent: null, stock: v.stock, reserved: 0, available: v.stock, soldOut: v.stock <= 0, low: v.stock > 0 && v.stock <= 3 });
const presentProduct = (p) => ({
  id: p.id, name: p.name, description: p.description, categoryId: p.categoryId, sectionId: p.sectionId, status: p.status, moderationStatus: p.moderationStatus, moderationReason: null,
  basePriceCents: p.basePriceCents, promotion: { priceCents: p.promoPriceCents, startsAt: p.promoStartsAt, endsAt: p.promoEndsAt, active: false },
  variantAttributes: p.variantAttributes, variants: p.variants.map(presentVariant), images: p.images.map((assetId, position) => ({ id: assetId, position, urls: imageUrls(assetId) })),
  soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0), publishedAt: p.publishedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
});
const summary = (p) => {
  const total = p.variants.reduce((sum, v) => sum + v.stock, 0);
  const prices = p.variants.map((v) => v.priceCents ?? p.basePriceCents).filter((x) => x != null);
  return { id: p.id, name: p.name, status: p.status, moderationStatus: p.moderationStatus, sectionId: p.sectionId, basePriceCents: p.basePriceCents, fromPriceCents: prices.length ? Math.min(...prices) : p.basePriceCents, cover: p.images[0] ? imageUrls(p.images[0]) : null, availableTotal: total, low: total > 0 && total <= 3, soldOut: p.variants.length > 0 && total <= 0, variantCount: p.variants.length, updatedAt: p.updatedAt };
};
const mustCatalog = (res, ctx) => {
  const s = stores.get(ctx.params[0]);
  if (!s || s.ownerId !== ctx.user.id) return void problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (s.status !== 'approved') return void problem(res, 409, 'STORE_NOT_APPROVED', 'Loja ainda não aprovada', 'O catálogo é liberado depois da aprovação da loja.');
  return s;
};
const mustProduct = (res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return null;
  const p = products.get(ctx.params[1]);
  if (!p || p.storeId !== s.id) return void problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  return p;
};
const touch = (p) => (p.updatedAt = now());

route('GET', '/v1/stores/:id/products', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  let rows = storeProducts(s.id);
  const status = ctx.query.get('status');
  const q = (ctx.query.get('q') ?? '').toLowerCase();
  if (status) rows = rows.filter((p) => p.status === status);
  if (ctx.query.get('lowStock')) rows = rows.filter((p) => summary(p).low);
  if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));
  if (ctx.query.get('sectionId')) rows = rows.filter((p) => p.sectionId === ctx.query.get('sectionId'));
  rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq);
  const limit = Number(ctx.query.get('limit') ?? 25);
  const offset = Number(ctx.query.get('cursor') ?? 0);
  const page = rows.slice(offset, offset + limit);
  json(res, 200, { data: page.map(summary), nextCursor: offset + limit < rows.length ? String(offset + limit) : null });
});
route('POST', '/v1/stores/:id/products', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  const key = req.headers['idempotency-key'];
  if (key && idempotent.has(key)) return json(res, 201, presentProduct(products.get(idempotent.get(key))));
  const b = ctx.body;
  if (typeof b.name !== 'string' || b.name.trim().length < 2) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'name', message: 'Informe o nome.' }] });
  const p = { id: randomUUID(), seq: products.size, storeId: s.id, name: b.name.trim(), description: b.description ?? null, categoryId: b.categoryId ?? null, sectionId: b.sectionId ?? null, status: 'draft', moderationStatus: 'ok', basePriceCents: b.basePriceCents ?? null, promoPriceCents: null, promoStartsAt: null, promoEndsAt: null, variantAttributes: [], variants: [], images: [], publishedAt: null, createdAt: now(), updatedAt: now() };
  products.set(p.id, p);
  if (key) idempotent.set(key, p.id);
  json(res, 201, presentProduct(p));
});
route('GET', '/v1/stores/:id/products/import/template', {}, (req, res, ctx) => {
  if (!mustCatalog(res, ctx)) return;
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }).end('nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo\r\n');
});
const HEADERS = ['nome', 'categoria', 'descricao', 'preco', 'promocional', 'promo_inicio', 'promo_fim', 'variacao1', 'variacao2', 'estoque', 'codigo'];
route('POST', '/v1/stores/:id/products/import', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  const text = ctx.body.__csv ?? '';
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = (lines[0] ?? '').split(';');
  if (HEADERS.some((h) => !header.includes(h))) return problem(res, 422, 'IMPORT_FILE_INVALID', 'Planilha inválida', 'Cabeçalho inválido. Use o modelo.', { errors: [{ field: 'file', message: 'Cabeçalho inválido. Use o modelo.' }] });
  const errors = [];
  const groups = new Map();
  lines.slice(1).forEach((line, i) => {
    const cells = Object.fromEntries(line.split(';').map((value, index) => [header[index], value.trim()]));
    const row = i + 2;
    if (!cells.nome) return errors.push({ line: row, message: 'nome vazio' });
    if (!/^\d+(,\d{1,2})?$/.test(cells.preco ?? '')) return errors.push({ line: row, message: 'preço vazio ou inválido' });
    const group = groups.get(cells.nome) ?? { nome: cells.nome, preco: Math.round(Number(cells.preco.replace(',', '.')) * 100), codigo: cells.codigo || null, estoque: 0 };
    group.estoque += Number(cells.estoque || 0);
    groups.set(cells.nome, group);
  });
  const existing = new Set(storeProducts(s.id).flatMap((p) => p.variants.map((v) => v.sku)).filter(Boolean));
  const dup = [...groups.values()].filter((g) => g.codigo && existing.has(g.codigo));
  const fresh = [...groups.values()].filter((g) => !dup.includes(g));
  const mode = ctx.query.get('mode') ?? 'preview';
  const base = { totalLines: lines.length - 1, valid: lines.length - 1 - errors.length, invalid: errors.length, errors, productsToCreate: fresh.length, alreadyExist: dup.length };
  if (mode !== 'commit') return json(res, 200, { ...base, committed: false, created: 0, updated: 0, skipped: 0 });
  for (const g of fresh) {
    const p = { id: randomUUID(), seq: products.size, storeId: s.id, name: g.nome, description: null, categoryId: null, sectionId: null, status: 'draft', moderationStatus: 'ok', basePriceCents: g.preco, promoPriceCents: null, promoStartsAt: null, promoEndsAt: null, variantAttributes: [], variants: [{ id: randomUUID(), attributes: {}, stock: g.estoque, priceCents: null, sku: g.codigo }], images: [], publishedAt: null, createdAt: now(), updatedAt: now() };
    products.set(p.id, p);
  }
  json(res, 200, { ...base, committed: true, created: fresh.length, updated: 0, skipped: dup.length });
});
route('POST', '/v1/stores/:id/products/bulk', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  const { productIds, action } = ctx.body;
  let changed = 0;
  for (const id of productIds) {
    const p = products.get(id);
    if (!p || p.storeId !== s.id) continue;
    if (action.type === 'pause' && p.status === 'active') p.status = 'paused';
    if (action.type === 'resume' && p.status === 'paused') p.status = 'active';
    if (action.type === 'move_section') p.sectionId = action.sectionId;
    changed++;
    touch(p);
  }
  json(res, 200, { dryRun: false, willChange: changed, changed, blocked: [] });
});
route('GET', '/v1/stores/:id/products/:pid', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (p) json(res, 200, presentProduct(p));
});
route('PATCH', '/v1/stores/:id/products/:pid', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  const b = ctx.body;
  for (const [from, to] of [['name', 'name'], ['description', 'description'], ['categoryId', 'categoryId'], ['sectionId', 'sectionId'], ['basePriceCents', 'basePriceCents'], ['promoPriceCents', 'promoPriceCents'], ['promoStartsAt', 'promoStartsAt'], ['promoEndsAt', 'promoEndsAt']]) if (b[from] !== undefined) p[to] = b[from];
  if (p.promoPriceCents != null && p.basePriceCents != null && p.promoPriceCents >= p.basePriceCents) return problem(res, 422, 'PROMOTION_INVALID', 'Promoção inválida', 'O preço promocional precisa ser menor que o normal.');
  touch(p);
  json(res, 200, presentProduct(p));
});
route('DELETE', '/v1/stores/:id/products/:pid', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  p.status = 'archived';
  empty(res);
});
route('PUT', '/v1/stores/:id/products/:pid/variants', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  const { attributes, variants } = ctx.body;
  if (!Array.isArray(variants) || variants.length < 1) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  p.variantAttributes = attributes;
  p.variants = variants.map((v) => ({ id: v.id ?? randomUUID(), attributes: v.attributes, stock: v.stock ?? 0, priceCents: v.priceCents ?? null, sku: v.sku ?? null }));
  touch(p);
  json(res, 200, presentProduct(p));
});
route('POST', '/v1/stores/:id/products/:pid/variants/:vid/stock', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  const v = p.variants.find((x) => x.id === ctx.params[2]);
  if (!v) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  v.stock = ctx.body.set !== undefined ? ctx.body.set : v.stock + ctx.body.delta;
  touch(p);
  json(res, 200, presentVariant(v));
});
route('PUT', '/v1/stores/:id/products/:pid/images', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  if (ctx.body.imageIds.length > 8) return problem(res, 422, 'TOO_MANY_IMAGES', 'Muitas fotos');
  p.images = ctx.body.imageIds;
  touch(p);
  json(res, 200, presentProduct(p));
});
route('POST', '/v1/stores/:id/products/:pid/publish', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  const errors = [];
  if (!p.categoryId) errors.push({ field: 'categoryId', message: 'Escolha a categoria.' });
  if (p.basePriceCents == null) errors.push({ field: 'basePriceCents', message: 'Informe o preço.' });
  if (p.images.length < 1) errors.push({ field: 'imageIds', message: 'Envie ao menos 1 foto.' });
  if (p.variants.length < 1) errors.push({ field: 'variants', message: 'Cadastre ao menos 1 variação.' });
  if (errors.length > 0) return problem(res, 422, 'PRODUCT_INCOMPLETE', 'Produto incompleto', 'Faltam informações para publicar.', { errors });
  p.status = 'active';
  p.publishedAt = now();
  touch(p);
  json(res, 200, presentProduct(p));
});
route('POST', '/v1/stores/:id/products/:pid/pause', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  p.status = 'paused';
  touch(p);
  json(res, 200, presentProduct(p));
});
route('POST', '/v1/stores/:id/products/:pid/resume', {}, (req, res, ctx) => {
  const p = mustProduct(res, ctx);
  if (!p) return;
  p.status = 'active';
  touch(p);
  json(res, 200, presentProduct(p));
});
route('GET', '/v1/stores/:id/sections', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  const rows = [...sections.values()].filter((x) => x.storeId === s.id).sort((a, b) => a.position - b.position);
  json(res, 200, { data: rows.map((x) => ({ id: x.id, name: x.name, position: x.position, productCount: storeProducts(s.id).filter((p) => p.sectionId === x.id).length })), nextCursor: null });
});
route('POST', '/v1/stores/:id/sections', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  const x = { id: randomUUID(), storeId: s.id, name: String(ctx.body.name).trim(), position: [...sections.values()].filter((y) => y.storeId === s.id).length };
  sections.set(x.id, x);
  json(res, 201, { id: x.id, name: x.name, position: x.position, productCount: 0 });
});
route('DELETE', '/v1/stores/:id/sections/:sid', {}, (req, res, ctx) => {
  const s = mustCatalog(res, ctx);
  if (!s) return;
  sections.delete(ctx.params[1]);
  for (const p of products.values()) if (p.sectionId === ctx.params[1]) p.sectionId = null;
  empty(res);
});

// semeia lojista com loja APROVADA e conta de senha conhecida (o catálogo só abre com a loja aprovada)
route('POST', '/__test/seed-merchant', { public: true }, (req, res, ctx) => {
  const owner = { id: randomUUID(), email: `lojista-${randomUUID().slice(0, 8)}@loja.test`, name: 'Marcos Silva', password: 'Webag-Lojista-2026!', profile: null, active: true, roles: ['customer', 'merchant'], emailVerified: true };
  users.set(owner.id, owner);
  const document = String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
  const s = { id: randomUUID(), ownerId: owner.id, status: ctx.body.status ?? 'approved', documentType: 'cpf', document, legalName: null, name: ctx.body.name ?? 'Casa Bela', description: null, whatsapp: '11987654321', mainCategoryId: categories[2].id, address: { cep: '07900-000', street: 'Rua das Flores', number: '10', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 }, documents: CPF_KINDS.map((kind) => ({ id: randomUUID(), kind, createdAt: now(), superseded: false })), reviewItems: [], history: [], payment: { status: 'active' }, submittedAt: now(), decidedBy: null, decisionReason: null, createdAt: now() };
  stores.set(s.id, s);
  json(res, 201, { email: owner.email, password: owner.password, storeId: s.id });
});

// semeia uma loja já enviada para análise (o teste de aprovação não depende do teste de cadastro)
route('POST', '/__test/seed-store', { public: true }, (req, res, ctx) => {
  const name = ctx.body.name ?? 'Casa Bela';
  const owner = { id: randomUUID(), email: `dono-${randomUUID().slice(0, 8)}@loja.test`, name: 'Marcos Silva', password: 'x', profile: null, active: true, roles: ['customer', 'merchant'], emailVerified: true };
  users.set(owner.id, owner);
  const document = String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
  const s = { id: randomUUID(), ownerId: owner.id, status: 'in_review', documentType: 'cpf', document, legalName: null, name, description: null, whatsapp: '11987654321', mainCategoryId: categories[2].id, address: { cep: '07900-000', street: 'Rua das Flores', number: '10', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 }, documents: CPF_KINDS.map((kind) => ({ id: randomUUID(), kind, createdAt: now(), superseded: false })), reviewItems: [], history: [], payment: { status: 'active' }, submittedAt: ctx.body.submittedAt ?? now(), decidedBy: null, decisionReason: null, createdAt: now() };
  stores.set(s.id, s);
  json(res, 201, { id: s.id, name, documents: s.documents.map((d) => d.id) });
});

// ---------------------------------------------------------------- pedidos, logística e trocas (Ondas 4C, 4D e 5B)
const orders = new Map();
const deliveries = new Map();
const couriers = new Map();
const exchanges = new Map();
let orderSeq = 4000;
const money = (amount) => ({ amount, currency: 'BRL' });
const storeActionsFor = (o) => {
  const a = [];
  if (o.status === 'received') a.push('accept', 'refuse');
  if (o.status === 'accepted') a.push('prepare', 'ready', 'cancel');
  if (o.status === 'in_preparation') a.push('ready', 'cancel');
  return a;
};
const orderSummary = (o) => ({ id: o.id, number: o.number, status: o.status, mode: o.mode, createdAt: o.createdAt, paidAt: o.createdAt, acceptDeadlineAt: o.status === 'received' ? new Date(Date.parse(o.createdAt) + 10 * 60_000).toISOString() : null, customerFirstName: 'Carla', itemCount: 2, firstItemName: 'Camiseta Básica', total: money(8990), allowedActions: storeActionsFor(o) });
const orderDetail = (o) => ({ ...orderSummary(o), acceptedAt: null, customer: { firstName: 'Carla', phone: null }, items: [{ name: 'Camiseta Básica', attributes: { Tam: 'M' }, image: {}, quantity: 2, unitPrice: money(4495), lineTotal: money(8990) }], delivery: null, pickup: null, values: { subtotal: money(8990), delivery: money(500), storeDiscount: money(0), total: money(9490), commission: money(1349), netBeforeProviderFee: money(7641) }, couponCode: null, timeline: [{ status: o.status, at: o.createdAt, actor: 'system', reason: null }], cancellation: null, logistics: o.deliveryId ? { status: deliveries.get(o.deliveryId)?.status, courierFirstName: deliveries.get(o.deliveryId)?.courier?.name ?? null, volumes: 1 } : undefined });
const mineStore = (ctx) => [...stores.values()].find((s) => s.ownerId === ctx.user?.id);
const deliveryView = (d) => {
  const wait = Math.max(0, Math.floor((Date.now() - Date.parse(d.readyAt)) / 60_000));
  return { id: d.id, kind: d.kind, orderId: d.orderId, orderNumber: d.orderNumber, storeId: d.storeId, storeName: d.storeName, status: d.status, readyAt: d.readyAt, waitingMinutes: d.status === 'ready_for_collection' ? wait : null, sla: d.status === 'ready_for_collection' ? (wait >= 20 ? 'late' : wait >= 10 ? 'long' : 'ok') : null, courier: d.courier, volumes: d.volumes, note: d.note ?? null, destination: 'Jardim Alvorada, Francisco Morato', fee: money(700), expectedCost: money(600), cost: d.cost ?? null, attempts: 0, failReason: null, etaToAt: d.etaToAt ?? null, overdue: d.etaToAt ? Date.parse(d.etaToAt) < Date.now() && d.status !== 'delivered' : false, overdueMinutes: d.etaToAt && Date.parse(d.etaToAt) < Date.now() ? Math.round((Date.now() - Date.parse(d.etaToAt)) / 60_000) : null, area: { key: 'jardim-alvorada', readyCount: [...deliveries.values()].filter((x) => x.status === 'ready_for_collection').length }, contactRevealable: true, customerPhoneMasked: '(11) 9****-4321', whatsappSentAt: d.whatsappSentAt ?? null, codeRequired: false, allowedActions: d.status === 'ready_for_collection' ? ['assign', 'cancel'] : d.status === 'awaiting_courier' ? ['confirm', 'reassign', 'cancel'] : d.status === 'courier_en_route' ? ['picked_up', 'not_delivered', 'cancel'] : d.status === 'out_for_delivery' ? ['delivered', 'not_delivered'] : [], updatedAt: now() };
};
const courierView = (c) => ({ id: c.id, name: c.name, phone: c.phone, note: c.note ?? null, active: c.active, documentsCheckedAt: now(), deliveriesLast7Days: 3, busyNow: [...deliveries.values()].some((d) => d.courier?.id === c.id && !['delivered', 'cancelled', 'not_delivered', 'returned_to_store'].includes(d.status)), createdAt: now() });
const lojistaStore = (res, ctx) => {
  const s = mineStore(ctx);
  if (!s || s.id !== ctx.params[0]) {
    problem(res, 404, 'NOT_FOUND', 'Não encontrado');
    return null;
  }
  return s;
};

route('POST', '/__test/seed-order', { public: true }, (req, res, ctx) => {
  const id = randomUUID();
  const o = { id, storeId: ctx.body.storeId, number: `WB-${++orderSeq}`.slice(0, 8), status: 'received', mode: 'delivery', createdAt: now(), deliveryId: null };
  orders.set(id, o);
  json(res, 201, { id, number: o.number });
});
route('POST', '/__test/seed-exchange', { public: true }, (req, res, ctx) => {
  const id = randomUUID();
  exchanges.set(id, { id, storeId: ctx.body.storeId, number: 'TR-1042', status: 'requested', createdAt: now() });
  json(res, 201, { id });
});
route('POST', '/__test/seed-delivery', { public: true }, (req, res, ctx) => {
  const s = stores.get(ctx.body.storeId);
  const d = { id: randomUUID(), kind: 'delivery', orderId: randomUUID(), orderNumber: `WB-${++orderSeq}`.slice(0, 8), storeId: s.id, storeName: s.name, status: 'ready_for_collection', readyAt: new Date(Date.now() - 12 * 60_000).toISOString(), courier: null, volumes: 2, note: null, etaToAt: ctx.body.etaToMin === undefined ? null : new Date(Date.now() + ctx.body.etaToMin * 60_000).toISOString() };
  deliveries.set(d.id, d);
  json(res, 201, { id: d.id, number: d.orderNumber });
});
route('POST', '/__test/seed-courier', { public: true }, (req, res, ctx) => {
  const c = { id: randomUUID(), name: ctx.body.name ?? 'João', phone: '5511912345678', active: true, note: null };
  couriers.set(c.id, c);
  json(res, 201, { id: c.id });
});
route('GET', '/v1/stores/:id/orders', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  if (!s) return;
  const scope = ctx.query.get('scope');
  const groups = { new: ['received'], in_progress: ['accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'], history: ['delivered', 'cancelled', 'refused'] };
  const list = [...orders.values()].filter((o) => o.storeId === s.id && (groups[scope] ?? groups.in_progress).includes(o.status));
  json(res, 200, { data: list.map(orderSummary), nextCursor: null });
});
route('GET', '/v1/stores/:id/orders/:oid', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const o = s && orders.get(ctx.params[1]);
  if (!o) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  json(res, 200, orderDetail(o));
});
route('POST', '/v1/stores/:id/orders/:oid/accept', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const o = s && orders.get(ctx.params[1]);
  if (!o) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (o.status === 'received') o.status = 'accepted';
  json(res, 200, orderDetail(o));
});
route('POST', '/v1/stores/:id/orders/:oid/status', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const o = s && orders.get(ctx.params[1]);
  if (!o) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const to = ctx.body.status;
  if (to === 'in_preparation') o.status = 'in_preparation';
  else if (to === 'ready_for_collection') {
    o.status = 'ready_for_collection';
    const d = { id: randomUUID(), kind: 'delivery', orderId: o.id, orderNumber: o.number, storeId: s.id, storeName: s.name, status: 'ready_for_collection', readyAt: now(), courier: null, volumes: ctx.body.volumes ?? 1, note: ctx.body.note ?? null };
    deliveries.set(d.id, d);
    o.deliveryId = d.id;
  } else return problem(res, 409, 'INVALID_TRANSITION', 'Transição inválida');
  json(res, 200, orderDetail(o));
});
route('GET', '/v1/stores/:id/exchanges', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  if (!s) return;
  const scope = ctx.query.get('scope');
  const list = [...exchanges.values()].filter((x) => x.storeId === s.id && (scope === 'pending' ? x.status === 'requested' : x.status !== 'requested'));
  json(res, 200, { data: list.map((x) => ({ id: x.id, number: x.number, orderId: randomUUID(), orderNumber: 'WB-4001', status: x.status, type: 'size_color', reasonCode: 'size', description: 'Ficou pequena.', method: 'pickup_at_home', resolution: 'replace', quantity: 1, item: { orderItemId: randomUUID(), name: 'Camiseta Básica', attributes: { Tam: 'M' } }, newVariant: { variantId: randomUUID(), attributes: { Tam: 'G' } }, fee: money(500), difference: money(0), totalDue: money(500), refund: money(0), answerDeadlineAt: new Date(Date.parse(x.createdAt) + 24 * 3_600_000).toISOString(), windowEndsAt: new Date(Date.parse(x.createdAt) + 7 * 86_400_000).toISOString(), createdAt: x.createdAt, updatedAt: x.createdAt })), nextCursor: null });
});
route('POST', '/v1/stores/:id/exchanges/:xid/accept', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const x = s && exchanges.get(ctx.params[1]);
  if (!x) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  x.status = 'approved';
  json(res, 200, { id: x.id, number: x.number, status: x.status });
});
// ---------------------------------------------------------------- Onda 6: avaliações, ajuda, conta, mediação
const reviews = new Map();
route('POST', '/__test/seed-review', { public: true }, (req, res, ctx) => {
  const id = randomUUID();
  reviews.set(id, { id, storeId: ctx.body.storeId, rating: ctx.body.rating ?? 4, comment: ctx.body.comment ?? 'Chegou bem embalado.', fit: null, reviewer: 'Joana L.', target: { type: 'store', id: ctx.body.storeId, name: 'Casa Bela' }, createdAt: now(), storeReply: null, storeRepliedAt: null });
  json(res, 201, { id });
});
route('GET', '/v1/stores/:id/reviews', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  if (!s) return;
  const replied = ctx.query.get('replied');
  const list = [...reviews.values()].filter((r) => r.storeId === s.id && (replied === null || (replied === 'true') === Boolean(r.storeReply)));
  json(res, 200, { data: list, nextCursor: null });
});
route('PUT', '/v1/stores/:id/reviews/:rid/reply', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const r = s && reviews.get(ctx.params[1]);
  if (!r) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  r.storeReply = String(ctx.body.text ?? '').slice(0, 500);
  r.storeRepliedAt = now();
  json(res, 200, { id: r.id, storeReply: r.storeReply, storeRepliedAt: r.storeRepliedAt });
});
route('DELETE', '/v1/stores/:id/reviews/:rid/reply', {}, (req, res, ctx) => {
  const s = lojistaStore(res, ctx);
  const r = s && reviews.get(ctx.params[1]);
  if (!r) return s && problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  r.storeReply = null;
  r.storeRepliedAt = null;
  empty(res);
});
route('GET', '/v1/help', { public: true }, (req, res, ctx) => ctx.query.get('audience') === 'customer' ? json(res, 200, { audience: 'customer', contacts: { whatsapp: '11999990000', email: 'ajuda@webag.local', hours: 'Seg a sex, 9h às 18h' }, privacy: { officerName: 'Encarregado de dados', officerEmail: 'dados@webag.local' }, groups: [{ id: 'payment', label: 'Pagamento', items: [{ id: randomUUID(), question: 'Posso pagar com PIX?', answer: 'Sim. O código aparece na tela do pedido.\n\nO pagamento é confirmado pelo servidor.' }, { id: randomUUID(), question: 'Pergunta com HTML', answer: '<img src=x onerror=alert(1)> texto' }] }, { id: 'exchange', label: 'Trocas', items: [] }] }) : json(res, 200, { audience: 'merchant', contacts: { whatsapp: '11999990000', email: 'ajuda@webag.local', hours: 'Seg a sex, 9h às 18h' }, privacy: { officerName: 'Encarregado de dados', officerEmail: 'dados@webag.local' }, groups: [{ id: 'orders', label: 'Pedidos', items: [{ id: randomUUID(), question: 'Como aceito um pedido?', answer: 'Toque em Aceitar no alerta. Você tem 10 minutos.' }] }] }));
const deletions = new Map();
route('GET', '/v1/me/deletion', {}, (req, res) => json(res, 200, { canDelete: true, blockers: [], hasPassword: true, ownsStore: true, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72 }));
route('POST', '/v1/me/deletion', {}, (req, res, ctx) => {
  const user = ctx.user;
  if (!user || user.password !== ctx.body.password) return problem(res, 403, 'INVALID_PASSWORD', 'Senha incorreta');
  deletions.set(user.id, true);
  json(res, 200, { status: 'pending', effectiveAt: new Date(Date.now() + 72 * 3_600_000).toISOString(), cancelableUntil: new Date(Date.now() + 72 * 3_600_000).toISOString() });
});
const exportsByUser = new Map();
route('GET', '/v1/me/data-exports', {}, (req, res, ctx) => json(res, 200, { latest: exportsByUser.get(ctx.user.id) ?? null, nextRequestAt: exportsByUser.has(ctx.user.id) ? new Date(Date.now() + 86_400_000).toISOString() : null }));
route('POST', '/v1/me/data-exports', {}, (req, res, ctx) => {
  if (ctx.user.password !== ctx.body.password) return problem(res, 403, 'INVALID_PASSWORD', 'Senha incorreta');
  const status = { id: randomUUID(), status: 'queued', requestedAt: now(), readyAt: null, expiresAt: null, sizeBytes: null };
  exportsByUser.set(ctx.user.id, status);
  json(res, 202, status);
});
const mediations = new Map();
route('POST', '/__test/seed-mediation', { public: true }, (req, res, ctx) => {
  const id = randomUUID();
  mediations.set(id, { id, number: `TR-${2000 + mediations.size}`, orderId: randomUUID(), storeId: ctx.body.storeId ?? randomUUID(), type: 'defect', resolution: 'refund', origin: 'store_refusal', storeReason: 'Mau uso do produto', customerText: 'Veio com defeito de fábrica.', photoCount: 2, startedAt: now(), deadlineAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), overdue: false, refusalNotAllowedByLaw: true });
  json(res, 201, { id, number: mediations.get(id).number });
});
route('GET', '/v1/admin/exchanges/mediations', { perm: 'exchanges:mediate' }, (req, res) => json(res, 200, { data: [...mediations.values()], nextCursor: null }));
route('POST', '/v1/admin/exchanges/mediations/:id/decision', { perm: 'exchanges:mediate' }, (req, res, ctx) => {
  const m = mediations.get(ctx.params[0]);
  if (!m) return problem(res, 409, 'EXCHANGE_NOT_IN_MEDIATION', 'Já decidida');
  if (!['customer', 'store'].includes(ctx.body.decision) || String(ctx.body.reason ?? '').trim().length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  record(req, ctx, { action: 'exchange.mediation_decided', targetType: 'exchange', targetId: m.id, reason: ctx.body.reason, after: { decision: ctx.body.decision } });
  mediations.delete(m.id);
  json(res, 200, { status: 'decided' });
});
// Exclusão sem o app (WB-214, SEC-166, SEC-168/176). Contas de teste: `excluir@` (normal), `cuidado@` (conta sob ataque: a senha certa
// exige o código do e-mail), `bloqueado@` (pedido em andamento). O código `delete_web` fake é sempre 482913.
const DELETE_CODE = '482913';
for (const [key, email, extra] of [
  ['del-normal', 'excluir@webag.local', {}],
  ['del-stepup', 'cuidado@webag.local', { stepUp: true }],
  ['del-blocked', 'bloqueado@webag.local', { blocked: true }],
]) users.set(key, { id: randomUUID(), email, name: 'Cliente', password: 'Excluir-Dev-2026', profile: null, active: true, emailVerified: true, ...extra });
const deleteTickets = new Map();
const deletionLog = [];
const findByEmail = (email) => [...users.values()].find((u) => u.email === String(email).toLowerCase());
const deletableUser = (email) => {
  const user = findByEmail(email);
  return user && !user.profile && !deletions.get(user.id) ? user : null;
};
const ticketFor = (user) => {
  const deleteTicket = randomBytes(32).toString('base64url');
  deleteTickets.set(deleteTicket, { userId: user.id, until: Date.now() + 600_000 });
  return { deleteTicket, expiresIn: 600 };
};
route('POST', '/v1/auth/account-deletion/start', { public: true }, (req, res, ctx) => {
  const email = String(ctx.body.email).toLowerCase();
  if (email.startsWith('limite@')) return problem(res, 429, 'TOO_MANY_REQUESTS', 'Muitas tentativas', 'Muitas tentativas.', { headers: { 'retry-after': '3600' } });
  const user = deletableUser(email);
  if (ctx.body.password === undefined) {
    deletionLog.push({ via: 'A-send', exists: Boolean(user) });
    return json(res, 200, { sent: true }); // igual exista ou não a conta
  }
  if (!user || user.password !== ctx.body.password) return problem(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');
  if (user.stepUp) return problem(res, 403, 'LOGIN_CODE_REQUIRED', 'Código necessário', 'Para sua segurança, confirme a exclusão pelo código enviado ao seu e-mail.');
  json(res, 200, ticketFor(user));
});
route('POST', '/v1/auth/account-deletion/verify-code', { public: true }, (req, res, ctx) => {
  const user = deletableUser(ctx.body.email);
  if (!user || ctx.body.code !== DELETE_CODE) return problem(res, 400, 'CODE_INVALID', 'Código incorreto', 'Confira o código ou peça um novo.');
  json(res, 200, ticketFor(user));
});
const liveTicket = (raw) => {
  const entry = deleteTickets.get(raw);
  return entry && entry.until > Date.now() ? entry : null;
};
route('POST', '/v1/auth/account-deletion/review', { public: true }, (req, res, ctx) => {
  const entry = liveTicket(ctx.body.deleteTicket);
  if (!entry) return problem(res, 410, 'DELETE_TICKET_INVALID', 'Pedido vencido ou já usado', 'Comece de novo.');
  const user = [...users.values()].find((u) => u.id === entry.userId);
  const blockers = user.blocked ? [{ kind: 'order', id: randomUUID(), number: '4821', status: 'saiu para entrega' }] : [];
  json(res, 200, { canDelete: blockers.length === 0, blockers, hasPassword: true, ownsStore: false, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72, internal: 'nao-deve-sair' });
});
route('POST', '/v1/auth/account-deletion/finish', { public: true }, (req, res, ctx) => {
  const entry = liveTicket(ctx.body.deleteTicket);
  if (!entry) return problem(res, 410, 'DELETE_TICKET_INVALID', 'Pedido vencido ou já usado', 'Comece de novo.');
  const user = [...users.values()].find((u) => u.id === entry.userId);
  if (user.blocked) return problem(res, 409, 'DELETION_BLOCKED', 'Conclua antes de excluir', 'Você tem pedidos ou trocas em andamento.', { extra: { blockers: [{ kind: 'order', id: randomUUID(), number: '4821', status: 'saiu para entrega' }] } });
  deleteTickets.delete(ctx.body.deleteTicket);
  deletions.set(user.id, true);
  deletionLog.push({ via: 'web', email: user.email });
  const until = new Date(Date.now() + 72 * 3_600_000).toISOString();
  json(res, 200, { status: 'pending', effectiveAt: until, cancelableUntil: until });
});
route('POST', '/__test/account-deletions', { public: true }, (req, res) => json(res, 200, { data: deletionLog, closed: [...deletions.keys()].length }));
route('POST', '/v1/auth/account-deletion/cancel', { public: true }, (req, res, ctx) => {
  const user = findByEmail(ctx.body.email);
  if (!user || user.password !== ctx.body.password || !deletions.get(user.id)) return problem(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
  if (user.stepUp) {
    if (!ctx.body.code) return problem(res, 403, 'LOGIN_CODE_REQUIRED', 'Código necessário', 'Para sua segurança, confirme com o código enviado ao seu e-mail.');
    if (ctx.body.code !== DELETE_CODE) return problem(res, 400, 'CODE_INVALID', 'Código incorreto', 'Confira o código.');
  }
  deletions.delete(user.id);
  empty(res);
});
route('GET', '/v1/admin/logistics/deliveries', { perm: 'logistics:read' }, (req, res, ctx) => {
  const done = ctx.query.get('tab') === 'done';
  const finished = ['delivered', 'cancelled', 'not_delivered', 'returned_to_store'];
  const list = [...deliveries.values()].filter((d) => finished.includes(d.status) === done);
  json(res, 200, { data: list.map(deliveryView), nextCursor: null });
});
route('GET', '/v1/admin/logistics/deliveries/:id', { perm: 'logistics:read' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (!d) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const canDispatch = (PERMS['logistics:write'] ?? []).includes(ctx.user?.profile);
  json(res, 200, { ...deliveryView(d), ...(canDispatch ? { contact: { pickupAddress: 'Rua das Flores, 10 - Centro', storePhone: '1140028922', dropoffAddress: 'Rua Azul, 55 - Jardim Alvorada', customerFirstName: 'Carla', customerPhone: '11987654321' } } : {}), timeline: [] });
});
route('POST', '/v1/admin/logistics/deliveries/:id/contact-reveal', { perm: 'logistics:contact' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (!d) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const reason = String(ctx.body.reason ?? '');
  if (reason.trim().length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  record(req, ctx, { action: 'delivery.contact_revealed', targetType: 'delivery', targetId: d.id, reason });
  json(res, 200, { contact: { pickupAddress: 'Rua das Flores, 10 - Centro', storePhone: '1140028922', dropoffAddress: 'Rua Azul, 55 - Jardim Alvorada', customerFirstName: 'Carla', customerPhone: '11987654321' } });
});
route('GET', '/v1/admin/logistics/couriers', { perm: 'logistics:read' }, (req, res, ctx) => {
  const onlyActive = ctx.query.get('active') === 'true';
  json(res, 200, { data: [...couriers.values()].filter((c) => !onlyActive || c.active).map(courierView), nextCursor: null });
});
route('POST', '/v1/admin/logistics/couriers', { perm: 'logistics:write' }, (req, res, ctx) => {
  const c = { id: randomUUID(), name: ctx.body.name, phone: ctx.body.phone, note: ctx.body.note ?? null, active: true };
  couriers.set(c.id, c);
  json(res, 201, courierView(c));
});
route('POST', '/v1/admin/logistics/deliveries/:id/assign', { perm: 'logistics:write' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (!d) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (d.status !== 'ready_for_collection') return problem(res, 409, 'DELIVERY_ALREADY_ASSIGNED', 'Já atribuída');
  const c = couriers.get(ctx.body.courierId);
  if (!c) return problem(res, 404, 'NOT_FOUND', 'Motoboy não encontrado');
  d.status = 'awaiting_courier';
  d.courier = { id: c.id, name: c.name };
  const o = orders.get(d.orderId);
  json(res, 200, { ...deliveryView(d), contact: {}, timeline: [], _order: o?.number });
});
route('POST', '/v1/admin/logistics/deliveries/assign-batch', { perm: 'logistics:write' }, (req, res, ctx) => {
  const ids = [...new Set(ctx.body.deliveryIds ?? [])];
  if (ids.length < 2 || ids.length > 10) return problem(res, 422, 'INVALID_BATCH', 'Lote inválido', 'Escolha de 2 a 4 corridas.');
  const c = couriers.get(ctx.body.courierId);
  if (!c) return problem(res, 404, 'NOT_FOUND', 'Motoboy não encontrado');
  const assigned = [];
  const failed = [];
  for (const id of ids) {
    const d = deliveries.get(id);
    if (!d || d.status !== 'ready_for_collection') {
      failed.push({ deliveryId: id, code: 'DELIVERY_ALREADY_ASSIGNED' });
      continue;
    }
    d.status = 'awaiting_courier';
    d.courier = { id: c.id, name: c.name };
    assigned.push({ ...deliveryView(d), contact: {}, timeline: [] });
  }
  json(res, 200, { assigned, failed });
});
route('GET', '/v1/admin/logistics/deliveries/:id/whatsapp', { perm: 'logistics:write' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (!d || !d.courier) return problem(res, 409, 'INVALID_DELIVERY_TRANSITION', 'Sem motoboy');
  const message = `*Webag · Entrega #${d.orderNumber}*\nBuscar na loja: ${d.storeName}\nVolumes: ${d.volumes}`;
  json(res, 200, { courierPhone: '5511912345678', message, link: `https://wa.me/5511912345678?text=${encodeURIComponent(message)}`, courierActiveDeliveries: 1 });
});
route('POST', '/v1/admin/logistics/deliveries/:id/whatsapp-sent', { perm: 'logistics:write' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (d) d.whatsappSentAt = now();
  empty(res);
});
route('POST', '/v1/admin/logistics/deliveries/:id/status', { perm: 'logistics:write' }, (req, res, ctx) => {
  const d = deliveries.get(ctx.params[0]);
  if (!d) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  const next = { confirm: 'courier_en_route', picked_up: 'out_for_delivery', delivered: 'delivered' }[ctx.body.action];
  if (!next) return problem(res, 409, 'INVALID_DELIVERY_TRANSITION', 'Transição inválida');
  d.status = next;
  json(res, 200, { ...deliveryView(d), contact: {}, timeline: [] });
});

// Cartão pela página segura (B.2): intenções de uso único, provedor "fake" (sem MP.js).
const cardIntents = new Map();
route('GET', '/__test/card-intent/:name', { public: true }, (req, res, ctx) => {
  const token = `intent_${ctx.params[0]}_aaaaaaaaaaaaaaaaaaaa`;
  cardIntents.set(token, { amount: 5990, used: false });
  json(res, 200, { token });
});
route('GET', '/v1/card-intents/:token', { public: true }, (req, res, ctx) => {
  const intent = cardIntents.get(ctx.params[0]);
  if (!intent || intent.used) return problem(res, 410, 'CARD_INTENT_INVALID', 'Link inválido ou já usado');
  json(res, 200, { amount: { amount: intent.amount, currency: 'BRL' }, provider: 'fake', publicKey: null, installmentsMax: 3, expiresAt: new Date(Date.now() + 900_000).toISOString() });
});
route('POST', '/v1/card-intents/:token/pay', { public: true }, (req, res, ctx) => {
  // WB-121: antes de consumir a intenção (o link continua valendo)
  if (maintenanceState.enabled) return problem(res, 503, 'MAINTENANCE', 'Voltamos já', maintenanceState.message ?? 'Estamos em manutenção rápida. Voltamos já; seus pedidos em andamento continuam normalmente.', { headers: { 'retry-after': '120' } });
  const intent = cardIntents.get(ctx.params[0]);
  if (!intent || intent.used) return problem(res, 410, 'CARD_INTENT_INVALID', 'Link inválido ou já usado');
  intent.used = true;
  const card = ctx.body.card?.token;
  if (card === 'fake_tok_insufficient') return problem(res, 422, 'PAYMENT_DECLINED', 'Pagamento recusado', 'Limite insuficiente.');
  json(res, 200, { orderId: '11111111-1111-4111-8111-111111111111', status: 'awaiting_payment', payment: {}, threeDsUrl: null });
});

route('GET', '/__test/state', { public: true }, (req, res) => json(res, 200, { superSecret: SUPER_SECRET, audit: audit.length }));

// ---------------------------------------------------------------- servidor
// ---------------------------------------------------------------- DEC-073: alertas (B3), usuários (B4), pedidos (B5), manutenção (WB-121) e e-mail do lojista (B2)
// Reproduz o contrato de `getAdmin*`/`listAdmin*` do openapi.yaml: RBAC por tipo de alerta, dado mascarado, `allowedActions` por perfil.
Object.assign(PERMS, {
  'alerts:read': ['super_admin', 'operations', 'finance', 'support'],
  'alerts:resolve': ['super_admin', 'operations', 'finance'],
  'users:read': ['super_admin', 'operations', 'support'],
  'users:block': ['super_admin', 'operations'],
  'orders:read': ['super_admin', 'operations', 'finance', 'support'],
  'orders:refund': ['super_admin', 'finance'],
  'maintenance:read': ['super_admin', 'operations', 'finance', 'support'],
  'maintenance:write': ['super_admin'],
});
const ALERT_KINDS = [
  { kind: 'refund_exhausted', label: 'Estorno recusado pelo provedor', area: 'payments', severity: 'critical', hint: 'Tente o estorno de novo ou cubra o valor pela Webag.', audience: ['super_admin', 'finance'] },
  { kind: 'delivery_late', label: 'Entrega atrasada', area: 'logistics', severity: 'warning', hint: 'Atribua um motoboy ou fale com a loja.', audience: ['super_admin', 'operations', 'finance', 'support'] },
  { kind: 'order_stuck', label: 'Pedido parado sem aceite', area: 'orders', severity: 'warning', hint: 'Ligue para a loja ou cancele o pedido.', audience: ['super_admin', 'operations', 'support'] },
  { kind: 'dsr_due', label: 'Pedido de titular perto do prazo', area: 'privacy', severity: 'critical', hint: 'Responda antes do prazo legal.', audience: ['super_admin'] },
];
const opsAlertsFor = (profile) => (profile ? opsAlerts.filter((a) => ALERT_KINDS.find((k) => k.kind === a.kind)?.audience.includes(profile)) : []);
const opsApiAlert = (a) => {
  const k = ALERT_KINDS.find((x) => x.kind === a.kind);
  return { id: a.id, kind: a.kind, label: k.label, area: k.area, severity: k.severity, hint: k.hint, status: a.status, attemptId: null, details: a.details, links: a.links, createdAt: a.createdAt, resolvedAt: a.resolvedAt ?? null, resolvedByName: a.resolvedByName ?? null, resolutionNote: a.resolutionNote ?? null };
};
let opsAlerts = [];
let opsUsers = new Map();
let adminOrders = new Map();
let maintenanceState = { enabled: false, message: null, expectedBackAt: null, updatedAt: null, updatedByName: null };
const storeNotifications = new Map();
const OPS_STORE = '11111111-1111-4111-8111-111111111111';
const opsHoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

function seedOps() {
  opsAlerts = [
    { id: 'a0000000-0000-4000-8000-000000000001', kind: 'refund_exhausted', status: 'open', details: { amountCents: 4590, failures: 5 }, links: { orderId: 'b0000000-0000-4000-8000-000000000001', storeId: null, deliveryId: null, exchangeId: null }, createdAt: opsHoursAgo(50) },
    { id: 'a0000000-0000-4000-8000-000000000002', kind: 'order_stuck', status: 'open', details: { minutesWaiting: 22 }, links: { orderId: 'b0000000-0000-4000-8000-000000000002', storeId: OPS_STORE, deliveryId: null, exchangeId: null }, createdAt: opsHoursAgo(3) },
    { id: 'a0000000-0000-4000-8000-000000000003', kind: 'delivery_late', status: 'open', details: { lateMinutes: 18 }, links: { orderId: null, storeId: null, deliveryId: 'd0000000-0000-4000-8000-000000000001', exchangeId: null }, createdAt: opsHoursAgo(1) },
    { id: 'a0000000-0000-4000-8000-000000000004', kind: 'dsr_due', status: 'open', details: { requestId: 'r1', dueInDays: 3 }, links: { orderId: null, storeId: null, deliveryId: null, exchangeId: null }, createdAt: opsHoursAgo(10) },
    { id: 'a0000000-0000-4000-8000-000000000005', kind: 'order_stuck', status: 'resolved', details: { minutesWaiting: 40 }, links: { orderId: null, storeId: null, deliveryId: null, exchangeId: null }, createdAt: opsHoursAgo(80), resolvedAt: opsHoursAgo(70), resolvedByName: 'Caio Lima', resolutionNote: 'Loja aceitou depois do contato.' },
  ];
  opsUsers = new Map([
    ['c0000000-0000-4000-8000-000000000001', { id: 'c0000000-0000-4000-8000-000000000001', name: 'Maria L.', emailMasked: 'm***@gmail.com', phoneMasked: '(11) *****-1234', roles: ['customer', 'merchant'], status: 'active', createdAt: '2026-10-01T12:00:00Z', lastLoginAt: opsHoursAgo(5), emailVerified: true, stores: [{ id: OPS_STORE, name: 'Mercadinho Boa Compra', status: 'approved', role: 'owner' }], history: [] }],
    ['c0000000-0000-4000-8000-000000000002', { id: 'c0000000-0000-4000-8000-000000000002', name: 'João P.', emailMasked: 'j***@outlook.com', phoneMasked: null, roles: ['customer'], status: 'blocked', createdAt: '2026-09-12T12:00:00Z', lastLoginAt: null, emailVerified: true, stores: [], history: [{ action: 'blocked', reason: 'Três pedidos com chargeback.', at: opsHoursAgo(120), byName: 'Caio Lima', suspendedStoreIds: [] }] }],
    ['c0000000-0000-4000-8000-000000000003', { id: 'c0000000-0000-4000-8000-000000000003', name: 'Ana C.', emailMasked: 'a***@gmail.com', phoneMasked: '(11) *****-9876', roles: ['customer'], status: 'active', createdAt: '2026-11-02T12:00:00Z', lastLoginAt: opsHoursAgo(30), emailVerified: false, stores: [], history: [] }],
  ]);
  const base = (id, number, status, over = {}) => ({ id, number, status, mode: 'delivery', paymentMethod: 'pix', createdAt: opsHoursAgo(4), paidAt: opsHoursAgo(4), store: { id: OPS_STORE, name: 'Mercadinho Boa Compra', city: 'Francisco Morato' }, customer: { id: 'c0000000-0000-4000-8000-000000000001', name: 'Maria L.', emailMasked: 'm***@gmail.com', phoneMasked: '(11) *****-1234' }, totalCents: 5990, refundedCents: 0, disputedAt: null, timeline: [{ status: 'received', from: null, at: opsHoursAgo(4), actor: 'system', actorName: null, reason: null }], ...over });
  adminOrders = new Map([
    ['b0000000-0000-4000-8000-000000000001', base('b0000000-0000-4000-8000-000000000001', 'WB-1A01', 'delivered', { totalCents: 4590, createdAt: opsHoursAgo(60), paidAt: opsHoursAgo(60) })],
    ['b0000000-0000-4000-8000-000000000002', base('b0000000-0000-4000-8000-000000000002', 'WB-1A02', 'received', { createdAt: opsHoursAgo(1), paidAt: opsHoursAgo(1) })],
    ['b0000000-0000-4000-8000-000000000003', base('b0000000-0000-4000-8000-000000000003', 'WB-1A03', 'awaiting_payment', { paymentMethod: 'card', totalCents: 12000, paidAt: null, createdAt: opsHoursAgo(2) })],
    ['b0000000-0000-4000-8000-000000000004', base('b0000000-0000-4000-8000-000000000004', 'WB-1A04', 'received', { totalCents: 60000, mode: 'pickup' })],
  ]);
  maintenanceState = { enabled: false, message: null, expectedBackAt: null, updatedAt: null, updatedByName: null };
  storeNotifications.clear();
}
seedOps();
addAdmin({ email: 'financeiro@webag.local', name: 'Fabi Rocha', password: 'Webag-Admin-Dev-2026', profile: 'finance', secret: SUPER_SECRET });
route('POST', '/__test/reset-ops', { public: true }, (req, res) => {
  seedOps();
  json(res, 200, { ok: true });
});

const opsPageOf = (rows, q, limit) => {
  const start = Number(q.get('cursor') ?? 0);
  const data = rows.slice(start, start + limit);
  return { data, nextCursor: start + limit < rows.length ? String(start + limit) : null };
};

route('GET', '/v1/admin/overview/pending', { perm: 'alerts:read' }, (req, res, ctx) => {
  const open = opsAlertsFor(ctx.user.profile).filter((a) => a.status === 'open');
  json(res, 200, { alerts: { open: open.length, critical: open.filter((a) => ALERT_KINDS.find((k) => k.kind === a.kind).severity === 'critical').length }, stores: null, disputes: null, refunds: null, dataRequests: null });
});
route('GET', '/v1/admin/alerts', { perm: 'alerts:read' }, (req, res, ctx) => {
  const q = ctx.query;
  const status = q.get('status') ?? 'open';
  let rows = opsAlertsFor(ctx.user.profile).filter((a) => status === 'all' || a.status === status);
  const kind = ALERT_KINDS.find((k) => k.kind === q.get('kind'));
  if (q.get('kind')) rows = rows.filter((a) => a.kind === q.get('kind'));
  if (q.get('severity')) rows = rows.filter((a) => ALERT_KINDS.find((k) => k.kind === a.kind).severity === q.get('severity'));
  if (q.get('area')) rows = rows.filter((a) => ALERT_KINDS.find((k) => k.kind === a.kind).area === q.get('area'));
  void kind;
  rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  json(res, 200, opsPageOf(rows.map(opsApiAlert), q, Number(q.get('limit') ?? 20)));
});
route('GET', '/v1/admin/alerts/summary', { perm: 'alerts:read' }, (req, res, ctx) => {
  const open = opsAlertsFor(ctx.user.profile).filter((a) => a.status === 'open');
  const sev = (s) => open.filter((a) => ALERT_KINDS.find((k) => k.kind === a.kind).severity === s).length;
  const oldest = open.map((a) => a.createdAt).sort()[0] ?? null;
  json(res, 200, { open: open.length, bySeverity: { critical: sev('critical'), warning: sev('warning'), info: sev('info') }, byArea: {}, byKind: [], oldestOpenAt: oldest });
});
route('GET', '/v1/admin/alerts/kinds', { perm: 'alerts:read' }, (req, res, ctx) => json(res, 200, { data: ALERT_KINDS.filter((k) => k.audience.includes(ctx.user.profile)).map((k) => ({ kind: k.kind, label: k.label, area: k.area, severity: k.severity, hint: k.hint })), nextCursor: null }));
route('GET', '/v1/admin/alerts/:id', { perm: 'alerts:read' }, (req, res, ctx) => {
  const a = opsAlertsFor(ctx.user.profile).find((x) => x.id === ctx.params[0]);
  if (!a) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  json(res, 200, opsApiAlert(a));
});
route('POST', '/v1/admin/alerts/:id/resolve', { perm: 'alerts:resolve' }, (req, res, ctx) => {
  const a = opsAlertsFor(ctx.user.profile).find((x) => x.id === ctx.params[0]);
  if (!a) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (a.status === 'resolved') return problem(res, 409, 'ALERT_ALREADY_RESOLVED', 'Alerta já encerrado');
  const note = String(ctx.body.note ?? '').trim();
  if (note.length < 5 || note.length > 300) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  Object.assign(a, { status: 'resolved', resolvedAt: now(), resolvedByName: ctx.user.name, resolutionNote: note });
  record(req, ctx, { action: 'alert.resolve', targetType: 'alert', targetId: a.id, reason: note });
  json(res, 200, opsApiAlert(a));
});

// usuários
const opsUserRow = (u) => ({ id: u.id, name: u.name, emailMasked: u.emailMasked, phoneMasked: u.phoneMasked, roles: u.roles, status: u.status, storeCount: u.stores.length, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });
const opsUserDetail = (u, profile) => ({ ...opsUserRow(u), emailVerified: u.emailVerified, stores: u.stores, recentOrders: [...adminOrders.values()].filter((o) => o.customer.id === u.id).slice(0, 10).map((o) => ({ id: o.id, number: o.number, status: o.status, mode: o.mode, createdAt: o.createdAt, total: money(o.totalCents), storeName: o.store.name })), blockHistory: u.history, allowedActions: PERMS['users:block'].includes(profile) ? (u.status === 'active' ? ['block'] : u.status === 'blocked' ? ['unblock'] : []) : [] });
route('GET', '/v1/admin/users', { perm: 'users:read' }, (req, res, ctx) => {
  const q = ctx.query;
  const term = (q.get('q') ?? '').trim().toLowerCase();
  let rows = [...opsUsers.values()];
  // SEC-181: nome por trecho (3+); e-mail e celular só inteiros (aqui: sem casar com o mascarado); ID exato.
  if (term) rows = rows.filter((u) => u.id === term || (term.length >= 3 && u.name.toLowerCase().includes(term)));
  if (q.get('role')) rows = rows.filter((u) => u.roles.includes(q.get('role')));
  if (q.get('status')) rows = rows.filter((u) => u.status === q.get('status'));
  json(res, 200, opsPageOf(rows.map(opsUserRow), q, Number(q.get('limit') ?? 20)));
});
route('GET', '/v1/admin/users/:id', { perm: 'users:read' }, (req, res, ctx) => {
  const u = opsUsers.get(ctx.params[0]);
  if (!u) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  json(res, 200, opsUserDetail(u, ctx.user.profile));
});
route('POST', '/v1/admin/users/:id/block', { perm: 'users:block' }, (req, res, ctx) => {
  const u = opsUsers.get(ctx.params[0]);
  if (!u) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (u.status === 'blocked') return problem(res, 409, 'USER_ALREADY_BLOCKED', 'Usuário já está bloqueado');
  if (String(ctx.body.reason ?? '').trim().length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  u.status = 'blocked';
  const suspended = u.stores.filter((s) => s.role === 'owner' && s.status === 'approved');
  for (const s of suspended) s.status = 'suspended';
  u.history.unshift({ action: 'blocked', reason: ctx.body.reason, at: now(), byName: ctx.user.name, suspendedStoreIds: suspended.map((s) => s.id) });
  record(req, ctx, { action: 'user.block', targetType: 'user', targetId: u.id, reason: ctx.body.reason });
  json(res, 200, { ...opsUserDetail(u, ctx.user.profile), suspendedStoreIds: suspended.map((s) => s.id), failedStoreIds: [] });
});
route('POST', '/v1/admin/users/:id/unblock', { perm: 'users:block' }, (req, res, ctx) => {
  const u = opsUsers.get(ctx.params[0]);
  if (!u) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (u.status !== 'blocked') return problem(res, 409, 'USER_NOT_BLOCKED', 'Usuário não está bloqueado');
  if (String(ctx.body.reason ?? '').trim().length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  u.status = 'active';
  u.history.unshift({ action: 'unblocked', reason: ctx.body.reason, at: now(), byName: ctx.user.name, suspendedStoreIds: [] });
  record(req, ctx, { action: 'user.unblock', targetType: 'user', targetId: u.id, reason: ctx.body.reason });
  json(res, 200, opsUserDetail(u, ctx.user.profile));
});

// pedidos
const OPS_TERMINAL = ['delivered', 'cancelled', 'refused', 'expired'];
const opsOrderRow = (o) => ({ id: o.id, number: o.number, status: o.status, mode: o.mode, paymentMethod: o.paymentMethod, createdAt: o.createdAt, paidAt: o.paidAt, store: o.store, customer: { id: o.customer.id, name: o.customer.name }, total: money(o.totalCents) });
const opsOrderDetail = (o, profile) => {
  const paid = o.paidAt ? o.totalCents : 0;
  const remaining = Math.max(0, paid - o.refundedCents);
  const canAct = PERMS['orders:refund'].includes(profile);
  const showSplit = profile === 'super_admin' || profile === 'finance';
  return {
    ...opsOrderRow(o), acceptedAt: null, deliveredAt: o.status === 'delivered' ? o.createdAt : null, cancelledAt: o.cancelledAt ?? null, cancelledBy: o.cancelledBy ?? null, cancelReason: o.cancelReason ?? null, disputedAt: o.disputedAt, notReceivedAt: null, couponCode: null,
    customer: o.customer, delivery: o.mode === 'delivery' ? { neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', logistics: null } : null,
    items: [{ name: 'Arroz 5 kg', attributes: {}, quantity: 2, unitPrice: money(2500), lineTotal: money(5000) }],
    values: { subtotal: money(5000), delivery: money(600), serviceFee: money(390), storeDiscount: money(0), platformDiscount: money(0), total: money(o.totalCents), commission: showSplit ? money(750) : null, applicationFee: showSplit ? money(1140) : null, merchantNetBeforeProviderFee: showSplit ? money(4250) : null },
    payment: o.paidAt ? { method: o.paymentMethod, status: 'approved', installments: 1, declineReason: null, attempts: [{ id: 'p1', status: 'approved', method: o.paymentMethod, amount: money(o.totalCents), createdAt: o.paidAt }] } : null,
    refunds: { paid: money(paid), refunded: money(o.refundedCents), remaining: money(remaining), items: o.refundItems ?? [] },
    timeline: o.timeline, exchanges: [], review: null,
    allowedActions: [...(canAct && !OPS_TERMINAL.includes(o.status) ? ['cancel'] : []), ...(canAct && paid > 0 && !o.disputedAt && remaining > 0 ? ['refund'] : [])],
    refundLimit: { superAdminOnlyAboveCents: 50000, profileCapCents: profile === 'super_admin' ? null : 50000 },
  };
};
route('GET', '/v1/admin/orders', { perm: 'orders:read' }, (req, res, ctx) => {
  const q = ctx.query;
  let rows = [...adminOrders.values()];
  const term = (q.get('q') ?? '').trim().toLowerCase();
  if (term) rows = rows.filter((o) => o.number.toLowerCase() === term || o.id === term);
  if (q.get('status')) rows = rows.filter((o) => q.get('status').split(',').includes(o.status));
  if (q.get('mode')) rows = rows.filter((o) => o.mode === q.get('mode'));
  if (q.get('paymentMethod')) rows = rows.filter((o) => o.paymentMethod === q.get('paymentMethod'));
  if (q.get('userId')) rows = rows.filter((o) => o.customer.id === q.get('userId'));
  if (q.get('city')) rows = rows.filter((o) => (o.store.city ?? '').toLowerCase().includes(q.get('city').toLowerCase()));
  rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  json(res, 200, opsPageOf(rows.map(opsOrderRow), q, Number(q.get('limit') ?? 50)));
});
route('GET', '/v1/admin/orders/:id', { perm: 'orders:read' }, (req, res, ctx) => {
  const o = adminOrders.get(ctx.params[0]);
  if (!o) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  json(res, 200, opsOrderDetail(o, ctx.user.profile));
});
route('POST', '/v1/admin/orders/:id/cancel', { perm: 'orders:refund', reauth: true }, (req, res, ctx) => {
  const o = adminOrders.get(ctx.params[0]);
  if (!o) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (OPS_TERMINAL.includes(o.status)) return problem(res, 409, 'ORDER_NOT_CANCELLABLE', 'Pedido não pode ser cancelado');
  const reason = String(ctx.body.reason ?? '').trim();
  if (reason.length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  const paid = o.paidAt ? o.totalCents : 0;
  const remaining = paid - o.refundedCents;
  const refund = ctx.body.refund !== false;
  if (refund && remaining > 50000 && ctx.user.profile !== 'super_admin') return problem(res, 403, 'SUPER_ADMIN_REQUIRED', 'Só o super admin');
  if (refund) o.refundedCents += remaining;
  Object.assign(o, { status: 'cancelled', cancelledAt: now(), cancelledBy: 'admin', cancelReason: reason });
  o.timeline.push({ status: 'cancelled', from: 'received', at: now(), actor: 'admin', actorName: ctx.user.name, reason });
  record(req, ctx, { action: 'order.cancel', targetType: 'order', targetId: o.id, reason });
  json(res, 200, { status: 'cancelled', refunded: money(refund ? remaining : 0), remaining: money(paid - o.refundedCents) });
});
route('POST', '/v1/admin/orders/:id/refunds', { perm: 'orders:refund', reauth: true }, (req, res, ctx) => {
  const o = adminOrders.get(ctx.params[0]);
  if (!o) return problem(res, 404, 'NOT_FOUND', 'Não encontrado');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(req.headers['idempotency-key'] ?? ''))) return problem(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Chave obrigatória');
  const amount = Number(ctx.body.amountCents);
  if (!Number.isInteger(amount) || amount < 1 || String(ctx.body.reason ?? '').trim().length < 10) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  const remaining = (o.paidAt ? o.totalCents : 0) - o.refundedCents;
  if (amount > remaining) return problem(res, 422, 'REFUND_EXCEEDS_PAID', 'Valor acima do pago');
  if (amount > 50000 && ctx.user.profile !== 'super_admin') return problem(res, 403, 'SUPER_ADMIN_REQUIRED', 'Só o super admin');
  o.refundedCents += amount;
  o.refundItems = [...(o.refundItems ?? []), { id: randomUUID(), amount: money(amount), status: 'done', reason: ctx.body.reason, at: now() }];
  record(req, ctx, { action: 'payment.refund', targetType: 'order', targetId: o.id, reason: ctx.body.reason, after: { amountCents: amount } });
  json(res, 200, { status: 'done', refunded: money(o.refundedCents), remaining: money(remaining - amount) });
});

// manutenção
const DEFAULT_MAINTENANCE = 'Estamos em manutenção rápida. Voltamos já; seus pedidos em andamento continuam normalmente.';
const publicMaintenance = () => ({ active: maintenanceState.enabled, message: maintenanceState.enabled ? (maintenanceState.message ?? DEFAULT_MAINTENANCE) : null, expectedBackAt: maintenanceState.enabled ? maintenanceState.expectedBackAt : null });
route('GET', '/v1/config/maintenance', { public: true }, (req, res) => json(res, 200, publicMaintenance()));
route('GET', '/v1/admin/maintenance', { perm: 'maintenance:read' }, (req, res) => json(res, 200, { ...publicMaintenance(), updatedAt: maintenanceState.updatedAt, updatedByName: maintenanceState.updatedByName }));
route('PUT', '/v1/admin/maintenance', { perm: 'maintenance:write' }, (req, res, ctx) => {
  const b = ctx.body;
  const reason = String(b.reason ?? '').trim();
  if (typeof b.enabled !== 'boolean' || reason.length < 5) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  if (b.enabled && b.expectedBackAt && new Date(b.expectedBackAt).getTime() <= Date.now()) return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos', undefined, { errors: [{ field: 'expectedBackAt', message: 'A previsão precisa estar no futuro.' }] });
  maintenanceState = b.enabled ? { enabled: true, message: b.message ?? null, expectedBackAt: b.expectedBackAt ?? null, updatedAt: now(), updatedByName: ctx.user.name } : { enabled: false, message: null, expectedBackAt: null, updatedAt: now(), updatedByName: ctx.user.name };
  record(req, ctx, { action: b.enabled ? 'maintenance.enable' : 'maintenance.disable', targetType: 'platform', targetId: 'maintenance', reason });
  json(res, 200, { ...publicMaintenance(), updatedAt: maintenanceState.updatedAt, updatedByName: maintenanceState.updatedByName });
});
route('POST', '/__test/maintenance', { public: true }, (req, res, ctx) => {
  maintenanceState = ctx.body.enabled ? { enabled: true, message: ctx.body.message ?? null, expectedBackAt: ctx.body.expectedBackAt ?? null, updatedAt: now(), updatedByName: 'Ana Souza' } : { enabled: false, message: null, expectedBackAt: null, updatedAt: now(), updatedByName: 'Ana Souza' };
  json(res, 200, { ok: true });
});

// lojista: configurações da loja (só o que o menu "Minha loja" e "Avisos de pedido novo" leem) e o e-mail de pedido novo
route('GET', '/v1/stores/:id/settings', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  json(res, 200, {
    isOpenNow: true,
    hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, intervals: [{ start: '09:00', end: '18:00' }] })),
    holidays: [], pause: { active: false, until: null, indefinitely: false },
    delivery: { acceptsDelivery: true, radiusKm: 5, feeMode: 'fixed', feeFixedCents: 500, tiers: [], minOrderCents: 3000, freeAboveCents: 0, etaMinMinutes: 30, etaMaxMinutes: 45, prepMinutes: 25, prepMinutesIsDefault: false },
    pickup: { enabled: false, useStoreAddress: true, address: null, instructions: null, prepMinMinutes: 15, prepMaxMinutes: 30 },
    exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 0, version: 1, legalFloor: { withdrawalDays: 7, defectDays: 90 } },
    lowStockThreshold: 5,
    notifications: { newOrderEmail: storeNotifications.get(s.id) ?? true },
  });
});
route('PUT', '/v1/stores/:id/notifications', {}, (req, res, ctx) => {
  const s = mustOwn(res, ctx);
  if (!s) return;
  if (typeof ctx.body.newOrderEmail !== 'boolean') return problem(res, 400, 'VALIDATION_FAILED', 'Dados inválidos');
  storeNotifications.set(s.id, ctx.body.newOrderEmail);
  json(res, 200, { newOrderEmail: ctx.body.newOrderEmail });
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Armazenamento de objetos falso (ADR-005): recebe o POST pré-assinado e serve o documento por URL assinada.
  if (url.pathname.startsWith('/__storage/')) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': '*' };
    if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
    if (req.method === 'POST') {
      req.resume();
      return void req.on('end', () => res.writeHead(204, cors).end());
    }
    res.writeHead(200, { ...cors, 'content-type': 'image/png', 'cache-control': 'no-store' });
    return void res.end(PNG);
  }
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
