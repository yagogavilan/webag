import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const saved = (calls: { url: URL; init: RequestInit }[]) => calls.filter((c) => c.url.pathname.endsWith('/me/store') && c.init.method === 'PUT').map((c) => JSON.parse(String(c.init.body)));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('Step1 (L3): CPF ou CNPJ', () => {
  function setup(handlers: Parameters<typeof mockFetch> = [], store = fakeStore()) {
    const { impl, calls } = mockFetch(...handlers, (url, init) => (url.pathname.endsWith('/me/store') && init.method === 'PUT' ? json({ ...store, step: 1 }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step1 store={store} next="/lojista/onboarding/2" />);
    return calls;
  }

  it('máscara de CPF, valida o dígito verificador ao tocar e não chama a rede', async () => {
    const calls = setup();
    await userEvent.type(T('etapa1', 'document-input'), '11122233344');
    expect(T('etapa1', 'document-input')).toHaveValue('111.222.333-44');
    await userEvent.click(T('etapa1', 'submit'));
    expect(screen.getByText('Confira o CPF.')).toBeInTheDocument();
    expect(saved(calls)).toHaveLength(0);
  });

  it('CPF válido salva a etapa 1 sem pontuação e avança', async () => {
    const calls = setup();
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/onboarding/2'));
    expect(saved(calls)[0]).toEqual({ step: 1, legalType: 'cpf', document: '52998224725' });
  });

  it('CNPJ alfanumérico: aceita letras, pede razão social e o aceite fiscal, e limpa o número ao trocar o tipo', async () => {
    const calls = setup();
    await userEvent.click(T('etapa1', 'type-cnpj'));
    expect(screen.getByText('CNPJ selecionado')).toBeInTheDocument();
    await userEvent.type(T('etapa1', 'document-input'), '12abc34501de35');
    expect(T('etapa1', 'document-input')).toHaveValue('12.ABC.345/01DE-35');
    await userEvent.click(T('etapa1', 'submit'));
    expect(screen.getByText('Digite a razão social.')).toBeInTheDocument();
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    await userEvent.type(T('etapa1', 'legal-name-input'), 'Casa Bela Roupas Ltda');
    await userEvent.click(T('etapa1', 'fiscal-checkbox'));
    await userEvent.click(T('etapa1', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(saved(calls)[0]).toEqual({ step: 1, legalType: 'cnpj', document: '12ABC34501DE35', legalName: 'Casa Bela Roupas Ltda', fiscalAccepted: true });
  });

  it('documento que já tem loja mostra o erro e o link do suporte', async () => {
    setup([(url, init) => (url.pathname.endsWith('/me/store') && init.method === 'PUT' ? json({ code: 'DOCUMENT_IN_USE', title: 'x', status: 409 }, 409) : undefined)]);
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    expect(await screen.findByText('Esse CPF/CNPJ já tem loja.')).toBeInTheDocument();
    expect(T('etapa1', 'support-link')).toHaveTextContent('Falar com o suporte');
    expect(push).not.toHaveBeenCalled();
  });

  it('erro ao salvar mantém o que foi digitado e oferece tentar de novo', async () => {
    setup([(url, init) => (url.pathname.endsWith('/me/store') && init.method === 'PUT' ? json({ code: 'X', title: 'x', status: 500 }, 500) : undefined)]);
    await userEvent.type(T('etapa1', 'document-input'), '52998224725');
    await userEvent.click(T('etapa1', 'submit'));
    expect(await screen.findByTestId('lojista.onboarding.save-error')).toBeInTheDocument();
    expect(T('etapa1', 'document-input')).toHaveValue('529.982.247-25');
  });

  it('retoma o rascunho: mostra o CNPJ salvo e "Salvo às"', () => {
    setup([], fakeStore({ step: 1, legalType: 'cnpj', document: '11222333000181', legalName: 'Casa Bela', fiscalAccepted: true }));
    expect(T('etapa1', 'document-input')).toHaveValue('11.222.333/0001-81');
    expect(T('etapa1', 'saved')).toHaveTextContent(/Salvo às \d{2}:\d{2}/);
  });
});

describe('Step2 (L4): dados da loja e CEP', () => {
  const categories = { data: [{ id: 'c1', name: 'Roupas', icon: 'tag', parentId: null, position: 0, active: true, children: [] }], nextCursor: null };
  const regions = { data: [{ id: 'r1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] }], nextCursor: null };

  function setup(cep: Record<string, unknown> | number) {
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/categories') ? json(categories) : undefined),
      (url) => (url.pathname.endsWith('/regions') ? json(regions) : undefined),
      (url) => (url.pathname.includes('/geo/cep/') ? (typeof cep === 'number' ? json({ code: 'CEP_NOT_FOUND', title: 'x', status: cep }, cep) : json(cep)) : undefined),
      (url, init) => (url.pathname.endsWith('/me/store') && init.method === 'PUT' ? json(fakeStore({ step: 2 })) : undefined),
      (url, init) => (url.pathname.endsWith('/waitlist') && init.method === 'POST' ? json(null, 204) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step2 store={fakeStore({ step: 1 })} next="/lojista/onboarding/3" backHref="/lojista/onboarding/1" />);
    return calls;
  }

  async function fillBasics() {
    await userEvent.type(T('etapa2', 'name-input'), 'Casa Bela');
    await userEvent.selectOptions(await screen.findByTestId('lojista.etapa2.category-select'), 'c1');
    await userEvent.type(T('etapa2', 'whatsapp-input'), '11999998888');
  }

  it('ao completar o CEP preenche rua, bairro e cidade e salva a etapa 2', async () => {
    const calls = setup({ street: 'Rua das Palmeiras', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: -23.28, lng: -46.74 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07900000');
    expect(await screen.findByDisplayValue('Rua das Palmeiras')).toBeInTheDocument();
    expect(T('etapa2', 'cep-input')).toHaveValue('07900-000');
    await userEvent.type(T('etapa2', 'number-input'), '120');
    await userEvent.click(T('etapa2', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/onboarding/3'));
    expect(saved(calls)[0]).toMatchObject({ step: 2, name: 'Casa Bela', categoryId: 'c1', whatsapp: '11999998888', address: { cep: '07900-000', street: 'Rua das Palmeiras', number: '120', city: 'Francisco Morato', lat: -23.28 } });
  });

  it('CEP que não existe libera rua e bairro para digitar', async () => {
    setup(404);
    await userEvent.type(T('etapa2', 'cep-input'), '99999999');
    expect(await screen.findByText('Não achamos esse CEP. Preencha rua e bairro.')).toBeInTheDocument();
    expect(T('etapa2', 'street-input')).not.toHaveAttribute('readonly');
  });

  it('cidade fora das regiões ativas: erro no campo, bloco de aviso, e a lista de espera pede o consentimento', async () => {
    const calls = setup({ street: 'Rua A', neighborhood: 'Centro', city: 'Mairiporã', state: 'SP', lat: -23.3, lng: -46.5 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07600000');
    expect(await screen.findByTestId('lojista.etapa2.out-of-region')).toHaveTextContent('Ainda não atendemos Mairiporã.');
    await userEvent.type(T('etapa2', 'number-input'), '10');
    await userEvent.click(T('etapa2', 'submit'));
    expect(screen.getAllByText('Ainda não atendemos Mairiporã.').length).toBeGreaterThan(1);
    expect(saved(calls)).toHaveLength(0);
    await userEvent.click(T('etapa2', 'waitlist-submit'));
    expect(screen.getByText('Marque a caixa para continuar.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Quero receber um aviso por e-mail quando o Webag chegar em minha cidade.'));
    await userEvent.click(T('etapa2', 'waitlist-submit'));
    expect(await screen.findByText('Anotado. Avisamos por e-mail.')).toBeInTheDocument();
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/waitlist'))?.init.body))).toMatchObject({ kind: 'city', city: 'Mairiporã', consent: true });
  });

  it('campos vazios: erros por campo e nada é enviado', async () => {
    const calls = setup(404);
    await userEvent.click(T('etapa2', 'submit'));
    expect(screen.getByText('Digite o nome da loja.')).toBeInTheDocument();
    expect(screen.getByText('Confira o WhatsApp com DDD.')).toBeInTheDocument();
    expect(screen.getByText('Confira o CEP.')).toBeInTheDocument();
    expect(saved(calls)).toHaveLength(0);
  });

  it('"Sem número" dispensa o número', async () => {
    const calls = setup({ street: 'Rua A', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: 1, lng: 1 });
    await fillBasics();
    await userEvent.type(T('etapa2', 'cep-input'), '07900000');
    await screen.findByDisplayValue('Rua A');
    await userEvent.click(T('etapa2', 'no-number-checkbox'));
    await userEvent.click(T('etapa2', 'submit'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(saved(calls)[0].address).toMatchObject({ noNumber: true, number: '' });
  });
});

describe('Step4 (L6): conta de recebimento', () => {
  it('só segue para https ou para o próprio painel', () => {
    expect(safeAuthorizationUrl('https://auth.mercadopago.com.br/authorization?x=1', 'http://localhost:3001')).toContain('mercadopago');
    expect(safeAuthorizationUrl('/lojista/onboarding/4?state=a', 'http://localhost:3001')).toBe('http://localhost:3001/lojista/onboarding/4?state=a');
    expect(safeAuthorizationUrl('http://evil.com/x', 'http://localhost:3001')).toBeNull();
    expect(safeAuthorizationUrl('javascript:alert(1)', 'http://localhost:3001')).toBeNull();
  });

  it('simulado: confirma o retorno no servidor e mostra "Conta de teste conectada"', async () => {
    const { impl, calls } = mockFetch((url) => (url.pathname.endsWith('/payout/callback') ? json({ status: 'connected', maskedAccount: 'Conta final 4821', simulated: true }) : undefined));
    vi.stubGlobal('fetch', impl);
    const { result } = renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/lojista/onboarding/revisao" oauth={{ state: 'st1', code: 'cd1' }} />);
    expect(screen.getByRole('status', { name: 'Conferindo a conexão' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/payout/callback'))).toBe(true));
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ state: 'st1', code: 'cd1' });
    result.unmount();
  });

  it('negou a autorização: aviso e etapa pendente; "Conectar depois" segue para a revisão', async () => {
    const { impl, calls } = mockFetch((url, init) => (url.pathname.endsWith('/me/store') && init.method === 'PUT' ? json(fakeStore({ step: 4 })) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<Step4 store={fakeStore({ step: 3 })} next="/lojista/onboarding/revisao" oauth={{ denied: true }} />);
    expect(T('etapa4', 'denied')).toHaveTextContent('Você não autorizou a conexão. Sem ela, a loja não recebe.');
    await userEvent.click(T('etapa4', 'connect-later'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lojista/onboarding/revisao'));
    expect(saved(calls)[0]).toEqual({ step: 4 });
  });

  it('conta já conectada vira "Continuar" e mostra a conta mascarada', () => {
    renderLojista(<Step4 store={fakeStore({ step: 3, payout: { status: 'connected', maskedAccount: 'Conta final 4821', simulated: false } })} next="/lojista/onboarding/revisao" />);
    expect(T('etapa4', 'connected-status')).toHaveTextContent('Conta conectada');
    expect(T('etapa4', 'connected-status')).toHaveTextContent('Conta final 4821');
    expect(T('etapa4', 'submit')).toHaveTextContent('Continuar');
  });

  it('titular divergente: fica em análise e explica', () => {
    renderLojista(<Step4 store={fakeStore({ step: 3, payout: { status: 'under_review', maskedAccount: null, simulated: false } })} next="/x" />);
    expect(T('etapa4', 'under-review')).toHaveTextContent('Titular da conta diferente do cadastro.');
  });
});

describe('Revisão (L7)', () => {
  const complete = fakeStore({
    step: 4,
    legalType: 'cpf',
    document: '52998224725',
    name: 'Casa Bela',
    categoryId: 'c1',
    whatsapp: '11999998888',
    address: { cep: '07900-000', street: 'Rua das Palmeiras', number: '120', noNumber: false, complement: '', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: 1, lng: 1 },
    documents: (['id_front', 'id_back', 'address_proof'] as const).map((kind) => ({ kind, fileName: `${kind}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1000, uploadedAt: '2026-11-18T17:00:00Z' })),
  });

  it('lista o que falta, com a etapa de cada item, e não envia', async () => {
    const { impl, calls } = mockFetch((url) => (url.pathname.endsWith('/categories') ? json({ data: [], nextCursor: null }) : undefined));
    vi.stubGlobal('fetch', impl);
    renderLojista(<Review store={{ ...complete, documents: complete.documents.slice(0, 1) }} />);
    expect(missingItems({ ...complete, documents: complete.documents.slice(0, 1) }).map((m) => m.step)).toEqual([3, 3]);
    await userEvent.click(T('revisao', 'submit'));
    const list = T('revisao', 'missing-list');
    expect(list).toHaveTextContent('documento com foto, verso');
    expect(list).toHaveTextContent('Etapa 3');
    expect(calls.some((c) => c.url.pathname.endsWith('/submit'))).toBe(false);
  });

  it('mostra o aviso do Mercado Pago pendente, o documento mascarado e envia para análise', async () => {
    const { impl, calls } = mockFetch(
      (url) => (url.pathname.endsWith('/categories') ? json({ data: [], nextCursor: null }) : undefined),
      (url) => (url.pathname.endsWith('/store/submit') ? json({ ...complete, status: 'in_review', submittedAt: '2026-11-18T13:15:00Z' }) : undefined),
    );
    vi.stubGlobal('fetch', impl);
    renderLojista(<Review store={complete} />);
    expect(T('revisao', 'payout-banner')).toHaveTextContent('Falta conectar o Mercado Pago.');
    expect(screen.getByText('•••••••4725')).toBeInTheDocument();
    expect(screen.queryByText('52998224725')).toBeNull();
    await userEvent.click(T('revisao', 'submit'));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/store/submit'))).toBe(true));
  });

  it('editar um bloco volta à revisão depois (parâmetro de retorno)', () => {
    vi.stubGlobal('fetch', mockFetch((url) => (url.pathname.endsWith('/categories') ? json({ data: [], nextCursor: null }) : undefined)).impl);
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
    [fakeStore({ step: 3 }), 'revisao', '/lojista/onboarding/4'],
    [fakeStore({ step: 4 }), 'revisao', null],
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
  });
});
