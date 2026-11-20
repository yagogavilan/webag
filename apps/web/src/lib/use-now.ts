'use client';

import { useEffect, useState } from 'react';

/** Relógio que reavalia a tela a cada `intervalMs` (contagem regressiva, "há 2 min"). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
