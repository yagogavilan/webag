import { createRequire } from 'node:module';
const requireFromWeb = createRequire('/home/user/webag/apps/web/package.json');
export const { chromium } = requireFromWeb('@playwright/test');
export const API = 'http://localhost:3300', APP = 'http://localhost:3302', WEB = 'http://localhost:3301';
export const SEED_PASSWORD = 'webag-seed-lojista-2026';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const tid = (id) => `[data-testid="${id}"]`;
export const vis = (page, id, timeout = 60_000) => page.locator(`${tid(id)}:visible`).first().waitFor({ timeout });
export async function tap(page, id, timeout = 60_000) {
  const el = page.locator(`${tid(id)}:visible`).first();
  await el.waitFor({ timeout });
  await el.click({ timeout });
}
export async function appGo(page, path) {
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
}
export function launch(extra = {}) {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--font-render-hinting=none', '--force-color-profile=srgb', ...(extra.args ?? [])] });
}
export async function appSession(browser, { dsf = 1, size = { width: 390, height: 844 }, topInset = 0 } = {}) {
  const context = await browser.newContext({ viewport: size, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: dsf, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  if (topInset) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: topInset, bottom: 0, left: 0, right: 0 } }); }
  page.setDefaultTimeout(30_000);
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await tap(page, 'location.choose-city', 120_000);
  await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30_000 });
  const morato = page.locator('[data-testid^="location.city-"]').filter({ hasText: 'Francisco Morato' });
  await (((await morato.count()) ? morato : page.locator('[data-testid^="location.city-"]')).first()).click();
  await page.waitForSelector(tid('location.neighborhood-any'), { timeout: 20_000 });
  await page.click(tid('location.neighborhood-any'));
  await vis(page, 'home.screen', 90_000);
  await page.locator('[data-testid^="home.store-"]:visible').first().waitFor({ timeout: 90_000 });
  return { context, page };
}
export async function appLogin(page, email, password = SEED_PASSWORD) {
  await tap(page, 'tabs.account');
  await tap(page, 'home.login');
  await page.fill(tid('auth.login-email-input'), email);
  await page.fill(tid('auth.login-password-input'), password);
  await tap(page, 'auth.login-submit');
  await vis(page, 'tabs.account', 60_000);
  await page.waitForTimeout(2500);
  await tap(page, 'tabs.account');
  await vis(page, 'account.screen', 60_000);
}

