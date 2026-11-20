#!/usr/bin/env node
// Pipeline de render das pecas de marketing: HTML -> PDF, PNG e MP4. Uso, pela raiz:
//   pnpm marketing [alvo] [opcoes]
// Alvos: lojista | cliente | instagram | video | tudo (padrao)
// Opcoes:
//   --capa <segundos>   instante do frame usado como capa do video (padrao 2)
//   --audio <arquivo>   trilha de audio a mixar no video (padrao: faixa de silencio AAC). Corta na duracao e faz fade-out de 1 s
//   --pasta <subpasta>  le o HTML de docs/marketing/src/<subpasta>/ (usado nas fixtures de teste; padrao: raiz de src)
//   --saida <dir>       grava em outro diretorio em vez de docs/marketing/saida (usado nas fixtures de teste)
//   --ajuda
// Variavel: CHROMIUM_PATH = executavel do Chromium, se o do Playwright nao estiver instalado (ver docs/marketing/README.md).
// Detalhes de contrato (tamanhos, nomes, window.setTime) e decisoes de render: docs/marketing/README.md.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marketing = join(root, 'docs/marketing');
const srcRoot = join(marketing, 'src');
const docsRoot = join(root, 'docs'); // raiz do servidor: as pecas referenciam ../../telas e ../../design (fora de marketing/src)

const TARGETS = ['lojista', 'cliente', 'instagram', 'video', 'tudo'];
const DECKS = { lojista: 'apresentacao-lojista', cliente: 'apresentacao-cliente' };
const SLIDE = { w: 1920, h: 1080 };
const INSTAGRAM = [
  { name: 'perfil', w: 1080, h: 1080, roots: ['main.perfil', 'main.post', 'main', 'body > *'] },
  { name: 'post-0-apresentacao', w: 1080, h: 1350, roots: ['main.post'] },
  { name: 'post-1', w: 1080, h: 1350, roots: ['main.post'] },
  { name: 'post-2', w: 1080, h: 1350, roots: ['main.post'] },
  { name: 'post-3', w: 1080, h: 1350, roots: ['main.post'] },
];
const STORY = { w: 1080, h: 1920, fps: 30, file: 'video-story' };

const log = (msg) => console.log(`[marketing] ${msg}`);
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`[marketing] AVISO: ${msg}`);
};
class UserError extends Error {}
const fail = (msg) => {
  throw new UserError(msg);
};

let opts;
let target;
try {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      capa: { type: 'string', default: '2' },
      audio: { type: 'string' },
      pasta: { type: 'string', default: '' },
      saida: { type: 'string' },
      ajuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  opts = parsed.values;
  target = parsed.positionals[0] ?? 'tudo';
} catch (error) {
  console.error(`[marketing] ERRO: ${error.message}`);
  process.exit(2);
}
if (opts.ajuda || !TARGETS.includes(target)) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 12)
      .map((l) => l.replace(/^\/\/ ?/, ''))
      .join('\n'),
  );
  process.exit(opts.ajuda ? 0 : 2);
}
const coverAt = Number(opts.capa);
if (!Number.isFinite(coverAt) || coverAt < 0) {
  console.error('[marketing] ERRO: --capa precisa ser um numero de segundos >= 0');
  process.exit(2);
}
const srcDir = join(srcRoot, opts.pasta);
const outDir = opts.saida ? resolve(process.cwd(), opts.saida) : join(marketing, 'saida');
const explicit = target !== 'tudo'; // alvo explicito: peca ausente e erro; em "tudo" e aviso (designers entregam em momentos diferentes)

// ---------------------------------------------------------------- utilitarios
const fmtSecs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const kb = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

function ffmpegAvailable() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}
function needFfmpeg() {
  if (!ffmpegAvailable())
    fail(
      'ffmpeg nao encontrado no PATH. Instale (Linux: `sudo apt install ffmpeg`; macOS: `brew install ffmpeg`) e tente de novo.',
    );
}

