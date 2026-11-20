#!/usr/bin/env node
// SEC-166 / WB-214 de ponta a ponta PELA PÁGINA PÚBLICA contra a API real: /excluir-conta (via A: e-mail > código lido no Mailpit > revisão > confirmação; depois o
// arrependimento com a senha). Pré: API real (TRUST_PROXY=1) + painel web em build de produção (`next start`, ver playwright.real.config.ts) em WEB_URL.
// Uso: WEB_URL=http://localhost:3101 API_URL=http://localhost:3400 node docs/qa/retestes/excluir-conta-web.mjs
import { createRequire } from 'node:module';
import { newCustomer, sql, sleep } from './lib.mjs';
const { chromium } = createRequire(new URL('../../../apps/web/package.json', import.meta.url))('@playwright/test');
const WEB = process.env.WEB_URL ?? 'http://localhost:3101';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const results = [];
const check = (id, title, pass, evidence = '') => { results.push(pass); console.log(`${pass ? 'PASS ' : 'FALHA'} ${id} | ${title}${evidence ? `  [${evidence}]` : ''}`); };
const tid = (page, id) => page.getByTestId(`public.excluir.${id}`);

const customer = await newCustomer();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const context = await browser.newContext({ locale: 'pt-BR' });
const page = await context.newPage();
const before = ((await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${customer.email}`)}`)).json()).messages ?? []).length;
await page.goto(`${WEB}/excluir-conta`);
check('EXCLWEB-0', 'a página pública abre sem login, com o formulário de e-mail e os prazos', await tid(page, 'email-input').isVisible(), (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 120));
await tid(page, 'email-input').fill(customer.email);
await tid(page, 'send-code').click();
await tid(page, 'notice').waitFor();
check('EXCLWEB-1', 'a resposta do 1º passo não revela se a conta existe', /Se existir uma conta com esse e-mail/.test(await tid(page, 'notice').innerText()), await tid(page, 'notice').innerText());
let code;
for (let i = 0; i < 30 && !code; i++) {
  const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${customer.email}`)}`)).json();
  if ((found.messages ?? []).length > before) code = (found.messages.find((m) => /\b\d{6}\b/.test(m.Subject))?.Subject.match(/\b(\d{6})\b/) ?? [])[1];
  if (!code) await sleep(300);
}
check('EXCLWEB-2', 'o código de 6 dígitos chega ao e-mail do dono', Boolean(code));
await page.getByLabel('Dígito 1 de 6').pressSequentially(code ?? '000000');
await tid(page, 'delete-submit').waitFor({ timeout: 15_000 });
check('EXCLWEB-3', 'com o código certo a revisão aparece (o que será apagado, o que a lei obriga reter, prazos)', await tid(page, 'delete-submit').isVisible(), (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200));
await tid(page, 'delete-submit').click();
await page.getByRole('alertdialog').waitFor();
await tid(page, 'delete-confirm').click();
await tid(page, 'done').waitFor({ timeout: 15_000 });
const status = sql(`select status from users where email = '${customer.email}'`);
check('EXCLWEB-4', 'a exclusão fecha a conta (users.status = deleted, pendente 72 h) e a página não cria sessão nem cookie', /Sua conta foi fechada/.test(await tid(page, 'done').innerText()) && status === 'deleted' && (await context.cookies()).length === 0, `status=${status}; cookies=${(await context.cookies()).length}; ${await tid(page, 'done').innerText()}`.slice(0, 260));
await tid(page, 'cancel-email').fill(customer.email);
await tid(page, 'cancel-password').fill('webag-seed-lojista-2026');
await tid(page, 'cancel-submit').click();
await tid(page, 'cancel-done').waitFor({ timeout: 15_000 });
check('EXCLWEB-5', 'arrependimento pela mesma página: com a senha certa a exclusão é cancelada e a conta volta a active', /A exclusão foi cancelada/.test(await tid(page, 'cancel-done').innerText()) && sql(`select status from users where email = '${customer.email}'`) === 'active', await tid(page, 'cancel-done').innerText());
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
