#!/usr/bin/env node
// `pnpm perf:app`: mede o desempenho do app do cliente (Expo web) como o Safari do iPhone o vê, em Chromium (Playwright) com
// emulação de iPhone 17 Pro, CPU 4x mais lenta e rede 4G (Slow 4G por padrão) via CDP. Fluxo: abertura > cidade > início > loja >
// produto > sacola > checkout > PIX > pedido confirmado > acompanhamento. Contra uma API FALSA (scripts/perf/fake-api.mjs) com
// 60 ms de latência de servidor e fotos WebP nos tamanhos reais, para o número depender do app e não do servidor.
//
//   pnpm perf:app --label antes                 compila (expo export -p web), serve com brotli/gzip + cache imutável e mede
//   pnpm perf:app --label depois --dist <pasta> mede um export que já existe (a pasta de `expo export -p web`)
//   pnpm perf:app --label dev --url http://localhost:8081   mede um servidor que já está no ar (ex.: Metro de desenvolvimento)
//   pnpm perf:app --report antes depois         junta dois resultados em docs/qa/performance/app-<data>.md (tabela fluxo x métrica)
// Diagnóstico: --profile <passo> (store, product, cart, checkout...) imprime as funções que mais gastam CPU nesse passo (use um export `--no-minify` para ver nomes).
// Opções: --tap 80 (ms entre o dedo encostar e soltar; um toque humano leva 80 a 120 ms, o que dá tempo ao prefetch por intenção)  --runs 3 (mediana)  --net lento|rapido|sem  --cpu 4  --out <arquivo.json>  --no-compress (servidor sem gzip/brotli)
// Variável: CHROMIUM_PATH (Chromium alternativo). Limites do método: docs/qa/performance/README.md (não é aparelho real nem Hermes).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeApi } from './perf/fake-api.mjs';
import { startStaticServer } from './perf/static-server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps/mobile');
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------------------------------
// Funções puras (testadas em scripts/perf-app.test.mjs)
// ---------------------------------------------------------------------------------------------------------------------

