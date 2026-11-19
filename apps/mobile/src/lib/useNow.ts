import { useEffect, useState } from 'react';
import { serverNow } from './server-clock';

/** Relógio do servidor, atualizado a cada `everyMs` (padrão 1 min). Para contagens que mudam por minuto (atraso). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
