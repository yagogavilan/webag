import { expect, test } from '@playwright/test';
import { documentPhoto } from './helpers';

/** R1 do roteiro de usabilidade: cadastrar loja (WB-050 a 054), do cadastro da conta ao envio para análise. */
test.describe('Cadastrar loja (lojista)', () => {
  test('cria a conta, preenche as 4 etapas, envia para análise e acompanha', async ({ page }) => {
    const email = `marcos-${Date.now()}@casabela.test`;
    await page.goto('/lojista/cadastro');
    await page.getByTestId('lojista.signup.name-input').fill('Marcos Silva');
    await page.getByTestId('lojista.signup.email-input').fill(email);
    await page.getByTestId('lojista.signup.phone-input').fill('11987654321');
    await page.getByTestId('lojista.signup.password-input').fill('Webag-Lojista-2026!');
    await page.getByTestId('lojista.signup.password-confirm-input').fill('Webag-Lojista-2026!');
    await page.getByTestId('lojista.signup.terms-checkbox').check();
    await page.getByTestId('lojista.signup.submit').click();

    // L2: código por e-mail (a API falsa aceita 123456)
    await page.getByLabel('Dígito 1 de 6').pressSequentially('123456');
    await expect(page).toHaveURL(/\/lojista\/onboarding\/1/);

    // Etapa 1: CPF (o botão fica ativo e o erro aparece ao tocar)
    await page.getByTestId('lojista.etapa1.submit').click();
    await expect(page.getByText(/CPF/i).first()).toBeVisible();
    await page.getByTestId('lojista.etapa1.document-input').fill('52998224725');
    await page.getByTestId('lojista.etapa1.submit').click();

    // Etapa 2: loja, categoria, WhatsApp e endereço por CEP
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);
    await page.getByTestId('lojista.etapa2.name-input').fill('Casa Bela');
    await page.getByTestId('lojista.etapa2.category-select').selectOption({ label: 'Mercado' });
    await page.getByTestId('lojista.etapa2.whatsapp-input').fill('11987654321');
    await page.getByTestId('lojista.etapa2.cep-input').fill('07900000');
    await expect(page.getByTestId('lojista.etapa2.street-input')).toHaveValue('Rua das Flores');
    await page.getByTestId('lojista.etapa2.number-input').fill('10');
    await page.getByTestId('lojista.etapa2.submit').click();

    // Etapa 3: 3 documentos, cada um com pré-visualização antes de enviar
    await expect(page).toHaveURL(/\/lojista\/onboarding\/3/);
    await page.getByTestId('lojista.etapa3.submit').click();
    await expect(page.getByTestId('lojista.etapa3.missing-list')).toContainText('Falta enviar');
    for (const kind of ['id_front', 'id_back', 'address_proof']) {
      await page.getByTestId(`lojista.etapa3.slot-${kind}-file-input`).setInputFiles(documentPhoto());
      await page.getByTestId('lojista.etapa3.preview-accept').click();
      await expect(page.getByTestId(`lojista.etapa3.slot-${kind}`)).toContainText('Enviado');
    }
    await page.getByTestId('lojista.etapa3.submit').click();

    // Etapa 4: conta de recebimento (Mercado Pago simulado)
    await expect(page).toHaveURL(/\/lojista\/onboarding\/4/);
    await page.getByTestId('lojista.etapa4.submit').click();
    await expect(page.getByTestId('lojista.etapa4.connected-status')).toContainText('Conta de teste conectada');
    await page.getByTestId('lojista.etapa4.submit').click();

    // Revisão e envio
    await expect(page).toHaveURL(/\/lojista\/onboarding\/revisao/);
    await expect(page.getByTestId('lojista.revisao.section-1')).toContainText('•••••••4725');
    await page.getByTestId('lojista.revisao.submit').click();
    await expect(page.getByTestId('lojista.revisao.success')).toBeVisible();

    // L8: acompanhamento
    await page.getByTestId('lojista.revisao.success-status').click();
    await expect(page.getByRole('heading', { name: 'Sua loja está em análise' })).toBeVisible();
    await expect(page.getByText('Respondemos em até')).toBeVisible();
  });

  test('conta existente sem a loja concluída retoma de onde parou', async ({ page }) => {
    const email = `retoma-${Date.now()}@casabela.test`;
    await page.goto('/lojista/cadastro');
    await page.getByTestId('lojista.signup.name-input').fill('Rita Souza');
    await page.getByTestId('lojista.signup.email-input').fill(email);
    await page.getByTestId('lojista.signup.phone-input').fill('11976543210');
    await page.getByTestId('lojista.signup.password-input').fill('Webag-Lojista-2026!');
    await page.getByTestId('lojista.signup.password-confirm-input').fill('Webag-Lojista-2026!');
    await page.getByTestId('lojista.signup.terms-checkbox').check();
    await page.getByTestId('lojista.signup.submit').click();
    await page.getByLabel('Dígito 1 de 6').pressSequentially('123456');
    await page.getByTestId('lojista.etapa1.document-input').fill('11144477735');
    await page.getByTestId('lojista.etapa1.submit').click();
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);

    // Sai e volta: o painel leva direto à etapa 2 (WB-051 C4)
    await page.goto('/lojista');
    await expect(page).toHaveURL(/\/lojista\/onboarding\/2/);
  });
});