/** Roda um binario, devolve { code, stdout (Buffer), stderr (string) }. `input` opcional vai para o stdin. */
function runBinary(cmd, args, input) {
  return new Promise((done, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.on('close', (code) => done({ code, stdout: Buffer.concat(out), stderr: err }));
    child.stdin.end(input);
  });
}

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') fail('saida nao e um PNG valido');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function pdfPageCount(buf) {
  const text = buf.toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

// ---------------------------------------------------------------- servidor estatico
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serve a pasta docs/ inteira em 127.0.0.1 numa porta livre (porta 0 = o SO escolhe), para o fetch de config.json funcionar (file:// bloqueia) e para ../../telas e ../../design resolverem. Nada fora de docs/ e servido. */
function startServer() {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let file = resolve(docsRoot, '.' + decodeURIComponent(url.pathname));
      if (file !== docsRoot && !file.startsWith(docsRoot + sep)) {
        res.writeHead(403).end('fora da pasta docs');
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(404).end('nao encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(400).end('requisicao invalida');
    }
  });
  return new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      done({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

// ---------------------------------------------------------------- Playwright do workspace
function loadChromium() {
  let chromium;
  try {
    const requireFromWeb = createRequire(join(root, 'apps/web/package.json'));
    const testPackage = requireFromWeb.resolve('@playwright/test/package.json');
    chromium = createRequire(testPackage)('playwright').chromium;
  } catch {
    fail(
      'Playwright nao encontrado no workspace. Rode `pnpm install` na raiz (apps/web depende de @playwright/test).',
    );
  }
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const exe = executablePath ?? chromium.executablePath();
  if (!existsSync(exe)) {
    fail(
      `Chromium nao encontrado em ${exe}. Rode \`pnpm --filter @webag/web exec playwright install chromium\` (uma vez) ` +
        'ou aponte um Chromium/Chrome ja instalado com a variavel CHROMIUM_PATH.',
    );
  }
  return { chromium, executablePath };
}

// --font-render-hinting=none: texto com o mesmo espacamento em qualquer maquina (sem hinting do SO).
// --force-color-profile=srgb: cores identicas independente do monitor/perfil da maquina que renderiza.
const CHROME_ARGS = ['--font-render-hinting=none', '--force-color-profile=srgb'];

/** Abre uma pagina, coleta problemas de carga (404, excecoes, recurso externo) e espera fontes e imagens. */
async function openPage(browser, origin, file, viewport, deviceScaleFactor = 1) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    locale: 'pt-BR',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const problems = [];
  const label = relative(srcRoot, file);
  page.on('pageerror', (e) => problems.push(`${label}: excecao JS: ${e.message}`));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !m.text().startsWith('Failed to load resource') &&
      warn(`${label}: console.error: ${m.text()}`),
  );
  page.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(origin) && r.status() >= 400 && !u.endsWith('/favicon.ico'))
      problems.push(`${label}: ${r.status()} ao carregar ${u.slice(origin.length)}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))
      warn(
        `${label}: recurso externo (depende de internet; prefira local em src/assets): ${u.slice(0, 120)}`,
      );
  });
  await page.goto(`${origin}/${relative(docsRoot, file).split(sep).join('/')}`, {
    waitUntil: 'networkidle',
  });
  // pecas que sinalizam prontidao com <html data-ready="1"> (o script do HTML a define apos carregar o config): espera; sem sinal, segue
  const usesReady = await page.evaluate(
    () =>
      document.documentElement.hasAttribute('data-ready') ||
      [...document.scripts].some((s) => s.textContent.includes('data-ready')),
  );
  if (usesReady)
    await page
      .waitForSelector('html[data-ready="1"]', { timeout: 15000, state: 'attached' })
      .catch(() => problems.push(`${label}: html[data-ready="1"] nao apareceu em 15 s`));
  const readiness = await page.evaluate(async () => {
    await document.fonts.ready;
    const imgs = [...document.images];
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = img.onerror = r;
            }),
      ),
    );
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    return {
      brokenImages: imgs
        .filter((img) => img.naturalWidth === 0)
        .map((img) => img.getAttribute('src')),
      failedFonts: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
    };
  });
  for (const src of readiness.brokenImages) problems.push(`${label}: imagem nao carregou: ${src}`);
  for (const fam of readiness.failedFonts) problems.push(`${label}: fonte nao carregou: ${fam}`);
  return { page, context, problems, label };
}

function throwIfProblems(problems) {
  if (problems.length) fail(problems.join('\n'));
}

// ---------------------------------------------------------------- apresentacoes (PDF)
async function renderDeck(browser, origin, key) {
  const name = DECKS[key];
  const file = join(srcDir, `${name}.html`);
  if (!existsSync(file)) return skipMissing(file);
  const t0 = Date.now();
  const { page, context, problems, label } = await openPage(browser, origin, file, {
    width: SLIDE.w,
    height: SLIDE.h,
  });
  try {
    throwIfProblems(problems);
    const measure = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('section.slide')].map((el, i) => {
          const r = el.getBoundingClientRect();
          const heading = el.querySelector('h1, h2, h3');
          return {
            n: i + 1,
            w: r.width,
            h: r.height,
            sw: el.scrollWidth,
            sh: el.scrollHeight,
            title: (heading?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
          };
        }),
      );
    const check = (slides, media) => {
      if (slides.length === 0) fail(`${label}: nenhum <section class="slide"> encontrado`);
      const errors = [];
      for (const s of slides) {
        const id = `slide ${s.n}${s.title ? ` ("${s.title}")` : ''}`;
        if (Math.abs(s.w - SLIDE.w) > 0.01 || Math.abs(s.h - SLIDE.h) > 0.01)
          errors.push(`${id} mede ${s.w}x${s.h} em vez de ${SLIDE.w}x${SLIDE.h} (${media})`);
        if (s.sw > SLIDE.w || s.sh > SLIDE.h)
          errors.push(
            `${id} tem overflow: scroll ${s.sw}x${s.sh} maior que ${SLIDE.w}x${SLIDE.h} (${media})`,
          );
      }
      if (errors.length) fail(`${label}:\n  ${errors.join('\n  ')}`);
    };
    check(await measure(), 'tela');
    // o PDF usa a midia "print": fixa pagina 1920x1080 sem margem, uma pagina por slide, cores impressas
    await page.emulateMedia({ media: 'print' });
    await page.addStyleTag({
      content:
        `@page{size:${SLIDE.w}px ${SLIDE.h}px;margin:0}` +
        'html,body{margin:0!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        'section.slide{break-inside:avoid;break-after:auto}' +
        'section.slide:not(:first-of-type){break-before:page}',
    });
    const slides = await measure();
    check(slides, 'impressao');
    const rawPdf = await page.pdf({
      width: `${SLIDE.w}px`,
      height: `${SLIDE.h}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });
    // datas fixas (mesmo tamanho do original, offsets do xref continuam validos): rodar de novo sem mudar o HTML gera o mesmo arquivo e nao suja o git
    const pdf = Buffer.from(
      rawPdf
        .toString('latin1')
        .replace(/\/(CreationDate|ModDate) \(D:\d{14}/g, '/$1 (D:20260101000000'),
      'latin1',
    );
    const pages = pdfPageCount(pdf);
    if (pages !== slides.length)
      fail(
        `${label}: o PDF saiu com ${pages} paginas para ${slides.length} slides (algum slide quebrou em duas paginas ou o container tem altura/overflow fixos na impressao)`,
      );
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, `${name}.pdf`);
    writeFileSync(out, pdf);
    return {
      peca: `${name}.pdf`,
      detalhe: `${slides.length} slides, ${kb(pdf.length)}`,
      ms: Date.now() - t0,
    };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- instagram (PNG)
