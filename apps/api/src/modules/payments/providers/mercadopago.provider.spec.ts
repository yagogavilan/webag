import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../platform/http/app-error.js';
import { ProviderTimeoutError } from '../payment-provider.js';
import { SellerCredentialsRegistry } from '../seller-credentials.js';
import { MercadoPagoPaymentProvider } from './mercadopago.provider.js';
import { mapDecline, mapStatus, mpExpiration, toCents, toProviderPayment, toReais } from './mercadopago.mapping.js';

/**
 * Respostas modeladas na documentação pública do MP e no SDK oficial (`mercadopago@3.6.2`). NENHUMA chamada real foi feita:
 * tudo que depende do comportamento do sandbox está marcado `[confirmar no sandbox]` no código do adaptador.
 */
const PIX_PENDING = {
  id: 1_234_567_890,
  status: 'pending',
  status_detail: 'pending_waiting_transfer',
  transaction_amount: 105,
  currency_id: 'BRL',
  external_reference: 'order-1',
  collector_id: 777,
  fee_details: [{ type: 'application_fee', amount: 10, fee_payer: 'collector' }],
  point_of_interaction: { transaction_data: { qr_code: '00020126580014br.gov.bcb.pix0136abc', qr_code_base64: 'iVBORw0KGgo=' } },
};

const config = (extra: Record<string, unknown> = {}) =>
  ({ get: (key: string) => ({ API_PUBLIC_URL: 'https://api.webag.test', MP_ACCESS_TOKEN: 'APP_USR-platform', MP_WEBHOOK_SECRET: 'whsec-test-0123456789', ...extra })[key] }) as unknown as ConfigService<never, true>;

describe('mapeamento do Mercado Pago', () => {
  it('dinheiro: reais do MP viram centavos inteiros sem erro de ponto flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(105)).toBe(10_500);
    expect(toCents(10.99)).toBe(1_099);
    expect(toReais(10_500)).toBe(105);
    expect(toReais(1_099)).toBe(10.99);
    expect(toReais(7)).toBe(0.07);
    expect(toCents(undefined)).toBe(0);
  });

  it('estados: aprovado, recusado, PIX vencido (cancelled/expired), 3DS, estornado e o que ainda não é dinheiro', () => {
    expect(mapStatus({ status: 'approved' })).toBe('approved');
    expect(mapStatus({ status: 'rejected' })).toBe('declined');
    expect(mapStatus({ status: 'cancelled', status_detail: 'expired' })).toBe('expired');
    expect(mapStatus({ status: 'cancelled', status_detail: 'by_collector' })).toBe('cancelled');
    expect(mapStatus({ status: 'refunded' })).toBe('refunded');
    expect(mapStatus({ status: 'in_process' })).toBe('pending');
    expect(mapStatus({ status: 'authorized' })).toBe('pending');
    expect(mapStatus({ status: 'pending', status_detail: 'pending_challenge', three_ds_info: { external_resource_url: 'https://mp/3ds' } })).toBe('pending_3ds');
    expect(mapStatus({ status: 'pending', status_detail: 'pending_challenge' })).toBe('pending');
    expect(mapStatus({ status: 'charged_back' })).toBe('approved');
    expect(toProviderPayment({ id: 1, status: 'charged_back' }).disputed).toBe(true); // I2: contestado fica visível
    expect(toProviderPayment({ id: 1, status: 'in_mediation' }).disputed).toBe(true);
    expect(toProviderPayment({ id: 1, status: 'approved' }).disputed).toBeUndefined();
    expect(mapStatus({ status: 'algo_novo' })).toBe('pending');
  });

  it('motivos de recusa viram códigos estáveis, nunca o texto do provedor', () => {
    expect(mapDecline('cc_rejected_insufficient_amount')).toBe('insufficient_funds');
    expect(mapDecline('cc_rejected_bad_filled_security_code')).toBe('invalid_card');
    expect(mapDecline('cc_rejected_other_reason')).toBe('rejected_by_issuer');
    expect(mapDecline(undefined)).toBe('rejected_by_issuer');
  });

  it('pagamento: valor, comissão (fee_details), tarifa do MP, recebedor, PIX e estornado', () => {
    const mapped = toProviderPayment({ ...PIX_PENDING, status: 'approved', transaction_amount_refunded: 30, fee_details: [...PIX_PENDING.fee_details, { type: 'mercadopago_fee', amount: 1.04, fee_payer: 'collector' }] });
    expect(mapped).toMatchObject({ providerPaymentId: '1234567890', status: 'approved', amountCents: 10_500, applicationFeeCents: 1_000, providerFeeCents: 104, receiverId: '777', refundedCents: 3_000, pixCopyPaste: '00020126580014br.gov.bcb.pix0136abc', pixQrBase64: 'iVBORw0KGgo=' });
  });

  it('expiração do PIX com offset -03:00 e milissegundos (formato exigido pelo MP)', () => {
    expect(mpExpiration(new Date('2026-11-18T23:45:00.000Z'))).toBe('2026-11-18T20:45:00.000-03:00');
  });
});

