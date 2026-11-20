#!/usr/bin/env node
// Fumaça do app no navegador (DEC-058): cidade > login > loja > produto > sacola, com o Chromium do Playwright.
// Uso (Metro web e API no ar; `pnpm dev` na raiz): `pnpm web:smoke [captura.png]` na raiz
// Variáveis: APP_URL (padrão http://localhost:8081), SMOKE_EMAIL, SMOKE_PASSWORD (cliente de demonstração do seed).
// O Playwright vem do workspace (apps/web); `pnpm web:smoke` o resolve (scripts/web-playwright.mjs), sem instalação global.
const { chromium } = require('playwright');

const APP = (process.env.APP_URL || 'http://localhost:8081').replace(/\/+$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'cliente.ana@seed.webag.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'webag-seed-lojista-2026';
const shot = process.argv[2];

const step = (msg) => console.log(`[web-smoke] ${msg}`);
const id = (testId) => `[data-testid="${testId}"]`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Qualquer console.error (ex.: prop desconhecida no DOM, o defeito do DT-067) acende o aviso vermelho que cobre a tela no modo dev.
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 400)}`);
  });
  page.on('requestfailed', (r) => {
    // imagens do armazenamento local (porta 9000) bloqueadas pelo ORB do Chromium em alguns ambientes: não é falha do app
    if (/ERR_BLOCKED_BY_ORB/.test(r.failure()?.errorText ?? '') && r.resourceType() === 'image') return;
    problems.push(`rede: ${r.method()} ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/v1/')) problems.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`); });
  const click = async (selector, timeout = 30000) => {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector, { timeout });
  };
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 240000 });

    step('escolher cidade');
    await click(id('location.choose-city'), 120000);
    await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30000 });
    await page.locator('[data-testid^="location.city-"]').first().click();
    if (await page.locator(id('location.neighborhood-any')).count().then((n) => n > 0 || false).catch(() => false)) {
      await page.click(id('location.neighborhood-any'));
    } else {
      await page.waitForSelector(id('location.neighborhood-any'), { timeout: 15000 }).then(() => page.click(id('location.neighborhood-any'))).catch(() => undefined);
    }

    step('entrar na conta');
    await click(id('tabs.account'), 60000);
    await click(id('home.login'));
    await page.fill(id('auth.login-email-input'), EMAIL);
    await page.fill(id('auth.login-password-input'), PASSWORD);
    await click(id('auth.login-submit'));

    step('abrir uma loja');
    // depois de entrar o app volta ao início sozinho
    // as telas das abas ficam montadas (e ocultas) por baixo da pilha: só o que está visível conta
    await page.locator('[data-testid^="home.store-"]:visible').first().click({ timeout: 60000 });

    step('abrir um produto');
    await page.locator('[data-testid^="store.product-"]:visible').first().click({ timeout: 60000 });

    step('adicionar à sacola');
    await page.waitForSelector(id('product.add'), { timeout: 60000 });
    // produto com variação obrigatória (cor, tamanho): escolhe a primeira opção de cada grupo
    const options = await page.locator('[data-testid^="product.variant-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'product.variant-error'));
    const picked = new Set();
    for (const testId of options) {
      const group = testId.split('-').slice(0, -1).join('-');
      if (picked.has(group)) continue;
      picked.add(group);
      await page.locator(`[data-testid="${testId}"]:visible`).first().click();
    }
    await click(id('product.add'), 60000);
    await click(id('product.add'));
    // "Adicionado" é transitório; volta à loja e abre a sacola pela barra da loja (recarregar a página sairia da conta: a sessão no navegador fica só na memória)
    await page.waitForFunction(() => /adicionado/i.test(document.querySelector('[data-testid="product.add"]')?.textContent ?? ''), null, { timeout: 30000 });
    await click(id('product.back'));
    await page.locator(`${id('store.cart-bar')}:visible`).first().click({ timeout: 30000 });
    await page.waitForSelector(id('cart.total'), { timeout: 60000 });
    step(`sacola com total: ${(await page.innerText(id('cart.total'))).trim()}`);

    // U8.1: "Ir para o pagamento" abre o Checkout (antes só mostrava um aviso e a compra nunca terminava)
    // A logística do Webag tem horário (BUG-016): fora dele a Sacola só oferece "Escolha como receber" e não abre o checkout
    if (await page.locator(`${id('cart.logistics-banner')}:visible`).count()) {
      step('entregas fechadas agora (BUG-016): checkout não testado neste horário; use pnpm --filter @webag/mobile web:compra retirada-pix');
      if (shot) await page.screenshot({ path: shot });
      if (problems.length) throw new Error(`avisos do navegador:\n${problems.join('\n')}`);
      return;
    }
    step(`ir para o pagamento (botão: "${(await page.locator(`${id('cart.submit')}:visible`).first().innerText()).trim()}")`);
    await click(id('cart.submit'));
    await page.waitForSelector(`${id('checkout.screen')}`, { timeout: 60000 });
    step('checkout aberto');

    if (shot) await page.screenshot({ path: shot });
    if (problems.length) throw new Error(`avisos do navegador:\n${problems.join('\n')}`);
    step('ok');
  } catch (err) {
    console.error(`[web-smoke] url: ${page.url()}; visíveis: ${(await page.locator('[data-testid]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).join(' ').slice(0, 400)}`);
    if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-erro.png') }).catch(() => undefined);
    console.error(`[web-smoke] falhou: ${err.message.split('\n').slice(0, 3).join(' ')}`);
    if (problems.length) console.error(`[web-smoke] avisos do navegador:\n${problems.join('\n')}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
