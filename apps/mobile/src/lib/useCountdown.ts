import { useCallback, useEffect, useState } from 'react';

/** Contagem regressiva por relógio (não por soma de ticks): sobrevive a app em segundo plano. */
export function useCountdown(initialSeconds: number) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const restart = useCallback((seconds: number = initialSeconds) => setEndsAt(Date.now() + seconds * 1000), [initialSeconds]);
  return { remaining, restart };
}
