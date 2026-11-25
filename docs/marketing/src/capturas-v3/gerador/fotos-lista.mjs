// P6: passo "Fotos" do "Adicionar vários" (celular), com a lista de P4. Cria os rascunhos pelo fluxo normal do painel, na Moda Passo Firme
// (loja de apoio, para não poluir a Moda Express Franco). Salva painel-fotos-lista-mob.jpg.
import { launch, painelLogin, painelGo, HIDE_ALERT } from '../../capturas/gerador/lib.mjs';
import { salvar } from './salvar.mjs';
const LINHAS = ['Camiseta básica preta 60,00 - 10 un', 'Vaso de cerâmica 80,00 - 4 un', 'Calça jeans 130,00 - 3 un', 'Toalha de banho 40,00 - 8 un', 'Luminária de mesa 150,00 - 2 un', 'Tênis casual 200,00 - 5 un'];
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
await painelLogin(page, 'lojista.moda-passo-firme@seed.webag.local');
const free = async () => { await page.addStyleTag({ content: HIDE_ALERT }); await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'))); };
await painelGo(page, '/lojista/produtos/adicionar-varios', false);
await free();
await page.getByTestId('lojista.colar.text').fill(LINHAS.join('\n'));
await page.getByTestId('lojista.colar.read').click();
await page.getByTestId('lojista.colar.review').waitFor();
await page.waitForTimeout(1000);
await page.getByTestId('lojista.colar.create').click();
await page.getByTestId('lojista.colar.photos').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await free();
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
await salvar(page, 'painel-fotos-lista-mob');
await b.close();
