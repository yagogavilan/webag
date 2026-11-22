import { expect, test, type Page } from '@playwright/test';
import { loginLojista, seedMerchant } from './helpers';

/**
 * QA "Reteste 2" (HEAD 5d09e97): vizinhas independentes das correções do BUG-043 (lista no celular), BUG-045 (Apagar repetido) e BUG-046 (API falsa).
 * Medidas no build de produção, com a API falsa. Só leitura de layout e fluxo; nenhuma regra de negócio.
 */
const NAMES = ['Caneca Esmaltada', 'Garrafa Térmica', 'Boné Aba Reta', 'Camiseta Básica', 'Mochila Urbana'];
const csvOf = (names: string[], code = 'C') => ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', ...names.map((n, i) => `${n};Casa;;${20 + i},90;;;;;;${5 + i};${code}-${i}`)].join('\r\n');

async function importCsv(page: Page, names: string[], code = 'C'): Promise<void> {
  await page.goto('/lojista/produtos/importar');
  await page.getByTestId('lojista.importar.file-input').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csvOf(names, code), 'utf-8') });
  await page.getByTestId('lojista.importar.import-submit').click();
  await expect(page.getByTestId('lojista.importar.result')).toBeVisible();
}

async function publishAll(page: Page, storeId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const call = (pid: string, method: string, path: string, body: unknown) =>
      fetch(`/api/proxy/lojista/stores/${id}/products/${pid}${path}`, { method, headers: { 'content-type': 'application/json', 'x-webag-client': 'web' }, body: JSON.stringify(body) });
    const list = (await (await fetch(`/api/proxy/lojista/stores/${id}/products?limit=50`)).json()) as { data: { id: string }[] };
    for (const { id: pid } of list.data) {
      await call(pid, 'PATCH', '', { categoryId: 'cat-1' });
      await call(pid, 'PUT', '/images', { imageIds: ['asset-x'] });
      await call(pid, 'POST', '/publish', {});
    }
  }, storeId);
}

