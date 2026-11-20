'use client';

import { Clock, Package, Storefront } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, CheckboxField, EmptyState, Logo, NewPasswordPair, TextField, passwordStrength, ui } from '@/components/ui';
import { sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { currentLegalRefs, merchantApi, type LegalDoc } from '@/lib/api/lojista';
import { isValidEmail, isValidPhone, maskPhone, suggestEmailDomain } from '@/lib/br/mask';
import { ltid } from '@/lib/testid';
import { EmailCodeStep } from './email-code-step';
import s from './lojista.module.css';

interface Errors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirm?: string;
  terms?: string;
  form?: string;
}

const WEAK = 'Senha fraca. Use 8 caracteres ou mais, com letras e números.';

/** Cria a conta, confirma o e-mail e concede o papel de lojista (aceite dos Termos do lojista já dado na caixa de L1). */
async function becomeMerchantAndContinue(accepted: LegalDoc[]) {
  const merchant = accepted.find((doc) => doc.type === 'merchant_terms') ?? (await currentLegalRefs(['merchant_terms']))[0];
  if (!merchant) throw new Error('sem termos');
  await merchantApi.becomeMerchant([merchant]);
}

/** L1 (e L2 no mesmo lugar). Desktop em 2 colunas; celular em 1. */
export function SignupForm({ signupOpen }: { signupOpen: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'form' | 'code'>('form');
  const [accepted, setAccepted] = useState<LegalDoc[]>([]);
  const [closed, setClosed] = useState(!signupOpen);
  const suggestion = suggestEmailDomain(email);

  useEffect(() => {
    // Erros: foco no 1º campo inválido (onda-2 §0.3).
    if (Object.keys(errors).length > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Digite seu nome.';
    if (!isValidEmail(email)) next.email = 'Confira o e-mail.';
    if (!isValidPhone(phone)) next.phone = 'Confira o celular com DDD.';
    if (passwordStrength(password) === 'weak') next.password = WEAK;
    if (confirm !== password) next.confirm = 'As senhas não são iguais.';
    if (!terms) next.terms = 'Marque a caixa para continuar.';
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const refs = await currentLegalRefs(['customer_terms', 'privacy', 'merchant_terms']);
      setAccepted(refs);
      const result = await sessionRequest<{ emailVerified: boolean }>('lojista', 'register', {
        name: name.trim(),
        email: email.trim(),
        phone,
        password,
        adultDeclaration: true,
        // /auth/register só aceita os termos do cliente e a privacidade; os Termos do lojista entram em /me/merchant-role.
        acceptedDocuments: refs.filter((doc) => doc.type !== 'merchant_terms'),
      });
      if (result.emailVerified) {
        await becomeMerchantAndContinue(refs);
        return router.replace('/lojista/onboarding/1' as never);
      }
      setStage('code');
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'EMAIL_ALREADY_REGISTERED') return setErrors({ email: 'Esse e-mail já tem conta Webag.' });
      if (caught instanceof ApiError && caught.code === 'WEAK_PASSWORD') return setErrors({ password: caught.fieldMessage('password') ?? WEAK });
      if (caught instanceof ApiError && caught.code === 'MERCHANT_SIGNUP_DISABLED') return setClosed(true);
      if (caught instanceof ApiError && caught.status === 429) return setErrors({ form: 'Muitas tentativas. Espere alguns minutos e tente de novo.' });
      if (caught instanceof ApiError && caught.isNetwork) return setErrors({ form: 'Sem conexão. Conecte-se para criar a conta. O que você digitou continua aqui.' });
      setErrors({ form: 'Não foi possível criar a conta. O que você digitou continua aqui.' });
    }
  }

  async function verified() {
    try {
      await becomeMerchantAndContinue(accepted);
      router.replace('/lojista/onboarding/1' as never);
    } catch (caught) {
      setStage('form');
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'MERCHANT_SIGNUP_DISABLED') return setClosed(true);
      setErrors({ form: 'Sua conta foi criada, mas não conseguimos abrir o cadastro da loja. Entre para continuar.' });
    }
  }

  return (
    <div className={s.signupPage}>
      <header className={s.signupHeader}>
        <Logo size={32} />
        <Link href={`/lojista/entrar${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}` as never} className={`wb-text-body ${s.signupLink}`} data-testid={ltid('signup', 'login-link')}>
          Já tem conta? Entrar
        </Link>
      </header>
      <div className={s.signupBody}>
        <ul className={s.facts} aria-label="Como funciona">
          {[
            [Storefront, 'Cadastro em 4 etapas'],
            [Clock, 'Resposta em até 2 dias úteis'],
            [Package, 'Cadastre produtos enquanto a loja é analisada'],
          ].map(([Icon, text]) => {
            const FactIcon = Icon as typeof Storefront;
            return (
              <li key={text as string} className={s.fact}>
                <span className={s.factIcon}>
                  <FactIcon size={24} aria-hidden="true" />
                </span>
                <span className="wb-text-body-strong">{text as string}</span>
              </li>
            );
          })}
        </ul>
        {closed ? (
          <Waitlist defaultEmail={email} />
        ) : stage === 'code' ? (
          <EmailCodeStep email={email.trim()} onVerified={() => void verified()} onEmailChanged={setEmail} />
        ) : (
          <form ref={form} onSubmit={submit} className={s.formCol} noValidate>
            <h1 className={`wb-text-title1 ${s.title}`}>Cadastre sua loja no Webag</h1>
            <p className="wb-text-body" style={{ margin: 0 }}>
              Leva cerca de 10 minutos. Você pode parar e voltar depois.
            </p>
            {Object.keys(errors).filter((key) => key !== 'form').length > 0 ? (
              <Banner tone="danger" testId={ltid('signup', 'error-summary')}>
                Corrija os campos marcados para continuar.
              </Banner>
            ) : null}
            <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" enterKeyHint="next" error={errors.name} data-testid={ltid('signup', 'name-input')} />
            <TextField
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              error={errors.email}
              hint={suggestion && !errors.email ? <>Quis dizer {suggestion}?</> : undefined}
              data-testid={ltid('signup', 'email-input')}
            />
            {errors.email === 'Esse e-mail já tem conta Webag.' ? (
              <Button variant="secondary" onClick={() => router.push(`/lojista/entrar?email=${encodeURIComponent(email.trim())}` as never)} data-testid={ltid('signup', 'existing-login')}>
                Entrar e abrir minha loja
              </Button>
            ) : null}
            <TextField label="Celular" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel" enterKeyHint="next" placeholder="(00) 00000-0000" error={errors.phone} data-testid={ltid('signup', 'phone-input')} />
            <NewPasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} passwordError={errors.password} confirmError={errors.confirm} testIds={{ password: ltid('signup', 'password-input'), confirm: ltid('signup', 'password-confirm-input'), toggle: ltid('signup', 'password-toggle') }} />
            <CheckboxField
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              error={errors.terms}
              data-testid={ltid('signup', 'terms-checkbox')}
              label={
                <>
                  Tenho 18 anos ou mais e aceito os{' '}
                  <a href="/termos-lojista" target="_blank" rel="noopener noreferrer">
                    Termos do lojista
                  </a>{' '}
                  e a{' '}
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer">
                    Política de Privacidade
                  </a>
                </>
              }
            />
            {errors.form ? <Banner tone="danger" testId={ltid('signup', 'error')}>{errors.form}</Banner> : null}
            <div className={s.sticky}>
              <Button type="submit" size="lg" loading={busy} loadingLabel="Criando conta…" data-testid={ltid('signup', 'submit')}>
                Criar conta
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Flag `cadastro_lojista` desligada (WB-050 C3): lista de espera por e-mail, só com o consentimento marcado (WB-211 C1). */
function Waitlist({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setEmailError(undefined);
    if (!isValidEmail(email)) return setEmailError('Confira o e-mail.');
    if (!consent) return setError('Marque a caixa para continuar.');
    setBusy(true);
    try {
      await merchantApi.waitlist({ email: email.trim(), kind: 'merchant_signup', consent: true });
      setDone(true);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof ApiError && caught.isNetwork ? 'Sem conexão. Conecte-se para continuar.' : 'Não foi possível salvar. O que você digitou continua aqui.');
    }
  }

  return (
    <div className={s.formCol} data-testid={ltid('signup', 'closed')}>
      <EmptyState icon={Storefront} title="Cadastro de lojas indisponível" text="Estamos organizando a entrada de novas lojas." />
      {done ? (
        <Banner tone="success" testId={ltid('signup', 'waitlist-done')}>Anotado. Avisamos por e-mail.</Banner>
      ) : (
        <form onSubmit={submit} className={ui.stack} noValidate>
          <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={emailError} data-testid={ltid('signup', 'waitlist-email-input')} />
          <CheckboxField checked={consent} onChange={(e) => setConsent(e.target.checked)} label="Quero receber um aviso por e-mail quando o cadastro abrir." />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button type="submit" loading={busy} loadingLabel="Salvando…" data-testid={ltid('signup', 'waitlist-submit')}>
            Entrar na lista de espera
          </Button>
        </form>
      )}
    </div>
  );
}