// DSF 2 + reducao Lanczos (ffmpeg) para 1080 de largura: bordas de texto/curvas/gradientes ficam suavizadas (supersampling),
// melhor que DSF 1 puro; o custo e ~1 s por peca. O PNG final e RGB 8 bits, sem canal alfa.
async function renderInstagram(browser, origin) {
  needFfmpeg();
  const results = [];
  for (const spec of INSTAGRAM) {
    const file = join(srcDir, 'instagram', `${spec.name}.html`);
    if (!existsSync(file)) {
      results.push(skipMissing(file));
      continue;
    }
    const t0 = Date.now();
    const { page, context, problems, label } = await openPage(
      browser,
      origin,
      file,
      { width: spec.w, height: spec.h },
      2,
    );
    try {
      throwIfProblems(problems);
      const selector = await page.evaluate(
        (candidates) => candidates.find((s) => document.querySelector(s)) ?? null,
        spec.roots,
      );
      if (!selector) fail(`${label}: raiz nao encontrada (esperado: ${spec.roots[0]})`);
      const geo = await page.evaluate((s) => {
        const el = document.querySelector(s);
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, x: r.x, y: r.y, sw: el.scrollWidth, sh: el.scrollHeight };
      }, selector);
      if (Math.abs(geo.w - spec.w) > 0.01 || Math.abs(geo.h - spec.h) > 0.01)
        fail(`${label}: \`${selector}\` mede ${geo.w}x${geo.h} em vez de ${spec.w}x${spec.h}`);
      if (geo.sw > spec.w || geo.sh > spec.h)
        fail(
          `${label}: overflow em \`${selector}\`: scroll ${geo.sw}x${geo.sh} maior que ${spec.w}x${spec.h}`,
        );
      const big = await page
        .locator(selector)
        .first()
        .screenshot({ type: 'png', animations: 'allow' });
      const bigSize = pngSize(big);
      if (bigSize.w !== spec.w * 2 || bigSize.h !== spec.h * 2)
        fail(
          `${label}: captura saiu ${bigSize.w}x${bigSize.h}, esperado ${spec.w * 2}x${spec.h * 2}`,
        );
      const r = await runBinary(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          'pipe:0',
          '-vf',
          `scale=${spec.w}:${spec.h}:flags=lanczos`,
          '-pix_fmt',
          'rgb24',
          '-f',
          'image2pipe',
          '-c:v',
          'png',
          'pipe:1',
        ],
        big,
      );
      if (r.code !== 0) fail(`${label}: ffmpeg falhou ao reduzir o PNG: ${r.stderr.trim()}`);
      const size = pngSize(r.stdout);
      if (size.w !== spec.w || size.h !== spec.h)
        fail(`${label}: PNG final ${size.w}x${size.h}, esperado ${spec.w}x${spec.h}`);
      mkdirSync(join(outDir, 'instagram'), { recursive: true });
      writeFileSync(join(outDir, 'instagram', `${spec.name}.png`), r.stdout);
      results.push({
        peca: `instagram/${spec.name}.png`,
        detalhe: `${size.w}x${size.h}, ${kb(r.stdout.length)}`,
        ms: Date.now() - t0,
      });
    } catch (error) {
      results.push({ peca: `instagram/${spec.name}.png`, erro: error.message });
    } finally {
      await context.close();
    }
  }
  return results;
}