/** Perfis de rede (bytes/s). "lento" = Lighthouse/DevTools Slow 4G; "rapido" = Fast 4G. */
export const NETWORKS = {
  lento: { name: '4G lento (1,6 Mbps, RTT 150 ms)', downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  rapido: { name: '4G rápido (9 Mbps, RTT 60 ms)', downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 60 },
  sem: { name: 'sem limite de rede', downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
};

export function median(values) {
  const v = values.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Tarefas longas (>50 ms) dentro da janela: soma do que passa de 50 ms (Total Blocking Time aproximado). */
export function blockingTime(longtasks, from, to) {
  return longtasks.filter(([start]) => start >= from && start <= to).reduce((total, [, duration]) => total + Math.max(0, duration - 50), 0);
}

/** Maior duração de evento de entrada (toque) na janela: aproximação do INP (inclui o tempo até a próxima pintura). */
export function maxEventDuration(events, from, to) {
  const inside = events.filter(([start, , name]) => start >= from - 8 && start <= to && /^(pointer|click|mouse|touch|key)/.test(name));
  return inside.length ? Math.max(...inside.map(([, duration]) => duration)) : null;
}

/** Resumo de um perfil de CPU do Chrome (`Profiler.stop`): tempo próprio por função, do maior para o menor. */
export function topSelfTime(profile, limit = 15) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const delta = profile.timeDeltas[i] ?? 0;
    self.set(id, (self.get(id) ?? 0) + delta);
  });
  const byFn = new Map();
  for (const [id, us] of self) {
    const { callFrame } = byId.get(id);
    const key = `${callFrame.functionName || '(anônima)'} ${String(callFrame.url).split('/').slice(-1)[0]}:${callFrame.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + us);
  }
  return [...byFn].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, us]) => ({ name, ms: us / 1000 }));
}

export function classify(url, apiBase) {
  if (url.startsWith(apiBase) && url.includes('/v1/')) return 'api';
  if (/\/img\/\d+\//.test(url) || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url)) return 'img';
  if (/\.(ttf|otf|woff2?)(\?|$)/i.test(url)) return 'font';
  if (/\.js(\?|$)/i.test(url)) return 'js';
  return 'other';
}

export const fmtMs = (n) => (n === null || n === undefined ? 'n/d' : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
export const fmtKb = (n) => (n === null || n === undefined ? 'n/d' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`);

/** Metas (hipóteses do fundador/PO; ver docs/qa/performance/README.md). */
export const TARGETS = {
  cold: { ms: 2500, text: '≤ 2,5 s (1ª tela útil, 4G)' },
  step: { ms: 1000, text: '≤ 1 s (rede, p95 em 4G)' },
  feedback: { ms: 100, text: '≤ 100 ms' },
  tbt: { ms: 200, text: '≤ 200 ms' },
};

/** Tabela markdown fluxo x métrica x antes x depois x meta. */
export function renderReport(before, after) {
  const rows = [];
  const status = (value, target) => (value === null || value === undefined ? '' : value <= target.ms ? 'ok' : 'acima');
  const delta = (a, b) => (typeof a === 'number' && typeof b === 'number' && a > 0 ? `${b <= a ? '-' : '+'}${Math.abs(Math.round(((b - a) / a) * 100))}%` : '');
  for (const [id, stepB] of Object.entries(before.steps)) {
    const stepA = after.steps[id];
    if (!stepA) continue;
    const kind = id.startsWith('cold') || id === 'reopen' ? 'cold' : 'step';
    const target = TARGETS[kind];
    rows.push(`| ${stepB.label} | Tempo até o conteúdo | ${fmtMs(stepB.ms)} | ${fmtMs(stepA.ms)} | ${delta(stepB.ms, stepA.ms)} | ${target.text} ${status(stepA.ms, target) ? `(${status(stepA.ms, target)})` : ''} |`);
    if (stepB.feedbackMs !== null || stepA.feedbackMs !== null) rows.push(`| | 1º feedback visual ao toque | ${fmtMs(stepB.feedbackMs)} | ${fmtMs(stepA.feedbackMs)} | ${delta(stepB.feedbackMs, stepA.feedbackMs)} | ${TARGETS.feedback.text} |`);
    if (stepB.fcpMs !== undefined && stepB.fcpMs !== null) rows.push(`| | FCP | ${fmtMs(stepB.fcpMs)} | ${fmtMs(stepA.fcpMs)} | ${delta(stepB.fcpMs, stepA.fcpMs)} | ≤ 1,8 s |`);
    if (stepB.lcpMs !== undefined && stepB.lcpMs !== null) rows.push(`| | LCP | ${fmtMs(stepB.lcpMs)} | ${fmtMs(stepA.lcpMs)} | ${delta(stepB.lcpMs, stepA.lcpMs)} | ≤ 2,5 s |`);
    rows.push(`| | TBT (tarefas longas) | ${fmtMs(stepB.tbtMs)} | ${fmtMs(stepA.tbtMs)} | ${delta(stepB.tbtMs, stepA.tbtMs)} | ${TARGETS.tbt.text} |`);
    if (stepB.inpMs !== null || stepA.inpMs !== null) rows.push(`| | INP aprox. (evento de toque) | ${fmtMs(stepB.inpMs)} | ${fmtMs(stepA.inpMs)} | ${delta(stepB.inpMs, stepA.inpMs)} | ≤ 200 ms |`);
    rows.push(`| | Requisições (API / total) | ${stepB.req.api} / ${stepB.req.total} | ${stepA.req.api} / ${stepA.req.total} | | sem cascata |`);
    rows.push(`| | Transferido (JS / imagens / total) | ${fmtKb(stepB.bytes.js)} / ${fmtKb(stepB.bytes.img)} / ${fmtKb(stepB.bytes.total)} | ${fmtKb(stepA.bytes.js)} / ${fmtKb(stepA.bytes.img)} / ${fmtKb(stepA.bytes.total)} | ${delta(stepB.bytes.total, stepA.bytes.total)} | imagem de lista ≤ 30 KB |`);
  }
  return ['| Fluxo | Métrica | Antes | Depois | Variação | Meta |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

export function parseArgs(argv) {
  const o = { label: 'medida', runs: 3, net: 'lento', cpu: 4, dist: null, url: null, out: null, compress: true, preload: true, profile: null, tap: 80, report: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--label') o.label = argv[++i];
    else if (a === '--runs') o.runs = Number(argv[++i]);
    else if (a === '--net') o.net = argv[++i];
    else if (a === '--cpu') o.cpu = Number(argv[++i]);
    else if (a === '--dist') o.dist = argv[++i];
    else if (a === '--url') o.url = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--no-compress') o.compress = false;
    else if (a === '--no-preload') o.preload = false;
    else if (a === '--profile') o.profile = argv[++i];
    else if (a === '--tap') o.tap = Number(argv[++i]);
    else if (a === '--report') o.report = [argv[++i], argv[++i]];
    else if (a === '--help' || a === '-h') o.help = true;
    else o.errors.push(`opção desconhecida: ${a}`);
  }
  if (!NETWORKS[o.net]) o.errors.push(`--net deve ser lento, rapido ou sem (recebi "${o.net}")`);
  if (!Number.isInteger(o.runs) || o.runs < 1 || o.runs > 15) o.errors.push('--runs deve ser um inteiro de 1 a 15');
  if (!(o.cpu >= 1 && o.cpu <= 20)) o.errors.push('--cpu deve ficar entre 1 e 20');
  return o;
}

/** Tamanho do bundle exportado: JS (bruto, gzip, brotli), fontes, imagens e o arquivo de entrada. */
export function bundleSizes(dir) {
  const out = { js: { raw: 0, gzip: 0, br: 0, files: 0 }, fonts: 0, images: 0, other: 0, entry: null, total: 0 };
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      const size = statSync(full).size;
      out.total += size;
      if (/\.js$/.test(name)) {
        const buf = readFileSync(full);
        const gz = gzipSync(buf, { level: 9 }).length;
        const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }).length;
        out.js.raw += size; out.js.gzip += gz; out.js.br += br; out.js.files++;
        if (/^entry-/.test(name)) out.entry = { raw: size, gzip: gz, br };
      } else if (/\.(ttf|otf|woff2?)$/.test(name)) out.fonts += size;
      else if (/\.(png|jpe?g|webp|svg)$/.test(name)) out.images += size;
      else out.other += size;
    }
  };
  walk(dir);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------------------------------

