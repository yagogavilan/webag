'use client';

import { CheckCircle, Lock, Receipt, Wallet } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useReauth } from '@/components/panel/reauth';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, SkeletonRows, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { STORE_KEY } from '../store-context';
import s from '../lojista.module.css';
import { SaveError, StepFrame } from './step-frame';

interface Props {
  store: MerchantStore;
  next: string;
  backHref?: string | undefined;
  /** Retorno do OAuth do Mercado Pago (`state` e `code`), ou `denied` quando o lojista negou. */
  oauth?: { state?: string | undefined; code?: string | undefined; denied?: boolean | undefined };
}

type Problem = 'denied' | 'level' | 'expired' | 'in_use' | 'network' | null;

/** Só segue para o Mercado Pago (https) ou volta para o próprio painel; qualquer outro destino é recusado. */
export function safeAuthorizationUrl(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.protocol === 'https:' || url.origin === origin) return url.toString();
  } catch {
    /* URL inválida */
  }
  return null;
}

/** L6, Etapa 4 de 4: ligar a conta de recebimento (OAuth do Mercado Pago; em dev, provedor simulado). */
export function Step4({ store, next, backHref, oauth }: Props) {
  const router = useRouter();
  const client = useQueryClient();
  const reauth = useReauth();
  const toast = useToast();
  const handled = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(Boolean(oauth?.state && oauth.code));
  const [problem, setProblem] = useState<Problem>(oauth?.denied ? 'denied' : null);
  const [formError, setFormError] = useState<string | null>(null);
  const status = store.payout.status;
  const connected = status === 'connected';

  // Volta do Mercado Pago: confirma com o servidor (state de uso único); nunca confia no que veio na URL.
  useEffect(() => {
    if (handled.current || !oauth?.state || !oauth.code) return;
    handled.current = true;
    merchantApi
      .payoutCallback(store.id, { state: oauth.state, code: oauth.code })
      .then((payout) => client.setQueryData<MerchantStore | null>(STORE_KEY, (current) => (current ? { ...current, payout } : current)))
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.code === 'PAYMENT_ACCOUNT_LEVEL_INSUFFICIENT') setProblem('level');
        else if (caught instanceof ApiError && caught.code === 'PAYMENT_ACCOUNT_IN_USE') setProblem('in_use');
        else if (caught instanceof ApiError && caught.isNetwork) setProblem('network');
        else setProblem('expired');
      })
      .finally(() => {
        setChecking(false);
        router.replace('/lojista/onboarding/4' as never);
      });
  }, [oauth, client, router, store.id]);

  async function connect() {
    setFormError(null);
    setProblem(null);
    setConnecting(true);
    try {
      // Trocar ou ligar a conta de recebimento exige a senha digitada há menos de 5 min (SEC-109).
      const { authorizationUrl } = await reauth.guard(() => merchantApi.connectPayout(store.id), 'Digite sua senha para conectar a conta de recebimento.');
      const target = safeAuthorizationUrl(authorizationUrl, window.location.origin);
      if (!target) throw new Error('destino inválido');
      window.location.assign(target);
    } catch (caught) {
      setConnecting(false);
      if (caught instanceof ApiError && caught.code === 'REAUTH_CANCELLED') return;
      setFormError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para conectar sua conta.' : 'Não foi possível abrir o Mercado Pago. Tente de novo.');
    }
  }

  async function advance(event?: FormEvent) {
    event?.preventDefault();
    if (!connected) return connect();
    router.push(next as never);
  }

  /** Volta ao painel com o rascunho guardado. Não promete adiar o que a Revisão bloqueia: sem a conta, o envio não acontece. */
  function later() {
    toast.show('Rascunho salvo. Sem a conta de recebimento não dá para enviar para análise.');
    router.push('/lojista' as never);
  }

  return (
    <StepFrame
      step={4}
      screen="etapa4"
      title="Onde você recebe?"
      savedAt={null}
      backHref={backHref}
      submitLabel={connected ? 'Continuar' : 'Conectar Mercado Pago'}
      busyLabel={connecting ? 'Abrindo o Mercado Pago…' : 'Salvando…'}
      busy={connecting}
      onSubmit={advance}
      error={formError ? <SaveError message={formError} /> : null}
      extraAction={
        !connected ? (
          <Button variant="text" onClick={later} disabled={connecting} data-testid={ltid('etapa4', 'connect-later')}>
            Salvar e continuar depois
          </Button>
        ) : null
      }
    >
      <ul className={ui.stack} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {[
          [Wallet, 'Você recebe direto na sua conta Mercado Pago.'],
          [Receipt, 'O Webag desconta a comissão de cada venda.'],
          [Lock, 'Você não precisa dar sua senha ao Webag.'],
        ].map(([Icon, text]) => {
          const RowIcon = Icon as typeof Wallet;
          return (
            <li key={text as string} className={s.fact}>
              <span className={s.factIcon}>
                <RowIcon size={24} aria-hidden="true" />
              </span>
              <span className="wb-text-body">{text as string}</span>
            </li>
          );
        })}
      </ul>

      {checking ? <SkeletonRows rows={1} height={64} label="Conferindo a conexão" /> : null}

      {connected ? (
        <Banner tone="success" testId={ltid('etapa4', 'connected-status')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={20} weight="fill" aria-hidden="true" />
            <strong>{store.payout.simulated ? 'Conta de teste conectada' : 'Conta conectada'}</strong>
          </span>
          {store.payout.maskedAccount ? <span> {store.payout.maskedAccount}</span> : null}
        </Banner>
      ) : status === 'under_review' ? (
        <Banner tone="warning" testId={ltid('etapa4', 'under-review')}>
          Titular da conta diferente do cadastro. Aguarde a análise ou conecte outra conta.
        </Banner>
      ) : null}

      {problem === 'denied' ? <Banner tone="warning" testId={ltid('etapa4', 'denied')}>Você não autorizou a conexão. Sem ela, a loja não recebe.</Banner> : null}
      {problem === 'level' ? (
        <Banner tone="warning" testId={ltid('etapa4', 'level')}>
          Sua conta Mercado Pago ainda não pode receber pelo Webag. Abra o app do Mercado Pago, complete o cadastro e tente de novo.{' '}
          <a href="https://www.mercadopago.com.br/ajuda" target="_blank" rel="noopener noreferrer">
            Ver como resolver
          </a>
        </Banner>
      ) : null}
      {problem === 'in_use' ? (
        <Banner tone="warning" testId={ltid('etapa4', 'in-use')}>
          Essa conta já está em uso por outra loja.{' '}
          <a href={supportHref()} target="_blank" rel="noopener noreferrer">
            Fale com o suporte
          </a>
        </Banner>
      ) : null}
      {problem === 'network' ? <Banner tone="warning">Sem conexão. Conecte-se para conferir a conta e tente de novo.</Banner> : null}
      {problem === 'expired' ? <Banner tone="warning" testId={ltid('etapa4', 'expired')}>Link expirado. Conecte de novo.</Banner> : null}
      {!connected ? (
        <p className={`wb-text-caption ${ui.muted}`} style={{ margin: 0 }}>
          Sem a conta de recebimento não dá para enviar para análise.
        </p>
      ) : null}
    </StepFrame>
  );
}
