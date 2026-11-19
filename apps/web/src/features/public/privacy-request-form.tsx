'use client';

import { useState, type FormEvent } from 'react';
import { Banner, Button, TextArea, TextField, ui } from '@/components/ui';

const MAX_MESSAGE = 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Receipt = { protocol: string; dueAt: string };

const DATE = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/**
 * Pedido de exclusão ao encarregado, para quem não consegue entrar no app (WB-214, SEC-166). A resposta é sempre a mesma exista ou não
 * conta com o e-mail (a API não revela, SEC-152) e a tela também não: só mostra o protocolo. A mensagem não é guardada no navegador
 * nem registrada em log.
 */
export function PrivacyRequestForm({ officerEmail }: { officerEmail: string | null }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    const invalid = EMAIL.test(trimmed) ? undefined : 'Digite o e-mail da conta, como nome@exemplo.com.';
    setEmailError(invalid);
    setError(null);
    if (invalid) return;
    setBusy(true);
    try {
      const response = await fetch('/api/public/privacy-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webag-client': 'web' },
        body: JSON.stringify({ type: 'deletion', email: trimmed, ...(message.trim() ? { message: message.trim() } : {}) }),
        credentials: 'omit',
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 202) {
        const body = (await response.json().catch(() => null)) as Partial<Receipt> | null;
        if (body && typeof body.protocol === 'string' && typeof body.dueAt === 'string') {
          setReceipt({ protocol: body.protocol, dueAt: body.dueAt });
          return;
        }
      }
      if (response.status === 429) setError('Muitas tentativas. Tente de novo em 1 hora.');
      else if (response.status === 400) setError('Confira o e-mail e o texto e tente de novo.');
      else setError('Não conseguimos enviar agora. Tente de novo.');
    } catch {
      setError('Sem conexão. Conecte-se para continuar.');
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    const due = new Date(receipt.dueAt);
    return (
      <Banner tone="success" testId="public.excluir.done">
        <strong>Recebemos o seu pedido.</strong> Protocolo {receipt.protocol}. Se existir uma conta com esse e-mail, vamos tratar o pedido e responder até {Number.isNaN(due.getTime()) ? 'o prazo combinado' : DATE.format(due)}. Enviamos uma confirmação para o seu e-mail.
      </Banner>
    );
  }
  return (
    <form onSubmit={submit} className={ui.stack} noValidate data-testid="public.excluir.form">
      <TextField
        label="E-mail da conta"
        type="email"
        name="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailError}
        data-testid="public.excluir.email"
      />
      <TextArea
        label="Mensagem (opcional)"
        name="message"
        rows={4}
        maxLength={MAX_MESSAGE}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        hint="Não envie senha nem dados de cartão."
        counter={{ value: message.length, max: MAX_MESSAGE }}
        data-testid="public.excluir.message"
      />
      {error ? <Banner tone="danger" offline={error.startsWith('Sem conexão')} testId="public.excluir.error">{error}</Banner> : null}
      <Button type="submit" size="lg" loading={busy} loadingLabel="Enviando…" data-testid="public.excluir.submit">Pedir exclusão da conta</Button>
      <noscript>
        <p>Este formulário precisa de JavaScript.{officerEmail ? ` Escreva para ${officerEmail}.` : ' Escreva para o canal de privacidade indicado na Política de privacidade.'}</p>
      </noscript>
    </form>
  );
}
