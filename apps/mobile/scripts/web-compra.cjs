#!/usr/bin/env node
// Compra de ponta a ponta no navegador (U8.1): app web (Metro) + API real local + provedor de pagamento `fake`.
// Três caminhos, todos até o acompanhamento do pedido, com capturas em docs/qa/relatorios/compra-e2e/:
//   entrega-pix   login (cliente do seed) > loja > produto > sacola > checkout > PIX > "Simular pagamento" > Pedido confirmado > acompanhar
//   retirada-pix  cadastro de conta nova a partir da Sacola (volta direto ao checkout, U8.2) > Retirar na loja > PIX > confirmado > código de retirada
//   cartao        login > checkout > cartão (página segura do site, cartão de teste aprovado) > espera > acompanhar
// Uso (API :3000, Metro web :8081 e site :3001 no ar; ver docs/qa/relatorios/setup-do-zero.md):
//   NODE_PATH=$(npm root -g) node apps/mobile/scripts/web-compra.cjs [entrega-pix|retirada-pix|cartao ...]
// Variáveis: APP_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SHOTS_DIR (padrão docs/qa/relatorios/compra-e2e, relativo à raiz do repositório), VIEWPORT (390x844 padrão).
// A confirmação do pagamento vem do servidor (rota de simulação da API, só dev); o app nunca marca como pago.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const APP = (process.env.APP_URL || 'http://localhost:8081').replace(/\/+$/, '');
const EMAIL = process.env.SMOKE_EMAIL || 'cliente.ana@seed.webag.local';
const PASSWORD = process.env.SMOKE_PASSWORD || 'webag-seed-lojista-2026';
const [W, H] = (process.env.VIEWPORT || '390x844').split('x').map(Number);
const SHOTS = process.env.SHOTS_DIR || path.resolve('docs/qa/relatorios/compra-e2e');
const wanted = process.argv.slice(2);

const id = (testId) => `[data-testid="${testId}"]`;
const log = (msg) => console.log(`[compra] ${msg}`);

