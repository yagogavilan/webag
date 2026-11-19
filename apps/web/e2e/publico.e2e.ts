import { expect, test } from '@playwright/test';

const API = 'http://localhost:3999';

test.describe('Site público (sem login)', () => {
  test('a página inicial renderiza sem login, com logo, lojas reservadas e links das páginas exigidas pelas lojas', async ({ page }) => {
    const response = await page.goto('/');
    expect(response!.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('logo').first()).toBeVisible();
    await expect(page.getByTestId('public.home.play')).toHaveText('[link da Google Play]');
    await expect(page.getByTestId('public.home.apple')).toHaveText('[link da App Store]');
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

  test('política e termos mostram a versão publicada e a data; HTML do texto não é interpretado', async ({ page }) => {
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeVisible();
    await expect(page.getByTestId('public.privacidade.version')).toContainText('Versão 1. Em vigor desde 1 de janeiro de 2026.');
    await page.goto('/termos');
    await expect(page.getByTestId('public.termos.version')).toContainText('Versão 1');
    await expect(page.getByText('Texto inicial dos termos de uso do cliente')).toBeVisible();
    await page.goto('/termos/lojista');
    await expect(page.getByRole('heading', { level: 1, name: 'Termos do lojista' })).toBeVisible();
  });

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
    for (const path of ['/privacidade', '/termos', '/ajuda', '/suporte', '/excluir-conta', '/licencas']) expect(sitemap).toContain(path);
    expect(sitemap).not.toContain('/admin');
  });
});

test.describe('Excluir conta (WB-214, SEC-166)', () => {
  test('explica o processo e o pedido ao encarregado responde igual para conta que existe e que não existe', async ({ page, request }) => {
    await page.goto('/excluir-conta');
    await expect(page.getByRole('heading', { level: 1, name: 'Excluir conta Webag' })).toBeVisible();
    await expect(page.getByText('72 horas')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'O que a lei nos obriga a guardar' })).toBeVisible();

    await page.getByTestId('public.excluir.email').fill('admin@webag.local');
    await page.getByTestId('public.excluir.submit').click();
    const first = await page.getByTestId('public.excluir.done').innerText();
    expect(first).toContain('Se existir uma conta com esse e-mail');

    await page.reload();
    await page.getByTestId('public.excluir.email').fill('ninguem-existe@exemplo.com');
    await page.getByTestId('public.excluir.submit').click();
    const second = await page.getByTestId('public.excluir.done').innerText();
    // Mesmo texto, salvo o número do protocolo.
    expect(second.replace(/PV-\d+/, 'PV')).toBe(first.replace(/PV-\d+/, 'PV'));

    const stored = (await (await request.get(`${API}/__test/privacy-requests`)).json()).data as { type: string }[];
    expect(stored.every((r) => r.type === 'deletion')).toBe(true);
  });

  test('limite de tentativas aparece como mensagem e o formulário rejeita POST de outro site', async ({ page, request }) => {
    await page.goto('/excluir-conta');
    await page.getByTestId('public.excluir.email').fill('limite@exemplo.com');
    await page.getByTestId('public.excluir.submit').click();
    await expect(page.getByTestId('public.excluir.error')).toContainText('Muitas tentativas');
    const forged = await request.post('/api/public/privacy-request', { data: { type: 'deletion', email: 'a@b.co' }, headers: { 'content-type': 'application/json' } });
    expect(forged.status()).toBe(403);
  });
});
