import { Linking } from 'react-native';
import { mapsUrl, whatsappUrl } from './model';

/** Abre o WhatsApp da loja com a mensagem pronta. Devolve false se não há número válido ou nada abriu (a tela mostra o número). */
export async function openWhatsapp(phone: string | null | undefined, message: string): Promise<boolean> {
  const url = whatsappUrl(phone, message);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** "Como chegar": mapa do aparelho (o app não embute mapa). */
export async function openDirections(address: string): Promise<boolean> {
  try {
    await Linking.openURL(mapsUrl(address));
    return true;
  } catch {
    return false;
  }
}
