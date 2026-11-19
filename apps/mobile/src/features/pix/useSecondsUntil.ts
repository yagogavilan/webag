import { useEffect, useState } from 'react';

/** Segundos até um instante ISO, pelo relógio (não por soma de ticks): sobrevive a app em segundo plano. `null` sem prazo. */
export function useSecondsUntil(iso: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  const end = Date.parse(iso);
  return Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / 1000));
}
