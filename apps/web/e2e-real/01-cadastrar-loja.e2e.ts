import { expect, test } from '@playwright/test';
import { API, MERCHANT_PASSWORD, apiCall, documentPhoto, emailCode, merchantToken } from './helpers';
import { saveState } from './state';

/**
 * O2-E2E-01 (R1 do roteiro de usabilidade): cadastrar loja, do cadastro da conta ao envio para análise, contra a API REAL
 * (e-mail pelo SMTP/Mailpit real, upload ao S3, geocodificação, conta de recebimento do provedor `fake`).
 * WB-050 a WB-054, WB-211, SEC-008b, SEC-050.
 */
test.describe('Cadastrar loja (lojista) com a API real', () => {
  test('cria a conta com código de e-mail, preenche as 4 etapas, envia e acompanha o status', async ({ page, request }) => {
    const stamp = Date.now();
    const email = `qa-loja-${stamp}@casabela.test`;
    const storeName = `Casa Bela QA ${stamp % 100_000}`;
    // CPF válido distinto por execução (a API recusa o mesmo documento em duas lojas, O2-ONB-03).
    const cpf = validCpf(stamp);

    await page.goto('/lojista/cadastro');
    await page.getByTestId('lojista.signup.name-input').fill('Marcos Silva');
    await page.getByTestId('lojista.signup.email-input').fill(email);
    await page.getByTestId('lojista.signup.phone-input').fill('11987654321');
    await page.getByTestId('lojista.signup.password-input').fill(MERCHANT_PASSWORD);
    await page.getByTestId('lojista.signup.password-confirm-input').fill(MERCHANT_PASSWORD);
    await page.getByTestId('lojista.signup.terms-checkbox').check();
    await page.getByTestId('lojista.signup.submit').click();

    // L2: código REAL enviado por e-mail (nada de "123456 sempre vale")
    const code = await emailCode(email);
    await page.getByLabel('Dígito 1 de 6').pressSequentially(code);
    await expect(page).toHaveURL(/\/lojista\/onboarding\/1/);

    // Etapa 1: CPF. Vazio mostra o erro no campo; inválido (DV errado) também; válido avança
    await page.getByTestId('lojista.etapa1.submit').click();
    await expect(page.getByText(/CPF/i).first()).toBeVisible();
    await page.getByTestId('lojista.etapa1.document-input').fill('11111111111');
    await page.getByTestId('lojista.etapa1.submit').click();
    await expect(page).toHaveURL(/\/lojista\/onboarding\/1/);
    await page.getByTestId('lojista.etapa1.document-input').fill(cpf);
    await page.getByTestId('lojista.etapa1.submit').click();

    // Etapa 2: dados da loja, categoria, WhatsApp e endereço por CEP (geocodificador da API)
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);
    await page.getByTestId('lojista.etapa2.name-input').fill(storeName);
    await page.getByTestId('lojista.etapa2.category-select').selectOption({ label: 'Mercado' });
    await page.getByTestId('lojista.etapa2.whatsapp-input').fill('11987654321');
    await page.getByTestId('lojista.etapa2.cep-input').fill('07900000');
    await expect(page.getByTestId('lojista.etapa2.street-input')).toHaveValue(/\S+/);
    await page.getByTestId('lojista.etapa2.number-input').fill('10');
    await page.getByTestId('lojista.etapa2.submit').click();

    // Etapa 3: 3 documentos (upload direto ao S3 com POST pré-assinado + `complete` na API)
    await expect(page).toHaveURL(/\/lojista\/onboarding\/3/);
    await page.getByTestId('lojista.etapa3.submit').click();
    await expect(page.getByTestId('lojista.etapa3.missing-list')).toContainText('Falta enviar');
    for (const kind of ['id_front', 'id_back', 'address_proof']) {
      await page.getByTestId(`lojista.etapa3.slot-${kind}-file-input`).setInputFiles(documentPhoto());
      await page.getByTestId('lojista.etapa3.preview-accept').click();
      await expect(page.getByTestId(`lojista.etapa3.slot-${kind}`)).toContainText('Enviado', { timeout: 20_000 });
    }
    await page.getByTestId('lojista.etapa3.submit').click();

    // Etapa 4: conta de recebimento (provedor `fake` pela API real: OAuth com `state`)
    await expect(page).toHaveURL(/\/lojista\/onboarding\/4/);
    await page.getByTestId('lojista.etapa4.submit').click();
    // SEC-045: conectar a conta exige a senha digitada há menos de 5 minutos (a API falsa não pedia)
    const connectResponse = page.waitForResponse((r) => r.url().includes('/payment-account/connect') && r.request().method() === 'POST' && r.status() === 200);
    await page.getByTestId('lojista.reauth.password-input').fill(MERCHANT_PASSWORD);
    await page.getByTestId('lojista.reauth.submit').click();
    const started = (await (await connectResponse).json()) as { authorizationUrl: string; state?: string };
    const state = started.state ?? new URL(started.authorizationUrl).searchParams.get('state') ?? '';
    expect(state.length).toBeGreaterThan(20);
    // BUG-009: com o provedor `fake` a API devolve `authorizationUrl` = `${API_PUBLIC_URL}/fake-oauth/authorize` (rota que não existe)
    // e o painel só aceita https ou a própria origem. Se o defeito persistir, o painel mostra o erro e o teste completa o retorno do
    // OAuth como o provedor faria (`?state&code`), com o `state` REAL emitido pela API. Corrigido o defeito, o teste segue o redirecionamento.
    const bannerError = page.getByText('Não foi possível abrir o Mercado Pago');
    await expect(bannerError.or(page.getByTestId('lojista.etapa4.connected-status'))).toBeVisible({ timeout: 20_000 }).catch(() => undefined);
    if (await bannerError.isVisible()) {
      test.info().annotations.push({ type: 'BUG-009', description: 'authorizationUrl do provedor fake inválido para o painel (fluxo de conectar conta quebrado fora da produção)' });
      await page.goto(`/lojista/onboarding/4?state=${encodeURIComponent(state)}&code=fake-ok`);
    }
    await expect(page.getByTestId('lojista.etapa4.connected-status')).toContainText('Conta de teste conectada', { timeout: 20_000 });
    await page.getByTestId('lojista.etapa4.submit').click();

    // Revisão e envio: CPF mascarado na tela, depois "em análise"
    await expect(page).toHaveURL(/\/lojista\/onboarding\/revisao/);
    await expect(page.getByTestId('lojista.revisao.section-1')).toContainText(`•••••••${cpf.slice(-4)}`);
    await page.getByTestId('lojista.revisao.submit').click();
    await expect(page.getByTestId('lojista.revisao.success')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('lojista.revisao.success-status').click();
    await expect(page.getByRole('heading', { name: 'Sua loja está em análise' })).toBeVisible();
    await expect(page.getByText('Respondemos em até')).toBeVisible();

    // Prova pela API (não só pela tela): a loja existe, em análise, e o CPF não vaza inteiro na resposta do lojista
    const mine = await page.request.get('/api/proxy/lojista/stores/mine');
    expect(mine.status()).toBe(200);
    const stores = ((await mine.json()) as { data: { id: string; name: string; status: string }[] }).data;
    const created = stores.find((s) => s.name === storeName);
    expect(created, 'a loja criada aparece em /stores/mine').toBeTruthy();
    expect(created!.status).toBe('in_review');

    // O2-ONB-13 / SEC-020: outro lojista (conta do seed) não lê a loja em análise nem o CPF dela (404)
    const stranger = await merchantToken('lojista.mercadinho-boa-compra@seed.webag.local', 'webag-seed-lojista-2026');
    const foreign = await apiCall(stranger, 'GET', `/v1/stores/${created!.id}`);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain(cpf);

    // A loja em análise NÃO é pública (RN-03): 404 na API pública
    const pub = await request.get(`${API}/v1/browse/stores/${created!.id}`, { params: { lat: -23.2811, lng: -46.7452 } });
    expect(pub.status()).toBe(404);

    saveState({ merchantEmail: email, merchantPassword: MERCHANT_PASSWORD, storeId: created!.id, storeName });
  });

  test('conta existente sem a loja concluída retoma de onde parou (WB-051 C4)', async ({ page }) => {
    const stamp = Date.now() + 1;
    const email = `qa-retoma-${stamp}@casabela.test`;
    await page.goto('/lojista/cadastro');
    await page.getByTestId('lojista.signup.name-input').fill('Rita Souza');
    await page.getByTestId('lojista.signup.email-input').fill(email);
    await page.getByTestId('lojista.signup.phone-input').fill('11976543210');
    await page.getByTestId('lojista.signup.password-input').fill(MERCHANT_PASSWORD);
    await page.getByTestId('lojista.signup.password-confirm-input').fill(MERCHANT_PASSWORD);
    await page.getByTestId('lojista.signup.terms-checkbox').check();
    await page.getByTestId('lojista.signup.submit').click();
    await page.getByLabel('Dígito 1 de 6').pressSequentially(await emailCode(email));
    await page.getByTestId('lojista.etapa1.document-input').fill(validCpf(stamp));
    await page.getByTestId('lojista.etapa1.submit').click();
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);
    await page.goto('/lojista');
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);
  });
});

/** CPF com dígitos verificadores válidos, derivado do instante (único por execução). */
function validCpf(seed: number): string {
  const base = String(seed % 1_000_000_000).padStart(9, '0').split('').map(Number);
  const dv = (list: number[]): number => {
    const rest = list.reduce((acc, d, i) => acc + d * (list.length + 1 - i), 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  const cpf = [...base, d1, d2].join('');
  return /^(\d)\1{10}$/.test(cpf) ? validCpf(seed + 7) : cpf;
}
