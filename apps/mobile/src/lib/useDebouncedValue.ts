import { useEffect, useState } from 'react';

/** Valor que só muda depois de `delay` ms sem mudar (sugestões de busca esperam 300 ms, onda-3 D6). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
