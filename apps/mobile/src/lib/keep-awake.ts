import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Mantém a tela ligada enquanto o cliente espera o PIX. Falha em silêncio: no navegador (Wake Lock negado ou sem suporte) o
 * `useKeepAwake` da lib deixa a promessa rejeitada sem tratamento, o que derruba a tela com erro; no aparelho nada muda.
 */
export function useSafeKeepAwake(tag = 'webag-pix'): void {
  useEffect(() => {
    let active = true;
    void Promise.resolve(activateKeepAwakeAsync(tag)).catch(() => {
      active = false;
    });
    return () => {
      if (active) void Promise.resolve(deactivateKeepAwake(tag)).catch(() => undefined);
    };
  }, [tag]);
}
