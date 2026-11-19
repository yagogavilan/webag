'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, Dialog, OtpInput, PasswordField, TextField, ui } from '@/components/ui';
import { BLOCKER_LABEL } from '@/lib/api/account';
import { hoursText } from '@/features/account/legal-copy';
import { failureMessage, postStep, type Blocker, type StepResult } from './deletion-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

type Phase = 'email' | 'code' | 'password' | 'review' | 'done';
interface Review {
  canDelete: boolean;
  blockers: Blocker[];
  ownsStore: boolean;
  anonymizationDays: number | null;
  fiscalRetentionYears: number | null;
  regretHours: number | null;
}
interface Outcome {
  status: 'completed' | 'pending';
  effectiveAt: string;
  cancelableUntil: string | null;
}
type Failed = Extract<StepResult<unknown>, { ok: false }>;

const T = (id: string) => `public.excluir.${id}`;

/**
 * Exclusão de conta sem o app (WB-214, SEC-166, Google Play). Via A: e-mail, código enviado ao e-mail, revisão, confirmação. Via B:
 * e-mail e senha (única via para e-mail não confirmado). Se a conta está sob ataque, a API responde 403 `LOGIN_CODE_REQUIRED` à senha
 * certa e a tela passa à via A com o código do e-mail (SEC-168/176). A tela nunca diz se a conta existe: "Se existir uma conta com esse
 * e-mail, enviamos um código" e uma só mensagem para e-mail ou senha incorretos. O ticket de exclusão fica só em memória (nunca em
 * armazenamento do navegador, URL ou log) e a API é quem fecha a conta; o resultado mostrado vem do servidor.
 */