for (const vp of [
  { name: 'celular de entrada 360x640', width: 360, height: 640, compact: true },
  { name: 'celular 390x844', width: 390, height: 844, compact: true },
  { name: 'computador 1280x800', width: 1280, height: 800, compact: false },
]) {
  test.describe(`BUG-043 ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('lista de produtos: linha compacta, "Mais" e menu da linha alcançáveis e dentro da tela; no computador nada muda', async ({ page }) => {
      const merchant = await seedMerchant();
      await loginLojista(page, merchant.email, merchant.password);
      await importCsv(page, NAMES);
      await publishAll(page, merchant.storeId);
      await page.goto('/lojista/produtos');
      const rows = page.locator('tr[data-testid^="lojista.produtos.row-"]');
      await expect(rows).toHaveCount(5);
      const first = rows.first();
      const id = ((await first.getAttribute('data-testid')) ?? '').replace('lojista.produtos.row-', '');
      const dupInline = page.getByTestId(`lojista.produtos.row-${id}-duplicate`);
      const more = page.getByTestId(`lojista.produtos.row-${id}-more`);
      const headerMore = page.getByTestId('lojista.produtos.more');

      if (vp.compact) {
        const addTop = (await page.getByTestId('lojista.produtos.add').boundingBox())?.y ?? vp.height;
        let whole = 0;
        const heights: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const box = (await rows.nth(i).boundingBox())!;
          heights.push(Math.round(box.height));
          if (box.y + box.height <= Math.min(addTop, vp.height - 72)) whole += 1;
        }
        console.log(`QA-R2 ${vp.name}: alturas ${heights.join(',')} inteiros_na_1a_tela=${whole} addTop=${Math.round(addTop)}`);
        for (const h of heights) expect(h).toBeLessThanOrEqual(100);
        if (vp.height >= 800) expect(whole).toBeGreaterThanOrEqual(3);
        else expect(whole, '360x640: pelo menos 1 inteiro').toBeGreaterThanOrEqual(1);
        // a linha não tem rolagem horizontal e o menu da linha tem alvo de 44 px
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const mb = (await more.boundingBox())!;
        expect([mb.width >= 44, mb.height >= 44]).toEqual([true, true]);
        await expect(dupInline).toBeHidden();
        // menu da linha: abre dentro da tela e "Duplicar" cria a cópia e leva à edição
        let dupCalls = 0;
        await page.route('**/products/*/duplicate', async (route) => {
          dupCalls += 1;
          expect(route.request().headers()['idempotency-key']).toMatch(/^dup-/);
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'copia-qa', name: 'Cópia QA' }) });
        });
        await more.click();
        const menu = page.getByRole('menu', { name: /Mais ações de/ });
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(more).toBeFocused();
        await more.click();
        await page.getByRole('menuitem', { name: 'Duplicar' }).click();
        await expect(page).toHaveURL(/\/lojista\/produtos\/novo\/copia-qa\?camera=1/);
        expect(dupCalls).toBe(1);
        // "Mais" do cabeçalho: 4 destinos
        await page.goto('/lojista/produtos');
        await headerMore.click();
        const hm = page.getByRole('menu', { name: 'Mais opções de produtos' });
        await expect(hm.getByRole('menuitem')).toHaveCount(4);
        const hb = (await hm.boundingBox())!;
        expect(hb.x).toBeGreaterThanOrEqual(0);
        expect(hb.x + hb.width).toBeLessThanOrEqual(vp.width);
        await hm.getByRole('menuitem', { name: 'Importar planilha' }).click();
        await expect(page).toHaveURL(/\/lojista\/produtos\/importar/);
      } else {
        await expect(dupInline).toBeVisible();
        await expect(more).toBeHidden();
        await expect(headerMore).toBeHidden();
        await expect(page.getByTestId('lojista.produtos.paste-link')).toBeVisible();
        await expect(page.getByTestId('lojista.produtos.prices-link')).toBeVisible();
      }
    });
  });
}

test.describe('BUG-043 com o cartão "Continuar" (limite conhecido, medição)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('mede quantos produtos inteiros cabem na 1ª tela com 1 rascunho recente', async ({ page }) => {
    const merchant = await seedMerchant();
    await loginLojista(page, merchant.email, merchant.password);
    await importCsv(page, NAMES);
    await publishAll(page, merchant.storeId);
    await importCsv(page, ['Rascunho Recente'], 'R');
    await page.goto('/lojista/produtos');
    const rows = page.locator('tr[data-testid^="lojista.produtos.row-"]');
    await expect(rows).toHaveCount(6); // 5 vendendo + o rascunho recente (a lista "Todos" inclui rascunhos)
    await expect(page.getByTestId('lojista.produtos.continue')).toBeVisible();
    const addTop = (await page.getByTestId('lojista.produtos.add').boundingBox())?.y ?? 844;
    let whole = 0;
    for (let i = 0; i < 5; i += 1) {
      const box = (await rows.nth(i).boundingBox())!;
      if (box.y + box.height <= Math.min(addTop, 844 - 72)) whole += 1;
    }
    console.log(`QA-R2 com cartão Continuar (390x844): inteiros_na_1a_tela=${whole}`);
    expect(whole).toBeGreaterThanOrEqual(1);
  });
});

test.describe('BUG-045 Apagar rascunho repetido', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('404 no "Apagar" (resposta perdida): conta como apagado, avisa e atualiza a lista; 500 continua sendo erro e o rascunho fica', async ({ page }) => {
    const merchant = await seedMerchant();
    await loginLojista(page, merchant.email, merchant.password);
    await importCsv(page, ['Rascunho A', 'Rascunho B']);
    await page.goto('/lojista/produtos?filtro=draft');
    const item = (name: string) => page.locator('li', { has: page.getByText(name, { exact: true }) });
    await expect(item('Rascunho A')).toHaveCount(1);
    await expect(item('Rascunho B')).toHaveCount(1);

    // 500: erro visível, o rascunho continua (não engolir erro que não é 404)
    await page.route('**/products/*', async (route) => {
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ code: 'INTERNAL_ERROR', title: 'Erro', status: 500 }) });
      return route.fallback();
    });
    await page.getByRole('button', { name: 'Apagar o rascunho Rascunho A' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Apagar/ }).click();
    // BUG-048: no celular a coluna do nome fica com 0 px e o alerta não é "visível" para o Playwright; o conteúdo é o que importa aqui
    await expect(item('Rascunho A').getByRole('alert')).toContainText('Não foi possível');
    await expect(item('Rascunho A')).toHaveCount(1);
    await page.unroute('**/products/*');

    // 404 depois de a API ter apagado de fato (resposta perdida e toque repetido)
    await page.route('**/products/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await route.fetch(); // a API apaga de verdade
      return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ code: 'NOT_FOUND', title: 'Não encontrado', status: 404 }) });
    });
    await page.getByRole('button', { name: 'Apagar o rascunho Rascunho B' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Apagar/ }).click();
    await expect(page.getByText('Rascunho apagado.')).toBeVisible();
    await expect(item('Rascunho B')).toHaveCount(0);
    await expect(item('Rascunho B').getByRole('alert')).toHaveCount(0);
  });
});

test.describe('BUG-046 API falsa do cadastro rápido', () => {
  test('GET product-drafts e catalog/quick-start respondem na forma do contrato', async ({ page }) => {
    const merchant = await seedMerchant();
    await loginLojista(page, merchant.email, merchant.password);
    await importCsv(page, ['Rascunho X']);
    const out = await page.evaluate(async (id) => {
      const get = async (path: string) => (await fetch(`/api/proxy/lojista/stores/${id}${path}`)).json();
      return { drafts: await get('/product-drafts'), start: await get('/catalog/quick-start') };
    }, merchant.storeId);
    expect(out.drafts).toMatchObject({ count: 1, limit: 100, nextCursor: null });
    expect(out.drafts.data[0]).toMatchObject({ name: 'Rascunho X', via: expect.any(String), expiresInDays: expect.any(Number) });
    expect(out.start).toMatchObject({ draftCount: 1, draftLimit: 100 });
    expect(out.start.latestDraft).toMatchObject({ name: 'Rascunho X' });
  });
});