const log = (m) => console.log(`[perf] ${m}`);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const tid = (id) => `[data-testid="${id}"]`;
const vis = (id) => `__vis('${tid(id)}')`;
const visPrefix = (prefix) => `__vis('[data-testid^="${prefix}"]')`;

/** Instrumentação dentro da página (roda antes de qualquer script do app). */
const INIT_SCRIPT = `(() => {
  const p = (window.__perf = { lt: [], ev: [], lcp: 0, fcp: 0, mutAt: 0, t0: 0 });
  const obs = (type, cb, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra }); } catch {} };
  obs('longtask', (e) => p.lt.push([e.startTime, e.duration]));
  obs('largest-contentful-paint', (e) => { p.lcp = e.startTime; });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') p.fcp = e.startTime; });
  obs('event', (e) => p.ev.push([e.startTime, e.duration, e.name]), { durationThreshold: 16 });
  window.__vis = (sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0);
  // primeiro toque (pointerup) arma o relógio do passo e observa a primeira mudança na tela (feedback)
  document.addEventListener('pointerup', () => {
    if (p.t0) return;
    p.t0 = performance.now();
    const mo = new MutationObserver(() => { if (!p.mutAt) { p.mutAt = performance.now(); requestAnimationFrame(() => { p.fbAt = performance.now(); }); mo.disconnect(); } });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  }, true);
  window.__arm = () => { p.t0 = 0; p.mutAt = 0; p.fbAt = 0; };
  window.__until = (expr, timeout = 90000) => new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      let ok = false;
      try { ok = !!eval(expr); } catch {}
      if (ok) resolve(performance.now()); else if (performance.now() - start > timeout) resolve(-1); else requestAnimationFrame(check);
    };
    check();
  });
})();`;