// ---- API helpers
export async function call(method, path, body, token, extraHeaders = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}
export const PG = 'postgresql://webag:webag_dev_only@127.0.0.1:55432/webag_mkt';
import { execFileSync } from 'node:child_process';
export const sql = (q) => execFileSync('psql', [PG, '-At', '-F', '|', '-c', q], { encoding: 'utf8' }).trim();
export const MODA = '8ab41b27-6685-4a95-958a-48b1dbdb0a3f';
export async function ensureCustomer(email, name, phone) {
  let login = await call('POST', '/v1/auth/login', { email, password: SEED_PASSWORD });
  if (!login.data?.tokens) {
    const documents = await Promise.all(['customer_terms', 'privacy'].map(async (type) => ({ type, version: (await call('GET', `/v1/legal/${type}`)).data?.version })));
    const r = await call('POST', '/v1/auth/register', { name, email, phone, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: documents });
    if (r.status !== 201 && r.status !== 200) throw new Error(`cadastro ${email}: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    login = await call('POST', '/v1/auth/login', { email, password: SEED_PASSWORD });
  }
  sql(`update users set email_verified_at = coalesce(email_verified_at, now()) where email = '${email}'`);
  const token = login.data.tokens.accessToken;
  return token;
}

// ---- admin (TOTP proprio do banco de marketing)
import { createHmac } from 'node:crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totpAt(secret, at = Date.now()) {
  let bits = '';
  for (const ch of secret.toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const ADMIN = { email: 'admin@webag.local', password: process.env.ADMIN_PASSWORD ?? 'Webag-Admin-Dev-2026' };
const TOTP_FILE = '/tmp/webag-mkt/admin-totp.json';
export async function adminToken() {
  let st = existsSync(TOTP_FILE) ? JSON.parse(readFileSync(TOTP_FILE, 'utf8')) : null;
  const login = await call('POST', '/v1/auth/login', ADMIN);
  if (login.data?.tokens && !st) {
    const t = login.data.tokens.accessToken;
    const setup = await call('POST', '/v1/admin/totp/setup', null, t);
    const code = totpAt(setup.data.secret);
    const c = await call('POST', '/v1/admin/totp/confirm', { code }, t);
    if (c.status !== 200) throw new Error('totp confirm ' + c.status + JSON.stringify(c.data));
    st = { secret: setup.data.secret, lastStep: Math.floor(Date.now() / 30_000) };
    writeFileSync(TOTP_FILE, JSON.stringify(st));
    return t;
  }
  if (!login.data?.mfaToken) throw new Error('login admin: ' + login.status + JSON.stringify(login.data));
  let step = Math.floor(Date.now() / 30_000);
  while (step <= st.lastStep) { await sleep(2000); step = Math.floor(Date.now() / 30_000); }
  st.lastStep = step; writeFileSync(TOTP_FILE, JSON.stringify(st));
  const v = await call('POST', '/v1/auth/mfa/verify', { mfaToken: login.data.mfaToken, code: totpAt(st.secret) });
  if (!v.data?.tokens) throw new Error('mfa verify ' + v.status + JSON.stringify(v.data));
  return v.data.tokens.accessToken;
}

// ---- chrome do celular (status bar limpa + barra de gestos), so para as versoes "tela cheia"
export async function addPhoneChrome(page, tone /* 'light' = icones claros, 'dark' = icones escuros */) {
  await page.evaluate((tone) => {
    document.getElementById('__sb')?.remove();
    const c = tone === 'light' ? '#FFFFFF' : '#1C1721';
    const el = document.createElement('div');
    el.id = '__sb';
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;height:47px;z-index:2147483647;pointer-events:none;font-family:Figtree,system-ui,sans-serif';
    el.innerHTML = `
      <div style="position:absolute;left:34px;top:14px;font-size:17px;font-weight:700;letter-spacing:-0.2px;color:${c};line-height:22px">9:41</div>
      <svg style="position:absolute;right:24px;top:17px" width="76" height="14" viewBox="0 0 76 14" fill="${c}">
        <rect x="0" y="9" width="3.4" height="5" rx="1"/><rect x="5.2" y="6" width="3.4" height="8" rx="1"/><rect x="10.4" y="3" width="3.4" height="11" rx="1"/><rect x="15.6" y="0" width="3.4" height="14" rx="1"/>
        <path d="M33.5 3.2c2.5 0 4.8 1 6.5 2.6l1.1-1.2C39 2.6 36.4 1.4 33.5 1.4S28 2.6 25.9 4.6L27 5.8c1.7-1.6 4-2.6 6.5-2.6zm0 3.6c1.5 0 2.9.6 4 1.6l1.1-1.2c-1.4-1.3-3.2-2-5.1-2s-3.7.7-5.1 2l1.1 1.2c1.1-1 2.5-1.6 4-1.6zm0 3.5c.7 0 1.3.3 1.8.7l-1.8 2-1.8-2c.5-.4 1.1-.7 1.8-.7z"/>
        <rect x="47" y="0.5" width="24" height="13" rx="3.6" fill="none" stroke="${c}" stroke-opacity="0.45"/><rect x="49" y="2.5" width="20" height="9" rx="2" fill="${c}"/><path d="M73 5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="${c}" fill-opacity="0.5"/>
      </svg>`;
    document.body.appendChild(el);
    const bar = document.createElement('div');
    bar.id = '__hi';
    bar.style.cssText = `position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:${c};opacity:0.9;z-index:2147483647;pointer-events:none`;
    document.getElementById('__hi')?.remove();
    document.body.appendChild(bar);
  }, tone);
}
export async function scrollOf(page, selector, top) {
  await page.evaluate(([sel, top]) => {
    let el = document.querySelector(sel);
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (!el) { const all = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.clientHeight > 400); el = all[0]; }
    if (el) el.scrollTop = top;
  }, [selector, top]);
}

// ---- painel do lojista
export const HIDE_ALERT = '[data-dialog-root]:has([data-testid="lojista.alert.modal"]) { display: none !important; }';
/** deixa os pedidos de demonstracao em andamento com horarios recentes (evita "ha 2 h" em vermelho) */
export function refreshDemoTimes() {
  // pedidos de execucoes anteriores saem da fila (entregues); os de demonstracao (WB-DM*) ficam com horarios recentes
  sql(`update orders set status='delivered', delivered_at=now()-interval '1 hour' where store_id='${MODA}' and number not like 'WB-DM%' and status in ('accepted','in_preparation','ready_for_collection','out_for_delivery')`);
  sql(`update deliveries set status='delivered' where order_id in (select id from orders where store_id='${MODA}' and number not like 'WB-DM%') and status not in ('delivered','cancelled')`);
  const nums = sql(`select number from orders where store_id='${MODA}' and number like 'WB-DM%' and status in ('accepted','in_preparation','ready_for_collection','out_for_delivery') order by created_at desc`).split('\n').filter(Boolean);
  const cols = sql(`select column_name from information_schema.columns where table_name='orders' and data_type like 'timestamp%' and column_name not in ('updated_at')`).split('\n');
  nums.forEach((number, i) => {
    const min = [1, 2, 2, 3, 4][i] ?? 4;
    const sets = cols.map((c) => `${c} = ${c} + off.d`).join(', ');
    sql(`update orders o set ${sets} from (select (now() - interval '${min} minutes' - created_at) as d from orders where number='${number}') off where o.number='${number}'`);
  });
}
export async function painelLogin(page, email) {
  await page.goto(`${WEB}/lojista/entrar`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('lojista.login.email-input').fill(email);
  await page.getByTestId('lojista.login.password-input').fill(SEED_PASSWORD);
  await page.getByTestId('lojista.login.submit').click();
  await page.waitForURL((u) => !u.pathname.includes('/entrar'), { timeout: 30000 });
}
export async function painelGo(page, path, dismiss = true) {
  await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1800);
  if (dismiss) await page.getByText('Agora não', { exact: true }).first().click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);
}