// ---------------------------------------------------------------- video (MP4)
// Frames PNG (sem perda) por pipe para o ffmpeg: nada de 450 arquivos em disco. Silencio AAC por padrao: ver README (decisao).
async function renderVideo(browser, origin) {
  needFfmpeg();
  const file = join(srcDir, `${STORY.file}.html`);
  if (!existsSync(file)) return skipMissing(file);
  let audioPath = null;
  if (opts.audio) {
    audioPath = resolve(process.cwd(), opts.audio);
    if (!existsSync(audioPath)) fail(`trilha nao encontrada: ${audioPath}`);
  }
  const t0 = Date.now();
  const { page, context, problems, label } = await openPage(
    browser,
    origin,
    file,
    { width: STORY.w, height: STORY.h },
    1,
  );
  try {
    throwIfProblems(problems);
    const api = await page.evaluate(() => ({
      duration: window.__duration,
      hasSetTime: typeof window.setTime === 'function',
    }));
    if (!(typeof api.duration === 'number' && api.duration > 0))
      fail(`${label}: window.__duration ausente ou invalido (${api.duration})`);
    if (!api.hasSetTime) fail(`${label}: window.setTime(t) nao esta definido`);
    const frames = Math.round(api.duration * STORY.fps);
    const secs = Number.isInteger(api.duration) ? api.duration : Number(api.duration.toFixed(2));
    const geo = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
    }));
    if (geo.sw > STORY.w || geo.sh > STORY.h)
      fail(
        `${label}: a pagina tem overflow (${geo.sw}x${geo.sh}) alem do palco ${STORY.w}x${STORY.h}`,
      );

    const shot = async (t) => {
      await page.evaluate((time) => window.setTime(time), t);
      return page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' });
    };

    mkdirSync(outDir, { recursive: true });
    const finalPath = join(outDir, `${STORY.file}-${secs}s.mp4`);
    const tmpPath = `${finalPath}.tmp.mp4`;
    const audioInput = audioPath
      ? ['-i', audioPath]
      : [
          '-f',
          'lavfi',
          '-t',
          String(api.duration),
          '-i',
          'anullsrc=channel_layout=stereo:sample_rate=48000',
        ];
    const audioFilter = audioPath
      ? ['-af', `afade=t=out:st=${Math.max(0, api.duration - 1)}:d=1`]
      : [];
    const args = [
      '-v',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(STORY.fps),
      '-c:v',
      'png',
      '-i',
      'pipe:0',
      ...audioInput,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-vf',
      'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '16',
      '-profile:v',
      'high',
      '-r',
      String(STORY.fps),
      '-g',
      '60',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      ...audioFilter,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-t',
      String(api.duration),
      '-movflags',
      '+faststart',
      '-fflags',
      '+bitexact',
      '-flags:v',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      '-map_metadata',
      '-1',
      tmpPath,
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = '';
    let ffExited = false;
    ff.stderr.on('data', (c) => (ffErr += c));
    ff.stdin.on('error', () => {});
    const ffDone = new Promise((done) =>
      ff.on('close', (code) => {
        ffExited = true;
        done(code);
      }),
    );
    ff.on('error', () => {});

    for (let i = 0; i < frames; i++) {
      if (ffExited) break;
      const buf = await shot(i / STORY.fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if ((i + 1) % 100 === 0 || i + 1 === frames)
        process.stdout.write(
          `[marketing]   video: frame ${i + 1}/${frames}\r${i + 1 === frames ? '\n' : ''}`,
        );
    }
    ff.stdin.end();
    const code = await ffDone;
    if (code !== 0) fail(`ffmpeg falhou (codigo ${code}): ${ffErr.trim()}`);
    renameSync(tmpPath, finalPath);

    const coverT = Math.min(coverAt, Math.max(0, api.duration - 1 / STORY.fps));
    if (coverAt > api.duration)
      warn(`--capa ${coverAt} passa da duracao (${api.duration} s); usando ${coverT.toFixed(2)} s`);
    const cover = await shot(coverT);
    const cs = pngSize(cover);
    if (cs.w !== STORY.w || cs.h !== STORY.h)
      fail(`${label}: capa saiu ${cs.w}x${cs.h}, esperado ${STORY.w}x${STORY.h}`);
    writeFileSync(join(outDir, `${STORY.file}-capa.png`), cover);

    const probe = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,r_frame_rate,nb_frames,pix_fmt,codec_name:format=duration',
        '-of',
        'json',
        finalPath,
      ],
      { encoding: 'utf8' },
    );
    let detalhe = `${frames} frames, ${kb(statSync(finalPath).size)}`;
    if (probe.status === 0) {
      const info = JSON.parse(probe.stdout);
      const v = info.streams[0];
      const dur = Number(info.format.duration);
      const [num, den] = v.r_frame_rate.split('/').map(Number);
      const ok =
        v.width === STORY.w &&
        v.height === STORY.h &&
        num / den === STORY.fps &&
        Math.abs(dur - api.duration) < 0.05 &&
        v.pix_fmt === 'yuv420p' &&
        v.codec_name === 'h264';
      if (!ok)
        fail(
          `${label}: ffprobe nao confere: ${v.codec_name} ${v.width}x${v.height} ${v.pix_fmt} ${v.r_frame_rate} ${dur}s (esperado h264 ${STORY.w}x${STORY.h} yuv420p ${STORY.fps} ${api.duration}s)`,
        );
      detalhe += `, ${v.width}x${v.height} ${v.r_frame_rate}fps ${dur.toFixed(2)}s`;
    }
    return [
      { peca: `${STORY.file}-${secs}s.mp4`, detalhe, ms: Date.now() - t0 },
      {
        peca: `${STORY.file}-capa.png`,
        detalhe: `${cs.w}x${cs.h} em t=${coverT.toFixed(2)}s`,
        ms: 0,
      },
    ];
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- orquestracao
function skipMissing(file) {
  const rel = relative(root, file);
  if (explicit) return { peca: rel, erro: 'HTML nao encontrado' };
  warn(`${rel} ainda nao existe; pulado`);
  return { peca: rel, pulado: true };
}

