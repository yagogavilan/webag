'use client';

import { CheckCircle, LockKey, WarningCircle } from '@phosphor-icons/react';
import type { CardIntentView } from '@webag/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Banner, Button, Logo, MessageState, RadioCards, cx, ui } from '@/components/ui';
import { networkError, toApiError } from '@/lib/api/errors';
import { FAKE_CARDS, appLink, describeFailure, isChallengeUrl, type Failure } from '@/lib/card-pay';
import { loadMercadoPago, type BrickController, type BrickFormData } from '@/lib/card-pay/mercadopago';
import { formatCents, formatClock } from '@/lib/format';
import s from './card-pay.module.css';

type CardToken = { token: string; installments: number; paymentMethodId?: string; issuerId?: string };
type Stage = { name: 'form' } | { name: 'challenge'; orderId: string; url: string } | { name: 'done'; orderId: string } | { name: 'failed'; failure: Failure };

/** Moldura das páginas públicas de pagamento: só a marca, sem menu nem login do painel (SEC-106). */
export function PayFrame({ children }: { children: ReactNode }) {
  return (
    <main className={s.page}>
      <Logo size={40} />
      {children}
    </main>
  );
}

/** Botão que abre o app por deep link. É `<a>` comum: o esquema do app não é rota do Next. */
function AppButton({ href, children, variant = 'primary', testId }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary'; testId: string }) {
  return (
    <a className={cx(ui.button, ui.lg, ui[variant])} href={href} data-testid={testId}>
      {children}
    </a>
  );
}

/** Intenção inválida, vencida ou usada (e falhas de leitura). Sempre com o caminho de volta ao app. */
export function IntentProblem({ reason, scheme }: { reason: 'invalid' | 'busy' | 'unavailable'; scheme: string }) {
  const copy = {
    invalid: { title: 'Este link venceu ou já foi usado', text: 'Volte ao app e escolha pagar com cartão de novo.' },
    busy: { title: 'Muitas tentativas', text: 'Espere um pouco e volte ao app para tentar de novo.' },
    unavailable: { title: 'Não conseguimos abrir o pagamento agora', text: 'Nenhum valor foi cobrado. Volte ao app e tente de novo em instantes.' },
  }[reason];
  return (
    <PayFrame>
      <div className={cx(ui.card, s.card)}>
        <MessageState icon={WarningCircle} title={copy.title} text={copy.text} testId="public.cartao.invalid" role="alert" focusTitle>
          <AppButton href={appLink(scheme, 'checkout')} testId="public.cartao.back-to-app">
            Voltar ao app
          </AppButton>
        </MessageState>
      </div>
    </PayFrame>
  );
}

async function submitCard(intent: string, card: CardToken): Promise<{ orderId: string; threeDsUrl: string | null }> {
  let response: Response;
  try {
    response = await fetch('/api/pay/card', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-webag-client': 'web' },
      body: JSON.stringify({ intent, card }),
      credentials: 'omit',
    });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { orderId: string; threeDsUrl: string | null };
  return { orderId: body.orderId, threeDsUrl: body.threeDsUrl ?? null };
}

/**
 * Página segura de cartão (B.2). O navegador só vê o token que o Mercado Pago gera dentro dos iframes dele; esta tela nunca
 * recebe nem guarda número, validade ou CVV. O resultado do pagamento é do servidor: aqui só se diz "voltar ao app".
 */
