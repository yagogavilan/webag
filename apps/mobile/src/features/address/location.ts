import * as Location from 'expo-location';

/**
 * Localização do aparelho, só "durante o uso" e só aproximada (Balanced): basta para achar o bairro e evita pedir mais do que precisa
 * (SEC-084, minimização). Quem chama explica o motivo ANTES, em tela própria (design-system.md §5.6).
 */
const GPS_TIMEOUT_MS = 10_000;

/** Casas decimais da posição guardada e enviada ao geocodificador: 2 casas = cerca de 1 km (SEC-179, minimização). */
const COORD_DECIMALS = 2;
export const roundCoord = (value: number): number => Number(value.toFixed(COORD_DECIMALS));

export type PermissionResult = 'granted' | 'denied' | 'blocked';

export interface ApproxPlace {
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;
}

export type GpsOutcome = { kind: 'ok'; place: ApproxPlace } | { kind: 'denied' } | { kind: 'blocked' } | { kind: 'failed' };

export async function requestLocationPermission(): Promise<PermissionResult> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  // "negado para sempre": o sistema não mostra mais o diálogo; só Ajustes resolve
  if (current.status === 'denied' && !current.canAskAgain) return 'blocked';
  const asked = await Location.requestForegroundPermissionsAsync();
  if (asked.status === 'granted') return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Permissão, posição aproximada (até 10 s) e bairro/cidade pelo geocodificador do sistema. */
export async function locateApproximately(): Promise<GpsOutcome> {
  try {
    const permission = await requestLocationPermission();
    if (permission !== 'granted') return { kind: permission };
    const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), GPS_TIMEOUT_MS);
    // Arredonda ANTES de qualquer uso: nem o geocodificador do sistema nem a busca recebem o ponto exato.
    const latitude = roundCoord(position.coords.latitude);
    const longitude = roundCoord(position.coords.longitude);
    const [place] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), GPS_TIMEOUT_MS);
    const city = place?.city ?? place?.subregion ?? '';
    if (!city) return { kind: 'failed' };
    return {
      kind: 'ok',
      place: {
        latitude,
        longitude,
        city,
        district: place?.district ?? '',
        state: place?.region ?? '',
      },
    };
  } catch {
    return { kind: 'failed' };
  }
}

/** Ponto do endereço digitado, pelo geocodificador do sistema. Best-effort: null = pedir confirmação no mapa (pendente). */
export async function geocodeAddress(query: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const [hit] = await withTimeout(Location.geocodeAsync(query), 8_000);
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  } catch {
    return null;
  }
}
