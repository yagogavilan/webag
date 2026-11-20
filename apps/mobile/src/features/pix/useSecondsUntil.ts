import { useEffect, useState } from 'react';
import { serverNow } from '../../lib/server-clock';

/**
 * Segundos até um instante ISO pelo relógio do SERVIDOR (I11): um aparelho com a hora adiantada não mostra "venceu" antes da hora.
 * Conta por relógio (não por soma de ticks): sobrevive a app em segundo plano. `null` sem prazo.
 */
export function useSecondsUntil(iso: string | null | undefined): number | null {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  const end = Date.parse(iso);
  return Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / 1000));
}
