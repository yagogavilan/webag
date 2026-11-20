#!/usr/bin/env node
// Scripts de navegador que usam o Playwright do WORKSPACE (apps/web já o tem como dependência: `@playwright/test`),
// sem exigir instalação global (BUG-028b/c). Uso, pela raiz:
//   pnpm web:compra [entrega-pix|retirada-pix|cartao ...]   compra de ponta a ponta no app web (apps/mobile/scripts/web-compra.cjs)
//   pnpm web:smoke [captura.png]                            fumaça do app web (apps/mobile/scripts/web-smoke.cjs)
//   pnpm web:e2e [fake|real|all]                            Playwright do site/painéis (apps/web): `fake` = API falsa, `real` = API real
//                                                           (precisa do `pnpm run setup` e da API no ar); `all` (padrão) roda os dois, um depois do outro
// Variáveis (opcionais): PW_CHANNEL=chrome (só para `web:e2e`: usa o Chrome instalado em vez do Chromium do Playwright; compra e smoke exigem o Chromium),
//   E2E_WEB_PORT (site na suíte `fake`, padrão 3101), REAL_WEB_PORT (site na suíte `real`, padrão 3101), E2E_API_PORT (API falsa, padrão 3999).
//   Uma porta fora de 3001/3101/8081 precisa entrar em CORS_ORIGINS (upload de foto) e a API/storage-init reiniciados.
// Antes de cada suíte o script espera a porta do site ficar livre (o servidor da suíte anterior leva alguns segundos para soltá-la),
// que era a causa do "EADDRINUSE" em duas execuções seguidas.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'apps/web');
const isWindows = process.platform === 'win32';
const [mode, ...args] = process.argv.slice(2);

const fail = (message) => {
  console.error(`[web-playwright] ERRO: ${message}`);
  process.exit(1);
};

const SCRIPTS = { compra: 'apps/mobile/scripts/web-compra.cjs', smoke: 'apps/mobile/scripts/web-smoke.cjs' };
if (!['compra', 'smoke', 'e2e'].includes(mode ?? '')) fail('uso: node scripts/web-playwright.mjs <compra|smoke|e2e> [argumentos]');

// Playwright do workspace: `@playwright/test` de apps/web; o pacote `playwright` (que os scripts .cjs usam) vem junto, ao lado dele.
let playwrightModules;
try {
  const requireFromWeb = createRequire(join(webDir, 'package.json'));
  const testPackage = requireFromWeb.resolve('@playwright/test/package.json');
  const requireFromTest = createRequire(testPackage);
  playwrightModules = dirname(dirname(requireFromTest.resolve('playwright/package.json')));
} catch {
  fail('Playwright não encontrado no workspace. Rode `pnpm install` na raiz (apps/web depende de @playwright/test).');
}

function chromiumMissing() {
  const requireFromWeb = createRequire(join(webDir, 'package.json'));
  const { chromium } = requireFromWeb('@playwright/test');
  return !existsSync(chromium.executablePath());
}

function isPortFree(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.once('listening', () => server.close(() => done(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function waitPortFree(port, label) {
  const until = Date.now() + 90_000;
  let warned = false;
  while (!(await isPortFree(port))) {
    if (Date.now() > until) fail(`a porta ${port} (${label}) continua ocupada há 90 s. Pare o servidor que a usa ou defina outra porta por variável.`);
    if (!warned) console.log(`[web-playwright] aguardando a porta ${port} (${label}) ficar livre...`);
    warned = true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
}

function run(command, commandArgs, options) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', shell: isWindows, ...options });
    child.on('error', (error) => fail(`não consegui executar "${command}": ${error.message}`));
    child.on('exit', (code) => done(code ?? 1));
  });
}

if (mode === 'compra' || mode === 'smoke') {
  if (chromiumMissing()) {
    fail('o navegador do Playwright não está instalado. Rode `pnpm --filter @webag/web exec playwright install chromium` (uma vez) e tente de novo.');
  }
  const nodePath = [playwrightModules, process.env.NODE_PATH].filter(Boolean).join(isWindows ? ';' : ':');
  const code = await run(process.execPath, [join(root, SCRIPTS[mode]), ...args], { cwd: root, env: { ...process.env, NODE_PATH: nodePath } });
  process.exit(code);
}

// mode === 'e2e'
const which = args[0] ?? 'all';
if (!['fake', 'real', 'all'].includes(which)) fail('uso: pnpm web:e2e [fake|real|all]');
const suites = [];
if (which !== 'real') suites.push({ name: 'API falsa', args: ['exec', 'playwright', 'test'], port: Number(process.env.E2E_WEB_PORT ?? 3101) });
if (which !== 'fake') suites.push({ name: 'API real', args: ['exec', 'playwright', 'test', '-c', 'playwright.real.config.ts'], port: Number(process.env.REAL_WEB_PORT ?? 3101) });

let exitCode = 0;
for (const suite of suites) {
  await waitPortFree(suite.port, `site, suíte ${suite.name}`);
  console.log(`[web-playwright] suíte ${suite.name} (site na porta ${suite.port})`);
  const code = await run('pnpm', suite.args, { cwd: webDir });
  if (code !== 0) exitCode = code;
}
// espera o último servidor soltar a porta, para a próxima execução (outra suíte, outro comando) não esbarrar nela
for (const suite of suites.slice(-1)) await waitPortFree(suite.port, `site, suíte ${suite.name}`);
process.exit(exitCode);