async function exportWeb(outDir, apiUrl) {
  log(`compilando o app web (expo export -p web) em ${outDir}...`);
  const env = {
    ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1',
    EXPO_PUBLIC_API_URL: apiUrl, EXPO_PUBLIC_WEB_URL: 'http://127.0.0.1:3001', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_PAYMENT_MODE: 'fake',
  };
  const r = spawnSync(process.execPath, ['./node_modules/expo/bin/cli', 'export', '-p', 'web', '--output-dir', outDir], { cwd: mobile, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`expo export falhou:\n${(r.stderr || r.stdout || '').split('\n').slice(-15).join('\n')}`);
}

function loadPlaywright() {
  const req = createRequire(join(root, 'apps/web/package.json'));
  return req('@playwright/test');
}

async function runOnce({ browser, appUrl, api, net, cpu, profileStep, tap }) {
  api.reset();
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, locale: 'pt-BR' });
  const page = await context.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // contabilidade de rede por passo
  let step = { req: { total: 0, api: 0 }, bytes: { total: 0, js: 0, img: 0, api: 0, font: 0, other: 0 }, calls: [], startedAt: Date.now() };
  const fresh = () => ({ req: { total: 0, api: 0 }, bytes: { total: 0, js: 0, img: 0, api: 0, font: 0, other: 0 }, calls: [], startedAt: Date.now() });
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    const url = e.request.url;
    if (url.startsWith('data:')) return;
    const kind = classify(url, api.base);
    reqs.set(e.requestId, { kind, step, url, at: Date.now() });
    step.req.total++;
    if (kind === 'api') { step.req.api++; step.calls.push({ path: new URL(url).pathname, startMs: Date.now() - step.startedAt }); }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    r.step.bytes[r.kind] += e.encodedDataLength;
    r.step.bytes.total += e.encodedDataLength;
    if (r.kind === 'api') { const c = r.step.calls.find((x) => x.path === new URL(r.url).pathname && x.endMs === undefined); if (c) c.endMs = Date.now() - r.step.startedAt; }
  });
  const throttle = async () => {
    if (net.latency > 0 || net.downloadThroughput > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  };
  await throttle();

  const results = {};
  const snapshot = async (id, label, fromMs, toMs, extra = {}) => {
    const perf = await page.evaluate(() => ({ lt: window.__perf.lt, ev: window.__perf.ev, lcp: window.__perf.lcp, fcp: window.__perf.fcp, t0: window.__perf.t0, fbAt: window.__perf.fbAt || 0 }));
    results[id] = {
      label, ms: toMs - fromMs, tbtMs: blockingTime(perf.lt, fromMs, toMs), inpMs: maxEventDuration(perf.ev, fromMs, toMs),
      feedbackMs: extra.cold ? null : perf.fbAt && perf.t0 ? perf.fbAt - perf.t0 : null,
      fcpMs: extra.cold ? perf.fcp || null : undefined, lcpMs: extra.cold ? perf.lcp || null : undefined,
      req: step.req, bytes: step.bytes, calls: step.calls.slice(0, 14),
    };
    step = fresh();
  };
  /** Toca em `clickSel` (já visível) e mede até `untilExpr` ficar verdadeiro; tempos dentro da página (performance.now). */
  const timed = async (id, label, clickSel, untilExpr, { timeout = 90000, pre } = {}) => {
    const target = page.locator(`${clickSel}:visible`).first();
    await target.waitFor({ timeout });
    if (pre) await pre();
    await page.evaluate(() => window.__arm());
    step = fresh();
    const doneP = page.evaluate(([expr, t]) => window.__until(expr, t), [untilExpr, timeout]);
    const profiling = profileStep === id;
    if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
    await target.click({ timeout, delay: tap });
    const t1 = await doneP;
    if (profiling) {
      const { profile } = await cdp.send('Profiler.stop');
      console.log(`\n[perf] CPU em "${label}" (tempo próprio, CPU ${cpu}x):`);
      for (const f of topSelfTime(profile)) console.log(`  ${f.ms.toFixed(0).padStart(6)} ms  ${f.name}`);
    }
    if (t1 < 0 && process.env.PERF_SHOT) await page.screenshot({ path: process.env.PERF_SHOT });
    if (t1 < 0) throw new Error(`tempo esgotado em "${label}" esperando ${untilExpr}`);
    const t0 = await page.evaluate(() => window.__perf.t0);
    await snapshot(id, label, t0, t1);
    return t1;
  };
  const untimedClick = async (sel, timeout = 90000) => {
    const el = page.locator(`${sel}:visible`).first();
    await el.waitFor({ timeout });
    await el.click({ timeout });
  };

  // 1. abertura a frio (1ª visita): da navegação até a tela de escolher a cidade
  step = fresh();
  await page.goto(appUrl, { waitUntil: 'commit' });
  const tCold = await page.evaluate((e) => window.__until(e, 120000), vis('location.choose-city'));
  if (tCold < 0) throw new Error('a tela de cidade não apareceu');
  await snapshot('cold', 'Abertura a frio (1ª visita) até a escolha da cidade', 0, tCold, { cold: true });

  // 2. cidade > início
  await page.evaluate(() => window.__arm());
  await untimedClick(tid('location.choose-city'));
  await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30000 });
  await page.evaluate(() => window.__arm());
  step = fresh();
  const homeP = page.evaluate((e) => window.__until(e, 90000), visPrefix('home.store-'));
  await page.locator('[data-testid^="location.city-"]').first().click();
  await page.waitForSelector(tid('location.neighborhood-any'), { timeout: 20000 });
  await page.click(tid('location.neighborhood-any'));
  const tHome = await homeP;
  if (tHome < 0) throw new Error('o início não mostrou lojas');
  const t0Home = await page.evaluate(() => window.__perf.t0);
  await snapshot('home', 'Escolher cidade > Início com lojas', t0Home, tHome);
  // imagens do início carregadas (ainda sem rolar): espera a rede acalmar um pouco
  await page.waitForTimeout(2500);

  // 2b. rolagem do início: intervalos entre quadros (rAF) durante a rolagem por roda
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (n) => { window.__frames.push(n - last); last = n; if (window.__scrolling) requestAnimationFrame(tick); }; window.__scrolling = true; requestAnimationFrame(tick); });
  await page.mouse.move(200, 500);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 260); await page.waitForTimeout(90); }
  const frames = await page.evaluate(() => { window.__scrolling = false; return window.__frames.slice(); });
  const sorted = [...frames].sort((a, b) => a - b);
  results.scroll = { label: 'Rolagem do início (14 passos)', frameP95: sorted[Math.floor(sorted.length * 0.95)] ?? null, frameMax: sorted[sorted.length - 1] ?? null, slowFrames: frames.filter((f) => f > 50).length, frames: frames.length };
  await page.mouse.wheel(0, -5000);
  await page.waitForTimeout(500);

  // 3. reabertura (cache HTTP quente, endereço salvo): recarrega e mede até o início com lojas
  step = fresh();
  await page.reload({ waitUntil: 'commit' });
  const tReopen = await page.evaluate((e) => window.__until(e, 120000), visPrefix('home.store-'));
  if (tReopen < 0) throw new Error('o início não reabriu');
  await snapshot('reopen', 'Reabertura (endereço salvo, cache quente) até o início com lojas', 0, tReopen, { cold: true });
  await page.waitForTimeout(1500);

  // 4. entra na conta (sem medir): a sacola da conta vive no servidor
  await untimedClick(tid('tabs.account'));
  await untimedClick(tid('home.login'));
  await page.fill(tid('auth.login-email-input'), 'cliente.ana@seed.webag.local');
  await page.fill(tid('auth.login-password-input'), 'webag-seed-lojista-2026');
  await untimedClick(tid('auth.login-submit'));
  await page.locator('[data-testid^="home.store-"]:visible').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1200);

  // 5. início > loja
  await timed('store', 'Início > Loja (produtos visíveis)', '[data-testid^="home.store-"]', visPrefix('store.product-'));
  await page.waitForTimeout(1500);
  // 6. loja > produto
  await timed('product', 'Loja > Produto (botão adicionar)', '[data-testid^="store.product-"]', vis('product.add'));
  await page.waitForTimeout(1200);
  // escolhe a 1ª opção de cada variação obrigatória (sem medir)
  const options = await page.locator('[data-testid^="product.variant-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'product.variant-error'));
  const picked = new Set();
  for (const testId of options) {
    const group = testId.split('-').slice(0, -1).join('-');
    if (picked.has(group)) continue;
    picked.add(group);
    await page.locator(`[data-testid="${testId}"]:visible`).first().click();
  }
  // 7. adicionar à sacola (resposta do toque)
  await timed('add', 'Adicionar à sacola (selo "Adicionado")', tid('product.add'), `/adicionado/i.test(document.querySelector('[data-testid="product.add"]')?.textContent ?? '')`);
  await page.waitForTimeout(1200);
  await timed('back-store', 'Produto > voltar à Loja (barra da sacola)', tid('product.back'), vis('store.cart-bar'));
  // 8. loja > sacola
  await timed('cart', 'Loja > Sacola (total)', tid('store.cart-bar'), vis('cart.total'));
  await page.waitForTimeout(800);
  // 9. sacola > checkout
  await timed('checkout', 'Sacola > Checkout', tid('cart.submit'), vis('checkout.screen'));
  await page.waitForTimeout(800);
  await untimedClick(tid('checkout.mode-delivery'));
  await untimedClick(tid('checkout.pay-pix'));
  const cpf = page.locator(`${tid('checkout.cpf-input')}:visible`);
  if (await cpf.count()) await cpf.first().fill('52998224725');
  // entrega sem endereço completo salvo: o 1º envio leva ao formulário (como no app real)
  await untimedClick(tid('checkout.submit'));
  const form = page.locator(`${tid('address.cep-input')}:visible`);
  if (await form.first().waitFor({ timeout: 6000 }).then(() => true, () => false)) {
    await form.first().fill('07700-000');
    await page.waitForTimeout(1500);
    const fill = async (id, value) => { const el = page.locator(`${tid(id)}:visible`).first(); if (!(await el.inputValue())) await el.fill(value); };
    await fill('address.street-input', 'Rua Teste');
    await fill('address.district-input', 'Centro');
    await fill('address.number-input', '100');
    await untimedClick(tid('address.submit'));
    await page.locator(`${tid('checkout.screen')}:visible`).first().waitFor({ timeout: 30000 });
    await untimedClick(tid('checkout.pay-pix'));
  }
  // 10. checkout > PIX
  await timed('pix', 'Checkout > Pagar com PIX (código)', tid('checkout.submit'), vis('pix.code'), { timeout: 120000 });
  await page.waitForTimeout(800);
  // 11. PIX pago (servidor confirma) > pedido confirmado
  await timed('confirmed', 'Simular pagamento > Pedido confirmado', tid('pix.simulate'), vis('confirmed.title'), { timeout: 120000 });
  await page.waitForTimeout(1500);
  // 12. acompanhar o pedido
  await timed('track', 'Pedido confirmado > Acompanhamento', tid('confirmed.track'), vis('order.timeline'));

  if (problems.length) results.problems = problems.slice(0, 5);
  await context.close();
  return results;
}

