'use client';

import { useCallback, useEffect, useState } from 'react';

/** Contagem regressiva em segundos (reenvio de código). `restart` recomeça; `m:ss` para exibir. */
export function useCountdown(initialSeconds: number): { seconds: number; restart: (next?: number) => void; label: string } {
  const [end, setEnd] = useState(() => Date.now() + initialSeconds * 1000);
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [end]);

  const restart = useCallback((next: number = initialSeconds) => setEnd(Date.now() + next * 1000), [initialSeconds]);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return { seconds, restart, label };
}