const flat = (r) => (Array.isArray(r) ? r : [r]);
const jobs = [];
if (target === 'lojista' || target === 'tudo')
  jobs.push(['lojista', (b, o) => renderDeck(b, o, 'lojista')]);
if (target === 'cliente' || target === 'tudo')
  jobs.push(['cliente', (b, o) => renderDeck(b, o, 'cliente')]);
if (target === 'instagram' || target === 'tudo') jobs.push(['instagram', renderInstagram]);
if (target === 'video' || target === 'tudo') jobs.push(['video', renderVideo]);

const started = Date.now();
const results = [];
let server;
let browser;
try {
  const { chromium, executablePath } = loadChromium();
  if (jobs.some(([n]) => n === 'instagram' || n === 'video')) needFfmpeg();
  ({ server } = await startServer());
  const origin = `http://127.0.0.1:${server.address().port}`;
  log(
    `servindo ${relative(root, docsRoot)} em ${origin}; saida em ${relative(root, outDir) || '.'}`,
  );
  browser = await chromium.launch({ args: CHROME_ARGS, executablePath });
  for (const [name, job] of jobs) {
    try {
      results.push(...flat(await job(browser, origin)));
    } catch (error) {
      if (!(error instanceof UserError)) error.message = `${error.stack ?? error.message}`;
      results.push({ peca: name, erro: error.message });
    }
  }
} catch (error) {
  console.error(
    `[marketing] ERRO: ${error instanceof UserError ? error.message : (error.stack ?? error)}`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.close();
}

if (results.length) console.log('');
for (const r of results) {
  if (r.pulado) console.log(`  pulado  ${r.peca}`);
  else if (r.erro)
    console.log(`  ERRO    ${r.peca}\n          ${r.erro.replace(/\n/g, '\n          ')}`);
  else
    console.log(`  ok      ${r.peca.padEnd(34)} ${r.detalhe}${r.ms ? `  (${fmtSecs(r.ms)})` : ''}`);
}
const errors = results.filter((r) => r.erro);
const done = results.filter((r) => !r.erro && !r.pulado);
if (results.length)
  console.log(
    `\n[marketing] ${done.length} pecas geradas, ${errors.length} com erro, ${warnings.length} avisos, ${fmtSecs(Date.now() - started)}`,
  );
if (errors.length || process.exitCode) process.exit(1);
if (done.length === 0) process.exit(1); // nada gerado (tudo pulado/ausente) nao e sucesso
