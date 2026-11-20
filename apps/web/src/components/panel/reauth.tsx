'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { Banner, Button, Dialog, OtpInput, PasswordField } from '@/components/ui';

interface Pending {
  reason: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ReauthApi {
  /** Roda `action`; se a API pedir reautenticação (REAUTH_REQUIRED), abre o Dialog de TOTP e repete a ação sozinha (AC5a). */
  guard: <T>(action: () => Promise<T>, reason: string) => Promise<T>;
}

const ReauthContext = createContext<ReauthApi | null>(null);

/**
 * Reautenticação antes de ação sensível. Admin: código do autenticador. Lojista: senha, válida por 5 min (WB-053 C1, WB-075).
 */
export function ReauthProvider({ children, area = 'admin' }: { children: ReactNode; area?: 'admin' | 'lojista' }) {
  const password = area === 'lojista';
  const prefix = area;
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const ask = useCallback((reason: string) => {
    return new Promise<void>((resolve, reject) => {
      const next = { reason, resolve, reject };
      pendingRef.current = next;
      setCode('');
      setError(null);
      setPending(next);
    });
  }, []);

  const guard = useCallback(
    async <T,>(action: () => Promise<T>, reason: string): Promise<T> => {
      try {
        return await action();
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.code !== 'REAUTH_REQUIRED') throw caught;
        await ask(reason);
        return action();
      }
    },
    [ask],
  );

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(area, 'auth/reauth', { method: 'POST', body: password ? { password: value } : { totpCode: value } });
      const current = pendingRef.current;
      setPending(null);
      current?.resolve();
    } catch (caught) {
      setCode('');
      setError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para continuar.' : password ? 'Senha incorreta.' : 'Código incorreto ou vencido.');
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    const current = pendingRef.current;
    setPending(null);
    current?.reject(new ApiError({ status: 0, code: 'REAUTH_CANCELLED', title: 'Cancelado' }));
  }

  const api = useMemo(() => ({ guard }), [guard]);

  return (
    <ReauthContext.Provider value={api}>
      {children}
      {pending ? (
        <Dialog
          title="Confirme que é você"
          testId={`${prefix}.reauth.dialog`}
          onClose={cancel}
          locked={busy}
          actions={
            <>
              <Button onClick={() => void submit(code)} loading={busy} loadingLabel="Confirmando…" data-testid={`${prefix}.reauth.submit`} disabled={!code && !busy}>
                Confirmar
              </Button>
              <Button variant="text" onClick={cancel} data-testid={`${prefix}.reauth.cancel`}>
                Cancelar
              </Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>
            {pending.reason}
          </p>
          {password ? (
            <form onSubmit={(event) => { event.preventDefault(); void submit(code); }}>
              <PasswordField label="Sua senha" value={code} onChange={setCode} autoComplete="current-password" error={error ?? undefined} testIds={{ input: `${prefix}.reauth.password-input`, toggle: `${prefix}.reauth.password-toggle` }} />
            </form>
          ) : (
            <>
              <OtpInput value={code} onChange={setCode} onComplete={(value) => void submit(value)} invalid={Boolean(error)} testId="admin.reauth.totp-input" autoFocus label="Código do app autenticador" />
              {error ? <Banner tone="danger">{error}</Banner> : null}
            </>
          )}
        </Dialog>
      ) : null}
    </ReauthContext.Provider>
  );
}

export function useReauth(): ReauthApi {
  const value = useContext(ReauthContext);
  if (!value) throw new Error('useReauth fora do ReauthProvider');
  return value;
}
