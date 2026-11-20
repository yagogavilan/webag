import { geocodeAddress } from './location';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Ponto aproximado do centro das cidades do lançamento. Só entra quando o geocodificador do aparelho não responde (Android
 * sem serviços do Google, sem rede). [HIPÓTESE] o contrato `PublicCity` ainda não traz coordenadas: pedido em
 * docs/arquitetura/pendencias-contrato-mobile.md. Quando vier, este arquivo some.
 */
const FALLBACK: Record<string, { latitude: number; longitude: number }> = {
  'francisco morato': { latitude: -23.2794, longitude: -46.7456 },
  'franco da rocha': { latitude: -23.3218, longitude: -46.7258 },
  caieiras: { latitude: -23.3647, longitude: -46.7405 },
  cajamar: { latitude: -23.355, longitude: -46.8767 },
  'campo limpo paulista': { latitude: -23.2078, longitude: -46.7889 },
};

/** Ponto para o endereço aproximado de cidade (e bairro) escolhido na lista. null = o app pede o CEP. */
export async function locateCity(city: string, district: string, state: string): Promise<{ latitude: number; longitude: number } | null> {
  const query = [district, city, state || 'SP', 'Brasil'].filter(Boolean).join(', ');
  const found = await geocodeAddress(query);
  return found ?? FALLBACK[normalize(city)] ?? null;
}