describe('adaptador Mercado Pago (SDK oficial) com HTTP simulado', () => {
  let sellers: SellerCredentialsRegistry;
  let provider: MercadoPagoPaymentProvider;
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  const respond = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    const headers = new Headers(init?.headers);
    return { url, method: init?.method, headers, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    sellers = new SellerCredentialsRegistry();
    sellers.register((storeId) => Promise.resolve(storeId === 'store-ok' ? { accessToken: 'APP_USR-seller-token', providerAccountId: '777' } : null));
    provider = new MercadoPagoPaymentProvider(config(), sellers);
  });
  afterEach(() => vi.unstubAllGlobals());

  const pixInput = { attemptId: 'attempt-1', method: 'pix' as const, amountCents: 10_500, applicationFeeCents: 1_000, externalReference: 'order-1', storeId: 'store-ok', installments: 1, payer: { email: 'maria@teste.com' }, expiresAt: new Date('2026-11-18T23:45:00.000Z') };

  it('PIX: cobra com o token DO LOJISTA, X-Idempotency-Key = tentativa, application_fee e notification_url do Webag', async () => {
    fetchMock.mockReturnValueOnce(respond(201, PIX_PENDING));
    const result = await provider.createPayment(pixInput);
    const call = lastCall();
    expect(call.url).toBe('https://api.mercadopago.com/v1/payments');
    expect(call.method).toBe('POST');
    expect(call.headers.get('authorization')).toBe('Bearer APP_USR-seller-token');
    expect(call.headers.get('x-idempotency-key')).toBe('attempt-1');
    expect(call.body).toMatchObject({ transaction_amount: 105, application_fee: 10, payment_method_id: 'pix', external_reference: 'order-1', notification_url: 'https://api.webag.test/v1/webhooks/mercadopago', date_of_expiration: '2026-11-18T20:45:00.000-03:00', payer: { email: 'maria@teste.com' } });
    expect(result).toMatchObject({ status: 'pending', amountCents: 10_500, applicationFeeCents: 1_000, receiverId: '777', pixCopyPaste: '00020126580014br.gov.bcb.pix0136abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // criação nunca é retentada pelo SDK
  });

  it('cartão: só o TOKEN e dados do checkout; nada que pareça número de cartão sai nem entra', async () => {
    fetchMock.mockReturnValueOnce(respond(201, { ...PIX_PENDING, status: 'approved', point_of_interaction: undefined }));
    await provider.createPayment({ ...pixInput, method: 'card', cardToken: 'tok_abc123def456', installments: 2, card: { paymentMethodId: 'visa', issuerId: '25' }, expiresAt: undefined });
    const body = lastCall().body!;
    expect(body).toMatchObject({ token: 'tok_abc123def456', installments: 2, payment_method_id: 'visa', issuer_id: 25, application_fee: 10, capture: true });
    expect(JSON.stringify(body)).not.toMatch(/\b\d{13,19}\b/);
    expect(body).not.toHaveProperty('card_number');
    expect(body).not.toHaveProperty('security_code');
  });

  it('CPF do pagador só vai quando informado', async () => {
    fetchMock.mockReturnValueOnce(respond(201, PIX_PENDING));
    await provider.createPayment({ ...pixInput, payer: { email: 'a@b.com', document: '12345678909' } });
    expect(lastCall().body!.payer).toMatchObject({ identification: { type: 'CPF', number: '12345678909' } });
  });

  it('3DS e recusa por saldo aparecem como o domínio entende', async () => {
    fetchMock.mockReturnValueOnce(respond(201, { ...PIX_PENDING, point_of_interaction: undefined, status: 'pending', status_detail: 'pending_challenge', three_ds_info: { external_resource_url: 'https://www.mercadopago.com.br/3ds/abc' } }));
    expect(await provider.createPayment({ ...pixInput, method: 'card', cardToken: 'tok_12345678' })).toMatchObject({ status: 'pending_3ds', threeDsUrl: 'https://www.mercadopago.com.br/3ds/abc' });
    fetchMock.mockReturnValueOnce(respond(201, { ...PIX_PENDING, point_of_interaction: undefined, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }));
    expect(await provider.createPayment({ ...pixInput, method: 'card', cardToken: 'tok_12345678' })).toMatchObject({ status: 'declined', declineReason: 'insufficient_funds' });
  });

  it('loja sem conta conectada NÃO cobra (nunca cai para o token da plataforma)', async () => {
    await expect(provider.createPayment({ ...pixInput, storeId: 'store-sem-conta' })).rejects.toMatchObject({ code: 'STORE_PAYMENT_ACCOUNT_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erros: timeout e 5xx na escrita são ambíguos (ProviderTimeoutError); 4xx é recusa sem o texto do provedor; 401 pede reconexão', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    await expect(provider.createPayment(pixInput)).rejects.toBeInstanceOf(ProviderTimeoutError);
    fetchMock.mockReturnValueOnce(respond(500, { message: 'boom' }));
    await expect(provider.createPayment(pixInput)).rejects.toBeInstanceOf(ProviderTimeoutError);
    fetchMock.mockReturnValueOnce(respond(400, { message: 'invalid payer secret-text', error: 'bad_request', status: 400, cause: [] }));
    const rejected = await provider.createPayment(pixInput).catch((e: unknown) => e as AppError);
    expect(rejected).toMatchObject({ code: 'PAYMENT_PROVIDER_REJECTED' });
    expect(JSON.stringify((rejected as AppError).problem)).not.toContain('secret-text');
    fetchMock.mockReturnValueOnce(respond(401, { message: 'invalid token', status: 401 }));
    await expect(provider.createPayment(pixInput)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_AUTH' });
  });

  it('consulta: devolve o estado do provedor; 404 vira null; usa o token do lojista', async () => {
    fetchMock.mockReturnValueOnce(respond(200, { ...PIX_PENDING, status: 'approved' }));
    expect(await provider.getPayment('1234567890', { storeId: 'store-ok' })).toMatchObject({ status: 'approved', receiverId: '777' });
    expect(lastCall()).toMatchObject({ url: 'https://api.mercadopago.com/v1/payments/1234567890', method: 'GET' });
    expect(lastCall().headers.get('authorization')).toBe('Bearer APP_USR-seller-token');
    fetchMock.mockReturnValueOnce(respond(404, { message: 'not found', status: 404 }));
    expect(await provider.getPayment('999', { storeId: 'store-ok' })).toBeNull();
  });

  it('estorno total e parcial: POST /refunds com o valor em reais e a chave de idempotência do estorno', async () => {
    fetchMock.mockReturnValueOnce(respond(201, { id: 55, payment_id: 1_234_567_890, amount: 30, status: 'approved' }));
    expect(await provider.refund('1234567890', 3_000, 'refund-key-1', { storeId: 'store-ok' })).toEqual({ providerRefundId: '55', amountCents: 3_000 });
    const call = lastCall();
    expect(call).toMatchObject({ url: 'https://api.mercadopago.com/v1/payments/1234567890/refunds', method: 'POST', body: { amount: 30 } });
    expect(call.headers.get('x-idempotency-key')).toBe('refund-key-1');
    fetchMock.mockReturnValueOnce(respond(201, { id: 56, amount: 105 }));
    expect((await provider.refund('1234567890', 10_500, 'refund-key-2', { storeId: 'store-ok' })).amountCents).toBe(10_500);
    expect(lastCall().body).toEqual({ amount: 105 });
  });

  it('recebedor esperado vem da conta do lojista (SEC-034) e o CPF é exigido só se configurado', async () => {
    expect(await provider.expectedReceiverId('store-ok')).toBe('777');
    expect(await provider.expectedReceiverId('store-sem-conta')).toBeNull();
    expect(provider.requiresPayerDocument('pix')).toBe(false);
    expect(new MercadoPagoPaymentProvider(config({ MP_PAYER_DOCUMENT_REQUIRED: true }), sellers).requiresPayerDocument('pix')).toBe(true);
    expect(new MercadoPagoPaymentProvider(config({ MP_PAYER_DOCUMENT_REQUIRED: true }), sellers).requiresPayerDocument('card')).toBe(false);
  });
});
