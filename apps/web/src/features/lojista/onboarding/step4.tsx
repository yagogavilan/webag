'use client';

import { CheckCircle, Lock, Receipt, Wallet } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, SkeletonRows, ui } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { STORE_KEY } from '../store-context';
import s from '../lojista.module.css';
import { SaveError, StepFrame } from './step-frame';
import { draftErrorMessage, useSaveDraft } from './use-draft';

interface Props {
  store: MerchantStore;
  next: string;
  backHref?: string | undefined;
  /** Retorno do OAuth do Mercado Pago (`state` e `code`), ou `denied` quando o lojista negou. */
  oauth?: { state?: string | undefined; code?: string | undefined; denied?: boolean | undefined };
}

type Problem = 'denied' | 'level' | 'expired' | 'in_use' | null;

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
  const save = useSaveDraft();
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
      .payoutCallback({ state: oauth.state, code: oauth.code })
      .then((payout) => client.setQueryData<MerchantStore | null>(STORE_KEY, (current) => (current ? { ...current, payout } : current)))
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.code === 'PAYOUT_LEVEL_INSUFFICIENT') setProblem('level');
        else if (caught instanceof ApiError && caught.code === 'PAYOUT_ACCOUNT_IN_USE') setProblem('in_use');
        else setProblem('expired');
      })
      .finally(() => {
        setChecking(false);
        router.replace('/lojista/onboarding/4' as never);
      });
  }, [oauth, client, router]);

  async function connect() {
    setFormError(null);
    setProblem(null);
    setConnecting(true);
    try {
      const { authorizationUrl } = await merchantApi.connectPayout('/lojista/onboarding/4');
      const target = safeAuthorizationUrl(authorizationUrl, window.location.origin);
      if (!target) throw new Error('destino inválido');
      window.location.assign(target);
    } catch (caught) {
      setConnecting(false);
      setFormError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para conectar sua conta.' : 'Não foi possível abrir o Mercado Pago. Tente de novo.');
    }
  }

  async function advance(event?: FormEvent) {
    event?.preventDefault();
    if (!connected) return connect();
    setFormError(null);
    try {
      await save.mutateAsync({ step: Math.max(store.step, 4) });
      router.push(next as never);
    } catch (caught) {
      setFormError(draftErrorMessage(caught));
    }
  }

  async function later() {
    setFormError(null);
    try {
      await save.mutateAsync({ step: Math.max(store.step, 4) });
      router.push(next as never);
    } catch (caught) {
      setFormError(draftErrorMessage(caught));
    }
  }

  return (
    <StepFrame
      step={4}
      screen="etapa4"
      title="Onde você recebe?"
      savedAt={store.step >= 4 ? store.updatedAt : null}
      backHref={backHref}
      submitLabel={connected ? 'Continuar' : 'Conectar Mercado Pago'}
      busyLabel={connecting ? 'Abrindo o Mercado Pago…' : 'Salvando…'}
      busy={connecting || save.isPending}
      onSubmit={advance}
      error={formError ? <SaveError message={formError} /> : null}
      extraAction={
        !connected ? (
          <Button variant="text" onClick={() => void later()} disabled={save.isPending || connecting} data-testid={ltid('etapa4', 'connect-later')}>
            Conectar depois
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
      {problem === 'expired' ? <Banner tone="warning" testId={ltid('etapa4', 'expired')}>Link expirado. Conecte de novo.</Banner> : null}
      {!connected ? (
        <p className={`wb-text-caption ${ui.muted}`} style={{ margin: 0 }}>
          A loja só vai ao ar depois de conectar.
        </p>
      ) : null}
    </StepFrame>
  );
}
