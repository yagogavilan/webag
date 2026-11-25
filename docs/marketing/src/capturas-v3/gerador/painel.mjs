// Capturas do painel do lojista (1440x900 e 390x844, 2x). Pre-requisitos: API 3300, site/painel 3301 (STORAGE_ORIGIN=http://127.0.0.1:19000),
// s3shim.mjs (v3) em 19000, `node preparar-dados.mjs` e `node pedidos.mjs`. Uso: node painel.mjs [desk|mob]
import { readFileSync } from 'node:fs';
import { launch, painelLogin, painelGo, HIDE_ALERT, sql } from '../../capturas/gerador/lib.mjs';
import * as P from '../../capturas/gerador/pedido.mjs';
import { salvar } from './salvar.mjs';
const VIEWS = { desk: { width: 1440, height: 900 }, mob: { width: 390, height: 844 } };
const only = process.argv[2];
const MODA = '8ab41b27-6685-4a95-958a-48b1dbdb0a3f';
// rascunhos de execucoes anteriores saem da lista
sql(`update products set name=case when name='' then 'descartado' else name end, status='archived', archived_at=now() where store_id='${MODA}' and status='draft'`);
// pedidos ativos com horario recente (evita "ha 8 min" em alerta): desloca todos os carimbos de tempo do pedido
function refrescar() {
  const ped = JSON.parse(readFileSync('/tmp/webag-mkt/v3/pedidos.json', 'utf8'));
  const cols = sql(`select column_name from information_schema.columns where table_name='orders' and data_type like 'timestamp%' and column_name not in ('updated_at')`).split('\n');
  [[ped.novo, 1], [ped.separando, 2], [ped.aCaminho, 3], [ped.pronto, 3]].forEach(([id, min]) => {
    const sets = cols.map((c) => `${c} = ${c} + off.d`).join(', ');
    sql(`update orders o set ${sets} from (select (now() - interval '${min} minutes' - created_at) as d from orders where id='${id}') off where o.id='${id}'`);
  });
}
refrescar();
const b = await launch();
for (const [vp, size] of Object.entries(VIEWS)) {
  if (only && only !== vp) continue;
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', hasTouch: vp === 'mob' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await painelLogin(page, P.MERCHANT);
  const free = async () => { await page.addStyleTag({ content: HIDE_ALERT }); await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'))); };
  const go = async (rota) => { await painelGo(page, rota, false); await free(); await page.waitForTimeout(1500); };
  const shot = async (nome) => { await page.waitForTimeout(500); await salvar(page, `painel-${nome}-${vp}`); };
  const scrollTo = async (y) => { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(400); };

  // pedidos: novo / em separacao / pronto (a fila mostra os tres estados)
  await go('/lojista/pedidos');
  await shot('pedido-novo');
  if (vp === 'mob') { await page.getByText(/^Prontos \(\d+\)/).first().click(); await page.waitForTimeout(800); }
  else await scrollTo(260);
  await shot('pronto-coleta');
  await scrollTo(0);

  // lista de produtos
  await go('/lojista/produtos');
  await scrollTo(vp === 'desk' ? 190 : 0);
  await shot('produtos-lista');

  // tabela de precos e estoque
  await go('/lojista/produtos/precos');
  await scrollTo(vp === 'desk' ? 190 : 0);
  await shot('precos-estoque');

  // adicionar varios: lista colada e ja lida
  await go('/lojista/produtos/adicionar-varios');
  await page.getByTestId('lojista.colar.text').fill(['Jaqueta jeans M R$ 150,00 6 un', 'Moletom canguru G R$ 100,00 15 un', 'Saia midi plissada M R$ 90,00 5 un', 'Camisa social G R$ 90,00 12 un', 'Meia cano alto R$ 20,00 30 un'].join('\n'));
  await page.waitForTimeout(500);
  await page.getByTestId('lojista.colar.read').click();
  await page.getByTestId('lojista.colar.review').waitFor();
  await page.waitForTimeout(1200);
  await scrollTo(vp === 'desk' ? 130 : 0);
  await shot('adicionar-varios');

  // cadastro rapido: foto + nome + preco
  await go('/lojista/produtos/novo');
  await page.waitForURL(/novo\/[0-9a-f-]+/);
  await free();
  await page.getByTestId('lojista.rapido.gallery-input').setInputFiles('/tmp/webag-mkt/v3/moletom.jpg');
  await page.getByTestId('lojista.rapido.name').fill('Moletom cinza');
  await page.getByTestId('lojista.rapido.price').fill('100,00');
  await page.getByTestId('lojista.rapido.stock').fill('15').catch(() => {});
  await page.getByTestId('lojista.rapido.category').selectOption({ label: 'Moda e calçados › Roupas' });
  await page.waitForTimeout(3500);
  await scrollTo(vp === 'desk' ? 470 : 330);
  await shot('cadastro-rapido');

  // financeiro de hoje e extrato
  await go('/lojista/financeiro');
  await page.getByRole('button', { name: 'Hoje', exact: true }).click().catch(async () => { await page.getByText('Hoje', { exact: true }).first().click(); });
  await page.waitForTimeout(2000);
  await shot('financeiro');
  await page.getByText('Extrato', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await shot('extrato');
  await ctx.close();
}
await b.close();
