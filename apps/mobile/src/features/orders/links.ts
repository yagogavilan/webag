import { openExternal } from '../legal/open-link';
import { mapsUrl, whatsappUrl } from './model';

/** Abre o WhatsApp da loja com a mensagem pronta. Devolve false se não há número válido ou nada abriu (a tela mostra o número). */
export async function openWhatsapp(phone: string | null | undefined, message: string): Promise<boolean> {
  const url = whatsappUrl(phone, message);
  if (!url) return false;
  return openExternal(url, 'whatsapp');
}

/** "Como chegar": mapa do aparelho (o app não embute mapa, ADR). */
export async function openDirections(address: string): Promise<boolean> {
  return openExternal(mapsUrl(address), 'maps');
}