/** Mediana de cada métrica ao longo das rodadas. */
export function aggregate(runs) {
  const out = {};
  const ids = Object.keys(runs[0] ?? {}).filter((k) => k !== 'problems');
  for (const id of ids) {
    const all = runs.map((r) => r[id]).filter(Boolean);
    if (id === 'scroll') {
      out.scroll = { label: all[0].label, frameP95: median(all.map((s) => s.frameP95)), frameMax: median(all.map((s) => s.frameMax)), slowFrames: median(all.map((s) => s.slowFrames)), frames: median(all.map((s) => s.frames)) };
      continue;
    }
    const med = (pick) => median(all.map(pick));
    out[id] = {
      label: all[0].label, ms: med((s) => s.ms), runsMs: all.map((s) => Math.round(s.ms)), tbtMs: med((s) => s.tbtMs), inpMs: med((s) => s.inpMs),
      feedbackMs: med((s) => s.feedbackMs), fcpMs: med((s) => s.fcpMs), lcpMs: med((s) => s.lcpMs),
      req: { total: med((s) => s.req.total), api: med((s) => s.req.api) },
      bytes: Object.fromEntries(['total', 'js', 'img', 'api', 'font', 'other'].map((k) => [k, med((s) => s.bytes[k])])),
      calls: all[0].calls,
    };
  }
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (o.errors.length) { console.error(`[perf] ${o.errors[0]}`); process.exit(1); }

  if (o.report) {
    const [a, b] = o.report.map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
    const md = renderReport(a, b);
    console.log(md);
    return;
  }

  const { chromium } = loadPlaywright();
  const apiPort = 3998;
  const api = await startFakeApi({ port: apiPort, latencyMs: 60 });
  log(`API falsa em ${api.base} (60 ms de servidor, fotos WebP geradas)`);

  let dist = o.dist ? resolve(o.dist) : null;
  let server = null;
  let appUrl = o.url;
  let bundle = null;
  if (!appUrl) {
    if (!dist) {
      dist = mkdtempSync(join(tmpdir(), 'webag-perf-'));
      await exportWeb(dist, api.base);
    }
    bundle = bundleSizes(dist);
    server = await startStaticServer({ dir: dist, port: 8095, host: '127.0.0.1', compress: o.compress, preloadFonts: o.preload });
    appUrl = `http://127.0.0.1:${server.port}`;
  }
  const exe = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-proxy-server'] });
  const net = NETWORKS[o.net];
  log(`rede: ${net.name}; CPU ${o.cpu}x; ${o.runs} rodada(s); app em ${appUrl}`);
  const runs = [];
  try {
    for (let i = 0; i < o.runs; i++) {
      log(`rodada ${i + 1}/${o.runs}...`);
      runs.push(await runOnce({ browser, appUrl, api, net, cpu: o.cpu, profileStep: o.profile, tap: o.tap }));
    }
  } finally {
    await browser.close();
    await server?.close();
    await api.close();
  }
  const result = {
    meta: { label: o.label, date: today, net: net.name, cpu: o.cpu, tapMs: o.tap, runs: o.runs, mode: o.url ? 'servidor externo' : o.compress ? 'produção estática (brotli/gzip)' : 'produção estática (sem compressão)', chromium: browser.version?.() ?? 'n/d', node: process.version, bundle },
    steps: aggregate(runs),
    problems: runs.flatMap((r) => r.problems ?? []).slice(0, 8),
  };
  const outFile = resolve(o.out ?? join(root, 'docs/qa/performance', `app-${today}-${o.label}.json`));
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  log(`resultado salvo em ${outFile}`);
  for (const [id, s] of Object.entries(result.steps)) {
    if (id === 'scroll') console.log(`  ${s.label}: quadro p95 ${fmtMs(s.frameP95)}, máx ${fmtMs(s.frameMax)}, ${s.slowFrames} quadros > 50 ms de ${s.frames}`);
    else console.log(`  ${s.label}: ${fmtMs(s.ms)} (rodadas ${s.runsMs.join(', ')} ms) | feedback ${fmtMs(s.feedbackMs)} | TBT ${fmtMs(s.tbtMs)} | API ${s.req.api} req | ${fmtKb(s.bytes.total)}`);
  }
  if (result.problems.length) console.log(`  avisos: ${result.problems.join(' | ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[perf] ERRO: ${error?.stack ?? error}`); process.exit(1); });
}
