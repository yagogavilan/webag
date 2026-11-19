import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { merchantApi } from '@/lib/api/lojista';
import { json, mockFetch } from '../../../../test/render';
import { fakeStore, renderLojista } from '../../../../test/lojista';
import { onboardingRedirect } from './onboarding-page';
import { Review, missingItems } from './review';
import { Step1 } from './step1';
import { Step2 } from './step2';
import { Step4, safeAuthorizationUrl } from './step4';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), usePathname: () => '/lojista/onboarding/1' }));

const T = (screen_: string, id: string) => screen.getByTestId(`lojista.${screen_}.${id}`);

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Step1 (L3): CPF ou CNPJ', () => {
  function setup(store: ReturnType<typeof fakeStore> | null = null) {
    vi.stubGlobal('fetch', mockFetch().impl);
    const save = vi.spyOn(merchantApi, 'saveDraft').mockResolvedValue(fakeStore({ step: 1 }));
    renderLojista(<Step1 store={store} next="/lojista/onboarding/2" />);
    return save;
  }

  it('máscara de CPF, valida o dígito verificador ao tocar e não chama a rede', async () => {
    const save = setup();
    await userEvent.type(T('etapa1', 'document-input'), '11122233344');
    expect(T('etapa1', 'document-input')).toHaveValue('111.222.333-44');
    await userEvent.click(T('etapa1', 'submit'));
    expect(screen.getByText('Confira o CPF.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('CPF válido cria a loja com o número sem pontuação e avança', async () => {
    const save = setup();
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/onboarding/2'));
    expect(save).toHaveBeenCalledWith(null, { legalType: 'cpf', document: '52998224725' });
  });

  it('CNPJ alfanumérico: aceita letras, pede razão social e o aceite fiscal, e limpa o número ao trocar o tipo', async () => {
    const save = setup();
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'type-cnpj'));
    expect(screen.getByText('CNPJ selecionado')).toBeInTheDocument();
    expect(T('etapa1', 'document-input')).toHaveValue('');
    await userEvent.type(T('etapa1', 'document-input'), '12abc34501de35');
    expect(T('etapa1', 'document-input')).toHaveValue('12.ABC.345/01DE-35');
    await userEvent.click(T('etapa1', 'submit'));
    expect(screen.getByText('Digite a razão social.')).toBeInTheDocument();
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    await userEvent.type(T('etapa1', 'legal-name-input'), 'Casa Bela Roupas Ltda');
    await userEvent.click(T('etapa1', 'fiscal-checkbox'));
    await userEvent.click(T('etapa1', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(null, { legalType: 'cnpj', document: '12ABC34501DE35', legalName: 'Casa Bela Roupas Ltda', fiscalAccepted: true });
  });

  it('documento que já tem loja mostra o erro e o link do suporte', async () => {
    const save = setup();
    save.mockRejectedValue(new ApiError({ status: 409, code: 'DOCUMENT_IN_USE', title: 'x' }));
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    expect(await screen.findByText('Esse CPF/CNPJ já tem loja.')).toBeInTheDocument();
    expect(T('etapa1', 'support-link')).toHaveTextContent('Falar com o suporte');
    expect(push).not.toHaveBeenCalled();
  });

  it('erro ao salvar mantém o que foi digitado e oferece tentar de novo', async () => {
    const save = setup();
    save.mockRejectedValue(new ApiError({ status: 500, code: 'X', title: 'x' }));
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    expect(await screen.findByTestId('lojista.onboarding.save-error')).toBeInTheDocument();
    expect(T('etapa1', 'document-input')).toHaveValue('529.982.247-25');
  });

  it('loja já criada: o documento fica só para leitura (1 documento = 1 loja) e só razão social e aceite seguem editáveis', async () => {
    const save = setup(fakeStore({ step: 1, legalType: 'cnpj', document: '11222333000181', legalName: 'Casa Bela', fiscalAccepted: true }));
    expect(T('etapa1', 'document-input')).toHaveValue('11.222.333/0001-81');
    expect(T('etapa1', 'document-input')).toHaveAttribute('readonly');
    expect(screen.getByText('Para trocar o CPF ou CNPJ, fale com o suporte.')).toBeInTheDocument();
    await userEvent.click(T('etapa1', 'submit'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), { legalName: 'Casa Bela', fiscalAccepted: true }));
  });
});

