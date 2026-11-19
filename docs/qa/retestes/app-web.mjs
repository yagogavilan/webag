#!/usr/bin/env node
// Smoke do APP (Expo no navegador, react-native-web) contra a API REAL: `pnpm web` + este script. Não substitui o aparelho real (toque, GPS, câmera, push, teclado).
// Uso: EXPO_PUBLIC_API_URL=http://localhost:3400 pnpm --filter @webag/mobile exec expo start --web --port 8091 ; node docs/qa/retestes/app-web.mjs
// Variáveis: APP_URL (padrão http://localhost:8091), API_URL, OUT (pasta das capturas). A API precisa liberar a origem do app no CORS_ORIGINS.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(new URL('../../../apps/web/package.json', import.meta.url))('@playwright/test');
const APP = process.env.APP_URL ?? 'http://localhost:8091';
const OUT = process.env.OUT ?? new URL('./resultados/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (id, title, pass, evidence = '') => { results.push({ id, pass }); console.log(`${pass ? 'PASS ' : 'FALHA'} ${id} | ${title}${evidence ? `  [${evidence}]` : ''}`); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', geolocation: { latitude: -23.2801, longitude: -46.744 }, permissions: ['geolocation'] });
const page = await context.newPage();
const api = [];
const consoleErrors = [];
const failed = [];
page.on('response', (r) => { if (r.url().includes('/v1/')) api.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ''), status: r.status() }); });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 100)} ${r.failure()?.errorText}`));

await page.goto(APP, { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}app-web-localizacao.png` });
check('APPWEB-0', 'primeira tela pergunta onde receber (localização, CEP ou cidade), sem tela em branco', /Onde você quer receber/i.test(await page.locator('body').innerText()));
// Visitante: a localização do navegador headless e o ViaCEP (terceiro, sem rede aqui) não servem: escolhe a cidade e o bairro, como quem não dá a localização.
await page.getByText(/Escolher a cidade/i).first().click();
await page.getByText(/Francisco Morato/i).first().click();
await page.waitForTimeout(1500);
await page.getByText(/Qualquer bairro de Francisco Morato/i).first().click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}app-web-home.png` });
const homeCalls = api.filter((a) => /\/v1\/(home|search|browse|banners|categories|regions)/.test(a.url));
check('APPWEB-1', 'o app abre no navegador e chama a API real (home, categorias, banners) com 200', homeCalls.length > 0 && homeCalls.every((a) => a.status === 200), homeCalls.slice(0, 6).map((a) => `${a.status} ${a.url.slice(0, 50)}`).join(' | '));
const text = await page.locator('body').innerText();
check('APPWEB-2', 'a home mostra lojas reais do seed (Mercadinho Boa Compra)', /Mercadinho Boa Compra/i.test(text) || /Padaria/i.test(text), text.replace(/\s+/g, ' ').slice(0, 160));
check('APPWEB-3', 'nenhuma requisição bloqueada (CORS) nem erro de console grave na abertura', failed.filter((f) => !/ERR_ABORTED|favicon|font/i.test(f)).length === 0, `falhas=${failed.slice(0, 3).join(' | ')}; console=${consoleErrors.slice(0, 2).join(' | ')}`);
const storeLink = page.getByText(/Mercadinho Boa Compra/i).first();
if (await storeLink.count()) {
  await storeLink.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}app-web-loja.png` });
  const storeText = await page.locator('body').innerText();
  check('APPWEB-4', 'a página da loja abre com produtos e o preço do servidor', /R\$/.test(storeText) && api.some((a) => /\/v1\/browse\/stores\/.+\/products/.test(a.url) && a.status === 200), storeText.replace(/\s+/g, ' ').slice(0, 160));
} else check('APPWEB-4', 'a página da loja abre', false, 'cartão da loja não encontrado na home');
console.log(`  [info] chamadas à API: ${api.length}; 4xx/5xx: ${api.filter((a) => a.status >= 400).map((a) => `${a.status} ${a.url.slice(0, 60)}`).join(' | ') || 'nenhuma'}`);
await browser.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