export function AccountDeletionFlow() {
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);

  useEffect(() => {
    if (phase !== 'code') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /** Uma chamada por vez: segundo toque durante o envio é ignorado (evita pedido duplicado). */
  async function guarded(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function restart(message?: string) {
    setTicket(null);
    setReview(null);
    setCode('');
    setPassword('');
    setConfirming(false);
    setPhase('email');
    setNotice(null);
    setError(message ?? null);
  }

  function fail(result: Failed) {
    if (result.code === 'DELETE_TICKET_INVALID') return restart(failureMessage(result));
    setError(failureMessage(result));
  }

  function validEmail(): boolean {
    const ok = EMAIL.test(email.trim());
    setEmailError(ok ? undefined : 'Digite o e-mail da conta, como nome@exemplo.com.');
    return ok;
  }

  async function openReview(deleteTicket: string): Promise<boolean> {
    const result = await postStep<Review>('review', { deleteTicket });
    if (!result.ok) {
      fail(result);
      return false;
    }
    setTicket(deleteTicket);
    setReview(result.data);
    setPhase('review');
    setNotice(null);
    return true;
  }

  async function sendCode(message?: string) {
    if (!validEmail()) return;
    await guarded(async () => {
      const result = await postStep('start', { email: email.trim() });
      if (!result.ok) return fail(result);
      setCode('');
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setPhase('code');
      setNotice(message ?? 'Se existir uma conta com esse e-mail, enviamos um código de 6 dígitos. Ele vale 10 minutos. Confira também o spam.');
    });
  }

  async function verify(value: string) {
    if (value.length !== 6) return setError('Digite os 6 dígitos do código.');
    await guarded(async () => {
      const result = await postStep<{ deleteTicket: string }>('verify-code', { email: email.trim(), code: value });
      if (!result.ok) {
        setCode('');
        return fail(result);
      }
      await openReview(result.data.deleteTicket);
    });
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const okEmail = validEmail();
    const okPassword = password.length > 0;
    setPasswordError(okPassword ? undefined : 'Digite a sua senha.');
    if (!okEmail || !okPassword) return;
    await guarded(async () => {
      const result = await postStep<{ deleteTicket: string }>('start', { email: email.trim(), password });
      if (result.ok) {
        setPassword('');
        await openReview(result.data.deleteTicket);
        return;
      }
      if (result.code === 'LOGIN_CODE_REQUIRED') {
        // SEC-176: senha certa, conta sob ataque. A API pede o código do e-mail; a tela o envia pela via A e abre o campo.
        setPassword('');
        const sent = await postStep('start', { email: email.trim() });
        if (!sent.ok) return fail(sent);
        setCode('');
        setResendAt(Date.now() + RESEND_SECONDS * 1000);
        setNow(Date.now());
        setPhase('code');
        setNotice('Por segurança, enviamos um código de 6 dígitos para o e-mail da conta. Digite-o para continuar.');
        return;
      }
      fail(result);
    });
  }

  async function confirmDeletion() {
    if (!ticket) return;
    await guarded(async () => {
      const result = await postStep<Outcome>('finish', { deleteTicket: ticket });
      setConfirming(false);
      if (result.ok) {
        setOutcome(result.data);
        setTicket(null);
        setPhase('done');
        return;
      }
      if (result.code === 'DELETION_BLOCKED') {
        setReview((current) => (current ? { ...current, canDelete: false, blockers: result.blockers } : current));
        return;
      }
      fail(result);
    });
  }

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const errorBanner = error ? (
    <Banner tone="danger" offline={error.startsWith('Sem conexão')} testId={T('error')}>
      {error}
    </Banner>
  ) : null;

  if (phase === 'done' && outcome) {
    const until = outcome.cancelableUntil ? new Date(outcome.cancelableUntil) : null;
    return (
      <div className={ui.stack} data-testid={T('done')}>
        <Banner tone="success">
          <strong>{outcome.status === 'completed' ? 'Sua conta foi excluída.' : 'Sua conta foi fechada.'}</strong>{' '}
          {outcome.status === 'pending' && until && !Number.isNaN(until.getTime())
            ? `Os seus dados serão apagados depois de ${DATE_TIME.format(until)}. Até lá, você pode desistir usando o formulário "Mudou de ideia?", logo abaixo.`
            : 'Os seus dados pessoais foram apagados ou anonimizados.'}{' '}
          Enviamos um aviso para o seu e-mail.
        </Banner>
      </div>
    );
  }

  if (phase === 'review' && review) {
    return (
      <div className={ui.stack} data-testid={T('review')}>
        {review.canDelete ? (
          <>
            <h3 className="wb-text-body-strong" style={{ margin: 0 }}>Confira antes de excluir</h3>
            <ul className="wb-text-body" style={{ margin: 0, paddingLeft: 20 }}>
              <li>A sua conta fecha agora e você sai de todos os aparelhos.</li>
              {review.ownsStore ? <li>A sua loja será encerrada e deixa de aparecer para os clientes.</li> : null}
              {review.regretHours ? <li>Você tem {hoursText(review.regretHours)} para desistir. Passado esse prazo, a exclusão não pode ser desfeita.</li> : null}
              {review.anonymizationDays ? <li>Apagamos ou anonimizamos os seus dados em até {review.anonymizationDays} dias.</li> : null}
              {review.fiscalRetentionYears ? <li>Pedidos e pagamentos ficam sem identificação, por {review.fiscalRetentionYears} anos, por obrigação legal.</li> : null}
            </ul>
            {errorBanner}
            <Button variant="destructive" size="lg" onClick={() => setConfirming(true)} disabled={busy} data-testid={T('delete-submit')}>
              Excluir minha conta
            </Button>
          </>
        ) : (
          <div className={ui.stack} data-testid={T('blockers')}>
            <Banner tone="warning">
              <strong>Conclua antes de excluir.</strong> Não dá para excluir a conta enquanto houver pedido, troca ou estorno em andamento. Quando terminarem, volte aqui e comece de novo (esta confirmação vale por 10 minutos).
            </Banner>
            <ul className="wb-text-body" style={{ margin: 0, paddingLeft: 20 }}>
              {review.blockers.map((blocker) => (
                <li key={`${blocker.kind}-${blocker.id}`}>
                  {BLOCKER_LABEL[blocker.kind] ?? 'Pendência'}
                  {blocker.number ? ` #${blocker.number}` : ''} · {blocker.status}
                </li>
              ))}
            </ul>
            {errorBanner}
            <Button variant="secondary" onClick={() => ticket && void guarded(async () => void (await openReview(ticket)))} loading={busy} loadingLabel="Conferindo…" data-testid={T('recheck')}>
              Conferir de novo
            </Button>
          </div>
        )}
        {confirming ? (
          <Dialog
            alert
            title="Excluir sua conta?"
            testId={T('delete-dialog')}
            locked={busy}
            onClose={() => setConfirming(false)}
            actions={
              <>
                <Button variant="destructive" onClick={() => void confirmDeletion()} loading={busy} loadingLabel="Excluindo…" data-testid={T('delete-confirm')}>Excluir conta</Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy} data-testid={T('delete-cancel')}>Cancelar</Button>
              </>
            }
          >
            <p className="wb-text-body" style={{ margin: 0 }}>
              Apagamos seus dados e pedidos antigos. {review.regretHours ? `Você terá ${hoursText(review.regretHours)} para desistir; depois disso, isso não pode ser desfeito.` : 'Isso não pode ser desfeito.'}
            </p>
          </Dialog>
        ) : null}
      </div>
    );
  }

  if (phase === 'code') {
    return (
      <form
        className={ui.stack}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
        data-testid={T('code-form')}
      >
        {notice ? <Banner tone="info" testId={T('notice')}>{notice}</Banner> : null}
        <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} invalid={Boolean(error)} disabled={busy} testId={T('otp-input')} autoFocus />
        {errorBanner}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Conferindo…" data-testid={T('code-submit')}>Continuar</Button>
        <div className={ui.stack}>
          <Button variant="text" onClick={() => void sendCode('Se existir uma conta com esse e-mail, enviamos um novo código. O anterior deixou de valer.')} disabled={busy || secondsLeft > 0} data-testid={T('resend')}>
            {secondsLeft > 0 ? `Reenviar código em ${secondsLeft} s` : 'Reenviar código'}
          </Button>
          <Button variant="text" onClick={() => { setError(null); setPhase('password'); }} disabled={busy} data-testid={T('use-password')}>Não recebeu o código? Excluir com a senha</Button>
          <Button variant="text" onClick={() => restart()} disabled={busy} data-testid={T('change-email')}>Usar outro e-mail</Button>
        </div>
      </form>
    );
  }

  if (phase === 'password') {
    return (
      <form onSubmit={submitPassword} className={ui.stack} noValidate data-testid={T('password-form')}>
        <p className="wb-text-body" style={{ margin: 0 }}>Entre com o e-mail e a senha da conta para continuar a exclusão. Nenhum acesso à conta é aberto: a senha só confirma que é você.</p>
        <TextField label="E-mail da conta" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} data-testid={T('email-input')} />
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={passwordError} testIds={{ input: T('password-input') }} />
        {errorBanner}
        <Button type="submit" size="lg" loading={busy} loadingLabel="Conferindo…" data-testid={T('password-submit')}>Continuar</Button>
        <Button variant="text" onClick={() => void sendCode()} disabled={busy} data-testid={T('use-code')}>Prefiro receber um código por e-mail</Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void sendCode();
      }}
      className={ui.stack}
      noValidate
      data-testid={T('form')}
    >
      <p className="wb-text-body" style={{ margin: 0 }}>Digite o e-mail da conta. Enviaremos um código para confirmar que é você.</p>
      <TextField label="E-mail da conta" type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} data-testid={T('email-input')} />
      {errorBanner}
      <Button type="submit" size="lg" loading={busy} loadingLabel="Enviando…" data-testid={T('send-code')}>Enviar código</Button>
      <Button variant="text" onClick={() => { setError(null); setPhase('password'); }} disabled={busy} data-testid={T('use-password')}>Excluir com e-mail e senha</Button>
      <noscript>
        <p>Este formulário precisa de JavaScript. Use o pedido ao encarregado, logo abaixo.</p>
      </noscript>
    </form>
  );
}