describe('Step2 (L4): dados da loja e CEP', () => {
  const categories = { data: [{ id: 'c1', name: 'Roupas', icon: 'tag', parentId: null, position: 0, active: true, children: [] }], nextCursor: null };
  const regions = { data: [{ id: 'r1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] }], nextCursor: null };

  function setup(cep: Record<string, unknown> | number) {
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/categories') ? json(categories) : undefined),
      (url) => (url.pathname.endsWith('/regions') ? json(regions) : undefined),
      (url) => (url.pathname.includes('/cep/') ? (typeof cep === 'number' ? json({ code: 'NOT_FOUND', title: 'x', status: cep }, cep) : json(cep)) : undefined),
      (url, init) => (url.pathname.endsWith('/waitlist') && init.method === 'POST' ? json(null, 204) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    const save = vi.spyOn(merchantApi, 'saveDraft').mockResolvedValue(fakeStore({ step: 2 }));
    renderLojista(<Step2 store={fakeStore({ step: 1 })} next="/lojista/onboarding/3" backHref="/lojista/onboarding/1" />);
    return { calls, save };
  }

  async function fillBasics() {
    await userEvent.type(T('etapa2', 'name-input'), 'Casa Bela');
    await userEvent.selectOptions(await screen.findByTestId('lojista.etapa2.category-select'), 'c1');
    await userEvent.type(T('etapa2', 'whatsapp-input'), '11999998888');
  }

  it('ao completar o CEP preenche rua, bairro e cidade e salva a etapa 2', async () => {
    const { save } = setup({ street: 'Rua das Palmeiras', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07900000');
    expect(await screen.findByDisplayValue('Rua das Palmeiras')).toBeInTheDocument();
    expect(T('etapa2', 'cep-input')).toHaveValue('07900-000');
    await userEvent.type(T('etapa2', 'number-input'), '120');
    await userEvent.click(T('etapa2', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/onboarding/3'));
    expect(save.mock.calls[0]?.[1]).toMatchObject({ name: 'Casa Bela', categoryId: 'c1', whatsapp: '11999998888', address: { cep: '07900-000', street: 'Rua das Palmeiras', number: '120', city: 'Francisco Morato', lat: -23.28 } });
  });

  it('CEP que não existe libera rua e bairro para digitar', async () => {
    setup(404);
    await userEvent.type(T('etapa2', 'cep-input'), '99999999');
    expect(await screen.findByText('Não achamos esse CEP. Preencha rua e bairro.')).toBeInTheDocument();
    expect(T('etapa2', 'street-input')).not.toHaveAttribute('readonly');
  });

  it('cidade fora das regiões ativas: erro no campo, bloco de aviso, e a lista de espera pede o consentimento', async () => {
    const { calls, save } = setup({ street: 'Rua A', neighborhood: 'Centro', city: 'Mairiporã', state: 'SP', lat: -23.3, lng: -46.5 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07600000');
    expect(await screen.findByTestId('lojista.etapa2.out-of-region')).toHaveTextContent('Ainda não atendemos Mairiporã.');
    await userEvent.type(T('etapa2', 'number-input'), '10');
    await userEvent.click(T('etapa2', 'submit'));
    expect(screen.getAllByText('Ainda não atendemos Mairiporã.').length).toBeGreaterThan(1);
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(T('etapa2', 'waitlist-submit'));
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Quero receber um aviso por e-mail quando o Webag chegar em minha cidade.'));
    await userEvent.click(T('etapa2', 'waitlist-submit'));
    expect(await screen.findByText('Anotado. Avisamos por e-mail.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/waitlist'))?.init.body))).toMatchObject({ kind: 'city', city: 'Mairiporã', consent: true });
  });

  it('campos vazios: erros por campo e nada é enviado; WhatsApp fixo é recusado', async () => {
    const { save } = setup(404);
    await userEvent.click(T('etapa2', 'submit'));
    expect(screen.getByText('Digite o nome da loja.')).toBeInTheDocument();
    expect(screen.getByText('Confira o WhatsApp com DDD.')).toBeInTheDocument();
    expect(screen.getByText('Confira o CEP.')).toBeInTheDocument();
    await userEvent.type(T('etapa2', 'whatsapp-input'), '1133334444');
    await userEvent.click(T('etapa2', 'submit'));
    expect(screen.getByText('Confira o WhatsApp com DDD.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('"Sem número" dispensa o número', async () => {
    const { save } = setup({ street: 'Rua A', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: 1, lng: 1 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07900000');
    await screen.findByDisplayValue('Rua A');
    await userEvent.click(T('etapa2', 'no-number-checkbox'));
    await userEvent.click(T('etapa2', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1].address).toMatchObject({ noNumber: true, number: '' });
  });
});

describe('Step4 (L6): conta de recebimento', () => {
  it('só segue para https ou para o próprio painel', () => {
    expect(safeAuthorizationUrl('https://auth.mercadopago.com.br/authorization?x=1', 'http://localhost:3001')).toContain('mercadopago');
    expect(safeAuthorizationUrl('/lojista/onboarding/4?state=a', 'http://localhost:3001')).toBe('http://localhost:3001/lojista/onboarding/4?state=a');
    expect(safeAuthorizationUrl('http://evil.com/x', 'http://localhost:3001')).toBeNull();
    expect(safeAuthorizationUrl('javascript:alert(1)', 'http://localhost:3001')).toBeNull();
  });

  it('simulado: confirma o retorno no servidor com o state de uso único e nunca confia na URL', async () => {
    const { impl, calls } = mockFetch((url) => (url.pathname.endsWith('/payment-account/callback') ? json({ connected: true, provider: 'fake', status: 'active', holderDocumentMasked: '***.982.247-**' }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/lojista/onboarding/revisao" oauth={{ state: 'st1', code: 'cd1' }} />);
    expect(screen.getByRole('status', { name: 'Conferindo a conexão' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/api/proxy/lojista/stores/s1/payment-account/callback')).toBe(true));
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ state: 'st1', code: 'cd1' });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lojista/onboarding/4'));
  });

  it('link vencido ou conta em uso: avisos próprios', async () => {
    const { impl } = mockFetch((url) => (url.pathname.endsWith('/payment-account/callback') ? json({ code: 'PAYMENT_ACCOUNT_IN_USE', title: 'x', status: 409 }, 409) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/x" oauth={{ state: 'st1', code: 'cd1' }} />);
    expect(await screen.findByTestId('lojista.etapa4.in-use')).toHaveTextContent('Essa conta já está em uso por outra loja.');
  });

  it('pede a senha de novo (reautenticação) antes de abrir o Mercado Pago', async () => {
    let reauthed = false;
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/auth/reauth') ? ((reauthed = true), json(null, 204)) : undefined),
      (url) => (url.pathname.endsWith('/payment-account/connect') ? (reauthed ? json({ authorizationUrl: 'http://evil.com/x', state: 's'.repeat(32), expiresInSeconds: 600 }) : json({ code: 'REAUTH_REQUIRED', title: 'x', status: 403 }, 403)) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/x" />);
    await userEvent.click(T('etapa4', 'submit'));
    expect(await screen.findByRole('dialog', { name: 'Confirme que é você' })).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('lojista.reauth.password-input'), 'minha-senha');
    await userEvent.click(screen.getByTestId('lojista.reauth.submit'));
    // destino fora do https/painel é recusado: nada de redirecionar para endereço estranho
    expect(await screen.findByText('Não foi possível abrir o Mercado Pago. Tente de novo.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/auth/reauth'))?.init.body))).toEqual({ password: 'minha-senha' });
  });

  it('negou a autorização: aviso e etapa pendente; "Salvar e continuar depois" volta ao painel e diz que o envio fica bloqueado (U8.8)', async () => {
    const { impl, calls } = mockFetch();
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/lojista/onboarding/revisao" oauth={{ denied: true }} />);
    expect(T('etapa4', 'denied')).toHaveTextContent('Você não autorizou a conexão. Sem ela, a loja não recebe.');
    expect(T('etapa4', 'connect-later')).toHaveTextContent('Salvar e continuar depois');
    expect(screen.queryByText('Conectar depois')).toBeNull();
    await userEvent.click(T('etapa4', 'connect-later'));
    expect(push).toHaveBeenCalledWith('/lojista');
    expect(screen.getAllByText('Rascunho salvo. Sem a conta de recebimento não dá para enviar para análise.').length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.init.method && c.init.method !== 'GET')).toHaveLength(0);
  });

  it('conta já conectada vira "Continuar" e mostra o titular mascarado', () => {
    vi.stubGlobal('fetch', mockFetch().impl);
    renderLojista(<Step4 store={fakeStore({ step: 4, payout: { status: 'connected', maskedAccount: 'Titular ***.982.247-**', simulated: false } })} next="/lojista/onboarding/revisao" />);
    expect(T('etapa4', 'connected-status')).toHaveTextContent('Conta conectada');
    expect(T('etapa4', 'connected-status')).toHaveTextContent('Titular ***.982.247-**');
    expect(T('etapa4', 'submit')).toHaveTextContent('Continuar');
  });

  it('titular divergente: fica em análise e explica', () => {
    vi.stubGlobal('fetch', mockFetch().impl);
    renderLojista(<Step4 store={fakeStore({ step: 3, payout: { status: 'under_review', maskedAccount: null, simulated: false } })} next="/x" />);
    expect(T('etapa4', 'under-review')).toHaveTextContent('Titular da conta diferente do cadastro.');
  });
});

describe('Revisão (L7)', () => {
  const docs = (['id_front', 'id_back', 'address_proof'] as const).map((kind) => ({ kind, uploadedAt: '2026-11-18T17:00:00Z' }));
  const complete = fakeStore({
    step: 4,
    legalType: 'cpf',
    document: '52998224725',
    name: 'Casa Bela',
    categoryId: 'c1',
    whatsapp: '11999998888',
    address: { cep: '07900-000', street: 'Rua das Palmeiras', number: '120', noNumber: false, complement: '', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: 1, lng: 1 },
    documents: docs,
    payout: { status: 'connected', maskedAccount: null, simulated: true },
  });
  const categoriesHandler = (url: URL) => (url.pathname.endsWith('/categories') ? json({ data: [], nextCursor: null }) : undefined);

  it('lista o que falta, com a etapa de cada item, e não envia', async () => {
    vi.stubGlobal('fetch', mockFetch(categoriesHandler).impl);
    const submit = vi.spyOn(merchantApi, 'submit');
    const incomplete = { ...complete, documents: docs.slice(0, 1) };
    renderLojista(<Review store={incomplete} />);
    expect(missingItems(incomplete).map((m) => m.step)).toEqual([3, 3]);
    await userEvent.click(T('revisao', 'submit'));
    const list = T('revisao', 'missing-list');
    expect(list).toHaveTextContent('documento com foto, verso');
    expect(list).toHaveTextContent('Etapa 3');
    expect(submit).not.toHaveBeenCalled();
  });

  it('conta de recebimento pendente também impede o envio (a API exige) e aponta a etapa 4', async () => {
    vi.stubGlobal('fetch', mockFetch(categoriesHandler).impl);
    const notConnected = { ...complete, payout: { status: 'not_connected' as const, maskedAccount: null, simulated: false } };
    expect(missingItems(notConnected)).toEqual([{ text: 'conta de recebimento (Mercado Pago)', step: 4 }]);
    renderLojista(<Review store={notConnected} />);
    expect(T('revisao', 'payout-banner')).toHaveTextContent('Falta conectar a conta de recebimento (Etapa 4). Sem ela não dá para enviar para análise.');
    // tocar em enviar: continua 1 aviso só (o da Etapa 4), sem repetir na lista "Falta:"
    await userEvent.click(T('revisao', 'submit'));
    expect(screen.queryByTestId('lojista.revisao.missing-list')).toBeNull();
    expect(screen.getAllByText(/Etapa 4/)).toHaveLength(1);
  });

  it('mostra o documento mascarado e envia para análise', async () => {
    vi.stubGlobal('fetch', mockFetch(categoriesHandler).impl);
    const submit = vi.spyOn(merchantApi, 'submit').mockResolvedValue({ ...complete, status: 'in_review' });
    renderLojista(<Review store={complete} />);
    expect(screen.getByText('•••••••4725')).toBeInTheDocument();
    expect(screen.queryByText('52998224725')).toBeNull();
    await userEvent.click(T('revisao', 'submit'));
    await waitFor(() => expect(submit).toHaveBeenCalledWith('s1'));
  });

  it('a API devolve o que falta (422): mostra a lista dela, com a etapa certa', async () => {
    vi.stubGlobal('fetch', mockFetch(categoriesHandler).impl);
    vi.spyOn(merchantApi, 'submit').mockRejectedValue(new ApiError({ status: 422, code: 'ONBOARDING_INCOMPLETE', title: 'x', fields: [{ field: 'address', message: 'Informe o endereço da loja.' }] }));
    renderLojista(<Review store={complete} />);
    await userEvent.click(T('revisao', 'submit'));
    expect(await screen.findByTestId('lojista.revisao.missing-list')).toHaveTextContent('Informe o endereço da loja');
    expect(T('revisao', 'missing-list')).toHaveTextContent('Etapa 2');
  });

  it('editar um bloco volta à revisão depois (parâmetro de retorno)', () => {
    vi.stubGlobal('fetch', mockFetch(categoriesHandler).impl);
    renderLojista(<Review store={complete} />);
    expect(T('revisao', 'section-3-edit')).toHaveAttribute('href', '/lojista/onboarding/3?de=revisao');
  });

  it('já enviada: mostra o sucesso com o prazo da configuração', () => {
    vi.stubGlobal('fetch', mockFetch().impl);
    renderLojista(<Review store={{ ...complete, status: 'in_review', slaBusinessDays: 3 }} />);
    expect(screen.getByRole('heading', { name: 'Recebemos seu cadastro' })).toBeInTheDocument();
    expect(screen.getByText('Respondemos em até 3 dias úteis.')).toBeInTheDocument();
    expect(T('revisao', 'success-status')).toBeInTheDocument();
  });
});

describe('guarda de ordem das etapas', () => {
  it.each([
    [null, '1', null],
    [null, '2', '/lojista/onboarding/1'],
    [fakeStore({ step: 1 }), '2', null],
    [fakeStore({ step: 1 }), '3', '/lojista/onboarding/2'],
    [fakeStore({ step: 2 }), 'revisao', '/lojista/onboarding/3'],
    [fakeStore({ step: 3 }), 'revisao', null],
    [fakeStore({ step: 3 }), '4', null],
    [fakeStore({ step: 4, status: 'in_review' }), 'revisao', null],
    [fakeStore({ step: 4, status: 'in_review' }), '1', '/lojista'],
    [fakeStore({ role: 'staff' }), '1', '/lojista'],
  ] as const)('loja %# na etapa %s', (store, step, expected) => {
    expect(onboardingRedirect(store, step, false)).toBe(expected);
  });

  it('em correção só abre as etapas 1 e 2, com o parâmetro de correção', () => {
    const store = fakeStore({ step: 4, status: 'correction_requested' });
    expect(onboardingRedirect(store, '2', true)).toBeNull();
    expect(onboardingRedirect(store, '3', true)).toBe('/lojista');
    expect(onboardingRedirect(store, '2', false)).toBe('/lojista');
    // Conectar a conta de recebimento continua possível depois do envio (e é o retorno do OAuth).
    expect(onboardingRedirect(fakeStore({ status: 'approved', step: 4 }), '4', false)).toBeNull();
    expect(onboardingRedirect(fakeStore({ status: 'suspended', step: 4 }), '4', false)).toBe('/lojista');
  });
});
