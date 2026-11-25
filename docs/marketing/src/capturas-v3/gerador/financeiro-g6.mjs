// G6 (P13): Resumo de "Hoje" da Moda Passo Firme (R$ 1.000,00 em 5 pedidos, ver vendas-redondas.mjs). Sobrescreve painel-financeiro-desk.jpg.
import { launch, painelLogin, painelGo, HIDE_ALERT } from '../../capturas/gerador/lib.mjs';
import { salvar } from './salvar.mjs';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await painelLogin(page, 'lojista.moda-passo-firme@seed.webag.local');
await painelGo(page, '/lojista/financeiro', false);
await page.addStyleTag({ content: HIDE_ALERT });
await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert')));
await page.getByTestId('lojista.financeiro.period-today').click();
await page.waitForTimeout(2500);
await salvar(page, 'painel-financeiro-desk');
await b.close();