async function newSession(browser) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    // 4xx esperados do próprio fluxo (sem sessão, sacola vazia) não são falha; 5xx sim
    if (r.status() >= 500 && r.url().includes('/v1/')) problems.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`);
  });
  return { context, page, problems };
}

const visible = (page, testId, timeout = 60000) => page.locator(`${id(testId)}:visible`).first().waitFor({ timeout });
const click = async (page, testId, timeout = 60000) => {
  const el = page.locator(`${id(testId)}:visible`).first();
  await el.waitFor({ timeout });
  await el.click({ timeout });
};

async function chooseCity(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await click(page, 'location.choose-city', 120000);
  await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30000 });
  await page.locator('[data-testid^="location.city-"]').first().click();
  await page.waitForSelector(id('location.neighborhood-any'), { timeout: 20000 });
  await page.click(id('location.neighborhood-any'));
}

/** Loja > produto > sacola: escolhe a 1ª opção de cada variação obrigatória. Termina na Sacola. */
async function fillCart(page, { pickup = false } = {}) {
  // Retirada: o Início só lista as lojas que retiram (nem toda loja retira)
  if (pickup) await click(page, 'home.mode-pickup');
  await page.locator('[data-testid^="home.store-"]:visible').first().click({ timeout: 90000 });
  await page.locator('[data-testid^="store.product-"]:visible').first().click({ timeout: 60000 });
  await page.waitForSelector(id('product.add'), { timeout: 60000 });
  const options = await page.locator('[data-testid^="product.variant-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'product.variant-error'));
  const picked = new Set();
  for (const testId of options) {
    const group = testId.split('-').slice(0, -1).join('-');
    if (picked.has(group)) continue;
    picked.add(group);
    await page.locator(`[data-testid="${testId}"]:visible`).first().click();
  }
  await click(page, 'product.add');
  // a conta já tinha sacola de outra loja (corridas anteriores): uma loja por pedido, o app pergunta; aqui esvazia e continua
  const switchClear = page.locator(`${id('cart.switch-clear')}:visible`);
  if (await switchClear.first().waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await switchClear.first().click();
    // depois de esvaziar o app adiciona o item; se o selo "Adicionado" já passou, a conferência abaixo usa a sacola
    await page.waitForTimeout(2500);
  }
  // o selo "Adicionado" é transitório; quem confirma é a barra da sacola na loja (abaixo)
  await page.waitForFunction(() => /adicionado/i.test(document.querySelector('[data-testid="product.add"]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
  await click(page, 'product.back');
  await page.locator(`${id('store.cart-bar')}:visible`).first().click({ timeout: 30000 });
  await visible(page, 'cart.total');
}

async function login(page) {
  await page.fill(id('auth.login-email-input'), EMAIL);
  await page.fill(id('auth.login-password-input'), PASSWORD);
  await click(page, 'auth.login-submit');
}

/** Entrega sem endereço salvo no aparelho: o checkout leva ao formulário; preenche à mão (sem depender do CEP externo). */
async function ensureAddress(page) {
  const form = page.locator(`${id('address.cep-input')}:visible`);
  const shown = await form.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (!shown) return false;
  log('sem endereço no aparelho: preenchendo o formulário');
  await form.first().fill('07700-000');
  const fill = async (testId, value) => {
    const el = page.locator(`${id(testId)}:visible`).first();
    if (!(await el.inputValue())) await el.fill(value);
  };
  await page.waitForTimeout(2500); // dá tempo da busca do CEP preencher rua e bairro, se houver
  await fill('address.street-input', 'Rua Teste');
  await fill('address.district-input', 'Centro');
  await fill('address.number-input', '100');
  await click(page, 'address.submit');
  await visible(page, 'checkout.screen');
  return true;
}

/** Checkout aberto: escolhe o modo, o meio de pagamento e confirma. */
async function pickMode(page, mode) {
  await visible(page, 'checkout.screen');
  await click(page, `checkout.mode-${mode}`);
}

async function payPixAndTrack(page, shot, { pickup }) {
  await click(page, 'checkout.pay-pix');
  // CPF: só aparece quando o servidor pede; o do seed é válido e fictício
  const cpf = page.locator(`${id('checkout.cpf-input')}:visible`);
  if (await cpf.count()) await cpf.first().fill('52998224725');
  await shot('03-checkout');
  await click(page, 'checkout.submit');
  // entrega sem endereço no aparelho: o botão leva ao formulário; salvo, volta ao checkout e paga
  if (!pickup && (await ensureAddress(page))) {
    await click(page, 'checkout.pay-pix');
    await click(page, 'checkout.submit');
  }
  await visible(page, 'pix.screen');
  await visible(page, 'pix.code');
  await shot('04-pix');
  log('PIX gerado; aprovando no provedor simulado (botão "Simular pagamento")');
  await click(page, 'pix.simulate');
  await visible(page, 'confirmed.title', 120000);
  await visible(page, 'confirmed.order-number');
  if (pickup) await visible(page, 'confirmed.pickup-code');
  await page.waitForTimeout(4500); // celebração e avisos (toast de 4 s) terminam: a captura mostra a tela em repouso
  await shot('05-pedido-confirmado');
  await click(page, 'confirmed.track');
  await visible(page, 'order.screen');
  await visible(page, 'order.timeline');
  await shot('06-acompanhamento');
}

/** A logística do Webag tem horário (BUG-016): fora dele a Sacola oferece só "Escolha como receber". Não é falha do app: o caminho de entrega é pulado e o de retirada segue. */
class Skip extends Error {}
async function skipIfLogisticsClosed(page) {
  if (await page.locator(`${id('cart.logistics-banner')}:visible`).count()) throw new Skip('entregas fechadas ou pausadas agora (BUG-016); rode no horário da logística ou use retirada');
}

const flows = {
  async 'entrega-pix'(page, shot) {
    await chooseCity(page);
    await click(page, 'tabs.account', 60000);
    await click(page, 'home.login');
    await login(page);
    await fillCart(page);
    await shot('01-sacola');
    await skipIfLogisticsClosed(page);
    await click(page, 'cart.submit');
    await visible(page, 'checkout.screen');
    // prova do U8.1: a Sacola abriu o checkout; o aviso antigo não existe mais
    if ((await page.getByText('O pagamento fica disponível na próxima etapa do app.').count()) > 0) throw new Error('aviso antigo ainda na tela');
    await pickMode(page, 'delivery');
    await shot('02-checkout-entrega');
    await payPixAndTrack(page, shot, { pickup: false });
  },

  async 'retirada-pix'(page, shot) {
    await chooseCity(page);
    await fillCart(page, { pickup: true });
    await shot('01-sacola-visitante');
    // visitante: "Ir para o pagamento" > criar conta; depois de criar volta ao checkout, sem passar pela Sacola (U8.2)
    await click(page, 'cart.submit');
    const stamp = Date.now().toString(36);
    await page.fill(id('auth.signup-name-input'), 'Cliente Teste Webag');
    await page.fill(id('auth.signup-email-input'), `e2e.${stamp}@gmail.com`);
    await page.fill(id('auth.signup-phone-input'), '11999998888');
    await page.fill(id('auth.password-input'), 'Cachorro-Azul-2024');
    await page.fill(id('auth.password-confirm-input'), 'Cachorro-Azul-2024');
    await click(page, 'auth.terms-checkbox');
    await shot('02-cadastro');
    await click(page, 'auth.signup-submit');
    await visible(page, 'checkout.screen', 90000);
    await pickMode(page, 'pickup');
    await visible(page, 'checkout.pickup-info');
    await payPixAndTrack(page, shot, { pickup: true });
  },

  async cartao(page, shot, ctx) {
    // Retirada: o cartão não depende de endereço nem do horário da logística; o meio de pagamento é o mesmo na entrega
    await chooseCity(page);
    await click(page, 'tabs.account', 60000);
    await click(page, 'home.login');
    await login(page);
    await click(page, 'tabs.home', 60000).catch(() => undefined);
    await fillCart(page, { pickup: true });
    await click(page, 'cart.submit');
    await visible(page, 'checkout.screen');
    await pickMode(page, 'pickup');
    await click(page, 'checkout.pay-card');
    await visible(page, 'checkout.card-secure-note');
    const cpf = page.locator(`${id('checkout.cpf-input')}:visible`);
    if (await cpf.count()) await cpf.first().fill('52998224725');
    await shot('03-checkout-cartao');
    // a página segura abre em outra aba (o app não vê o cartão)
    const popup = ctx.waitForEvent('page', { timeout: 120000 });
    popup.catch(() => undefined);
    await click(page, 'checkout.submit');
    const secure = await popup;
    await secure.waitForLoadState('domcontentloaded');
    await secure.locator(id('public.cartao.fake-banner')).waitFor({ timeout: 60000 });
    await secure.locator(id('public.cartao.fake-fake_tok_approved')).check();
    await secure.screenshot({ path: path.join(SHOTS, `cartao-${W}x${H}-04-pagina-segura.png`) });
    await secure.locator(id('public.cartao.submit')).click();
    await secure.locator(`${id('public.cartao.back-to-app')}, ${id('public.cartao.fake-error')}`).first().waitFor({ timeout: 60000 }).catch(async () => {
      await secure.screenshot({ path: path.join(SHOTS, `cartao-${W}x${H}-FALHA-pagina-segura.png`) });
      throw new Error('a página segura não confirmou o cartão de teste');
    });
    if (await secure.locator(id('public.cartao.fake-error')).count()) throw new Error(`cartão de teste recusado: ${await secure.locator(id('public.cartao.fake-error')).innerText()}`);
    await secure.screenshot({ path: path.join(SHOTS, `cartao-${W}x${H}-05-pagina-segura-aprovado.png`) });
    await secure.close();
    // o app só segue quando o SERVIDOR mostra o pedido: espera, depois acompanha
    await page.bringToFront();
    // quem confirma é o servidor: o app só muda de tela quando o pedido existe
    await visible(page, 'confirmed.title', 120000);
    await visible(page, 'confirmed.order-number');
    await page.waitForTimeout(4500);
    await shot('05-pedido-confirmado');
    await click(page, 'confirmed.track');
    await visible(page, 'order.screen');
    await visible(page, 'order.timeline');
    await shot('06-acompanhamento');
  },
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const names = wanted.length ? wanted : Object.keys(flows);
  const browser = await chromium.launch();
  let failed = 0;
  for (const name of names) {
    const { context, page, problems } = await newSession(browser);
    const shot = (label) => page.screenshot({ path: path.join(SHOTS, `${name}-${W}x${H}-${label}.png`) });
    try {
      log(`caminho ${name}`);
      await flows[name](page, shot, context);
      if (problems.length) log(`avisos do navegador (não falham o caminho):\n  ${problems.slice(0, 5).join('\n  ')}`);
      log(`OK ${name}`);
    } catch (e) {
      if (e instanceof Skip) {
        console.log(`[compra] PULADO ${name}: ${e.message}`);
        await context.close();
        continue;
      }
      failed += 1;
      await shot('FALHA').catch(() => undefined);
      console.error(`[compra] FALHA ${name}: ${e.message}`);
      if (problems.length) console.error(problems.slice(0, 8).join('\n'));
    }
    await context.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
