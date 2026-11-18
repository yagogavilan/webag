'use client';

import { Storefront } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, CheckboxField, Logo, MessageState } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { currentLegalRefs, merchantApi } from '@/lib/api/lojista';
import { ltid } from '@/lib/testid';
import { EmailCodeStep } from './email-code-step';
import s from './lojista.module.css';

/**
 * Conta aberta, mas ainda sem o papel de lojista: cliente que vai abrir a loja (L1 C2, onda-1b E7) ou cadastro
 * interrompido antes do código. Confirma o e-mail se preciso e concede o papel com o aceite dos Termos do lojista.
 */
export function StartStore({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  const router = useRouter();
  const [verified, setVerified] = useState(emailVerified);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [form, setForm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setForm(null);
    if (!terms) return setError('Marque a caixa para continuar.');
    setError(undefined);
    setBusy(true);
    try {
      await merchantApi.becomeMerchant(await currentLegalRefs(['merchant_terms']));
      router.replace('/lojista/onboarding/1' as never);
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'MERCHANT_SIGNUP_DISABLED') return setForm('O cadastro de lojas está indisponível no momento. Tente de novo mais tarde.');
      if (caught instanceof ApiError && caught.code === 'EMAIL_VERIFICATION_REQUIRED') return setVerified(false);
      setForm(caught instanceof ApiError && caught.isNetwork ? 'Sem conexão. Conecte-se para continuar.' : 'Não foi possível abrir o cadastro. Tente de novo.');
    }
  }

  return (
    <div className={s.signupPage}>
      <header className={s.signupHeader}>
        <Logo size={32} />
      </header>
      <div className={s.signupBody} style={{ gridTemplateColumns: '1fr' }}>
        {!verified ? (
          <EmailCodeStep email={currentEmail} onVerified={() => setVerified(true)} onEmailChanged={setCurrentEmail} />
        ) : (
          <div className={s.formCol}>
            <MessageState icon={Storefront} title="Você ainda não tem uma loja" text="Cadastre a sua em cerca de 10 minutos." focusTitle testId={ltid('start', 'empty')} />
            <CheckboxField
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              error={error}
              data-testid={ltid('start', 'terms-checkbox')}
              label={
                <>
                  Aceito os{' '}
                  <a href="/termos-lojista" target="_blank" rel="noopener noreferrer">
                    Termos do lojista
                  </a>
                </>
              }
            />
            {form ? <Banner tone="danger">{form}</Banner> : null}
            <Button size="lg" loading={busy} loadingLabel="Abrindo…" onClick={() => void start()} data-testid={ltid('start', 'submit')}>
              Cadastrar minha loja
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
