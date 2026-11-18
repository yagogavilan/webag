'use client';

import { CaretLeft } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Banner, Button, Dialog, cx, ui } from '@/components/ui';
import { useOnline } from '@/lib/use-online';
import { ltid } from '@/lib/testid';
import { asRoute } from '@/lib/routes';
import s from './loja.module.css';

interface Props {
  screen: string;
  title: string;
  description?: string;
  /** Há alteração não salva: sair pede confirmação ("Sair sem salvar?"). */
  dirty: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  error?: string | null;
  /** Coluna da direita no desktop ("Como o cliente vê"). */
  aside?: ReactNode;
  children: ReactNode;
}

/** Moldura das telas de configuração (onda-2 Parte C): botão "Salvar" explícito, aviso de sair sem salvar e volta a "Minha loja". */
export function SettingsFrame({ screen, title, description, dirty, busy, submitLabel, onSubmit, error, aside, children }: Props) {
  const router = useRouter();
  const online = useOnline();
  const [leaving, setLeaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Foco no título só ao abrir a tela (onda-2 §0.3): um `ref` inline roubaria o foco do campo a cada tecla.
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const back = () => (dirty ? setLeaving(true) : router.push(asRoute('/lojista/loja')));
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={submit} noValidate className={ui.stack} data-testid={ltid(screen, 'form')}>
      <div>
        <Button variant="text" size="sm" icon={<CaretLeft size={20} aria-hidden="true" />} onClick={back} data-testid={ltid(screen, 'back')}>
          Minha loja
        </Button>
      </div>
      <div>
        <h1 ref={heading} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>
          {title}
        </h1>
        {description ? <p className={cx('wb-text-body', ui.muted)} style={{ margin: '4px 0 0' }}>{description}</p> : null}
      </div>
      {!online ? (
        <Banner tone="warning" offline>
          Sem conexão. O que você digitou continua nesta tela.
        </Banner>
      ) : null}
      <div className={s.settingsGrid}>
        <div className={ui.stack}>{children}</div>
        {aside ? <aside className={cx(ui.card, s.asideCard)} aria-label="Como o cliente vê">{aside}</aside> : null}
      </div>
      {error ? (
        <Banner tone="danger" testId={ltid(screen, 'error')}>
          {error}
        </Banner>
      ) : null}
      <div className={s.saveBar}>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Salvando…" data-testid={ltid(screen, 'submit')}>
          {submitLabel}
        </Button>
      </div>
      {leaving ? (
        <Dialog
          title="Sair sem salvar?"
          onClose={() => setLeaving(false)}
          testId={ltid(screen, 'leave-dialog')}
          actions={
            <>
              <Button onClick={() => setLeaving(false)} data-testid={ltid(screen, 'leave-stay')}>
                Continuar editando
              </Button>
              <Button variant="text" onClick={() => router.push(asRoute('/lojista/loja'))} data-testid={ltid(screen, 'leave-confirm')}>
                Sair sem salvar
              </Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Você tem alterações que não foram salvas.</p>
        </Dialog>
      ) : null}
    </form>
  );
}

/** Carrega a configuração (com os quatro estados) e entrega ao formulário já com os valores iniciais. */
export function fieldMessage(errorFields: { field: string; message: string }[], prefix: string): string | undefined {
  return errorFields.find((f) => f.field === prefix || f.field.startsWith(`${prefix}.`) || f.field.startsWith(`${prefix}[`))?.message;
}
