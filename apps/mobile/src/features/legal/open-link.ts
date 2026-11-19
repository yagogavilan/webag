import { Linking } from 'react-native';
import { WEB_PUBLIC_URL } from '../checkout/config';

/** Páginas públicas do Webag (apps/web, DEC-057). A origem vem de `EXPO_PUBLIC_WEB_URL` por ambiente; nunca fixa no código. */
export const webPageUrl = (path: '/termos' | '/privacidade' | '/licencas', base: string = WEB_PUBLIC_URL): string => `${base}${path}`;

/** Abre no navegador do sistema (não num WebView do app). `false` = não abriu: a tela mostra o endereço para copiar. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
