'use client';

import { CheckCircle, Copy, DownloadSimple, Printer } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, Logo, MessageState, OtpInput, Skeleton, ToastProvider, cx, ui, useToast } from '@/components/ui';
import { apiRequest, onSessionLost, sessionRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useOnline } from '@/lib/use-online';
import { tid } from '@/lib/testid';
import s from './auth.module.css';

interface Setup {
  secret: string;
  otpauthUri: string;
}

/** QR como caminho SVG desenhado pelo React (sem injetar HTML). */
export function qrPath(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  let path = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, path };
}

/** Blocos de 4: "ABCD EFGH IJKL". */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** AC2 (componente TotpSetup): 3 passos, obrigatório para todo admin antes de qualquer acesso (WB-222). */
function Setup() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);

  useEffect(() => onSessionLost(() => router.replace('/admin/entrar?motivo=expirada')), [router]);

  const generate = useCallback(async () => {
    setLoadError(false);
    setSetup(null);
    setQr(null);
    try {
      const result = await apiRequest<Setup>('admin', 'admin/totp/setup', { method: 'POST' });
      if (!result.otpauthUri.startsWith('otpauth://')) throw new Error('URI inesperada');
      setSetup(result);
      setQr(qrPath(result.otpauthUri));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && !started.current) {
      started.current = true;
      void generate();
    }
  }, [step, generate]);

  async function verify(value: string) {
    if (busy) return;
    setBusy(true);
    setVerifyError(null);
    try {
      const result = await apiRequest<{ recoveryCodes: string[] }>('admin', 'admin/totp/confirm', { method: 'POST', body: { code: value } });
      setCodes(result.recoveryCodes);
      setStep(3);
    } catch (caught) {
      setCode('');
      setVerifyError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para continuar.' : 'Código incorreto ou vencido. Espere o próximo código e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(message);
    } catch {
      toast.show('Não foi possível copiar. Selecione o texto e copie.');
    }
  }

  function download() {
    const blob = new Blob([`Códigos de recuperação do Webag Admin\nCada código vale uma vez.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'webag-admin-codigos-de-recuperacao.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    try {
      await sessionRequest('admin', 'logout');
    } finally {
      router.replace('/admin/entrar');
    }
  }

  if (done) {
    return (
      <div className={cx(ui.card, s.card)}>
        <MessageState icon={CheckCircle} title="Verificação em duas etapas ligada" text="Seu acesso ao painel está protegido." testId={tid('totp', 'success')}>
          <Button size="lg" onClick={() => router.replace('/admin')} data-testid={tid('totp', 'finish')}>
            Ir para o painel
          </Button>
        </MessageState>
      </div>
    );
  }

  return (
    <div className={cx(ui.card, s.card)} style={{ maxWidth: 480 }}>
      <div>
        <p className="wb-text-caption-strong" style={{ margin: '0 0 8px' }}>Passo {step} de 3</p>
        <div className={s.progress} role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label="Progresso">
          <div className={s.progressBar} style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      {step === 1 ? (
        <>
          <h1 className="wb-text-title1" style={{ margin: 0 }} tabIndex={-1} ref={(node) => node?.focus()}>Instale um app autenticador</h1>
          <p className="wb-text-body" style={{ margin: 0 }}>Use um app como Google Authenticator, Microsoft Authenticator ou Authy.</p>
          <Button size="lg" onClick={() => setStep(2)} data-testid={tid('totp', 'next')}>Já instalei, continuar</Button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="wb-text-title1" style={{ margin: 0 }} tabIndex={-1} ref={(node) => node?.focus()}>Escaneie o QR</h1>
          {loadError ? (
            <>
              <Banner tone="danger" action={<Button variant="secondary" onClick={() => void generate()}>Tentar de novo</Button>}>
                Não conseguimos gerar o código agora.
              </Banner>
            </>
          ) : (
            <>
              <div className={s.qrBox} data-testid={tid('totp', 'qr')} aria-hidden={qr ? undefined : 'true'} style={{ width: 200, height: 200, display: 'grid', placeItems: 'center' }}>
                {qr ? (
                  <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={168} height={168} role="img" aria-label="QR code para o app autenticador" shapeRendering="crispEdges">
                    <path d={qr.path} fill="var(--wb-color-neutral-900)" />
                  </svg>
                ) : (
                  <Skeleton width={168} height={168} />
                )}
              </div>
              {setup ? (
                <>
                  <a className={s.link} href={setup.otpauthUri} data-testid={tid('totp', 'open-app')}>Abrir no app autenticador</a>
                  <div>
                    <p className="wb-text-body" style={{ margin: 0 }}>Não consegue escanear? Digite este código:</p>
                    <p className={cx('wb-text-body-strong', s.secret)} style={{ margin: '4px 0' }} data-testid={tid('totp', 'secret')}>{groupSecret(setup.secret)}</p>
                    <Button variant="secondary" size="sm" icon={<Copy size={20} aria-hidden="true" />} onClick={() => void copy(setup.secret, 'Copiado')} data-testid={tid('totp', 'secret-copy')}>Copiar</Button>
                  </div>
                </>
              ) : null}
              <p className="wb-text-body" style={{ margin: 0 }}>Digite o código de 6 dígitos que o app mostra.</p>
              <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} invalid={Boolean(verifyError)} disabled={!setup || busy} testId={tid('totp', 'code-input')} autoFocus />
              {verifyError ? <Banner tone="danger">{verifyError}</Banner> : null}
              {!online ? <Banner tone="warning" offline>Conecte-se para continuar.</Banner> : null}
              <Button size="lg" loading={busy} loadingLabel="Verificando…" onClick={() => void verify(code)} disabled={!setup} data-testid={tid('totp', 'verify')}>Verificar e continuar</Button>
            </>
          )}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="wb-text-title1" style={{ margin: 0 }} tabIndex={-1} ref={(node) => node?.focus()}>Guarde seus códigos de recuperação</h1>
          <Banner tone="warning">Esses códigos aparecem só agora. Cada um vale uma vez. Use um se perder o celular.</Banner>
          <ol className={s.codes} data-testid={tid('totp', 'recovery-list')} aria-label="Códigos de recuperação">
            {codes.map((item) => (
              <li key={item} className="wb-text-body-strong">{item}</li>
            ))}
          </ol>
          <div className={cx(ui.row, s.noPrint)}>
            <Button variant="secondary" size="sm" icon={<Copy size={20} aria-hidden="true" />} onClick={() => void copy(codes.join('\n'), 'Copiado')} data-testid={tid('totp', 'recovery-copy')}>Copiar tudo</Button>
            <Button variant="secondary" size="sm" icon={<DownloadSimple size={20} aria-hidden="true" />} onClick={download} data-testid={tid('totp', 'recovery-download')}>Baixar arquivo</Button>
            <Button variant="secondary" size="sm" icon={<Printer size={20} aria-hidden="true" />} onClick={() => window.print()} data-testid={tid('totp', 'recovery-print')}>Imprimir</Button>
          </div>
          <div className={s.noPrint}>
            <CheckboxField label="Guardei meus códigos em um lugar seguro." checked={saved} onChange={(event) => setSaved(event.target.checked)} data-testid={tid('totp', 'recovery-saved-checkbox')} />
            <Button size="lg" disabled={!saved} onClick={() => { setCodes([]); setDone(true); }} data-testid={tid('totp', 'finish')} style={{ marginTop: 8 }}>
              {saved ? 'Concluir' : 'Marque a caixa para concluir'}
            </Button>
          </div>
        </>
      ) : null}

      <div className={s.noPrint}>
        <Button variant="text" onClick={() => (step === 3 && !done ? setLeaving(true) : void logout())} data-testid={tid('totp', 'leave')}>Sair</Button>
      </div>
      {leaving ? (
        <Dialog title="Sair sem guardar os códigos?" testId={tid('totp', 'leave-dialog')} onClose={() => setLeaving(false)} actions={<><Button onClick={() => setLeaving(false)}>Voltar e guardar</Button><Button variant="text" onClick={() => void logout()}>Sair</Button></>}>
          <p className="wb-text-body" style={{ margin: 0 }}>Eles não aparecem de novo.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

export function TotpSetup() {
  return (
    <ToastProvider>
      <div className={s.page}>
        <header className={s.simpleHeader}>
          <Logo size={28} />
        </header>
        <Setup />
      </div>
    </ToastProvider>
  );
}
