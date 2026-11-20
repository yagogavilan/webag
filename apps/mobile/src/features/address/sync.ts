import { createRemoteAddress, fetchAddresses, type AddressFields } from '../../api/addresses-api';
import { ApiError } from '../../api/problem';
import { addressStore } from './store';
import type { Address } from './types';

function fieldsOf(a: Address): AddressFields {
  return {
    nickname: a.nickname,
    cep: a.cep,
    street: a.street,
    number: a.number,
    noNumber: a.noNumber,
    complement: a.complement,
    district: a.district,
    city: a.city,
    state: a.state,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

let running: Promise<void> | null = null;

/**
 * Logado: a API é a fonte dos endereços completos. Em ordem: (1) declara o dono do cache (SEC-122), (2) migra o que o visitante
 * digitou antes de entrar (endereço repetido volta como 200, sem duplicar), (3) troca o cache pela lista do servidor.
 * Falha de rede não apaga nada: o cache segue valendo até a próxima tentativa.
 */
export function syncAddresses(userId: string): Promise<void> {
  running ??= doSync(userId).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(userId: string): Promise<void> {
  await addressStore.bindOwner(userId);
  const before = addressStore.getState();
  if (before.status !== 'ready') return;

  const idMap = new Map<string, string>();
  for (const local of before.addresses.filter((a) => a.precision === 'full' && !a.remote)) {
    try {
      const saved = await createRemoteAddress(fieldsOf(local));
      idMap.set(local.id, saved.id);
    } catch (error) {
      // limite, cidade fora da região ou endereço sem ponto: este não migra; os outros seguem. Rede caída: tenta no próximo login.
      if (error instanceof ApiError && error.isConnectivity) return;
    }
  }
  try {
    await addressStore.applyServerList(await fetchAddresses(), idMap);
  } catch {
    // sem rede ou servidor fora: fica o cache
  }
}