export function CardPay({ intent, view, scheme }: { intent: string; view: CardIntentView; scheme: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'form' });
  const [sending, setSending] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fakeToken, setFakeToken] = useState<string | null>(null);
  const [fakeError, setFakeError] = useState<string | null>(null);
  const sent = useRef(false);
  const live = view.provider === 'mercadopago' && Boolean(view.publicKey);

  const send = useCallback(
    async (card: CardToken) => {
      if (sent.current) return; // a intenção é de uso único: um toque duplo não vira dois pagamentos
      sent.current = true;
      setSending(true);
      try {
        const result = await submitCard(intent, card);
        setStage(isChallengeUrl(result.threeDsUrl) ? { name: 'challenge', orderId: result.orderId, url: result.threeDsUrl } : { name: 'done', orderId: result.orderId });
      } catch (error) {
        setStage({ name: 'failed', failure: describeFailure(error) });
      } finally {
        setSending(false);
      }
    },
    [intent],
  );

  // Brick do Mercado Pago (provedor real).
  useEffect(() => {
    if (!live || stage.name !== 'form') return;
    let cancelled = false;
    let controller: BrickController | null = null;
    loadMercadoPago()
      .then(async () => {
        if (cancelled || !window.MercadoPago || !view.publicKey) return;
        const mp = new window.MercadoPago(view.publicKey, { locale: 'pt-BR' });
        const created = await mp.bricks().create('cardPayment', 'cardPaymentBrick', {
          initialization: { amount: view.amount.amount / 100 },
          customization: { paymentMethods: { minInstallments: 1, maxInstallments: view.installmentsMax } },
          locale: 'pt-BR',
          callbacks: {
            onSubmit: async (data: BrickFormData) => {
              await send({
                token: data.token,
                installments: Number(data.installments) || 1,
                ...(data.payment_method_id ? { paymentMethodId: String(data.payment_method_id) } : {}),
                ...(data.issuer_id ? { issuerId: String(data.issuer_id) } : {}),
              });
            },
            onError: () => setSdkError(true),
          },
        });
        if (cancelled) created.unmount();
        else controller = created;
      })
      .catch(() => {
        if (!cancelled) setSdkError(true);
      });
    return () => {
      cancelled = true;
      controller?.unmount();
    };
  }, [live, stage.name, view.publicKey, view.amount.amount, view.installmentsMax, send, attempt]);

  const expires = formatClock(view.expiresAt);

  if (stage.name === 'done') {
    return (
      <PayFrame>
        <div className={cx(ui.card, s.card)}>
          <MessageState icon={CheckCircle} title="Pagamento enviado" text="Volte ao app para ver o pedido. A confirmação do pagamento aparece lá, vinda do Webag." testId="public.cartao.done" focusTitle>
            <AppButton href={appLink(scheme, `order/${stage.orderId}`)} testId="public.cartao.back-to-app">
              Voltar ao app
            </AppButton>
          </MessageState>
        </div>
      </PayFrame>
    );
  }

  if (stage.name === 'failed') {
    return (
      <PayFrame>
        <div className={cx(ui.card, s.card)}>
          <MessageState icon={WarningCircle} title={stage.failure.title} text={stage.failure.text} testId="public.cartao.failure" role="alert" focusTitle>
            <AppButton href={appLink(scheme, 'checkout')} testId="public.cartao.back-to-app">
              Voltar ao app
            </AppButton>
          </MessageState>
        </div>
      </PayFrame>
    );
  }

  if (stage.name === 'challenge') {
    return (
      <PayFrame>
        <div className={cx(ui.card, s.card)}>
          <h1 className={cx('wb-text-title1', s.title)}>Confirme com o seu banco</h1>
          <p className="wb-text-body">O banco pede uma confirmação para liberar esta compra. Siga os passos abaixo.</p>
          <iframe className={s.challenge} src={stage.url} title="Verificação do banco" referrerPolicy="no-referrer" data-testid="public.cartao.challenge" />
          <AppButton href={appLink(scheme, `order/${stage.orderId}`)} testId="public.cartao.challenge-done">
            Já confirmei, voltar ao app
          </AppButton>
        </div>
      </PayFrame>
    );
  }

  return (
    <PayFrame>
      <div className={cx(ui.card, s.card)}>
        <h1 className={cx('wb-text-title1', s.title)}>Pagar com cartão</h1>
        <div className={s.amount}>
          <span className="wb-text-caption">Total do pedido</span>
          <span className="wb-text-title2" data-testid="public.cartao.amount">
            {formatCents(view.amount.amount)}
          </span>
          <span className={cx('wb-text-caption', s.secure)}>
            <LockKey size={16} weight="fill" aria-hidden="true" />
            Os dados do cartão vão direto ao Mercado Pago. O Webag não os recebe. Vale até {expires}.
          </span>
        </div>

        {live ? (
          sdkError ? (
            <Banner
              tone="danger"
              testId="public.cartao.sdk-error"
              action={
                <Button variant="secondary" size="sm" onClick={() => {
                    setSdkError(false);
                    setAttempt((n) => n + 1);
                  }} data-testid="public.cartao.sdk-retry">
                  Tentar de novo
                </Button>
              }
            >
              Não conseguimos carregar o formulário de cartão. Confira a conexão e tente de novo.
            </Banner>
          ) : (
            <div id="cardPaymentBrick" className={s.brick} aria-busy={sending || undefined} data-testid="public.cartao.brick" />
          )
        ) : (
          <>
            <Banner tone="warning" testId="public.cartao.fake-banner">
              Ambiente de teste: escolha um cartão de teste. Nenhum cartão real é usado.
            </Banner>
            <RadioCards
              legend="Cartão de teste"
              name="fake-card"
              value={fakeToken}
              onChange={(value) => {
                setFakeToken(value);
                setFakeError(null);
              }}
              options={FAKE_CARDS.map((card) => ({ value: card.token, label: card.title, description: card.hint, testId: `public.cartao.fake-${card.token}` }))}
            />
            {fakeError ? (
              <p role="alert" className="wb-text-caption" style={{ color: 'var(--wb-color-text-danger)', margin: 0 }} data-testid="public.cartao.fake-error">
                {fakeError}
              </p>
            ) : null}
            <Button
              size="lg"
              loading={sending}
              loadingLabel="Enviando pagamento"
              data-testid="public.cartao.submit"
              onClick={() => (fakeToken ? void send({ token: fakeToken, installments: 1 }) : setFakeError('Escolha um cartão de teste.'))}
            >
              {`Pagar ${formatCents(view.amount.amount)}`}
            </Button>
          </>
        )}
        {sending && live ? (
          <p className="wb-text-caption" role="status">
            Enviando o pagamento. Não feche esta página.
          </p>
        ) : null}
      </div>
    </PayFrame>
  );
}
