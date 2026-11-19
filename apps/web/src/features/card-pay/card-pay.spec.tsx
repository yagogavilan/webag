import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardIntentView } from '@webag/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardPay, IntentProblem } from './card-pay';

const fetchMock = vi.fn();
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });
const TOKEN = 'tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const fake: CardIntentView = { amount: { amount: 5990, currency: 'BRL' }, provider: 'fake', publicKey: null, installmentsMax: 3, expiresAt: '2026-11-19T15:00:00.000Z' };
const live: CardIntentView = { ...fake, provider: 'mercadopago', publicKey: 'APP_USR-public-key' };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  delete window.MercadoPago;
  vi.unstubAllGlobals();
});

const lastBody = () => JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);

describe('página segura de cartão (provedor de teste)', () => {
  it('mostra o total, exige escolher o cartão de teste e confirma sem dizer que pagou', async () => {
    fetchMock.mockResolvedValueOnce(respond({ orderId: 'ord-1', status: 'awaiting_payment', payment: {}, threeDsUrl: null }));
    render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    expect(screen.getByTestId('public.cartao.amount')).toHaveTextContent('R$');
    expect(screen.getByTestId('public.cartao.amount')).toHaveTextContent('59,90');
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(screen.getByTestId('public.cartao.fake-error')).toHaveTextContent('Escolha um cartão de teste.');
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_approved'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByTestId('public.cartao.done')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/pay/card');
    expect(lastBody()).toEqual({ intent: TOKEN, card: { token: 'fake_tok_approved', installments: 1 } });
    expect(screen.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://order/ord-1');
    expect(screen.queryByText(/pago com sucesso/i)).not.toBeInTheDocument();
  });

  it('cartão recusado: mostra o texto seguro da API e leva de volta ao checkout do app', async () => {
    fetchMock.mockResolvedValueOnce(respond({ status: 422, code: 'PAYMENT_DECLINED', title: 'Recusado', detail: 'Limite insuficiente.' }, 422));
    render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_insufficient'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByTestId('public.cartao.failure')).toHaveTextContent('Limite insuficiente.');
    expect(screen.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://checkout');
  });

  it('sacola mudou (409), link usado (410) e sem conexão têm mensagem própria', async () => {
    for (const [status, code, text] of [[409, 'CART_CHANGED', 'Sua sacola mudou'], [410, 'CARD_INTENT_INVALID', 'Este link venceu ou já foi usado']] as const) {
      fetchMock.mockResolvedValueOnce(respond({ status, code, title: 'x' }, status));
      const { unmount } = render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
      await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_approved'));
      await userEvent.click(screen.getByTestId('public.cartao.submit'));
      expect(await screen.findByRole('heading', { name: text })).toBeInTheDocument();
      unmount();
    }
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_approved'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeInTheDocument();
  });

  it('manutenção (503 MAINTENANCE): "Voltamos já", sem cobrança e com a volta ao app', async () => {
    fetchMock.mockResolvedValueOnce(respond({ status: 503, code: 'MAINTENANCE', title: 'Voltamos já', detail: 'Atualizando o sistema.' }, 503));
    render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_approved'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByRole('heading', { name: 'Voltamos já' })).toBeInTheDocument();
    expect(screen.getByTestId('public.cartao.failure')).toHaveTextContent('Seu cartão não foi cobrado e sua sacola continua salva');
    expect(screen.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://checkout');
  });

  it('3DS do Mercado Pago abre em iframe; URL de outro domínio não abre', async () => {
    fetchMock.mockResolvedValueOnce(respond({ orderId: 'ord-2', status: 'awaiting_payment', payment: {}, threeDsUrl: 'https://api.mercadopago.com/challenge/abc' }));
    const first = render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_3ds'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByTestId('public.cartao.challenge')).toHaveAttribute('src', 'https://api.mercadopago.com/challenge/abc');
    first.unmount();
    fetchMock.mockResolvedValueOnce(respond({ orderId: 'ord-3', status: 'awaiting_payment', payment: {}, threeDsUrl: 'https://evil.example/challenge' }));
    render(<CardPay intent={TOKEN} view={fake} scheme="webag" />);
    await userEvent.click(screen.getByTestId('public.cartao.fake-fake_tok_3ds'));
    await userEvent.click(screen.getByTestId('public.cartao.submit'));
    expect(await screen.findByTestId('public.cartao.done')).toBeInTheDocument();
    expect(screen.queryByTestId('public.cartao.challenge')).not.toBeInTheDocument();
  });
});

describe('página segura de cartão (Mercado Pago)', () => {
  function stubSdk(opts: { submit?: Record<string, unknown> } = {}) {
    const unmount = vi.fn();
    const create = vi.fn(async (_brick: string, _id: string, settings: { callbacks: { onSubmit: (d: unknown) => Promise<void> } }) => {
      queueMicrotask(() => void settings.callbacks.onSubmit({ token: 'mp_card_token_123', installments: 2, payment_method_id: 'visa', issuer_id: 24, ...opts.submit }));
      return { unmount };
    });
    const ctor = vi.fn(function () {
      return { bricks: () => ({ create }) };
    });
    window.MercadoPago = ctor as unknown as typeof window.MercadoPago;
    return { create, ctor, unmount };
  }

  it('usa a chave pública da API, monta o Brick e manda só o token do cartão', async () => {
    const sdk = stubSdk();
    fetchMock.mockResolvedValueOnce(respond({ orderId: 'ord-9', status: 'awaiting_payment', payment: {}, threeDsUrl: null }));
    render(<CardPay intent={TOKEN} view={live} scheme="webag" />);
    expect(await screen.findByTestId('public.cartao.done')).toBeInTheDocument();
    expect(sdk.ctor).toHaveBeenCalledWith('APP_USR-public-key', { locale: 'pt-BR' });
    expect(sdk.create.mock.calls[0]![0]).toBe('cardPayment');
    expect(lastBody()).toEqual({ intent: TOKEN, card: { token: 'mp_card_token_123', installments: 2, paymentMethodId: 'visa', issuerId: '24' } });
    // nada de dado de cartão na chamada
    expect(JSON.stringify(lastBody())).not.toMatch(/cardNumber|cvv|securityCode|expiration/i);
    await waitFor(() => expect(sdk.unmount).toHaveBeenCalled());
  });

  it('SDK que não carrega mostra erro com "Tentar de novo"', async () => {
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement && node.src.includes('mercadopago')) queueMicrotask(() => node.onerror?.(new Event('error')));
      else original(node);
      return node;
    });
    render(<CardPay intent={TOKEN} view={live} scheme="webag" />);
    expect(await screen.findByTestId('public.cartao.sdk-error')).toBeInTheDocument();
    expect(screen.getByTestId('public.cartao.sdk-retry')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('intenção inválida', () => {
  it('mostra o problema e volta ao app', () => {
    render(<IntentProblem reason="invalid" scheme="webag" />);
    expect(screen.getByRole('heading', { name: 'Este link venceu ou já foi usado' })).toBeInTheDocument();
    expect(screen.getByTestId('public.cartao.back-to-app')).toHaveAttribute('href', 'webag://checkout');
  });
});
