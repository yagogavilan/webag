import { expect, test } from '@playwright/test';

const API = 'http://localhost:3999';

test.describe('Site público (sem login)', () => {
  test('a página inicial renderiza sem login, com logo, aviso das lojas e links das páginas exigidas pelas lojas', async ({ page }) => {
    const response = await page.goto('/');
    expect(response!.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('logo').first()).toBeVisible();
    // Sem URL configurada: aviso sóbrio, sem placeholder entre colchetes e sem botões de loja.
    await expect(page.getByTestId('public.home.soon')).toHaveText('Em breve nas lojas');
    await expect(page.getByTestId('public.home.play')).toHaveCount(0);
    await expect(page.getByTestId('public.home.apple')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(/\[link da/);
    for (const [name, href] of [['Política de privacidade', '/privacidade'], ['Termos de uso', '/termos'], ['Ajuda e perguntas frequentes', '/ajuda'], ['Excluir conta', '/excluir-conta']] as const) {
      await expect(page.getByRole('main').getByRole('link', { name })).toHaveAttribute('href', href);
    }
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/);
  });

  test('cabeçalhos de segurança: CSP sem terceiros, sem enquadramento e sem referrer', async ({ page }) => {
    const response = await page.goto('/privacidade');
    const headers = response!.headers();
    const csp = headers['content-security-policy']!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('mercadopago');
    expect(csp).toMatch(/script-src 'self' 'nonce-/);
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('política e termos mostram o texto completo em revisão: sem minuta, sem data vencida, sem variável solta, HTML nunca interpretado', async ({ page }) => {
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible();
    await expect(page.getByTestId('public.privacidade.version')).toHaveText('Versão para revisão. Vigência a definir.');
    await expect(page.getByRole('heading', { level: 2, name: '1. Resumo em linguagem simples' })).toBeVisible();
    await page.goto('/termos');
    await expect(page.getByTestId('public.termos.version')).toHaveText('Versão para revisão. Vigência a definir.');
    await expect(page.getByRole('heading', { level: 2, name: '10. Direito de arrependimento (7 dias)' })).toBeVisible();
    await page.goto('/termos/lojista');
    await expect(page.getByRole('heading', { level: 1, name: 'Termos do Lojista' })).toBeVisible();
    for (const path of ['/privacidade', '/termos', '/termos/lojista', '/termos/trocas']) {
      await page.goto(path);
      const text = await page.locator('main').innerText();
      expect(text, path).not.toMatch(/\{\{|REVISAR|[Mm]inuta|31 de dezembro de 2025|Em vigor desde/);
      expect(text, path).not.toMatch(/\b2 ?h\b/);
      await expect(page.locator('main img, main script')).toHaveCount(0);
    }
  });

  test('SEC-187: foro e encarregado vêm escritos no texto da versão publicada; sem valor, aparece "a definir" (nada inventado)', async ({ page }) => {
    await page.goto('/termos/lojista');
    await expect(page.getByTestId('public.termos-lojista.document')).toContainText('Comarca de Teste');
    await page.goto('/privacidade');
    const doc = page.getByTestId('public.privacidade.document');
    await expect(doc).toContainText('dados@webag.local'); // escrito no texto da versão (não vem do ambiente nem do /v1/help)
    await expect(doc).toContainText('a definir'); // endereço da sede, prestadores etc. sem valor
    await expect(doc.getByRole('link', { name: 'a página de exclusão de conta' })).toHaveAttribute('href', /^https?:\/\/localhost:3101\/excluir-conta$/);
  });

  test('política de trocas pública em /termos/trocas, com link no rodapé e na ajuda', async ({ page }) => {
    const response = await page.goto('/termos/trocas');
    expect(response!.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Trocas e Reembolsos' })).toBeVisible();
    await expect(page.getByTestId('public.trocas.version')).toHaveText('Versão para revisão. Vigência a definir.');
    await expect(page.getByRole('heading', { level: 2, name: '3. Arrependimento (7 dias)' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/termos\/trocas$/);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Trocas e reembolsos' })).toHaveAttribute('href', '/termos/trocas');
    await page.goto('/ajuda');
    await page.getByTestId('public.ajuda.trocas').getByRole('link', { name: 'Política de trocas e reembolsos' }).click();
    await expect(page).toHaveURL(/\/termos\/trocas$/);
  });

  test('índice leva à seção pela âncora e "veja também" liga os outros documentos', async ({ page }) => {
    await page.goto('/termos');
    const toc = page.getByTestId('public.termos.toc');
    await toc.getByText(/^Índice/).click();
    await toc.getByRole('link', { name: '8. Se a entrega atrasar' }).click();
    await expect(page).toHaveURL(/#secao-8$/);
    await expect(page.locator('#secao-8')).toBeInViewport();
    await expect(page.getByTestId('public.legal-links').getByRole('link', { name: 'Política de trocas e reembolsos' })).toHaveAttribute('href', '/termos/trocas');
  });

  for (const [name, viewport] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }]] as const) {
    test(`textos legais legíveis em ${name} px: sem rolagem horizontal, alvos de toque de 44 px no índice, capturas`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const [path, slug] of [['/privacidade', 'privacidade'], ['/termos', 'termos'], ['/termos/lojista', 'lojista'], ['/termos/trocas', 'trocas']] as const) {
        await page.goto(path);
        await page.screenshot({ path: `test-results/legal-${slug}-${name}-topo.png`, fullPage: false });
        await page.getByText(/^Índice/).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
        const small = await page.locator('[data-testid$=".toc"] a').evaluateAll((links) => links.filter((a) => a.getBoundingClientRect().height < 44).length);
        expect(small, path).toBe(0);
        await page.screenshot({ path: `test-results/legal-${slug}-${name}.png`, fullPage: false });
        await page.goto(`${path}#secao-3`);
        await expect(page.locator('#secao-3')).toBeInViewport();
        await page.screenshot({ path: `test-results/legal-${slug}-${name}-secao.png`, fullPage: false });
      }
    });
  }

  test('a ajuda lista as perguntas publicadas, esconde grupo vazio e mostra HTML como texto', async ({ page }) => {
    await page.goto('/ajuda');
    await expect(page.getByRole('heading', { level: 2, name: 'Pagamento' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Trocas' })).toHaveCount(0);
    await page.getByText('Posso pagar com PIX?').click();
    await expect(page.getByText('O pagamento é confirmado pelo servidor.')).toBeVisible();
    await page.getByText('Pergunta com HTML').click();
    await expect(page.getByText('<img src=x onerror=alert(1)> texto')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    await expect(page.getByTestId('public.contatos').getByRole('link', { name: '(11) 99999-0000' })).toHaveAttribute('href', 'https://wa.me/11999990000');
  });

  test('suporte e licenças (Solar CC BY 4.0 e fontes OFL)', async ({ page }) => {
    await page.goto('/suporte');
    await expect(page.getByRole('heading', { level: 1, name: 'Suporte' })).toBeVisible();
    await expect(page.getByTestId('public.suporte.canais').getByRole('link', { name: 'ajuda@webag.local' })).toHaveAttribute('href', 'mailto:ajuda@webag.local');
    await page.goto('/licencas');
    await expect(page.getByTestId('public.licencas.solar')).toContainText('480 Design');
    await expect(page.getByTestId('public.licencas.solar').getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await expect(page.getByTestId('public.licencas.bricolage')).toContainText('SIL Open Font License 1.1');
  });

  test('robots e sitemap listam só o site público', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Sitemap:');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const path of ['/privacidade', '/termos', '/termos/trocas', '/termos/lojista', '/ajuda', '/suporte', '/excluir-conta', '/licencas']) expect(sitemap).toContain(path);
    expect(sitemap).not.toContain('/admin');
  });
});

test.describe('Excluir conta (WB-214, SEC-166)', () => {
  test('explica o processo e o pedido ao encarregado responde igual para conta que existe e que não existe', async ({ page, request }) => {
    await page.goto('/excluir-conta');
    await expect(page.getByRole('heading', { level: 1, name: 'Excluir conta Webag' })).toBeVisible();
    await expect(page.getByText('72 horas (3 dias)').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'O que a lei nos obriga a guardar' })).toBeVisible();

    await page.getByTestId('public.excluir.officer-email').fill('admin@webag.local');
    await page.getByTestId('public.excluir.officer-submit').click();
    const first = await page.getByTestId('public.excluir.officer-done').innerText();
    expect(first).toContain('Se existir uma conta com esse e-mail');

    await page.reload();
    await page.getByTestId('public.excluir.officer-email').fill('ninguem-existe@exemplo.com');
    await page.getByTestId('public.excluir.officer-submit').click();
    const second = await page.getByTestId('public.excluir.officer-done').innerText();
    // Mesmo texto, salvo o número do protocolo.
    expect(second.replace(/PV-\d+/, 'PV')).toBe(first.replace(/PV-\d+/, 'PV'));

    const stored = (await (await request.get(`${API}/__test/privacy-requests`)).json()).data as { type: string }[];
    expect(stored.every((r) => r.type === 'deletion')).toBe(true);
  });

  test('limite de tentativas aparece como mensagem e o formulário rejeita POST de outro site', async ({ page, request }) => {
    await page.goto('/excluir-conta');
    await page.getByTestId('public.excluir.officer-email').fill('limite@exemplo.com');
    await page.getByTestId('public.excluir.officer-submit').click();
    await expect(page.getByTestId('public.excluir.officer-error')).toContainText('Muitas tentativas');
    const forged = await request.post('/api/public/privacy-request', { data: { type: 'deletion', email: 'a@b.co' }, headers: { 'content-type': 'application/json' } });
    expect(forged.status()).toBe(403);
  });
});

test.describe('Excluir conta sem o app (SEC-166, SEC-176)', () => {
  const tid = (page: import('@playwright/test').Page, id: string) => page.getByTestId(`public.excluir.${id}`);

  test('via A: código do e-mail, revisão, confirmação e desistência, sem sessão nem cookie', async ({ page, context }) => {
    await page.goto('/excluir-conta');
    await tid(page, 'email-input').fill('excluir@webag.local');
    await tid(page, 'send-code').click();
    await expect(tid(page, 'notice')).toContainText('Se existir uma conta com esse e-mail');
    await page.getByLabel('Dígito 1 de 6').pressSequentially('482913');
    await expect(tid(page, 'delete-submit')).toBeVisible();
    await tid(page, 'delete-submit').click();
    await expect(page.getByRole('alertdialog')).toContainText('Excluir sua conta?');
    await tid(page, 'delete-confirm').click();
    await expect(tid(page, 'done')).toContainText('Sua conta foi fechada');
    expect(await context.cookies()).toEqual([]);

    // Desistir (arrependimento) com e-mail e senha
    await tid(page, 'cancel-email').fill('excluir@webag.local');
    await tid(page, 'cancel-password').fill('Excluir-Dev-2026');
    await tid(page, 'cancel-submit').click();
    await expect(tid(page, 'cancel-done')).toContainText('A exclusão foi cancelada');
  });

  test('a resposta do primeiro passo é igual para e-mail que existe e que não existe', async ({ page }) => {
    const texts: string[] = [];
    for (const email of ['excluir@webag.local', 'ninguem-existe@exemplo.com']) {
      await page.goto('/excluir-conta');
      await tid(page, 'email-input').fill(email);
      await tid(page, 'send-code').click();
      await expect(tid(page, 'notice')).toBeVisible();
      texts.push(await tid(page, 'notice').innerText());
    }
    expect(texts[0]).toBe(texts[1]);
    // Código errado para conta inexistente: a mesma mensagem de código incorreto.
    await page.getByLabel('Dígito 1 de 6').pressSequentially('000000');
    await expect(tid(page, 'error')).toContainText('Código incorreto');
  });

  test('via B com a conta sob ataque pede o código do e-mail; senha errada tem mensagem única', async ({ page }) => {
    await page.goto('/excluir-conta');
    await tid(page, 'use-password').click();
    await tid(page, 'email-input').fill('cuidado@webag.local');
    await tid(page, 'password-input').fill('senha-errada');
    await tid(page, 'password-submit').click();
    await expect(tid(page, 'error')).toHaveText('E-mail ou senha incorretos.');
    await tid(page, 'password-input').fill('Excluir-Dev-2026');
    await tid(page, 'password-submit').click();
    await expect(tid(page, 'notice')).toContainText('Por segurança, enviamos um código');
    await page.getByLabel('Dígito 1 de 6').pressSequentially('482913');
    await expect(tid(page, 'delete-submit')).toBeVisible();
  });

  test('desistir com a conta sob ataque abre o campo do código (SEC-176) e a exclusão com pedido em andamento é bloqueada', async ({ page }) => {
    // fecha a conta `cuidado@` pela via A para poder desistir depois
    await page.goto('/excluir-conta');
    await tid(page, 'email-input').fill('cuidado@webag.local');
    await tid(page, 'send-code').click();
    await page.getByLabel('Dígito 1 de 6').pressSequentially('482913');
    await tid(page, 'delete-submit').click();
    await tid(page, 'delete-confirm').click();
    await expect(tid(page, 'done')).toBeVisible();
    await tid(page, 'cancel-email').fill('cuidado@webag.local');
    await tid(page, 'cancel-password').fill('Excluir-Dev-2026');
    await tid(page, 'cancel-submit').click();
    await expect(tid(page, 'cancel-code-step')).toContainText('enviamos um código');
    await page.getByLabel('Dígito 1 de 6').last().pressSequentially('482913');
    await expect(tid(page, 'cancel-done')).toBeVisible();

    await page.goto('/excluir-conta');
    await tid(page, 'email-input').fill('bloqueado@webag.local');
    await tid(page, 'send-code').click();
    await page.getByLabel('Dígito 1 de 6').pressSequentially('482913');
    await expect(tid(page, 'blockers')).toContainText('Pedido #4821');
    await expect(tid(page, 'delete-submit')).toHaveCount(0);
  });

  test('limite de tentativas, POST de outro site e host de painel são recusados', async ({ page, request }) => {
    await page.goto('/excluir-conta');
    await tid(page, 'email-input').fill('limite@exemplo.com');
    await tid(page, 'send-code').click();
    await expect(tid(page, 'error')).toContainText('Muitas tentativas');
    const forged = await request.post('/api/public/account-deletion/start', { data: { email: 'a@b.co' }, headers: { 'content-type': 'application/json' } });
    expect(forged.status()).toBe(403);
    const unknown = await request.post('/api/public/account-deletion/apagar-tudo', { data: {}, headers: { 'content-type': 'application/json', 'x-webag-client': 'web' } });
    expect(unknown.status()).toBe(404);
  });
});
